// When scheduled pushes go out, on each recipient's own clock. Pure: no I/O, safe on the client too.
//
// The pact calendar never moves: a pact day runs midnight to midnight in the pact's timezone for everyone,
// so each day has one fixed deadline instant. Only when we send, and how we word that deadline, follow
// the person reading it.

import { addDays, isValidTimeZone, todayIn, type Day } from "./dates";

const HOUR = 3_600_000;

/** Evening reminders aim for 8pm, recipient-local. */
export const EVENING_HOUR = 20;
/** No scheduled push between 10pm and 8am, recipient-local. */
export const QUIET_FROM = 22;
export const QUIET_UNTIL = 8;
/** When a reminder can't come before quiet hours end, it comes the evening before at 9pm instead. */
const LATE_EVENING_HOUR = 21;
/** Morning-style pushes go out between 9am and 9pm, recipient-local. */
export const DAYTIME_FROM = 9;
export const DAYTIME_UNTIL = 21;

type Instant = number | Date;
const ms = (t: Instant) => (typeof t === "number" ? t : t.getTime());

const fmtCache = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock date and time of an instant in a timezone. */
function partsIn(tz: string, t: number) {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(tz, fmt);
  }
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(new Date(t))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}` as Day, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** The recipient's timezone, or the pact's when theirs is missing or unknown. */
export function tzFor(recipient: string | null | undefined, pactTz: string) {
  return recipient && isValidTimeZone(recipient) ? recipient : pactTz;
}

/**
 * The instant a wall-clock time happens in `tz`. A time skipped by a DST jump resolves to just after the jump
 * (so a day that starts at 1am starts then), a repeated one to its first occurrence.
 */
export function zonedTime(day: Day, hour: number, tz: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour);
  const offset = (t: number) => {
    const p = partsIn(tz, t);
    const [py, pm, pd] = p.day.split("-").map(Number);
    return Date.UTC(py, pm - 1, pd, p.hour, p.minute) - Math.floor(t / 60_000) * 60_000;
  };
  const matches = (t: number) => {
    const p = partsIn(tz, t);
    return p.day === day && p.hour === hour && p.minute === 0;
  };
  // the offsets either side of any nearby change: a repeated time matches both, a skipped one neither
  const a = wall - offset(wall - 36 * HOUR);
  const b = wall - offset(wall + 36 * HOUR);
  const [early, late] = a < b ? [a, b] : [b, a];
  if (matches(early)) return early;
  return late;
}

/** When a pact day ends: the pact's next midnight. Check-ins for that day close then; a make-up for it, a day later. */
export function pactDeadline(pactTz: string, day: Day): number {
  return zonedTime(addDays(day, 1), 0, pactTz);
}

const quiet = (tz: string, t: number) => {
  const h = partsIn(tz, t).hour;
  return h >= QUIET_FROM || h < QUIET_UNTIL;
};

/**
 * When the evening "check in today" push for pact day `day` should go out to someone in `recipientTz`.
 *
 * With T the day's deadline (the pact's next midnight):
 * 1. their 8pm, if one falls between T−12h and T−2h;
 * 2. otherwise T−4h;
 * 3. if that's in their quiet hours (10pm–8am), their next 8am if that's still an hour before T, otherwise their
 *    9pm the evening before (never before the pact day starts).
 *
 * Lands between T−12h and T−1h (T−13h at most, when their clocks go back that night), so it's inside the pact
 * day, and one person never gets two evening pushes for a pact in the same evening: consecutive ones are at least
 * 10 hours apart, even across a pact-day boundary or a DST change.
 */
export function eveningSendAt(pactTz: string, day: Day, recipientTz: string | null | undefined): number {
  const tz = tzFor(recipientTz, pactTz);
  const start = zonedTime(day, 0, pactTz);
  const deadline = pactDeadline(pactTz, day);
  const lo = deadline - 12 * HOUR;
  const hi = deadline - 2 * HOUR;
  for (let d = partsIn(tz, lo).day; d <= partsIn(tz, hi).day; d = addDays(d, 1)) {
    const t = zonedTime(d, EVENING_HOUR, tz);
    if (t >= lo && t <= hi) return t;
  }
  const t = deadline - 4 * HOUR;
  if (!quiet(tz, t)) return t;
  const local = partsIn(tz, t).day;
  let morning = zonedTime(local, QUIET_UNTIL, tz);
  if (morning < t) morning = zonedTime(addDays(local, 1), QUIET_UNTIL, tz);
  if (morning <= deadline - HOUR) return morning;
  let evening = zonedTime(local, LATE_EVENING_HOUR, tz);
  if (evening > t) evening = zonedTime(addDays(local, -1), LATE_EVENING_HOUR, tz);
  return Math.max(evening, start);
}

/** Is the evening push for pact day `day` due on this run? From its send time until the deadline (a missed run catches up). */
export function eveningDue(now: Instant, pactTz: string, day: Day, recipientTz: string | null | undefined) {
  const t = ms(now);
  return t >= eveningSendAt(pactTz, day, recipientTz) && t < pactDeadline(pactTz, day);
}

/** Is it between 9am and 9pm on this person's clock? */
export function isDaytime(now: Instant, tz: string) {
  const h = partsIn(tz, ms(now)).hour;
  return h >= DAYTIME_FROM && h < DAYTIME_UNTIL;
}

/**
 * Morning-style pushes (make-up "yesterday is still open", a break pact's morning push, "you finished"): once the
 * pact day they're about has closed, on the first run in the recipient's 9am–9pm. `until`: the push is pointless
 * after this (the make-up window closes).
 */
export function morningDue(now: Instant, closedAt: number, recipientTz: string, until?: number) {
  const t = ms(now);
  return t >= closedAt && (until === undefined || t < until) && isDaytime(t, recipientTz);
}

/** The first moment a morning-style push could go out, for display and tests. */
export function morningSendAt(closedAt: number, recipientTz: string): number {
  if (isDaytime(closedAt, recipientTz)) return closedAt;
  const local = partsIn(recipientTz, closedAt).day;
  const t = zonedTime(local, DAYTIME_FROM, recipientTz);
  return t >= closedAt ? t : zonedTime(addDays(local, 1), DAYTIME_FROM, recipientTz);
}

/** The cron runs at the top of every UTC hour: the first run at or after `t`. */
export function firstRunAt(t: number) {
  return Math.ceil(t / HOUR) * HOUR;
}

function clock(hour: number, minute: number) {
  if (hour === 12 && minute === 0) return "noon";
  const h = hour % 12 || 12;
  const m = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${h}${m}${hour < 12 ? "am" : "pm"}`;
}

/**
 * A deadline in the reader's words, to follow "before", "until" or "at": "midnight" when it's midnight on their clock
 * too, otherwise "4pm your time", or "7am tomorrow your time" when it's after their own midnight.
 */
export function deadlineText(deadline: Instant, tz: string, now: Instant = Date.now()) {
  if (!isValidTimeZone(tz)) return "midnight";
  const p = partsIn(tz, ms(deadline));
  if (p.hour === 0 && p.minute === 0) return "midnight";
  const tomorrow = p.day > todayIn(tz, new Date(ms(now)));
  return `${clock(p.hour, p.minute)}${tomorrow ? " tomorrow" : ""} your time`;
}

/** Split recipients by how the deadline reads for them, so each group's push words it their way. */
export function byDeadline(users: string[], tzOf: (user: string) => string, deadline: Instant, now: Instant = Date.now()) {
  const groups = new Map<string, string[]>();
  for (const u of users) {
    const text = deadlineText(deadline, tzOf(u), now);
    groups.set(text, [...(groups.get(text) ?? []), u]);
  }
  return [...groups];
}
