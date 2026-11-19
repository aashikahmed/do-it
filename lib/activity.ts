import { addDays, diffDays, type Day } from "./dates";
import {
  computePactState,
  isRestDay,
  pactEndDate,
  type CheckinCore,
  type FreezeCore,
  type MemberCore,
  type MissCore,
  type PactCore,
  type PactState,
  type Period,
} from "./streak";

/**
 * What a pact's Activity shows: every check-in, and every day someone who counted that day let slip, whether they
 * said so ("I missed it", "I gave in") or never answered. Rows sit under the day they're about. Mirrors what the
 * chain counts (computePactState), so a gap in the chain always has a row here.
 */

/** what a change in set_day() recorded: what the day said before and after (did / missed / nothing logged) */
export interface DayChange {
  user_id: string;
  day: Day;
  before: "did" | "missed" | "none";
  before_value: number | null;
  after: "did" | "missed";
  after_value: number | null;
  created_at: string;
}

export interface ActivityCheckin extends CheckinCore {
  id: string;
  created_at: string;
}

export interface ActivityMiss extends MissCore {
  created_at?: string;
}

export interface ActivityFreeze extends FreezeCore {
  used_by?: string | null;
}

/** a freeze that covers someone's miss: whose freezes it came from (null when it's an old shared one nobody paid) */
export interface Cover {
  by: string | null;
}

export type ActivityRow =
  | { type: "checkin"; key: string; user: string; day: Day; checkin: ActivityCheckin; change: DayChange | null }
  /** said: they told us (a misses row); otherwise they never logged the day */
  | { type: "miss"; key: string; user: string; day: Day; said: boolean; cover: Cover | null; change: DayChange | null }
  /** weekly pacts: a week that ended short. `day` is the week's last day, `start` its first. */
  | { type: "short"; key: string; user: string; day: Day; start: Day; count: number; need: number; cover: Cover | null };

export interface ActivityDay {
  day: Day;
  rows: ActivityRow[];
}

/** the period holding `day` */
export function periodOf(state: Pick<PactState, "periods">, day: Day): Period | undefined {
  return state.periods.find((p) => p.start <= day && day <= p.end);
}

function coverFor(freezes: ActivityFreeze[], start: Day, user: string): Cover | null {
  const f = freezes.find((x) => x.period_start === start && (x.covers === user || !x.covers));
  return f ? { by: f.paid_by ?? f.used_by ?? null } : null;
}

export function activityDays(input: {
  pact: PactCore;
  state: PactState;
  checkins: ActivityCheckin[];
  misses: ActivityMiss[];
  freezes: ActivityFreeze[];
  changes: DayChange[];
  today: Day;
}): ActivityDay[] {
  const { pact, state, checkins, misses, changes, today } = input;
  // automatic freezes count as soon as the engine spends them; the hourly cron writes them down later
  const freezes: ActivityFreeze[] = [
    ...input.freezes,
    ...state.autoFreezes
      .filter((a) => !input.freezes.some((f) => f.period_start === a.period && f.covers === a.covers))
      .map((a) => ({ period_start: a.period, covers: a.covers, paid_by: a.covers, used_by: null })),
  ];
  const weekly = pact.cadence === "weekly";
  // the latest change per person per day
  const lastChange = new Map<string, DayChange>();
  for (const c of [...changes].sort((a, b) => a.created_at.localeCompare(b.created_at))) lastChange.set(`${c.user_id}|${c.day}`, c);
  const changeOf = (u: string, d: Day) => lastChange.get(`${u}|${d}`) ?? null;

  const byDay = new Map<Day, { at: string; row: ActivityRow }[]>();
  const add = (day: Day, at: string, row: ActivityRow) => {
    if (day > today) return;
    const list = byDay.get(day) ?? [];
    list.push({ at, row });
    byDay.set(day, list);
  };

  const logged = new Set<string>();
  for (const c of checkins) {
    logged.add(`${c.user_id}|${c.day}`);
    add(c.day, c.created_at, { type: "checkin", key: `c:${c.id}`, user: c.user_id, day: c.day, checkin: c, change: changeOf(c.user_id, c.day) });
  }
  const said = new Set<string>();
  for (const m of misses) {
    const key = `${m.user_id}|${m.day}`;
    if (said.has(key) || logged.has(key)) continue;
    said.add(key);
    const p = periodOf(state, m.day);
    add(m.day, m.created_at ?? "", {
      type: "miss",
      key: `m:${key}`,
      user: m.user_id,
      day: m.day,
      said: true,
      cover: p ? coverFor(freezes, p.start, m.user_id) : null,
      change: changeOf(m.user_id, m.day),
    });
  }

  // days (weeks) that are over and settled: everyone who counted and fell short gets a row
  for (const p of state.periods) {
    if (p.end >= today || p.status === "late" || p.status === "upcoming" || p.rest) continue;
    const need = Math.min(state.need, diffDays(p.start, p.end) + 1);
    // the ones it paused for missing it with no freezes left still get their row (no chip)
    for (const u of [...p.required, ...p.paused]) {
      const count = p.counts[u] ?? 0;
      if (count >= need) continue;
      if (weekly) {
        add(p.end, "", { type: "short", key: `s:${u}|${p.start}`, user: u, day: p.end, start: p.start, count, need, cover: coverFor(freezes, p.start, u) });
        continue;
      }
      const key = `${u}|${p.start}`;
      // logged but it didn't count (over a break pact's limit), or said so: those rows are already there
      if (logged.has(key) || said.has(key)) continue;
      add(p.start, "", { type: "miss", key: `n:${key}`, user: u, day: p.start, said: false, cover: coverFor(freezes, p.start, u), change: changeOf(u, p.start) });
    }
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, list]) => ({
      day,
      // newest entries first; rows about a day nobody logged go last
      rows: list
        .sort((a, b) => {
          if (!a.at !== !b.at) return a.at ? -1 : 1;
          return b.at.localeCompare(a.at);
        })
        .map((x) => x.row),
    }));
}

/** a round can be changed until a week after it ends */
export const CHANGE_GRACE_DAYS = 7;

/** can `me` change `day` with set_day()? Days that are over, inside the round, not a day off. Mirrors set_day() in SQL. */
export function canChangeDay(
  pact: PactCore,
  member: Pick<MemberCore, "joined_on" | "left_on"> | undefined,
  day: Day,
  today: Day,
): boolean {
  if (!member || member.left_on) return false;
  const end = pactEndDate(pact);
  if (day >= today || day > end) return false;
  if (day < pact.start_date || day < member.joined_on) return false;
  if (today > addDays(end, CHANGE_GRACE_DAYS)) return false;
  return !isRestDay(pact, day);
}

export interface DayInputs {
  pact: PactCore;
  members: MemberCore[];
  checkins: CheckinCore[];
  misses: MissCore[];
  freezes: ActivityFreeze[];
  today: Day;
}

export interface DayPreview {
  state: PactState;
  /** the period the day is in, after the change */
  period: Period | undefined;
  /** after the change you're short in that period and nothing covers you */
  needsFreeze: boolean;
  /** ...and one of your own would keep it (you have one, and nobody else is left uncovered) */
  canFreeze: boolean;
  /** someone else missed it too and isn't covered, so your freeze alone won't keep it */
  othersUncovered: boolean;
  /** a freeze was spent in this preview */
  frozen: boolean;
  /** your own freezes left after the change */
  freezesLeft: number;
}

const compute = (x: DayInputs, checkins: CheckinCore[], misses: MissCore[], freezes: ActivityFreeze[]) =>
  computePactState(x.pact, x.members, checkins, freezes, x.today, misses);

const settled = (p: Period) => p.rest || (p.required.length > 0 && p.owing.length === 0);
const covers = (f: ActivityFreeze, start: Day, u: string) => f.period_start === start && (f.covers === u || !f.covers);

/**
 * What the chain looks like if `me` says `did` (with `value`) about `day`, optionally covering a miss with one of
 * their own freezes. Mirrors set_day() in SQL: swap the check-in or miss, hand back freezes the change made
 * unnecessary, then spend yours if it keeps the day.
 */
export function previewDay(x: DayInputs, me: string, day: Day, did: boolean, value: number | null, freeze: boolean): DayPreview {
  const checkins = x.checkins.filter((c) => !(c.user_id === me && c.day === day));
  const misses = x.misses.filter((m) => !(m.user_id === me && m.day === day));
  if (did) checkins.push({ user_id: me, day, value, made_up: false });
  else misses.push({ user_id: me, day });

  let freezes = [...x.freezes];
  const first = compute(x, checkins, misses, freezes);
  const p1 = periodOf(first, day);
  if (p1) {
    if (settled(p1)) freezes = freezes.filter((f) => f.period_start !== p1.start);
    else if (!p1.culprits.includes(me)) freezes = freezes.filter((f) => !(f.period_start === p1.start && f.covers === me));
  }
  let state = compute(x, checkins, misses, freezes);
  let period = periodOf(state, day);
  const start = period?.start;
  const culprits = period?.culprits ?? [];
  const needsFreeze = !!start && culprits.includes(me) && !freezes.some((f) => covers(f, start, me));
  const othersUncovered = !!start && culprits.some((u) => u !== me && !freezes.some((f) => covers(f, start, u)));
  const left = state.freezesLeftBy[me] ?? 0;
  const canFreeze = needsFreeze && !othersUncovered && left > 0;
  let frozen = false;
  if (freeze && canFreeze && start) {
    freezes = [...freezes, { period_start: start, covers: me, paid_by: me, used_by: me }];
    state = compute(x, checkins, misses, freezes);
    period = periodOf(state, day);
    frozen = true;
  }
  return { state, period, needsFreeze, canFreeze, othersUncovered, frozen, freezesLeft: state.freezesLeftBy[me] ?? 0 };
}

export type Tone = "good" | "warn" | "plain";

/**
 * One line on what a change does to the chain, never "back to 0": when a chain breaks it says how many kept days
 * still count. `label` names the day ("Monday", "Yesterday", "That week").
 */
export function changeText(
  before: PactState,
  after: DayPreview,
  me: string,
  day: Day,
  label: string,
  unit: "day" | "week",
): { text: string; tone: Tone } {
  const pb = periodOf(before, day);
  const pa = after.period;
  if (!pb || !pa) return { text: "", tone: "plain" };
  const lost = (s: Period["status"]) => s === "missed";
  const kept = after.state.periods.filter((p) => p.end < after.state.today && (p.status === "done" || p.status === "frozen")).length;
  const units = (n: number) => `${n} ${n === 1 ? unit : unit + "s"}`;
  const keptText = `Your ${kept} kept ${kept === 1 ? unit : unit + "s"} still count.`;
  const before_ = before.freezesLeftBy[me] ?? 0;
  const back = after.freezesLeft > before_ && !after.frozen;
  const backText = (lead: string) => (back ? `${lead}your freeze comes back. You'll have ${after.freezesLeft}.` : "");
  // the miss spends one of your freezes by itself (past the make-up window, misses pay for themselves)
  const spent = after.freezesLeft < before_ && !after.frozen;
  // out of freezes in a group: the day counts without you
  const outNow = pa.paused.includes(me) && !pb.paused.includes(me);
  const inAgain = pb.paused.includes(me) && !pa.paused.includes(me);
  const pausedAfter = !!after.state.paused[me];
  const pausedBefore = !!before.paused[me];
  const pauseNote =
    pausedAfter && !pausedBefore ? " You'll be paused until your next check-in." : !pausedAfter && pausedBefore ? " You're back in the chain." : "";

  if (!lost(pb.status) && !lost(pa.status)) {
    if (after.frozen) return { text: `${label} stays kept with one of your freezes. You'll have ${after.freezesLeft} left.${pauseNote}`, tone: "plain" };
    if (back) return { text: `${label} is kept on its own, so ${backText("")}${pauseNote}`, tone: "good" };
    if (outNow) return { text: `${label} counts without you, since you're out of freezes. The chain keeps going.${pauseNote}`, tone: "warn" };
    if (inAgain) return { text: `${label} counts with you in it.${pauseNote}`, tone: "good" };
    if (spent) return { text: `${label} uses one of your freezes, so the chain keeps going. You'll have ${after.freezesLeft} left.${pauseNote}`, tone: "plain" };
    if (pb.status !== pa.status && (pa.status === "done" || pa.status === "frozen")) return { text: `${label} is kept.${pauseNote}`, tone: "good" };
    if (pauseNote) return { text: pauseNote.trim(), tone: pausedAfter ? "warn" : "good" };
    return { text: "No change to the chain.", tone: "plain" };
  }
  if (lost(pb.status) && !lost(pa.status)) {
    const how = after.frozen || spent ? " with one of your freezes" : outNow ? " without you, since you're out of freezes" : "";
    const joins = after.state.streak > before.streak ? `, and the chain joins back up: ${units(after.state.streak)}.` : ".";
    const left = after.frozen || spent ? ` You'll have ${after.freezesLeft} left.` : "";
    return { text: `${label} is kept${how}${joins}${left}${pauseNote}`, tone: "good" };
  }
  if (!lost(pb.status) && lost(pa.status)) {
    const extra = back ? ` ${capital(backText(""))}` : "";
    return { text: `${label} breaks the chain. ${keptText}${extra}`, tone: "warn" };
  }
  return { text: `${label} stays broken. ${keptText}`, tone: "warn" };
}

function capital(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
