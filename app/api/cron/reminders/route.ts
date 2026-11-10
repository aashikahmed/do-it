import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, diffDays, hourIn, todayIn } from "@/lib/dates";
import { computePactState } from "@/lib/streak";
import { keptCount } from "@/lib/rounds";
import { sendPush } from "@/lib/push";
import { fetchAll, type Pact } from "@/lib/data";
import { capitalize, firstName, listNames, makeUpLabel } from "@/lib/view";
import type { PactState } from "@/lib/streak";

/**
 * Called hourly (see README). All times are in the pact's timezone.
 * - Morning (first run from 9am): "Tuesday is still open" to anyone who can still make up yesterday.
 * - Evening (first run from 8pm): "chain at risk", covering today and, if still owed, yesterday. One push.
 * Each member gets at most one of each per pact per day.
 *
 * Break pacts are different: evenings are when a habit is hardest to resist, so they never get an evening push,
 * and no push ever names the habit. One morning push per person: "How did yesterday go?" if you haven't answered,
 * otherwise the news about yesterday (everyone made it, or someone had a tough day).
 */
const MAKE_UP_FROM_HOUR = 9;
const REMIND_FROM_HOUR = 20;
/** "You finished" goes out the morning after the last day (a second day of slack covers a missed run). */
const FINISH_FROM_HOUR = 9;

type M = { pact_id: string; user_id: string; joined_on: string; left_on: string | null; profile: unknown };
type C = { pact_id: string; user_id: string; day: string };

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

  const all = (pacts ?? []) as Pact[];
  // from the morning after day one (something to make up) through the morning after the last day
  const due = all.filter((p) => {
    const today = todayIn(p.timezone, now);
    const end = addDays(p.start_date, p.duration_days - 1);
    const hour = hourIn(p.timezone, now);
    if (today < p.start_date || today > addDays(end, 1)) return false;
    return hour >= REMIND_FROM_HOUR || (today > p.start_date && hour >= MAKE_UP_FROM_HOUR);
  });
  const finished = all.filter((p) => {
    const since = diffDays(addDays(p.start_date, p.duration_days - 1), todayIn(p.timezone, now));
    // skip if someone already tapped Go again: they got the new-round push instead
    return since >= 1 && since <= 2 && (since === 2 || hourIn(p.timezone, now) >= FINISH_FROM_HOUR) && !all.some((x) => x.previous_id === p.id);
  });
  if (!due.length && !finished.length) return NextResponse.json({ checked: 0, sent: 0 });

  const ids = [...new Set([...due, ...finished].map((p) => p.id))];
  const [{ data: members }, { data: checkins }, { data: freezes }, { data: misses }] = await Promise.all([
    fetchAll<M>(() => admin.from("pact_members").select("pact_id,user_id,joined_on,left_on,profile:profiles(display_name)").in("pact_id", ids).order("pact_id").order("user_id")),
    fetchAll<C>(() => admin.from("checkins").select("pact_id,user_id,day").in("pact_id", ids).order("id")),
    fetchAll<{ pact_id: string; period_start: string }>(() => admin.from("freezes").select("pact_id,period_start").in("pact_id", ids).order("pact_id").order("period_start")),
    // break pacts count this week's "I gave in"s, so look back further than yesterday
    fetchAll<C>(() => admin.from("misses").select("pact_id,user_id,day").in("pact_id", ids).gte("day", addDays(utcToday, -9)).order("pact_id").order("user_id")),
  ]);
  const load = (pact: Pact) => {
    const ms = (members ?? []).filter((m) => m.pact_id === pact.id);
    const cs = (checkins ?? []).filter((c) => c.pact_id === pact.id);
    const state = computePactState(
      pact,
      ms,
      cs,
      (freezes ?? []).filter((f) => f.pact_id === pact.id).map((f) => f.period_start),
      todayIn(pact.timezone, now),
      (misses ?? []).filter((x) => x.pact_id === pact.id),
    );
    const xs = (misses ?? []).filter((x) => x.pact_id === pact.id);
    return { ms, cs, xs, state };
  };

  let sent = 0;
  for (const pact of due) {
    const today = todayIn(pact.timezone, now);
    const hour = hourIn(pact.timezone, now);
    const { ms, cs, xs, state } = load(pact);
    const unit = pact.cadence === "daily" ? "day" : "week";
    const url = `/p/${pact.id}`;
    const tag = `remind-${pact.id}`;

    if (pact.kind === "break") {
      if (hour < REMIND_FROM_HOUR) sent += await breakMorning(admin, pact, ms, cs, xs, state, today);
      continue;
    }
    const late = state.late;
    // still in the pact and still able to make up yesterday
    const owesLate = new Set((late?.owing ?? []).filter((u) => ms.some((m) => m.user_id === u && !m.left_on)));
    const label = late ? makeUpLabel(pact.cadence, late) : "";

    if (hour < REMIND_FROM_HOUR) {
      // morning: only about yesterday
      if (!late || !owesLate.size) continue;
      const { data: claimed } = await admin
        .from("checkin_notify_log")
        .upsert([...owesLate].map((u) => ({ pact_id: pact.id, user_id: u, day: late.end, kind: "makeup" })), {
          onConflict: "pact_id,user_id,day,kind",
          ignoreDuplicates: true,
        })
        .select("user_id");
      const targets = (claimed ?? []).map((r) => r.user_id as string);
      if (!targets.length) continue;
      const keep = state.streak > 0 ? `to keep your ${state.streak}-${unit} chain` : "to keep the chain going";
      const how = pact.cadence === "daily" ? `Make it up today ${keep}.` : `One more check-in, logged for yesterday, closes it. Do it today ${keep}.`;
      const res = await sendPush(targets, { title: `${pact.emoji} ${capitalize(label)} is still open`, body: `${how} You have until midnight.`, url, tag });
      sent += res.sent;
      continue;
    }

    // evening: today's link and yesterday's, in one push
    const cur = state.current;
    const atRisk = new Set(
      cur
        ? ms
            .filter((m) => {
              if (!cur.required.includes(m.user_id)) return false;
              if (pact.cadence === "daily") return !cs.some((c) => c.user_id === m.user_id && c.day === today);
              const left = state.need - (cur.counts[m.user_id] ?? 0);
              const doneToday = cs.some((c) => c.user_id === m.user_id && c.day === today);
              return left > 0 && !doneToday && left >= diffDays(today, cur.end) + 1;
            })
            .map((m) => m.user_id)
        : [],
    );
    const everyone = [...new Set([...atRisk, ...owesLate])];
    if (!everyone.length) continue;

    // claim the reminder slot first so overlapping runs never double-send
    const { data: claimed } = await admin
      .from("reminder_log")
      .upsert(everyone.map((u) => ({ pact_id: pact.id, user_id: u, day: today })), { onConflict: "pact_id,user_id,day", ignoreDuplicates: true })
      .select("user_id");
    const targets = (claimed ?? []).map((r) => r.user_id as string);
    if (!targets.length) continue;

    const streakBit = state.streak > 0 ? `${state.streak}-${unit} streak on the line.` : "Keep the chain going.";
    const doneNames = ms
      .filter((m) => !m.left_on && !atRisk.has(m.user_id) && cs.some((c) => c.user_id === m.user_id && c.day === today))
      .map((m) => (((m.profile as { display_name?: string } | null)?.display_name ?? "").split(" ")[0] || "Your partner"));
    const results = await Promise.all([
      sendPush(
        targets.filter((u) => owesLate.has(u) && atRisk.has(u)),
        { title: `${pact.emoji} Two to do before midnight`, body: `Make up ${label}, then today. ${streakBit}`, url, tag },
      ),
      sendPush(
        targets.filter((u) => owesLate.has(u) && !atRisk.has(u)),
        { title: `${pact.emoji} Last chance to make up ${label}`, body: `The chain breaks at midnight. ${streakBit}`, url, tag },
      ),
      sendPush(
        targets.filter((u) => !owesLate.has(u)),
        {
          title: `${pact.emoji} ${pact.title} is waiting on you`,
          body: doneNames.length ? `${doneNames.join(" and ")} already did it. ${streakBit}` : `${streakBit} Check in before midnight.`,
          url,
          tag,
        },
      ),
    ]);
    sent += results.reduce((n, r) => n + r.sent, 0);
  }

  for (const pact of finished) {
    const { ms, state } = load(pact);
    const active = ms.filter((m) => !m.left_on);
    if (!active.length) continue;
    // the last day can still be made up today: wait, so the recap counts it
    if (state.late) continue;
    const end = addDays(pact.start_date, pact.duration_days - 1);
    const { data: claimed } = await admin
      .from("checkin_notify_log")
      .upsert(active.map((m) => ({ pact_id: pact.id, user_id: m.user_id, day: end, kind: "finished" })), {
        onConflict: "pact_id,user_id,day,kind",
        ignoreDuplicates: true,
      })
      .select("user_id");
    const targets = (claimed ?? []).map((r) => r.user_id as string);
    if (!targets.length) continue;
    const kept = keptCount(state);
    const unit = pact.cadence === "daily" ? "days" : "weeks";
    const who = active.length > 1 ? "Together you kept" : "You kept";
    const res = await sendPush(targets, {
      title: pact.kind === "break" ? `${pact.emoji} ${state.periods.length} ${unit}, done` : `${pact.emoji} ${state.periods.length} ${unit} of ${pact.title}, done`,
      body: `${who} ${kept} of ${state.periods.length}. Go again?`,
      url: `/p/${pact.id}`,
      tag: `pact-${pact.id}`,
    });
    sent += res.sent;
  }

  return NextResponse.json({ checked: due.length + finished.length, sent });
}

/**
 * A break pact's one push of the day, sent from 9am. Asks anyone who hasn't answered for yesterday; once a day has
 * closed, tells everyone else how it went. Never names the habit: lock screens are public, and the word is a cue.
 */
async function breakMorning(
  admin: ReturnType<typeof createAdminClient>,
  pact: Pact,
  ms: M[],
  cs: C[],
  xs: C[],
  state: PactState,
  today: string,
) {
  const yesterday = addDays(today, -1);
  const p = state.periods.find((x) => x.start <= yesterday && yesterday <= x.end);
  if (!p || p.rest) return 0;
  const active = ms.filter((m) => !m.left_on).map((m) => m.user_id);
  const answered = (u: string) => cs.some((c) => c.user_id === u && c.day === yesterday) || xs.some((x) => x.user_id === u && x.day === yesterday);
  const settled = p.status === "done" || p.status === "missed" || p.status === "frozen";
  const ask = settled ? [] : active.filter((u) => p.required.includes(u) && !answered(u));

  // news only once a link has closed (every day for daily pacts, Monday morning for weekly ones), and only in a group
  let good: string[] = [];
  let bad: { to: string[]; title: string; body: string } | null = null;
  if (p.end === yesterday && active.length > 1 && !ask.length) {
    if (p.status === "done") good = active;
    else if (p.status === "missed") {
      const slipped = p.owing.filter((u) => answered(u) || (p.slips[u] ?? 0) > 0);
      const names = slipped.map((u) => firstName(nameOf(ms, u)));
      const repair = state.repair;
      const canFreeze = !!repair && repair.periods.length <= state.freezesLeft;
      const unit = pact.cadence === "daily" ? "day" : "week";
      if (names.length) {
        bad = {
          to: active.filter((u) => !slipped.includes(u)),
          title: canFreeze ? `${pact.emoji} A freeze can save the streak` : `${pact.emoji} A fresh start today`,
          body: canFreeze
            ? `${listNames(names)} had a tough ${pact.cadence === "daily" ? "day" : "week"}. A freeze keeps the ${repair!.previous}-${unit} streak.`
            : `${listNames(names)} had a tough ${pact.cadence === "daily" ? "day" : "week"}. Back at it today, together.`,
        };
      }
    }
  }
  const everyone = [...new Set([...ask, ...good, ...(bad?.to ?? [])])];
  if (!everyone.length) return 0;
  const { data: claimed } = await admin
    .from("checkin_notify_log")
    .upsert(everyone.map((u) => ({ pact_id: pact.id, user_id: u, day: today, kind: "morning" })), { onConflict: "pact_id,user_id,day,kind", ignoreDuplicates: true })
    .select("user_id");
  const targets = new Set((claimed ?? []).map((r) => r.user_id as string));
  if (!targets.size) return 0;
  const url = `/p/${pact.id}`;
  const tag = `remind-${pact.id}`;
  const unit = pact.cadence === "daily" ? "day" : "week";
  const streak = state.streak > 0 ? `Your ${state.streak}-${unit} streak is one tap from growing. ` : "";
  const results = await Promise.all([
    sendPush(ask.filter((u) => targets.has(u)), { title: `${pact.emoji} How did yesterday go?`, body: `${streak}You have until midnight to answer.`, url, tag }),
    sendPush(good.filter((u) => targets.has(u)), {
      title: `${pact.emoji} You all made it through`,
      body: `${state.streak}-${unit} streak. Keep it going.`,
      url,
      tag,
    }),
    bad ? sendPush(bad.to.filter((u) => targets.has(u)), { title: bad.title, body: bad.body, url, tag }) : Promise.resolve({ sent: 0 }),
  ]);
  return results.reduce((n, r) => n + r.sent, 0);
}

function nameOf(ms: M[], id: string) {
  const m = ms.find((x) => x.user_id === id);
  return ((m?.profile as { display_name?: string } | null)?.display_name ?? "").trim() || "Your partner";
}
