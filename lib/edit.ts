// Editing a pact after it's made. Pure: the edit sheet, the "what changed" card and the push all read it.
//
// The name, icon and colour can always change. The rules (everything that decides what counts) can only change until
// anyone logs anything: nobody counts until their first check-in, so up to then there's no history to rewrite.
// Mirrors update_pact() in SQL, which is what enforces it.

import { addDays, diffDays, formatDay, type Day } from "./dates";
import type { Pact, PactBundle } from "./data";
import { targetText, unitFor, type Direction, type Measure } from "./measure";
import { allowedDays, firstName, restDaysText, type BreakMode } from "./view";
import { startOffsets, weeksRun } from "./week";

export const RULE_KEYS = [
  "cadence",
  "times_per_week",
  "duration_days",
  "start_date",
  "measure",
  "direction",
  "unit",
  "target",
  "rest_days",
  "limit_step",
  "ask_next_morning",
] as const;

/** everything about a pact that locks at the first check-in */
export type PactRules = Pick<Pact, (typeof RULE_KEYS)[number]>;

/** what the rules were before a change, newest last; only kept when someone had joined under them */
export interface PactEdit {
  at: string;
  was: PactRules;
}

export function rulesOf(p: PactRules): PactRules {
  return Object.fromEntries(RULE_KEYS.map((k) => [k, p[k]])) as PactRules;
}

export function sameRules(a: PactRules, b: PactRules) {
  return RULE_KEYS.every((k) => a[k] === b[k]);
}

/** how a break pact says no: none at all, some days a week, or a little each day */
export function breakModeOf(p: Pick<Pact, "cadence" | "measure">): BreakMode {
  return p.cadence === "weekly" ? "days" : p.measure === "count" ? "amount" : "none";
}

// ── the form ──

export const DAILY_LENGTHS = [7, 14, 21, 30, 60, 90];
export const WEEKLY_LENGTHS = [4, 8, 12].map((w) => w * 7);

/** the length to keep when the cadence changes: the same one if it's on offer, otherwise the usual one */
export function lengthFor(cadence: "daily" | "weekly", days: number) {
  if (cadence === "weekly") return WEEKLY_LENGTHS.includes(days) ? days : 28;
  return DAILY_LENGTHS.includes(days) ? days : 30;
}

/** The rules as the create flow and the edit screen hold them while someone is choosing. */
export interface RuleDraft {
  cadence: "daily" | "weekly";
  timesPerWeek: number;
  durationDays: number;
  measure: Measure;
  direction: Direction;
  unit: string;
  /** minimum per check-in in the measure's unit (seconds for time) */
  target: number | null;
  // break a habit
  mode: BreakMode;
  /** "some days a week": how many days it's OK */
  allowance: number;
  /** "a little each day": the most per day, and what's counted */
  limit: number;
  limitUnit: string;
  /** lower the limit each week by this much (null = off) */
  limitStep: number | null;
  /** weekday bitmask, bit 0 = Sunday */
  restDays: number;
  askNextMorning: boolean;
}

export function draftOf(p: PactRules & Pick<Pact, "kind">): RuleDraft {
  const isBreak = p.kind === "break";
  const mode = isBreak ? breakModeOf(p) : "none";
  return {
    cadence: p.cadence,
    timesPerWeek: p.cadence === "weekly" ? p.times_per_week : 3,
    durationDays: p.duration_days,
    measure: isBreak ? "none" : p.measure,
    direction: isBreak ? "up" : p.direction,
    unit: isBreak ? "" : (p.unit ?? ""),
    target: isBreak ? null : p.target,
    mode,
    allowance: mode === "days" ? allowedDays(p) : 3,
    limit: mode === "amount" ? (p.target ?? 2) : 2,
    limitUnit: mode === "amount" ? (p.unit ?? "") : "",
    limitStep: p.limit_step,
    restDays: p.rest_days,
    askNextMorning: p.ask_next_morning,
  };
}

/** What a draft comes to, cleaned up the way update_pact() does it. */
export function draftRules(d: RuleDraft, kind: Pact["kind"], start: Day): PactRules {
  if (kind === "break") {
    const amount = d.mode === "amount";
    const weekly = d.mode === "days";
    return {
      cadence: weekly ? "weekly" : "daily",
      times_per_week: weekly ? 7 - d.allowance : 7,
      duration_days: d.durationDays,
      start_date: start,
      measure: amount ? "count" : "none",
      direction: "down",
      unit: amount ? d.limitUnit.trim() || "times" : null,
      target: amount ? d.limit : null,
      rest_days: weekly ? 0 : d.restDays,
      limit_step: amount ? d.limitStep : null,
      ask_next_morning: d.askNextMorning,
    };
  }
  const none = d.measure === "none";
  return {
    cadence: d.cadence,
    times_per_week: d.cadence === "daily" ? 7 : d.timesPerWeek,
    duration_days: d.durationDays,
    start_date: start,
    measure: d.measure,
    direction: d.measure === "time" || d.measure === "weight" ? d.direction : "up",
    unit: none || d.measure === "time" ? null : d.unit.trim() || (d.measure === "count" ? "times" : null),
    target: none ? null : d.target || null,
    rest_days: 0,
    limit_step: null,
    ask_next_morning: false,
  };
}

// ── locked or not ──

type Logged = Pick<PactBundle, "checkins" | "misses" | "changes" | "allMembers" | "today">;

export interface EditLock {
  /** who logged first, and when (first name; "You" is worded by the caller) */
  by: string;
  name: string;
  /** they said how a day went rather than checking in: a miss, or "I gave in" */
  miss: boolean;
  /** the only thing logged is the viewer's own check-in from today: undoing it unlocks everything */
  undo: Day | null;
}

/** Why the rules can't change any more, or null while nobody has logged anything. */
export function editLock(b: Logged, me: string): EditLock | null {
  const logs = [
    ...b.checkins.map((c) => ({ by: c.user_id, at: c.created_at, miss: false })),
    ...b.misses.map((m) => ({ by: m.user_id, at: m.created_at, miss: true })),
    // a changed day that's since been taken back still counts as logged
    ...b.changes.map((c) => ({ by: c.user_id, at: c.created_at, miss: false })),
  ].sort((x, y) => x.at.localeCompare(y.at));
  if (!logs.length) return null;
  const first = logs[0];
  const only = logs.length === 1 && b.checkins.length === 1 ? b.checkins[0] : null;
  return {
    by: first.by,
    name: firstName(b.allMembers.find((m) => m.user_id === first.by)?.name ?? "Someone"),
    miss: first.miss,
    undo: only && only.user_id === me && only.day === b.today ? only.day : null,
  };
}

/** "Priya checked in, so these stay as they are." Never says who gave in. */
export function lockText(lock: EditLock, kind: Pact["kind"], me: string) {
  const who = lock.by === me ? "You" : lock.name;
  const did = kind === "break" ? "answered" : lock.miss ? "called a day a miss" : "checked in";
  return `${who} ${did}, so these stay as they are.`;
}

// ── start days ──

/** The days a pact can start: where it is now (even in the past), today, tomorrow, and next Monday for weekly pacts. */
export function startChoices(current: Day, today: Day, weekly: boolean): Day[] {
  const days = startOffsets(today, weekly).map((o) => addDays(today, o));
  return days.includes(current) ? days : [...days, current].sort();
}

/** "today", "tomorrow", "Mon, Nov 30" */
export function startLabel(day: Day, today: Day) {
  const d = diffDays(today, day);
  return d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : formatDay(day);
}

// ── what changed ──

function often(r: PactRules, kind: Pact["kind"]) {
  if (kind === "break") {
    const mode = breakModeOf(r);
    if (mode === "days") return `up to ${allowedDays(r)} ${allowedDays(r) === 1 ? "day" : "days"} a week`;
    if (mode === "amount") return `up to ${r.target} ${unitFor(r.target, r.unit)} a day`.replace(/ +/g, " ");
    return "none at all";
  }
  return r.cadence === "daily" ? "every day" : r.times_per_week === 1 ? "once a week" : `${r.times_per_week} times a week`;
}

function length(r: PactRules) {
  if (r.cadence === "daily") return `${r.duration_days} days`;
  const weeks = Math.round(r.duration_days / 7);
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

/** what's tracked: "at least 20 push-ups", "time, longer is better", "streak only" */
export function trackText(r: Pick<PactRules, "measure" | "direction" | "unit" | "target">) {
  const t = targetText(r);
  if (t) return t[0].toLowerCase() + t.slice(1);
  if (r.measure === "none") return "streak only";
  if (r.measure === "time") return `time, ${r.direction === "down" ? "faster" : "longer"} is better`;
  if (r.measure === "weight") return `${r.unit ?? "weight"}, ${r.direction === "down" ? "lighter" : "heavier"} is better`;
  return r.unit ?? "a number";
}

export interface RuleChange {
  now: string;
  was: string;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Each rule that's different, in the words the app uses for it. Empty when nothing anyone would notice changed. */
export function ruleChanges(was: PactRules, now: PactRules, kind: Pact["kind"], today: Day): RuleChange[] {
  const out: RuleChange[] = [];
  const add = (a: string, b: string, word: (s: string) => string = cap) => {
    if (a !== b) out.push({ now: word(b), was: a });
  };
  add(often(was, kind), often(now, kind));
  add(length(was), length(now), (s) => `For ${s}`);
  add(startLabel(was.start_date, today), startLabel(now.start_date, today), (s) => `${diffDays(today, now.start_date) < 0 ? "Started" : "Starts"} ${s}`);
  if (kind === "break") {
    add(was.rest_days ? restDaysText(was.rest_days).replace("except ", "") : "none", now.rest_days ? restDaysText(now.rest_days).replace("except ", "") : "none", (s) => `Days off: ${s}`);
    const step = (r: PactRules) => (r.limit_step ? `${r.limit_step} less each week` : "same limit every week");
    if (breakModeOf(was) === "amount" && breakModeOf(now) === "amount") add(step(was), step(now));
    else if (now.limit_step) out.push({ now: cap(step(now)), was: "" });
    const asks = (r: PactRules) => (r.ask_next_morning ? "the next morning" : "from 6pm");
    add(asks(was), asks(now), (s) => `Asks ${s}`);
  } else {
    add(trackText(was), trackText(now), (s) => `Tracking: ${s}`);
  }
  return out;
}

/** "For 60 days (was 30 days)" */
export function changeText(c: RuleChange) {
  return c.was ? `${c.now} (was ${c.was})` : c.now;
}

/** A weekly pact's weeks run from its start day, so say which when the start or the rhythm moved. */
export function weeksMoved(was: PactRules, now: PactRules): string | null {
  if (now.cadence !== "weekly") return null;
  return was.cadence !== "weekly" || was.start_date !== now.start_date ? `Weeks run ${weeksRun(now.start_date)}` : null;
}

/** The body of the push to everyone else. Build pacts only: break pacts just show the card. */
export function changesBody(was: PactRules, now: PactRules, today: Day) {
  const lines = ruleChanges(was, now, "build", today).map(changeText);
  const weeks = weeksMoved(was, now);
  return [...lines, ...(weeks ? [weeks] : [])].map((l) => `${l}.`).join(" ");
}

/**
 * What changed since this person joined, for the card on the pact. Compared with the rules they joined under, so two
 * edits read as one and a change that was put back says nothing. Gone once they've logged something themselves.
 */
export function changedSince(b: Pick<PactBundle, "pact" | "members" | "checkins" | "misses" | "today" | "state">, me: string): { changes: string[] } | null {
  const { pact } = b;
  const mine = b.members.find((m) => m.user_id === me);
  if (!mine || pact.created_by === me || b.state.phase === "ended") return null;
  if (b.checkins.some((c) => c.user_id === me) || b.misses.some((m) => m.user_id === me)) return null;
  const joined = Date.parse(mine.joined_at);
  const first = (pact.edits ?? []).find((e) => Date.parse(e.at) > joined);
  if (!first) return null;
  const changes = ruleChanges(first.was, pact, pact.kind, b.today).map(changeText);
  if (!changes.length) return null;
  const weeks = weeksMoved(first.was, pact);
  return { changes: weeks ? [...changes, weeks] : changes };
}
