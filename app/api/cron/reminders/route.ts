import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, diffDays, todayIn } from "@/lib/dates";
import { computePactState } from "@/lib/streak";
import { keptCount } from "@/lib/rounds";
import { sendPush } from "@/lib/push";
import { fetchAll, type Pact } from "@/lib/data";
import { capitalize, firstName, listNames, makeUpLabel } from "@/lib/view";
import { byDeadline, eveningDue, morningDue, pactDeadline, tzFor, zonedTime } from "@/lib/reminders";
import type { PactState } from "@/lib/streak";

/**
 * Called hourly (see README). The pact's timezone sets the calendar (days, deadlines, who owes what), but each
 * person is reminded on their own clock (`profiles.timezone`, or the pact's when unknown). So every run looks at
 * every pact in its window and decides per member. The timing rules live in lib/reminders.ts.
 * - Evening: "chain at risk", covering today and, if still owed, yesterday. One push, at 8pm their time, or earlier
 *   when the pact's midnight comes before their evening, and never in their quiet hours (10pm to 8am).
 * - Morning: "Tuesday is still open" to anyone who can still make up yesterday, once yesterday has closed, between
 *   9am and 9pm their time.
 * Each member gets at most one of each per pact per pact day. Deadlines are worded on their clock ("before 4pm your time").
 *
 * Break pacts are different: evenings are when a habit is hardest to resist, so they never get an evening push,
 * and no push ever names the habit. One morning push per person: "How did yesterday go?" if you haven't answered,
 * otherwise the news about yesterday (everyone made it, or someone had a tough day).
 *
 * "You finished" goes out the morning after the last day, their time (a second day of slack covers missed runs).
 */
type M = { pact_id: string; user_id: string; joined_on: string; left_on: string | null; profile: unknown };
type C = { pact_id: string; user_id: string; day: string };
type Profile = { display_name?: string; timezone?: string | null } | null;

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
  // day one through the day after the last (a make-up for the last day). Who's due is decided per person below.
  const due = all.filter((p) => {
    const today = todayIn(p.timezone, now);
    const end = addDays(p.start_date, p.duration_days - 1);
    return today >= p.start_date && today <= addDays(end, 1);
  });
  const finished = all.filter((p) => {
    const since = diffDays(addDays(p.start_date, p.duration_days - 1), todayIn(p.timezone, now));
    // skip if someone already tapped Go again: they got the new-round push instead
    return since >= 1 && since <= 2 && !all.some((x) => x.previous_id === p.id);
  });
  if (!due.length && !finished.length) return NextResponse.json({ checked: 0, sent: 0 });

  const ids = [...new Set([...due, ...finished].map((p) => p.id))];
  const [{ data: members }, { data: checkins }, { data: freezes }, { data: misses }] = await Promise.all([
    fetchAll<M>(() =>
      admin.from("pact_members").select("pact_id,user_id,joined_on,left_on,profile:profiles(display_name,timezone)").in("pact_id", ids).order("pact_id").order("user_id"),
    ),
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
    // each person's own clock, or the pact's when we don't know it
    const tzOf = (u: string) => tzFor((ms.find((m) => m.user_id === u)?.profile as Profile)?.timezone, pact.timezone);
    return { ms, cs, xs, state, tzOf };
  };

  let sent = 0;
  for (const pact of due) {
    const today = todayIn(pact.timezone, now);
    const { ms, cs, xs, state, tzOf } = load(pact);
    const unit = pact.cadence === "daily" ? "day" : "week";
    const url = `/p/${pact.id}`;
    const tag = `remind-${pact.id}`;
    // yesterday closed at the start of today; today, and a make-up for yesterday, close at the next pact midnight
    const closedAt = zonedTime(today, 0, pact.timezone);
    const deadline = pactDeadline(pact.timezone, today);

    if (pact.kind === "break") {
      const mornings = ms.filter((m) => !m.left_on && morningDue(now, closedAt, tzOf(m.user_id), deadline)).map((m) => m.user_id);
      if (mornings.length) sent += await breakMorning(admin, pact, ms, cs, xs, state, today, new Set(mornings), tzOf, deadline, now);
      continue;
    }
    const late = state.late;
    // still in the pact and still able to make up yesterday
    const owesLate = new Set((late?.owing ?? []).filter((u) => ms.some((m) => m.user_id === u && !m.left_on)));
    const label = late ? makeUpLabel(pact.cadence, late) : "";

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
    // evening: today's link and yesterday's, in one push, at each person's own evening time
    const evening = [...new Set([...atRisk, ...owesLate])].filter((u) => eveningDue(now, pact.timezone, today, tzOf(u)));
    // morning: only about yesterday. When the evening push is due on the same run, it covers yesterday instead.
    const morning = late ? [...owesLate].filter((u) => !evening.includes(u) && morningDue(now, closedAt, tzOf(u), deadline)) : [];

    if (late && morning.length) {
      const { data: claimed } = await admin
        .from("checkin_notify_log")
        .upsert(morning.map((u) => ({ pact_id: pact.id, user_id: u, day: late.end, kind: "makeup" })), {
          onConflict: "pact_id,user_id,day,kind",
          ignoreDuplicates: true,
        })
        .select("user_id");
      const targets = (claimed ?? []).map((r) => r.user_id as string);
      const keep = state.streak > 0 ? `to keep your ${state.streak}-${unit} chain` : "to keep the chain going";
      for (const [until, group] of byDeadline(targets, tzOf, deadline, now)) {
        // "today" only when the window closes before their own midnight
        const when = until.includes("tomorrow") ? "" : " today";
        const how = pact.cadence === "daily" ? `Make it up${when} ${keep}.` : `One more check-in, logged for yesterday, closes it. Do it${when} ${keep}.`;
        const res = await sendPush(group, { title: `${pact.emoji} ${capitalize(label)} is still open`, body: `${how} You have until ${until}.`, url, tag });
        sent += res.sent;
      }
    }
    if (!evening.length) continue;

    // claim the reminder slot first so overlapping runs never double-send
    const { data: claimed } = await admin
      .from("reminder_log")
      .upsert(evening.map((u) => ({ pact_id: pact.id, user_id: u, day: today })), { onConflict: "pact_id,user_id,day", ignoreDuplicates: true })
      .select("user_id");
    const targets = (claimed ?? []).map((r) => r.user_id as string);
    if (!targets.length) continue;
    // this push covers yesterday, so no "still open" push after it
    const coversLate = targets.filter((u) => owesLate.has(u));
    if (late && coversLate.length) {
      await admin
        .from("checkin_notify_log")
        .upsert(coversLate.map((u) => ({ pact_id: pact.id, user_id: u, day: late.end, kind: "makeup" })), {
          onConflict: "pact_id,user_id,day,kind",
          ignoreDuplicates: true,
        });
    }

    const streakBit = state.streak > 0 ? `${state.streak}-${unit} streak on the line.` : "Keep the chain going.";
    const doneNames = ms
      .filter((m) => !m.left_on && !atRisk.has(m.user_id) && cs.some((c) => c.user_id === m.user_id && c.day === today))
      .map((m) => (((m.profile as Profile)?.display_name ?? "").split(" ")[0] || "Your partner"));
    for (const [until, group] of byDeadline(targets, tzOf, deadline, now)) {
      const results = await Promise.all([
        sendPush(
          group.filter((u) => owesLate.has(u) && atRisk.has(u)),
          { title: `${pact.emoji} Two to do before ${until}`, body: `Make up ${label}, then today. ${streakBit}`, url, tag },
        ),
        sendPush(
          group.filter((u) => owesLate.has(u) && !atRisk.has(u)),
          { title: `${pact.emoji} Last chance to make up ${label}`, body: `The chain breaks at ${until}. ${streakBit}`, url, tag },
        ),
        sendPush(
          group.filter((u) => !owesLate.has(u)),
          {
            title: `${pact.emoji} ${pact.title} is waiting on you`,
            body: doneNames.length ? `${doneNames.join(" and ")} already did it. ${streakBit}` : `${streakBit} Check in before ${until}.`,
            url,
            tag,
          },
        ),
      ]);
      sent += results.reduce((n, r) => n + r.sent, 0);
    }
  }

  for (const pact of finished) {
    const { ms, state, tzOf } = load(pact);
    const active = ms.filter((m) => !m.left_on);
    if (!active.length) continue;
    // the last day can still be made up today: wait, so the recap counts it
    if (state.late) continue;
    const end = addDays(pact.start_date, pact.duration_days - 1);
    // the morning after the last day, their time
    const ready = active.filter((m) => morningDue(now, pactDeadline(pact.timezone, end), tzOf(m.user_id)));
    if (!ready.length) continue;
    const { data: claimed } = await admin
      .from("checkin_notify_log")
      .upsert(ready.map((m) => ({ pact_id: pact.id, user_id: m.user_id, day: end, kind: "finished" })), {
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
 * A break pact's one push of the day, from 9am their time (`due`: the members whose morning it is). Asks anyone who
 * hasn't answered for yesterday; once a day has closed, tells everyone else how it went. Never names the habit:
 * lock screens are public, and the word is a cue.
 */
async function breakMorning(
  admin: ReturnType<typeof createAdminClient>,
  pact: Pact,
  ms: M[],
  cs: C[],
  xs: C[],
  state: PactState,
  today: string,
  due: Set<string>,
  tzOf: (u: string) => string,
  deadline: number,
  now: Date,
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
  // only the people whose morning it is; the rest get theirs on a later run
  const everyone = [...new Set([...ask, ...good, ...(bad?.to ?? [])])].filter((u) => due.has(u));
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
    ...byDeadline(ask.filter((u) => targets.has(u)), tzOf, deadline, now).map(([until, group]) =>
      sendPush(group, { title: `${pact.emoji} How did yesterday go?`, body: `${streak}You have until ${until} to answer.`, url, tag }),
    ),
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
  return ((m?.profile as Profile)?.display_name ?? "").trim() || "Your partner";
}
