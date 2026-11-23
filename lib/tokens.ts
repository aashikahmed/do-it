import { addDays, diffDays, type Day } from "./dates";
import { isRestDay, limitOn, type PactCore } from "./streak";

/** Clean-day milestones. A token is earned once and never taken back: a day you had it only puts the next one further away. */
export const MILESTONES = [1, 3, 7, 10, 14, 21, 30, 40, 50, 60, 75, 90];

/** clean = stayed off it (a check-in that counts); had = gave in, or went over the day's limit; blank = not answered */
export type DayMark = "clean" | "had" | "rest" | "blank" | "today" | "future";

export interface TokenWeek {
  /** days from the pact's first day */
  from: number;
  to: number;
  clean: number;
  /** clean days the week asks for */
  target: number;
}

export interface Token {
  m: number;
  /** past the pace the pact asks for (5 a week, say): a bonus */
  bonus: boolean;
  /** day it was earned (days from the start), or null */
  earnedOn: number | null;
}

export interface TokensModel {
  total: number;
  days: DayMark[];
  /** today, in days from the start (total once the pact has ended) */
  todayAt: number;
  /** answered today with a clean day */
  cleanToday: boolean;
  clean: number;
  /** clean days the pact asks for over its whole length */
  goal: number;
  tokens: Token[];
  next: { m: number; need: number; progress: number; bonus: boolean } | null;
  weeks: TokenWeek[];
  finished: boolean;
}

type Inputs = {
  pact: Pick<PactCore, "start_date" | "duration_days" | "cadence" | "times_per_week" | "kind" | "target" | "limit_step" | "rest_days">;
  phase: "upcoming" | "active" | "ended";
  userId: string;
  checkins: { user_id: string; day: Day; value?: number | null }[];
  misses: { user_id: string; day: Day }[];
  today: Day;
};

export function buildTokens({ pact, phase, userId, checkins, misses, today }: Inputs): TokensModel {
  const total = pact.duration_days;
  const ended = phase === "ended";
  const todayAt = ended ? total : Math.max(0, Math.min(total, diffDays(pact.start_date, today)));
  const clean = new Set<Day>();
  const had = new Set<Day>();
  for (const c of checkins) {
    if (c.user_id !== userId) continue;
    const limit = limitOn(pact, c.day);
    if (limit !== null && c.value !== null && c.value !== undefined && Number(c.value) > limit) had.add(c.day);
    else clean.add(c.day);
  }
  for (const m of misses) if (m.user_id === userId) had.add(m.day);

  const days: DayMark[] = [];
  let count = 0;
  let rest = 0;
  const reached: number[] = [];
  for (let i = 0; i < total; i++) {
    const day = addDays(pact.start_date, i);
    const isRest = isRestDay(pact, day);
    if (isRest) rest++;
    let mark: DayMark;
    if (i > todayAt || (i === todayAt && ended)) mark = "future";
    // "I gave in" replaces a yes for the same day
    else if (had.has(day)) mark = "had";
    else if (clean.has(day)) mark = "clean";
    else if (isRest) mark = "rest";
    else mark = i === todayAt ? "today" : "blank";
    if (mark === "clean") {
      count++;
      reached.push(i);
    }
    days.push(mark);
  }

  const open = total - rest;
  const goal = pact.cadence === "weekly" ? Math.floor((open * Math.min(7, pact.times_per_week)) / 7) : open;
  const tokens = MILESTONES.filter((m) => m <= open).map((m) => ({ m, bonus: m > goal, earnedOn: reached[m - 1] ?? null }));
  const nextT = tokens.find((t) => t.earnedOn === null);
  const prev = [...tokens].reverse().find((t) => t.earnedOn !== null)?.m ?? 0;
  const next = nextT ? { m: nextT.m, need: nextT.m - count, progress: (count - prev) / (nextT.m - prev), bonus: nextT.bonus } : null;

  const weeks: TokenWeek[] = [];
  for (let from = 0; from < total; from += 7) {
    const to = Math.min(total, from + 7);
    let target = 0;
    let c = 0;
    for (let i = from; i < to; i++) {
      if (!isRestDay(pact, addDays(pact.start_date, i))) target++;
      if (days[i] === "clean") c++;
    }
    if (pact.cadence === "weekly") target = Math.min(pact.times_per_week, to - from);
    weeks.push({ from, to, clean: c, target });
  }

  return { total, days, todayAt, cleanToday: days[todayAt] === "clean", clean: count, goal, tokens, next, weeks, finished: ended };
}

/** the highest token earned, for "you just earned one" */
export function topToken(t: Pick<TokensModel, "tokens">) {
  return [...t.tokens].reverse().find((x) => x.earnedOn !== null)?.m ?? 0;
}
