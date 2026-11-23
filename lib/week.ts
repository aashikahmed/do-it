// Where someone stands in the week in progress, on a weekly build pact. Pure: the screens and the reminder cron
// both read it, so what the app says and what a push says always agree.
//
// A pact's weeks start on its start day (start on a Wednesday and weeks run Wednesday to Tuesday), so we always
// name the day a week ends. "Tight" is when every day left is needed; "short" is when the target can't be reached
// anymore, and then what the week's end brings mirrors the engine in lib/streak.ts (a freeze, a pause, or a break).
// Break pacts never get any of this: we never chase someone about a habit they're giving up.

import { addDays, diffDays, formatDay, weekdayOf, type Day } from "./dates";
import type { Cadence, Kind, PactState } from "./streak";

export type WeekPace = "done" | "ok" | "tight" | "short";

/**
 * What the week's end brings for someone who can't make the target anymore (same meanings as LateOutcome):
 * freeze: one of their own freezes covers it. quiet: nothing logged all week, so it's covered and they're paused
 * from next week (one check-in avoids the pause). out: no freezes left, so they're paused. break: nobody else can
 * keep the week and they can't pay, so the streak ends.
 */
export type ShortOutcome = "freeze" | "quiet" | "out" | "break";

export interface WeekOutlook {
  start: Day;
  end: Day;
  count: number;
  need: number;
  /** check-ins still to go */
  togo: number;
  /** days left in the week, today included */
  daysLeft: number;
  doneToday: boolean;
  /** days still free for a check-in: the days left, less today once it's logged */
  room: number;
  pace: WeekPace;
  /** today is the week's last day */
  lastDay: boolean;
  /** short only */
  ifShort: ShortOutcome | null;
}

type Inputs = {
  pact: { cadence: Cadence; kind?: Kind | null };
  state: Pick<PactState, "phase" | "current" | "need" | "periods" | "freezesLeftBy">;
  checkins: { user_id: string; day: Day }[];
  today: Day;
};

/** the bare numbers for one person in the current week */
function pace(b: Inputs, userId: string) {
  const cur = b.state.current!;
  const need = Math.min(b.state.need, diffDays(cur.start, cur.end) + 1);
  const count = cur.counts[userId] ?? 0;
  const doneToday = b.checkins.some((c) => c.user_id === userId && c.day === b.today);
  const daysLeft = diffDays(b.today, cur.end) + 1;
  const room = daysLeft - (doneToday ? 1 : 0);
  const togo = Math.max(0, need - count);
  const p: WeekPace = togo === 0 ? "done" : togo > room ? "short" : togo === room ? "tight" : "ok";
  return { need, count, doneToday, daysLeft, room, togo, pace: p };
}

/**
 * Where this person stands in the current week, or null when it doesn't apply: not a weekly build pact, not
 * active, or they don't count this week (not started yet, paused, or just joined).
 */
export function weekOutlook(b: Inputs, userId: string): WeekOutlook | null {
  if (b.pact.cadence !== "weekly" || b.pact.kind === "break") return null;
  const cur = b.state.current;
  if (b.state.phase !== "active" || !cur || cur.rest || !cur.required.includes(userId)) return null;
  const me = pace(b, userId);

  let ifShort: ShortOutcome | null = null;
  if (me.pace === "short") {
    // anyone else who can still keep the week: the pact carries on with them
    const keeping = cur.required.filter((u) => u !== userId && pace(b, u).pace !== "short");
    const freezes = b.state.freezesLeftBy[userId] ?? 0;
    const lastWeek = cur.index === b.state.periods.length - 1;
    if (freezes <= 0) ifShort = keeping.length ? "out" : "break";
    else if (me.count === 0 && keeping.length && !lastWeek) ifShort = "quiet";
    else ifShort = "freeze";
  }

  return { start: cur.start, end: cur.end, ...me, lastDay: me.daysLeft === 1, ifShort };
}

const weekday = (d: Day) => formatDay(d, { weekday: "long" });

/** the last day of the week that `today` falls in, from the pact's dates alone (no state needed) */
export function weekEndOn(pact: { start_date: Day; duration_days: number }, today: Day): Day {
  const offset = Math.max(0, diffDays(pact.start_date, today));
  const end = addDays(pact.start_date, Math.floor(offset / 7) * 7 + 6);
  const last = addDays(pact.start_date, pact.duration_days - 1);
  return end > last ? last : end;
}

/** "Tuesday", or "today" / "tomorrow" when it's that close */
export function dayName(d: Day, today: Day) {
  if (d === today) return "today";
  if (d === addDays(today, 1)) return "tomorrow";
  return weekday(d);
}

/** "ends Tuesday", or "last day" on the week's last day: for "Week 2 of 4, ends Tuesday" */
export function weekEndsText(end: Day, today: Day) {
  return end === today ? "last day" : `ends ${weekday(end)}`;
}

/** "Nov 18 to 24", or "Nov 25 to Dec 1" across two months */
export function weekRange(start: Day, end: Day) {
  const md = { month: "short", day: "numeric" } as const;
  return `${formatDay(start, md)} to ${start.slice(0, 7) === end.slice(0, 7) ? Number(end.slice(8)) : formatDay(end, md)}`;
}

/** the days still needed when every one counts: "today and tomorrow", "tomorrow", "every day until Tuesday" */
export function daysNeeded(o: Pick<WeekOutlook, "room" | "doneToday" | "end">, today: Day) {
  const first = o.doneToday ? addDays(today, 1) : today;
  if (o.room === 1) return dayName(first, today);
  if (o.room === 2) return `${dayName(first, today)} and ${dayName(addDays(first, 1), today)}`;
  return `every day until ${weekday(o.end)}`;
}

/**
 * One sentence on where someone stands this week, ending with a full stop, or null once they're done.
 * `name` is someone else's first name; leave it out for "you".
 */
export function weekNote(o: WeekOutlook, today: Day, name?: string): string | null {
  const you = !name;
  const who = name ?? "You";
  const needs = you ? "need" : "needs";
  const by = dayName(o.end, today);
  switch (o.pace) {
    case "done":
      return null;
    case "ok":
      return `${o.togo} more by ${weekday(o.end)}.`;
    case "tight":
      if (o.lastDay) return `Last day of the week. ${who} ${needs} ${o.togo} more.`;
      return `${who} ${needs} ${daysNeeded(o, today)}.`;
    case "short":
      switch (o.ifShort) {
        case "quiet":
          return `Nothing logged this week. One check-in by ${by === "today" ? "midnight" : by} and ${you ? "you aren't" : `${name} isn't`} paused.`;
        case "out":
          return `Can't make ${o.need} this week, and ${you ? "you're" : `${name}'s`} out of freezes, so ${you ? "you'll" : "they'll"} be paused.`;
        case "break":
          return `Can't make ${o.need} this week, and nobody can cover it. The streak ends ${by === "today" ? "tonight" : by}.`;
        default:
          return `Can't make ${o.need} this week. A freeze will cover it.`;
      }
  }
}

/** does this note need attention (worded in ember on screen)? A freeze quietly covering a week doesn't. */
export function weekAtRisk(o: WeekOutlook | null) {
  return !!o && (o.pace === "tight" || (o.pace === "short" && o.ifShort !== "freeze"));
}

// ── choosing when a pact starts ──

/** "Wednesday to Tuesday": the weekdays a pact's weeks run, for one that starts on `start` */
export function weeksRun(start: Day) {
  return `${weekday(start)} to ${weekday(addDays(start, 6))}`;
}

/**
 * When a new pact can start, as days from today: today, tomorrow, and for weekly pacts the next Monday too, so
 * anyone who wants Monday-to-Sunday weeks can have them (unless today or tomorrow already is a Monday).
 */
export function startOffsets(today: Day, weekly: boolean): number[] {
  const toMonday = (8 - weekdayOf(today)) % 7;
  return weekly && toMonday > 1 ? [0, 1, toMonday] : [0, 1];
}

// ── the week, day by day (for the strip on the home card and the dots in the roster) ──

/** in: checked in; past: a day gone by without one; open: today, not yet; future: still to come */
export type DayMark = "in" | "past" | "open" | "future";

export interface WeekDays {
  start: Day;
  end: Day;
  /** first letter of each weekday, starting on the pact's own weekday: W T F S S M T */
  days: { day: Day; letter: string; mark: DayMark; today: boolean }[];
  count: number;
  need: number;
}

/** One person's current week, day by day, on a weekly build pact; null otherwise. */
export function weekDays(b: Pick<Inputs, "pact" | "checkins" | "today"> & { state: Pick<PactState, "phase" | "current" | "need"> }, userId: string): WeekDays | null {
  if (b.pact.cadence !== "weekly" || b.pact.kind === "break") return null;
  const cur = b.state.current;
  if (b.state.phase !== "active" || !cur) return null;
  const mine = new Set(b.checkins.filter((c) => c.user_id === userId).map((c) => c.day));
  const days: WeekDays["days"] = [];
  for (let d = cur.start; d <= cur.end; d = addDays(d, 1)) {
    const mark: DayMark = mine.has(d) ? "in" : d < b.today ? "past" : d === b.today ? "open" : "future";
    days.push({ day: d, letter: formatDay(d, { weekday: "narrow" }), mark, today: d === b.today });
  }
  return { start: cur.start, end: cur.end, days, count: days.filter((x) => x.mark === "in").length, need: Math.min(b.state.need, days.length) };
}

// ── pushes (build pacts only; the cron decides when) ──

type Named = { emoji: string; title: string };

/** The morning heads-up on a weekly build pact: the first day every day left is needed, or a silent week's last day. */
export function weekHeadsUp(pact: Named, o: WeekOutlook, today: Day) {
  if (o.pace !== "tight") return { title: `${pact.emoji} Last day of the week`, body: `Nothing logged for ${pact.title} this week. Check in once today to stay in.` };
  if (o.lastDay) return { title: `${pact.emoji} Last day of the week`, body: `${pact.title}: one more today makes ${o.need} this week.` };
  return {
    title: `${pact.emoji} ${o.togo} to go, ${o.room} days left`,
    body: `${pact.title}: your week ends ${dayName(o.end, today)}, so you need ${daysNeeded(o, today)}.`,
  };
}

/** The evening push on a weekly build pact, on a day it's due (see weekHeadsUp). `until`: the deadline on their clock. */
export function weekEvening(pact: Named, o: WeekOutlook, today: Day, until: string) {
  if (o.pace !== "tight") return { title: `${pact.emoji} Check in once to stay in`, body: `Nothing logged for ${pact.title} this week. One check-in before ${until} and you won't be paused.` };
  if (o.lastDay) return { title: `${pact.emoji} Last day of the week`, body: `${pact.title}: one more before ${until} makes ${o.need} this week.` };
  return { title: `${pact.emoji} ${pact.title} is waiting on you`, body: `Your week ends ${dayName(o.end, today)}, so you need ${daysNeeded(o, today)}. Check in before ${until}.` };
}
