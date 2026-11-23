import { addDays, diffDays, weekdayOf, type Day } from "./dates";

export type Cadence = "daily" | "weekly";
export type Kind = "build" | "break";

export interface PactCore {
  cadence: Cadence;
  times_per_week: number;
  duration_days: number;
  start_date: Day;
  freezes_allowed: number;
  /** build (do something) or break (stop or cut down); missing means build */
  kind?: Kind;
  /** break pacts with a daily limit: the most allowed per day */
  target?: number | null;
  /** lower the daily limit by this much each week */
  limit_step?: number | null;
  /** days off as a weekday bitmask (bit 0 = Sunday); daily pacts only */
  rest_days?: number;
}

export interface MemberCore {
  user_id: string;
  /** first period start this member counts toward */
  joined_on: Day;
  /** day they left; they stop counting from here, earlier periods are untouched */
  left_on?: Day | null;
}

/** is this member in the pact for the period starting at `start` (joined, not left)? */
export function isRequired(m: MemberCore, start: Day) {
  return m.joined_on <= start && (!m.left_on || start < m.left_on);
}

/** the first period start on or after `day`: a check-in mid-week counts you from the next week */
function periodOnOrAfter(pact: Pick<PactCore, "start_date" | "cadence">, day: Day): Day {
  const len = periodLength(pact);
  const offset = Math.max(0, diffDays(pact.start_date, day));
  return addDays(pact.start_date, Math.ceil(offset / len) * len);
}

export interface CheckinCore {
  user_id: string;
  day: Day;
  /** logged the next day as a make-up ("I did it today to make up"), not just logged late */
  made_up?: boolean;
  /** the number logged; on a break pact with a limit, over the limit doesn't count */
  value?: number | null;
}

/**
 * Build pacts: someone said "I missed it" about yesterday, which they could still have made up.
 * Break pacts: someone said "I gave in" (today or yesterday). Each one uses up a day the period allows.
 */
export interface MissCore {
  user_id: string;
  day: Day;
}

/**
 * A freeze spent on a period. Everyone has their own freezes: `paid_by` is whose allowance it used, `covers` whose
 * miss it covered (they differ when someone gave one of theirs). Old rows from shared freezes have no `covers`.
 */
export interface FreezeCore {
  period_start: Day;
  paid_by?: string | null;
  covers?: string | null;
}

/**
 * late = ended yesterday, not closed yet, but still fixable today: everyone short of it is short by
 * exactly one check-in, hasn't logged yesterday, and hasn't called it a miss. It doesn't break the
 * streak until midnight. Mirrors checkins_guard() in SQL, which allows logging yesterday until then.
 * Once a miss is past that window, each person who missed uses one of their own freezes, automatically. Out of
 * freezes, they're paused and the period counts without them. It's only "missed" when nobody kept it.
 */
export type PeriodStatus = "done" | "frozen" | "late" | "missed" | "open" | "upcoming";

export interface Period {
  index: number;
  start: Day;
  end: Day;
  status: PeriodStatus;
  /** members who count toward this period */
  required: string[];
  /** check-ins per member inside this period */
  counts: Record<string, number>;
  /** required members still short of the target */
  owing: string[];
  /** closed with help from a make-up check-in */
  madeUp: boolean;
  /** a day off: always counts as kept */
  rest: boolean;
  /** break pacts: days each member gave in during this period */
  slips: Record<string, number>;
  /** whose miss a freeze would still have to cover (only on a missed or late period; the rest is settled) */
  culprits: string[];
  /** missed it with no freezes left, so they're paused and the period counts without them */
  paused: string[];
  /**
   * a late period only: what happens to each person who still owes it if they don't make it up before it closes.
   * Only "break" puts the chain at risk; the rest is their own business (a freeze, or a pause).
   */
  ifMissed: Record<string, LateOutcome>;
}

/**
 * freeze: one of their own freezes covers it. quiet: it's their 3rd quiet day in a row (1 silent week), so it's
 * covered and they're paused from the next one. out: no freezes left, so they're paused and it counts without them.
 * without: no freezes left, but they've already checked in since, so it counts without them and they stay in.
 * break: nobody else kept it, so the chain breaks.
 */
export type LateOutcome = "freeze" | "quiet" | "out" | "without" | "break";

/** why someone is paused: 3 quiet days in a row (1 silent week), or a miss with no freezes left */
export type PauseReason = "quiet" | "out";

export type Phase = "upcoming" | "active" | "ended";

export interface PactState {
  phase: Phase;
  today: Day;
  endDate: Day;
  /** 1-based day number inside the pact (clamped) */
  dayNumber: number;
  periods: Period[];
  current: Period | null;
  need: number;
  streak: number;
  best: number;
  /** freezes spent in this pact, by anyone */
  freezesUsed: number;
  /** each current member's own freezes left (everyone gets `freezes_allowed`) */
  freezesLeftBy: Record<string, number>;
  /** the period that ended yesterday and can still be made up today */
  late: Period | null;
  /**
   * consecutive missed (or late) periods right before the current one that freezes could cover.
   * Offered when someone in the pact could pay for the missed ones (see planFreezes); a late one can be made up instead.
   */
  repair: { periods: Day[]; previous: number } | null;
  completion: { done: number; closed: number; total: number };
  /**
   * First period each member counts toward, or null if they haven't started. Nobody counts until their first
   * check-in, so someone who joins and never shows up can't break the chain. Mirrors period_required() in SQL.
   */
  countsFrom: Record<string, Day | null>;
  /** members the chain has paused right now: since when, and why. They count again from their next check-in. */
  paused: Record<string, { since: Day; why: PauseReason }>;
  /** freezes the rules have spent on their own and that aren't stored yet (the cron writes them down) */
  autoFreezes: { period: Day; covers: string }[];
}

export function periodLength(p: Pick<PactCore, "cadence">) {
  return p.cadence === "daily" ? 1 : 7;
}

export function pactEndDate(p: Pick<PactCore, "start_date" | "duration_days">): Day {
  return addDays(p.start_date, p.duration_days - 1);
}

export function isRestDay(p: Pick<PactCore, "cadence" | "rest_days">, day: Day) {
  return p.cadence === "daily" && !!p.rest_days && (p.rest_days & (1 << weekdayOf(day))) !== 0;
}

/** Break pacts with a daily limit: the most allowed on `day`, after the weekly reductions. Mirrors limit_on() in SQL. */
export function limitOn(p: Pick<PactCore, "kind" | "target" | "limit_step" | "start_date">, day: Day): number | null {
  if (p.kind !== "break" || p.target === null || p.target === undefined) return null;
  const week = Math.floor(diffDays(p.start_date, day) / 7);
  return Math.max(0, Number(p.target) - Number(p.limit_step ?? 0) * week);
}

export function computePactState(
  pact: PactCore,
  members: MemberCore[],
  checkins: CheckinCore[],
  freezes: (Day | FreezeCore)[],
  today: Day,
  misses: MissCore[] = [],
): PactState {
  const fz: FreezeCore[] = freezes.map((f) => (typeof f === "string" ? { period_start: f } : f));
  const len = periodLength(pact);
  const need = pact.cadence === "daily" ? 1 : pact.times_per_week;
  const endDate = pactEndDate(pact);
  const total = Math.ceil(pact.duration_days / len);
  const isBreak = pact.kind === "break";

  const memberIds = new Set(members.map((m) => m.user_id));
  // bucket check-ins by period index
  const buckets: Record<string, number>[] = Array.from({ length: total }, () => ({}));
  const madeUp = new Set<number>();
  const seen = new Set<string>();
  // first check-in that counts, per member: that's when they've started
  const firstIn: Record<string, Day> = {};
  // every check-in day that counts, per member: a paused member comes back with the first one after the pause
  const daysIn: Record<string, Day[]> = {};
  for (const c of checkins) {
    if (!memberIds.has(c.user_id)) continue;
    const key = `${c.user_id}|${c.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const offset = diffDays(pact.start_date, c.day);
    if (offset < 0 || c.day > endDate) continue;
    // over the day's limit: answered, but it doesn't count
    const limit = limitOn(pact, c.day);
    if (limit !== null && c.value !== null && c.value !== undefined && Number(c.value) > limit) continue;
    const idx = Math.floor(offset / len);
    buckets[idx][c.user_id] = (buckets[idx][c.user_id] ?? 0) + 1;
    if (c.made_up) madeUp.add(idx);
    if (!firstIn[c.user_id] || c.day < firstIn[c.user_id]) firstIn[c.user_id] = c.day;
    (daysIn[c.user_id] ??= []).push(c.day);
  }
  for (const u in daysIn) daysIn[u].sort();
  const yesterday = addDays(today, -1);
  const calledMiss = new Set(misses.filter((m) => m.day === yesterday).map((m) => m.user_id));
  // break pacts: every "I gave in" uses up one of the days a period allows
  const slipBuckets: Record<string, number>[] = Array.from({ length: total }, () => ({}));
  if (isBreak) {
    const counted = new Set<string>();
    for (const m of misses) {
      const key = `${m.user_id}|${m.day}`;
      if (!memberIds.has(m.user_id) || counted.has(key)) continue;
      counted.add(key);
      const offset = diffDays(pact.start_date, m.day);
      if (offset < 0 || m.day > endDate) continue;
      const idx = Math.floor(offset / len);
      slipBuckets[idx][m.user_id] = (slipBuckets[idx][m.user_id] ?? 0) + 1;
    }
  }

  // you count from the first period that starts on or after your first check-in (and not before you joined)
  const countsFrom: Record<string, Day | null> = {};
  const joined: Record<string, Day> = {};
  for (const m of members) {
    joined[m.user_id] = m.joined_on;
    const first = firstIn[m.user_id];
    if (!first) countsFrom[m.user_id] = null;
    else {
      const from = periodOnOrAfter(pact, first);
      countsFrom[m.user_id] = from > m.joined_on ? from : m.joined_on;
    }
  }

  // everyone's own freezes: stored ones (a row per person covered; old shared rows cover the whole period)
  const rowCovers = new Set(fz.filter((f) => f.covers).map((f) => `${f.period_start}|${f.covers}`));
  const wholeFrozen = new Set(fz.filter((f) => !f.covers).map((f) => f.period_start));
  const left: Record<string, number> = {};
  for (const m of members) left[m.user_id] = Math.max(0, pact.freezes_allowed - fz.filter((f) => f.paid_by === m.user_id).length);
  const autoFreezes: { period: Day; covers: string }[] = [];
  // paused members, and how many quiet periods in a row each counted member has had
  const pause: Record<string, { since: Day; after: Day; why: PauseReason } | null> = {};
  const quiet: Record<string, number> = {};
  const quietLimit = pact.cadence === "daily" ? 3 : 1;

  const periods: Period[] = [];
  for (let i = 0; i < total; i++) {
    const start = addDays(pact.start_date, i * len);
    const rawEnd = addDays(start, len - 1);
    const end = rawEnd > endDate ? endDate : rawEnd;
    const counts = buckets[i];
    const inPact = members.filter((m) => isRequired(m, start)).map((m) => m.user_id);
    // back from a pause: the first check-in after it counts them again, the same way a first check-in does
    for (const u of inPact) {
      const p = pause[u];
      if (!p) continue;
      const d = daysIn[u]?.find((x) => x > p.after);
      if (!d) continue;
      const back = periodOnOrAfter(pact, d) > joined[u] ? periodOnOrAfter(pact, d) : joined[u];
      if (back <= start) {
        pause[u] = null;
        countsFrom[u] = back;
        quiet[u] = 0;
      }
    }
    const started = inPact.filter((u) => countsFrom[u] !== null && countsFrom[u]! <= start);
    let required = started.filter((u) => !pause[u]);
    // nobody has started yet (the first days of a pact): whoever checked in during this period counts, else everyone
    let untouched = false;
    if (started.length === 0) {
      const showedUp = inPact.filter((u) => (counts[u] ?? 0) > 0);
      required = showedUp.length ? showedUp : inPact;
      untouched = !showedUp.length;
    }
    const slips = slipBuckets[i];
    const rest = isRestDay(pact, start);
    // a period only needs as many check-ins as it has days
    const days = diffDays(start, end) + 1;
    const periodNeed = Math.min(need, days);
    const owing = rest ? [] : required.filter((u) => (counts[u] ?? 0) < periodNeed);
    const complete = rest || (required.length > 0 && owing.length === 0);
    const over = (u: string) => (slips[u] ?? 0) > days - periodNeed;
    // break pacts: someone gave in more often than the period allows, so it's lost before it ends
    const broken = !complete && required.some(over);
    const ended = end < today;
    // who let it down: short of the target once it's over, or (a break pact lost early) over the days allowed
    const missedBy = rest || complete ? [] : ended ? owing : required.filter(over);
    const keeping = required.filter((u) => !missedBy.includes(u));
    const hasFreeze = (u: string) => wholeFrozen.has(start) || rowCovers.has(`${start}|${u}`);

    let status: PeriodStatus;
    let culprits: string[] = [];
    const pausedHere: string[] = [];
    const ifMissed: Record<string, LateOutcome> = {};
    if (start > today) status = "upcoming";
    else if (complete) status = "done";
    else {
      const fixable =
        ended &&
        end === yesterday &&
        required.length > 0 &&
        !broken &&
        owing.every((u) => (counts[u] ?? 0) === periodNeed - 1 && !seen.has(`${u}|${yesterday}`) && !calledMiss.has(u));
      if (ended ? fixable : !broken) {
        // still open, or yesterday that can still be made up; a freeze already spent on it holds
        const allFrozen = missedBy.length > 0 && missedBy.every(hasFreeze);
        status = ended ? (allFrozen ? "frozen" : "late") : "open";
        if (status === "late") {
          culprits = missedBy.filter((u) => !hasFreeze(u));
          // what midnight brings for each of them, the same way the branch below settles it
          const cantPay = culprits.some((u) => (left[u] ?? 0) <= 0);
          const breaks = untouched || (keeping.length === 0 && cantPay);
          // checked in since: a pause would end straight away, so there isn't one
          const back = (u: string) => !!daysIn[u]?.some((x) => x > end);
          for (const u of culprits) {
            if (breaks) ifMissed[u] = "break";
            else if ((left[u] ?? 0) <= 0) ifMissed[u] = back(u) ? "without" : "out";
            else if (!back(u) && (quiet[u] ?? 0) + 1 >= quietLimit && (counts[u] ?? 0) === 0 && keeping.length > 0 && i + 1 < total) ifMissed[u] = "quiet";
            else ifMissed[u] = "freeze";
          }
        }
      } else {
        // past the make-up window: everyone who missed uses their own freeze, or is paused if they're out
        const auto: string[] = [];
        const nobody: string[] = [];
        for (const u of missedBy) {
          if (hasFreeze(u)) continue;
          if ((left[u] ?? 0) > 0) {
            left[u]--;
            auto.push(u);
          } else if (keeping.length > 0) pausedHere.push(u);
          else nobody.push(u);
        }
        if (nobody.length || untouched) {
          // nobody kept it and someone can't pay (or nobody has ever checked in): it's missed, and no freezes are
          // spent on it automatically
          for (const u of auto) left[u]++;
          pausedHere.length = 0;
          status = "missed";
          culprits = missedBy.filter((u) => !hasFreeze(u));
        } else {
          const stillOwing = owing.filter((u) => !missedBy.includes(u));
          // a break pact lost early and the one who gave in is paused: today is still open for everyone else
          if (missedBy.every((u) => pausedHere.includes(u))) status = !ended && stillOwing.length ? "open" : "done";
          else status = "frozen";
          for (const u of auto) autoFreezes.push({ period: start, covers: u });
          for (const u of pausedHere) pause[u] = { since: start, after: end, why: "out" };
        }
      }
    }

    // quiet periods in a row: 3 days (or 1 silent week) and you're paused from the next one, while someone keeps it
    if (ended && !rest && status !== "late" && status !== "upcoming") {
      for (const u of required) {
        if (pausedHere.includes(u)) {
          quiet[u] = 0;
          continue;
        }
        quiet[u] = (counts[u] ?? 0) === 0 ? (quiet[u] ?? 0) + 1 : 0;
        if (quiet[u] >= quietLimit && keeping.length > 0 && i + 1 < total) {
          pause[u] = { since: addDays(start, len), after: end, why: "quiet" };
          quiet[u] = 0;
        }
      }
    }

    const counted = required.filter((u) => !pausedHere.includes(u));
    periods.push({
      index: i,
      start,
      end,
      status,
      required: counted,
      counts,
      owing: owing.filter((u) => !pausedHere.includes(u)),
      madeUp: complete && madeUp.has(i),
      rest,
      slips,
      culprits,
      paused: [...pausedHere],
      ifMissed,
    });
  }

  const phase: Phase = today < pact.start_date ? "upcoming" : today > endDate ? "ended" : "active";
  const current = phase === "active" ? periods.find((p) => p.start <= today && today <= p.end) ?? null : null;
  const lastIdx = phase === "upcoming" ? -1 : current ? current.index : total - 1;

  // current streak: current period counts only if already done (or frozen); open never breaks it, missed does
  let streak = 0;
  if (lastIdx >= 0 && current?.status !== "missed") {
    let j = lastIdx;
    if (current) {
      if (current.status === "done" || current.status === "frozen") streak = 1;
      j = lastIdx - 1;
    }
    for (; j >= 0; j--) {
      const s = periods[j].status;
      if (s === "done" || s === "frozen") streak++;
      else if (s !== "late") break; // on the line until midnight, not broken yet
    }
  }

  let best = 0;
  let run = 0;
  for (const p of periods) {
    if (p.status === "done" || p.status === "frozen") {
      run++;
      best = Math.max(best, run);
    } else if (p.status === "missed") run = 0;
    else if (p.status === "upcoming") break;
  }

  const freezesUsed = fz.length + autoFreezes.length;
  const freezesLeftBy: Record<string, number> = {};
  const paused: PactState["paused"] = {};
  for (const m of members) {
    if (m.left_on && m.left_on <= today) continue;
    freezesLeftBy[m.user_id] = left[m.user_id];
    const p = pause[m.user_id];
    if (p && p.since <= today) paused[m.user_id] = { since: p.since, why: p.why };
  }

  let repair: PactState["repair"] = null;
  // a break pact's current period can already be lost (someone gave in today): it can be frozen right away
  if (current && (current.index > 0 || current.status === "missed")) {
    const missed: Day[] = [];
    let j = current.status === "missed" ? current.index : current.index - 1;
    while (j >= 0 && (periods[j].status === "missed" || periods[j].status === "late")) {
      missed.push(periods[j].start);
      j--;
    }
    let restores = 0;
    for (; j >= 0; j--) {
      const s = periods[j].status;
      if (s === "done" || s === "frozen") restores++;
      else break;
    }
    // the late one can be made up instead, so only the older misses must be payable, by someone
    const older = missed.filter((d) => periods.find((p) => p.start === d)?.status !== "late");
    const anyLeft = Object.values(freezesLeftBy).some((n) => n > 0);
    const payable = Object.keys(freezesLeftBy).some((v) => plan(periods, freezesLeftBy, older, v).ok);
    if (missed.length > 0 && restores > 0 && anyLeft && payable) {
      repair = { periods: missed.reverse(), previous: restores };
    }
  }

  const late = periods.find((p) => p.status === "late") ?? null;
  const closed = periods.filter((p) => p.status === "done" || p.status === "frozen" || p.status === "missed");
  const dayNumber = Math.min(Math.max(diffDays(pact.start_date, today) + 1, 1), pact.duration_days);

  return {
    phase,
    today,
    endDate,
    dayNumber,
    periods,
    current,
    need,
    streak,
    best,
    freezesUsed,
    freezesLeftBy,
    late,
    repair,
    completion: {
      done: periods.filter((p) => p.status === "done").length,
      closed: closed.length,
      total,
    },
    countsFrom,
    paused,
    autoFreezes,
  };
}

export interface FreezePlan {
  /** everyone missing from these periods can be covered */
  ok: boolean;
  /** one freeze per person who missed, per period; paidBy differs from covers when it's a gift */
  payments: { period: Day; covers: string; paidBy: string }[];
  /** people the viewer would have to give one of theirs, because they're out */
  gifts: string[];
  /** people nobody can cover (they're out, and so is the viewer) */
  stuck: string[];
}

/**
 * Who pays to freeze `periods`, when `viewer` taps it. Each person who missed pays from their own freezes; when
 * they're out, the viewer gives one of theirs. Anyone can tap it, like before. Mirrors use_freezes() in SQL.
 */
export function planFreezes(state: Pick<PactState, "periods" | "freezesLeftBy">, periods: Day[], viewer: string): FreezePlan {
  return plan(state.periods, state.freezesLeftBy, periods, viewer);
}

function plan(all: Period[], leftBy: Record<string, number>, periods: Day[], viewer: string): FreezePlan {
  const left = { ...leftBy };
  const out: FreezePlan = { ok: true, payments: [], gifts: [], stuck: [] };
  for (const d of periods) {
    const p = all.find((x) => x.start === d);
    for (const u of p?.culprits ?? []) {
      let paidBy: string | null = null;
      if ((left[u] ?? 0) > 0) paidBy = u;
      else if ((left[viewer] ?? 0) > 0) paidBy = viewer;
      if (!paidBy) {
        out.ok = false;
        if (!out.stuck.includes(u)) out.stuck.push(u);
        continue;
      }
      left[paidBy]--;
      if (paidBy !== u && !out.gifts.includes(u)) out.gifts.push(u);
      out.payments.push({ period: d, covers: u, paidBy });
    }
  }
  return out;
}

/** freezes each person gets for a pact length — mirrors create_pact() in SQL */
export function freezesFor(cadence: Cadence, durationDays: number) {
  return cadence === "daily" ? Math.max(1, Math.floor(durationDays / 10)) : Math.max(1, Math.floor(durationDays / 28));
}
