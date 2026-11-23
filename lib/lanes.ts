import { diffDays, type Day } from "./dates";
import type { PactCore, Period, PactState } from "./streak";

export type PactColorName = "blue" | "sun" | "ember" | "mint" | "violet" | "rose";

/**
 * Runner colors, per pact color: picked to stand out on that pact's track (its deep shade). A person keeps the same
 * color for everyone who looks at the pact: colors go by join order, not by who's looking.
 */
const ON_COLOR: Record<PactColorName, string[]> = {
  blue: ["#FFC23D", "#FF8FB1", "#7CF0C5", "#FFFFFF", "#FFA45C", "#C9F27A"],
  violet: ["#FFC23D", "#FF8FB1", "#7CF0C5", "#FFFFFF", "#FFA45C", "#C9F27A"],
  rose: ["#FFC23D", "#FFFFFF", "#7CF0C5", "#10143A", "#C9F27A", "#B9C4FF"],
  ember: ["#FFFFFF", "#10143A", "#7CF0C5", "#FFE08A", "#B9C4FF", "#2B3CF0"],
  mint: ["#FFC23D", "#FFFFFF", "#10143A", "#FF8FB1", "#B9C4FF", "#2B3CF0"],
  sun: ["#10143A", "#F2457F", "#2B3CF0", "#FFFFFF", "#7B4DFF", "#0B8E67"],
};
/** finished pacts sit on a white card on the home screen */
const ON_LIGHT = ["#2B3CF0", "#F2457F", "#12B886", "#FF5B3A", "#7B4DFF", "#E09A00"];
const DARK = new Set(["#10143A", "#2B3CF0", "#7B4DFF", "#0B8E67", "#12B886", "#F2457F", "#FF5B3A", "#E09A00"]);

/** the most lanes a track shows; with more people, you and the first to join get lanes */
export const MAX_LANES = 6;

export function laneColor(pactColor: string, order: number, light = false) {
  const list = light ? ON_LIGHT : ON_COLOR[pactColor as PactColorName] ?? ON_COLOR.blue;
  return list[order % list.length];
}

/** text on top of a lane color */
export function inkOn(color: string) {
  return DARK.has(color.toUpperCase()) ? "#FFFFFF" : "#10143A";
}

/**
 * did = did their part; froze = covered by a freeze; missed/late = short of it; rest = a day off;
 * part = a check-in in a week that isn't done yet (weekly pacts), painted faintly so 2 of 3 doesn't look like 0 of 3
 */
export type LaneMark = "did" | "froze" | "missed" | "late" | "rest" | "part";

export interface LaneSeg {
  /** days from the pact's first day */
  from: number;
  to: number;
  mark: LaneMark;
}

export interface LanePerson {
  user_id: string;
  name: string;
  avatar_url: string | null;
  joined_at: string;
}

export interface Lane {
  userId: string;
  name: string;
  avatar: string | null;
  color: string;
  ink: string;
  segs: LaneSeg[];
  /** where their runner stands, in days from the start: today's start, or its end once they've done today */
  pos: number;
  /** periods they did their part in */
  kept: number;
}

export interface LanesModel {
  /** pact length in days: the finish line */
  total: number;
  /** today, in days from the start */
  today: number;
  lanes: Lane[];
  /** everyone past the finish */
  finished: boolean;
  /** members without a lane (more people than lanes) */
  hidden: number;
  /** weekly pacts: where each week ends, in days from the start (not the finish line) */
  weekEnds: number[];
  /** weekly pacts: the end of the week in progress, in days from the start, or null */
  weekEnd: number | null;
}

type Inputs = {
  pact: Pick<PactCore, "start_date" | "duration_days" | "cadence" | "times_per_week"> & { color: string };
  state: Pick<PactState, "periods" | "phase" | "need" | "current">;
  members: LanePerson[];
  me: string;
  today: Day;
  light?: boolean;
  /** check-ins, for painting the days of a week that isn't done yet */
  checkins?: { user_id: string; day: Day }[];
};

/** what one person did in one period, or null when they weren't counted (not started, paused, not in it yet) */
export function markFor(p: Period, u: string, need: number, current: boolean): LaneMark | null {
  const days = diffDays(p.start, p.end) + 1;
  const periodNeed = Math.min(need, days);
  if (p.rest) return "rest";
  if ((p.counts[u] ?? 0) >= periodNeed) return "did";
  if (current || p.status === "upcoming" || p.status === "open") return null;
  if (p.status === "late") return p.owing.includes(u) ? "late" : null;
  if (p.paused.includes(u)) return "missed";
  if (!p.required.includes(u)) return null;
  return p.status === "missed" ? "missed" : "froze";
}

/** Everyone's lane: a stretch per period they did (or missed), and where their runner stands today. */
export function buildLanes({ pact, state, members, me, today, light = false, checkins = [] }: Inputs): LanesModel {
  const total = pact.duration_days;
  const order = [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.user_id.localeCompare(b.user_id));
  const colorOf = new Map(order.map((m, i) => [m.user_id, laneColor(pact.color, i, light)]));
  const meFirst = [...order.filter((m) => m.user_id === me), ...order.filter((m) => m.user_id !== me)];
  const shown = meFirst.slice(0, MAX_LANES);
  const ended = state.phase === "ended";
  const todayAt = Math.max(0, Math.min(total, diffDays(pact.start_date, today)));

  const lanes = shown.map((m) => {
    const segs: LaneSeg[] = [];
    let kept = 0;
    let doneToday = false;
    for (const p of state.periods) {
      if (p.start > today) break;
      const isCurrent = !ended && state.current?.index === p.index;
      const mark = markFor(p, m.user_id, state.need, isCurrent);
      if (mark === "did") kept++;
      // the week in progress, not done yet: each day they checked in, painted faintly
      if (!mark && isCurrent && pact.cadence === "weekly" && p.required.includes(m.user_id)) {
        for (const c of checkins) {
          if (c.user_id !== m.user_id || c.day < p.start || c.day > p.end || c.day > today) continue;
          const at = diffDays(pact.start_date, c.day);
          segs.push({ from: at, to: at + 1, mark: "part" });
        }
        continue;
      }
      if (!mark) continue;
      const from = diffDays(pact.start_date, p.start);
      let to = diffDays(pact.start_date, p.end) + 1;
      // the period in progress: painted up to the end of today, once they've done their part
      if (isCurrent) {
        to = Math.min(to, todayAt + 1);
        doneToday = true;
      }
      const last = segs[segs.length - 1];
      if (last && last.mark === mark && last.to === from) last.to = to;
      else segs.push({ from, to, mark });
    }
    const color = colorOf.get(m.user_id)!;
    return {
      userId: m.user_id,
      name: m.name,
      avatar: m.avatar_url,
      color,
      ink: inkOn(color),
      segs,
      pos: ended ? total : Math.min(total, todayAt + (doneToday ? 1 : 0)),
      kept,
    };
  });

  const weekly = pact.cadence === "weekly";
  const weekEnds = weekly ? state.periods.map((p) => diffDays(pact.start_date, p.end) + 1).filter((d) => d < total) : [];
  const weekEnd = weekly && state.current && !ended ? diffDays(pact.start_date, state.current.end) + 1 : null;
  return { total, today: todayAt, lanes, finished: ended, hidden: Math.max(0, members.length - shown.length), weekEnds, weekEnd };
}
