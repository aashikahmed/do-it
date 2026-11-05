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
  { value: "distance", label: "Distance", hint: "km or miles" },
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

export function stepFor(t: Tracking, around: number | null) {
  if (t.measure === "time") return (around ?? 0) >= 1200 ? 30 : 15;
  if (t.measure === "distance") return 0.5;
  if (t.measure === "weight") return t.unit === "lb" ? 5 : 2.5;
  const ref = around ?? t.target ?? 0;
  return ref >= 100 ? 10 : ref >= 20 ? 5 : 1;
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
