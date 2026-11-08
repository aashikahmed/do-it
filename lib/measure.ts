import { addDays, diffDays, type Day } from "./dates";

export type Measure = "none" | "count" | "time" | "distance" | "weight";
export type Direction = "up" | "down";
export type Feel = 1 | 2 | 3;

export interface Tracking {
  measure: Measure;
  direction: Direction;
  unit: string | null;
  /** minimum per check-in (ceiling when direction is down); seconds for time */
  target: number | null;
}

export const FEELS: { value: Feel; label: string }[] = [
  { value: 1, label: "Tough" },
  { value: 2, label: "Good" },
  { value: 3, label: "Strong" },
];

export const MEASURES: { value: Measure; label: string; hint: string }[] = [
  { value: "count", label: "Count", hint: "Reps, pages, glasses" },
  { value: "time", label: "Time", hint: "Minutes, a run, a hold" },
  { value: "distance", label: "Distance", hint: "km, miles or metres" },
  { value: "weight", label: "Weight", hint: "A lift or body weight" },
  { value: "none", label: "Nothing", hint: "Just keep the streak" },
];

const num = (n: number, digits = 2) => new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(n);

/** 95 → "1:35", 3725 → "1:02:05" */
export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Value with its unit, for sentences: "35 push-ups", "29:20", "5.2 km". */
export function formatValue(t: Pick<Tracking, "measure" | "unit">, v: number) {
  switch (t.measure) {
    case "time":
      return formatDuration(v);
    case "count":
      return `${num(v)} ${t.unit ?? ""}`.trim();
    case "distance":
    case "weight":
      return `${num(v, 1)} ${t.unit ?? ""}`.trim();
    default:
      return num(v);
  }
}

/** An average for sentences: whole numbers for counts ("37 push-ups", not "36.62 push-ups"). */
export function formatAvg(t: Pick<Tracking, "measure" | "unit">, v: number) {
  return formatValue(t, t.measure === "count" ? Math.round(v) : v);
}

/** Short value for chart axes and stat tiles (no unit). */
export function formatShort(t: Pick<Tracking, "measure">, v: number) {
  return t.measure === "time" ? formatDuration(v) : num(v, t.measure === "count" ? 0 : 1);
}

export function isBetter(direction: Direction, a: number, b: number) {
  return direction === "down" ? a < b : a > b;
}

/** "At least 20 push-ups" / "Under 35:00" */
export function targetText(t: Tracking) {
  if (t.measure === "none" || t.target === null) return null;
  return `${t.direction === "down" ? "Under" : "At least"} ${formatValue(t, t.target)}`;
}

/** What the tracker is called in sentences: "push-ups", "time", "km". */
export function measureNoun(t: Tracking) {
  if (t.measure === "time") return "time";
  return t.unit ?? "";
}

/** Largest value any input accepts (seconds for time). */
export const MAX_VALUE = 999999;

/** A tidy step close to x: 1, 2 or 5 times a power of ten, never below 1. */
export function niceStep(x: number) {
  if (!(x > 1)) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const f = x / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

/** The next tidy step up: 1 → 2 → 5 → 10. */
function nextNiceStep(s: number) {
  const p = 10 ** Math.floor(Math.log10(s));
  const f = Math.round(s / p);
  return (f === 1 ? 2 : f === 2 ? 5 : 10) * p;
}

/**
 * Jump sizes for count chips: about 5%, 10% and 50% of the usual number (the larger of target and last value),
 * always three distinct sizes. 20 → [1, 2, 10], 30 → [2, 5, 20], 1000 → [50, 100, 500].
 * With nothing to go on yet, a wide spread: [1, 10, 100].
 */
export function countJumps(ref: number | null) {
  if (!ref || ref <= 0) return [1, 10, 100];
  const r = Math.max(ref, 20);
  const out: number[] = [];
  for (const share of [0.05, 0.1, 0.5]) {
    let s = niceStep(r * share);
    while (out.length && s <= out[out.length - 1]) s = nextNiceStep(s);
    out.push(s);
  }
  return out;
}

/**
 * Elastic scrub speed, in units per second. `pull` is the handle's offset from the middle (−1 to 1); the curve keeps
 * small pulls precise. Top speed follows the number itself, so it accelerates as it grows: 0 to 1,000 at full pull
 * takes about 3 seconds, and 1,000 to 1,450 under a second.
 */
export function scrubRate(pull: number, value: number) {
  const n = Math.max(-1, Math.min(1, pull));
  return Math.sign(n) * Math.abs(n) ** 2.2 * Math.max(60, Math.abs(value) * 1.2);
}

/** Step for a held ± button on a count: ones at first, then sized to the number, then ten times that. */
export function heldStep(value: number, heldMs: number) {
  if (heldMs < 900) return 1;
  const base = value < 20 ? 1 : value < 200 ? 5 : value < 2000 ? 10 : value < 20000 ? 100 : 1000;
  return heldMs > 2200 ? base * 10 : base;
}

/**
 * Which time wheels to show. Decided once when the input opens, so columns don't jump while scrolling.
 * Seconds matter for short holds and race times, hours for long sessions. No target yet: show all three.
 */
export function timeWheels(t: Pick<Tracking, "direction" | "target">, value: number | null) {
  const ref = t.target ?? value;
  const v = value ?? 0;
  return {
    hours: !(ref !== null && ref < 600) || v >= 3600,
    seconds: !(ref !== null && ref >= 600) || t.direction === "down" || v % 60 !== 0,
  };
}

/** Signed chip jumps in seconds: minutes when hours show, seconds for short holds. */
export function timeJumps(showsHours: boolean) {
  return showsHours ? [-300, 300, 900] : [-15, 15, 30];
}

/** "+5 min", "−15 s", "+1 h" */
export function jumpLabel(seconds: number) {
  const s = Math.abs(seconds);
  const body = s % 3600 === 0 ? `${s / 3600} h` : s % 60 === 0 ? `${s / 60} min` : `${s} s`;
  return `${seconds < 0 ? "−" : "+"}${body}`;
}

/** The tape for distance and weight: tick size in the stored unit, which ticks are long and labelled, pixels per tick. */
export function tapeFor(t: Pick<Tracking, "measure" | "unit">) {
  if (t.measure === "distance" && t.unit === "m") return { tick: 10, majorEvery: 5, labelEvery: 10, px: 10 };
  return { tick: 0.1, majorEvery: 5, labelEvery: 10, px: 13 };
}

/** A plate on each side, for lifts: 2.5 kg or 5 lb. */
export function plateStep(unit: string | null) {
  return unit === "lb" ? 5 : 2.5;
}

export interface Point {
  day: Day;
  value: number;
}

export interface ProgressStats {
  count: number;
  best: number | null;
  latest: number | null;
  /** average of the first and the latest 7-day windows that have entries */
  firstWeekAvg: number | null;
  lastWeekAvg: number | null;
  /** improvement from first to latest week, in the "better" direction (positive = better) */
  change: number | null;
  /** improvement as a share of the first week's average */
  changePct: number | null;
  total: number;
}

/** Stats over one person's logged values, oriented by direction. Weeks are counted from the pact's start. */
export function progressStats(points: Point[], direction: Direction, start: Day): ProgressStats {
  const pts = points.slice().sort((a, b) => a.day.localeCompare(b.day));
  if (!pts.length) return { count: 0, best: null, latest: null, firstWeekAvg: null, lastWeekAvg: null, change: null, changePct: null, total: 0 };
  const best = pts.reduce((b, p) => (isBetter(direction, p.value, b) ? p.value : b), pts[0].value);
  const byWeek = new Map<number, number[]>();
  for (const p of pts) {
    const w = Math.floor(diffDays(start, p.day) / 7);
    byWeek.set(w, [...(byWeek.get(w) ?? []), p.value]);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const firstWeekAvg = avg(byWeek.get(weeks[0])!);
  const lastWeekAvg = avg(byWeek.get(weeks[weeks.length - 1])!);
  const twoWeeks = weeks.length > 1;
  const raw = lastWeekAvg - firstWeekAvg;
  const change = twoWeeks ? (direction === "down" ? -raw : raw) : null;
  const changePct = twoWeeks && firstWeekAvg !== 0 ? (change! / Math.abs(firstWeekAvg)) * 100 : null;
  return {
    count: pts.length,
    best,
    latest: pts[pts.length - 1].value,
    firstWeekAvg,
    lastWeekAvg,
    change,
    changePct,
    total: pts.reduce((s, p) => s + p.value, 0),
  };
}

/** The pact days as a grid, for the feel calendar. */
export function pactDays(start: Day, durationDays: number, today: Day) {
  const last = today < addDays(start, durationDays - 1) ? today : addDays(start, durationDays - 1);
  const n = Math.max(0, diffDays(start, last) + 1);
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}
