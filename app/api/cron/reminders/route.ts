import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, diffDays, hourIn, todayIn } from "@/lib/dates";
import { computePactState } from "@/lib/streak";
import { sendPush } from "@/lib/push";
import { fetchAll, type Pact } from "@/lib/data";

/**
 * Evening "chain at risk" reminder. Call hourly (see README); each member gets at most one per pact per day,
 * sent on the first run at or after 8pm in the pact's timezone.
 */
const REMIND_FROM_HOUR = 20;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const utcToday = todayIn("UTC", now);
  const { data: pacts, error } = await fetchAll<Pact>(() =>
    admin
      .from("pacts")
      .select("*")
      .lte("start_date", addDays(utcToday, 1))
      .gte("created_at", new Date(now.getTime() - 400 * 86_400_000).toISOString())
      .order("id"),
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = ((pacts ?? []) as Pact[]).filter((p) => {
    const today = todayIn(p.timezone, now);
    const end = addDays(p.start_date, p.duration_days - 1);
    return today >= p.start_date && today <= end && hourIn(p.timezone, now) >= REMIND_FROM_HOUR;
  });
  if (!due.length) return NextResponse.json({ checked: 0, sent: 0 });

  const ids = due.map((p) => p.id);
  type M = { pact_id: string; user_id: string; joined_on: string; left_on: string | null; profile: unknown };
  const [{ data: members }, { data: checkins }, { data: freezes }] = await Promise.all([
    fetchAll<M>(() => admin.from("pact_members").select("pact_id,user_id,joined_on,left_on,profile:profiles(display_name)").in("pact_id", ids).order("pact_id").order("user_id")),
    fetchAll<{ pact_id: string; user_id: string; day: string }>(() => admin.from("checkins").select("pact_id,user_id,day").in("pact_id", ids).order("id")),
    fetchAll<{ pact_id: string; period_start: string }>(() => admin.from("freezes").select("pact_id,period_start").in("pact_id", ids).order("pact_id").order("period_start")),
  ]);

  let sent = 0;
  for (const pact of due) {
    const today = todayIn(pact.timezone, now);
    const ms = (members ?? []).filter((m) => m.pact_id === pact.id);
    const cs = (checkins ?? []).filter((c) => c.pact_id === pact.id);
    const state = computePactState(pact, ms, cs, (freezes ?? []).filter((f) => f.pact_id === pact.id).map((f) => f.period_start), today);
    const cur = state.current;
    if (!cur) continue;
    const daysLeft = diffDays(today, cur.end) + 1;

    const atRisk = ms.filter((m) => {
      if (!cur.required.includes(m.user_id)) return false;
      if (pact.cadence === "daily") return !cs.some((c) => c.user_id === m.user_id && c.day === today);
      const left = state.need - (cur.counts[m.user_id] ?? 0);
      const doneToday = cs.some((c) => c.user_id === m.user_id && c.day === today);
      return left > 0 && !doneToday && left >= daysLeft;
    });
    if (!atRisk.length) continue;

    // claim the reminder slot first so overlapping runs never double-send
    const { data: claimed } = await admin
      .from("reminder_log")
      .upsert(atRisk.map((m) => ({ pact_id: pact.id, user_id: m.user_id, day: today })), { onConflict: "pact_id,user_id,day", ignoreDuplicates: true })
      .select("user_id");
    const targets = (claimed ?? []).map((r) => r.user_id as string);
    if (!targets.length) continue;

    const doneNames = ms
      .filter((m) => !m.left_on && !atRisk.includes(m) && cs.some((c) => c.user_id === m.user_id && c.day === today))
      .map((m) => (((m.profile as { display_name?: string } | null)?.display_name ?? "").split(" ")[0] || "Your partner"));
    const unit = pact.cadence === "daily" ? "day" : "week";
    const streakBit = state.streak > 0 ? `${state.streak}-${unit} streak on the line.` : "Keep the chain going.";
    const body = doneNames.length ? `${doneNames.join(" and ")} already did it. ${streakBit}` : `${streakBit} Check in before midnight.`;
    const res = await sendPush(targets, { title: `${pact.emoji} ${pact.title} is waiting on you`, body, url: `/p/${pact.id}`, tag: `remind-${pact.id}` });
    sent += res.sent;
  }

  return NextResponse.json({ checked: due.length, sent });
}
