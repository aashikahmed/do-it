import "server-only";
import { createAdminClient } from "./supabase/admin";
import { todayIn } from "./dates";
import { computePactState } from "./streak";
import { sendPush } from "./push";
import { fetchAll, type Pact } from "./data";

type MemberRow = { user_id: string; joined_on: string; left_on: string | null; profile?: unknown };

/** Fan-out after a check-in: tell partners it's their turn, or celebrate when everyone is in. */
export async function notifyCheckin(pactId: string, actorId: string, day: string) {
  const admin = createAdminClient();

  // one notification per person per day, even if they undo and check in again
  const { data: claimed } = await admin
    .from("checkin_notify_log")
    .upsert({ pact_id: pactId, user_id: actorId, day, kind: "checkin" }, { onConflict: "pact_id,user_id,day,kind", ignoreDuplicates: true })
    .select("user_id");
  if (!claimed?.length) return;

  const [{ data: pact }, { data: members }, { data: checkins }, { data: freezes }] = await Promise.all([
    admin.from("pacts").select("*").eq("id", pactId).single<Pact>(),
    admin.from("pact_members").select("user_id,joined_on,left_on,profile:profiles(display_name)").eq("pact_id", pactId),
    fetchAll<{ user_id: string; day: string }>(() => admin.from("checkins").select("user_id,day").eq("pact_id", pactId).order("day").order("user_id")),
    admin.from("freezes").select("period_start").eq("pact_id", pactId),
  ]);
  if (!pact || !members) return;
  const all = members as MemberRow[];
  const today = todayIn(pact.timezone);
  const state = computePactState(pact, all, checkins ?? [], (freezes ?? []).map((f) => f.period_start), today);
  const actorName = nameOf(all, actorId);
  const others = all.filter((m) => !m.left_on && m.user_id !== actorId).map((m) => m.user_id);
  const url = `/p/${pactId}`;
  const cur = state.current;

  if (cur && cur.status === "done" && day >= cur.start && day <= cur.end && (cur.counts[actorId] ?? 0) <= state.need) {
    const unit = pact.cadence === "daily" ? "day" : "week";
    await sendPush(others, {
      title: `${pact.emoji} Everyone's in`,
      body: `${actorName} closed it out. ${state.streak}-${unit} streak on ${pact.title}.`,
      url,
      tag: `pact-${pactId}`,
    });
    return;
  }
  if (day !== today) return;

  // daily: still owes today. weekly: still short of this week's target.
  const owes = (u: string) =>
    pact.cadence === "daily"
      ? !(checkins ?? []).some((c) => c.user_id === u && c.day === today)
      : (cur?.counts[u] ?? 0) < state.need;
  const waiting = others.filter((u) => owes(u) && (cur?.required.includes(u) ?? false));
  // in bigger groups, only ping people who still owe a check-in
  const doneOthers = others.length <= 2 ? others.filter((u) => !waiting.includes(u)) : [];
  await Promise.all([
    sendPush(waiting, {
      title: `${pact.emoji} ${actorName} just did it`,
      body: `${pact.title}. Your turn.`,
      url,
      tag: `pact-${pactId}`,
    }),
    sendPush(doneOthers, {
      title: `${pact.emoji} ${actorName} checked in`,
      body: `${pact.title}. One step closer.`,
      url,
      tag: `pact-${pactId}`,
    }),
  ]);
}

export function nameOf(members: { user_id: string; profile?: unknown }[], id: string) {
  const m = members.find((x) => x.user_id === id);
  const p = m?.profile as { display_name?: string } | { display_name?: string }[] | null | undefined;
  const n = Array.isArray(p) ? p[0]?.display_name : p?.display_name;
  return (n || "Your partner").trim();
}
