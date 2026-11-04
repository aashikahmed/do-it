import { addDays, diffDays, type Day } from "./dates";

export type Cadence = "daily" | "weekly";

export interface PactCore {
  cadence: Cadence;
  times_per_week: number;
  duration_days: number;
  start_date: Day;
  freezes_allowed: number;
}

export interface MemberCore {
  user_id: string;
  /** first period start this member counts toward */
  joined_on: Day;
  /** day they left; they stop counting from here, earlier periods are untouched */
  left_on?: Day | null;
}

/** is this member on the hook for the period starting at `start`? */
export function isRequired(m: MemberCore, start: Day) {
  return m.joined_on <= start && (!m.left_on || start < m.left_on);
}

export interface CheckinCore {
  user_id: string;
  day: Day;
}

export type PeriodStatus = "done" | "frozen" | "missed" | "open" | "upcoming";

export interface Period {
  index: number;
  start: Day;
  end: Day;
  status: PeriodStatus;
  /** members who count toward this period */
  required: string[];
  /** check-ins per member inside this period */
  counts: Record<string, number>;
}

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
  freezesUsed: number;
  freezesLeft: number;
  /** consecutive missed periods right before the current one that a freeze could cover */
  repair: { periods: Day[]; previous: number } | null;
  completion: { done: number; closed: number; total: number };
}

export function periodLength(p: Pick<PactCore, "cadence">) {
  return p.cadence === "daily" ? 1 : 7;
}

export function pactEndDate(p: Pick<PactCore, "start_date" | "duration_days">): Day {
  return addDays(p.start_date, p.duration_days - 1);
}

export function computePactState(
  pact: PactCore,
  members: MemberCore[],
  checkins: CheckinCore[],
  frozenStarts: Day[],
  today: Day,
): PactState {
  const len = periodLength(pact);
  const need = pact.cadence === "daily" ? 1 : pact.times_per_week;
  const endDate = pactEndDate(pact);
  const total = Math.ceil(pact.duration_days / len);
  const frozen = new Set(frozenStarts);

  const memberIds = new Set(members.map((m) => m.user_id));
  // bucket check-ins by period index
  const buckets: Record<string, number>[] = Array.from({ length: total }, () => ({}));
  const seen = new Set<string>();
  for (const c of checkins) {
    if (!memberIds.has(c.user_id)) continue;
    const key = `${c.user_id}|${c.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const offset = diffDays(pact.start_date, c.day);
    if (offset < 0 || c.day > endDate) continue;
    const idx = Math.floor(offset / len);
    buckets[idx][c.user_id] = (buckets[idx][c.user_id] ?? 0) + 1;
  }

  const periods: Period[] = [];
  for (let i = 0; i < total; i++) {
    const start = addDays(pact.start_date, i * len);
    const rawEnd = addDays(start, len - 1);
    const end = rawEnd > endDate ? endDate : rawEnd;
    const required = members.filter((m) => isRequired(m, start)).map((m) => m.user_id);
    const counts = buckets[i];
    // a period only needs as many check-ins as it has days
    const periodNeed = Math.min(need, diffDays(start, end) + 1);
    const complete = required.length > 0 && required.every((u) => (counts[u] ?? 0) >= periodNeed);
    let status: PeriodStatus;
    if (start > today) status = "upcoming";
    else if (end < today) status = complete ? "done" : frozen.has(start) ? "frozen" : "missed";
    else status = complete ? "done" : "open";
    periods.push({ index: i, start, end, status, required, counts });
  }

  const phase: Phase = today < pact.start_date ? "upcoming" : today > endDate ? "ended" : "active";
  const current = phase === "active" ? periods.find((p) => p.start <= today && today <= p.end) ?? null : null;
  const lastIdx = phase === "upcoming" ? -1 : current ? current.index : total - 1;

  // current streak: current period counts only if already done; open never breaks it
  let streak = 0;
  if (lastIdx >= 0) {
    let j = lastIdx;
    if (current) {
      if (current.status === "done") streak = 1;
      j = lastIdx - 1;
    }
    for (; j >= 0; j--) {
      const s = periods[j].status;
      if (s === "done" || s === "frozen") streak++;
      else break;
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

  const freezesUsed = frozenStarts.length;
  const freezesLeft = Math.max(0, pact.freezes_allowed - freezesUsed);

  let repair: PactState["repair"] = null;
  if (current && current.index > 0) {
    const missed: Day[] = [];
    let j = current.index - 1;
    while (j >= 0 && periods[j].status === "missed") {
      missed.push(periods[j].start);
      j--;
    }
    let restores = 0;
    for (; j >= 0; j--) {
      const s = periods[j].status;
      if (s === "done" || s === "frozen") restores++;
      else break;
    }
    if (missed.length > 0 && restores > 0 && missed.length <= freezesLeft) {
      repair = { periods: missed.reverse(), previous: restores };
    }
  }

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
    freezesLeft,
    repair,
    completion: {
      done: periods.filter((p) => p.status === "done").length,
      closed: closed.length,
      total,
    },
  };
}

/** freezes granted for a pact length — mirrors create_pact() in SQL */
export function freezesFor(cadence: Cadence, durationDays: number) {
  return cadence === "daily" ? Math.max(1, Math.floor(durationDays / 10)) : Math.max(1, Math.floor(durationDays / 28));
}
