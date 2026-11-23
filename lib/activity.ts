import { addDays, diffDays, formatDay, type Day } from "./dates";
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
  | { type: "short"; key: string; user: string; day: Day; start: Day; count: number; need: number; cover: Cover | null }
  /**
   * Only for you: a run of your own days with nothing logged that no other row shows (paused, not started yet, or
   * this week on a weekly pact), so you can still fill them in. `day` is the run's last day, `start` its first, and
   * `days` the ones you can fill in (days off are skipped without ending the run).
   */
  | { type: "gap"; key: string; user: string; day: Day; start: Day; days: Day[] };

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
  /** who's looking: their own empty days get a row (see the `gap` row) */
  me?: { id: string; joined_on: Day; left_on?: Day | null };
}): ActivityDay[] {
  const { pact, state, checkins, misses, changes, today, me } = input;
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

  // days of yours another row already shows (a "didn't check in" day, or every day of a short week)
  const shown = new Set<Day>();
  // days (weeks) that are over and settled: everyone who counted and fell short gets a row
  for (const p of state.periods) {
    if (p.end >= today || p.status === "late" || p.status === "upcoming" || p.rest) continue;
    const need = Math.min(state.need, diffDays(p.start, p.end) + 1);
    // the ones it paused for missing it with no freezes left still get their row (no chip)
    for (const u of [...p.required, ...p.paused]) {
      const count = p.counts[u] ?? 0;
      if (count >= need) continue;
      if (weekly) {
        if (u === me?.id) for (let d = p.start; d <= p.end; d = addDays(d, 1)) shown.add(d);
        add(p.end, "", { type: "short", key: `s:${u}|${p.start}`, user: u, day: p.end, start: p.start, count, need, cover: coverFor(freezes, p.start, u) });
        continue;
      }
      const key = `${u}|${p.start}`;
      // logged but it didn't count (over a break pact's limit), or said so: those rows are already there
      if (logged.has(key) || said.has(key)) continue;
      if (u === me?.id) shown.add(p.start);
      add(p.start, "", { type: "miss", key: `n:${key}`, user: u, day: p.start, said: false, cover: coverFor(freezes, p.start, u), change: changeOf(u, p.start) });
    }
  }

  if (me) for (const g of gapRuns(pact, state, checkins, misses, shown, me, today)) add(g.day, "", g);

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

/**
 * Your own days that are over (not yesterday: the log sheet has it) with nothing logged and no other row, grouped into
 * runs. A day only counts as empty while you're short in its period, so a weekly pact's week you already met has none.
 */
function gapRuns(
  pact: PactCore,
  state: PactState,
  checkins: CheckinCore[],
  misses: MissCore[],
  shown: Set<Day>,
  me: { id: string; joined_on: Day; left_on?: Day | null },
  today: Day,
): Extract<ActivityRow, { type: "gap" }>[] {
  const yesterday = addDays(today, -1);
  const answered = new Set([...checkins, ...misses].filter((x) => x.user_id === me.id).map((x) => x.day));
  const out: Extract<ActivityRow, { type: "gap" }>[] = [];
  let run: Day[] = [];
  const flush = () => {
    if (run.length) out.push({ type: "gap", key: `g:${me.id}|${run[0]}`, user: me.id, day: run[run.length - 1], start: run[0], days: run });
    run = [];
  };
  for (const p of state.periods) {
    if (p.start >= yesterday) break;
    const need = Math.min(state.need, diffDays(p.start, p.end) + 1);
    const short = (p.counts[me.id] ?? 0) < need;
    for (let d = p.start; d <= p.end && d < yesterday; d = addDays(d, 1)) {
      if (isRestDay(pact, d)) continue;
      if (short && !answered.has(d) && !shown.has(d) && canChangeDay(pact, me, d, today)) run.push(d);
      else flush();
    }
  }
  flush();
  return out;
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
  // days after it that count for you now and didn't before (a check-in brings you back from a pause, or starts you
  // earlier): they spend your freezes, or pause you, until you fill them in
  const owed = newlyOwed(before, after.state, me, day);
  const owedFreezes = owed.filter((p) => after.state.autoFreezes.some((a) => a.period === p.start && a.covers === me)).length;
  const r = baseText(before, after, me, day, label, unit, owedFreezes);
  if (!owed.length) return r;
  const one = owed.length === 1;
  const what = unit === "week" ? (one ? "The week after it" : `The ${owed.length} weeks after it`) : capital(listDays(owed.map((p) => p.start), after.state.today));
  const they = one ? "it'll" : "they'll";
  const pauses = owed.some((p) => p.paused.includes(me)) || !!after.state.paused[me];
  const uses = owedFreezes
    ? after.freezesLeft === 0
      ? `use ${owedFreezes === 1 ? "your last freeze" : `your last ${owedFreezes} freezes`}`
      : `use ${owedFreezes === 1 ? "one" : owedFreezes} of your freezes`
    : "";
  const cost = uses && pauses ? `, or ${they} ${uses} and you'll be paused` : uses ? `, or ${they} ${uses}` : pauses ? ", or you'll be paused" : "";
  const lead = r.text === "No change to the chain." ? "" : `${r.text} `;
  return { text: `${lead}${what} ${one ? "counts" : "count"} for you now too. Fill ${one ? "it" : "them"} in${cost}.`, tone: "warn" };
}

/** settled periods other than the one holding `day` that count `me` short after the change but didn't count them before */
function newlyOwed(before: PactState, after: PactState, me: string, day: Day): Period[] {
  const counted = (p: Period) => p.required.includes(me) || p.paused.includes(me);
  return after.periods.filter((p) => {
    if ((p.start <= day && day <= p.end) || p.end >= after.today || p.rest) return false;
    if (!counted(p) || (p.counts[me] ?? 0) >= Math.min(after.need, diffDays(p.start, p.end) + 1)) return false;
    const was = before.periods[p.index];
    return !was || !counted(was);
  });
}

/** "Monday", "Monday and yesterday", "Sat 7 Nov, Monday and Tuesday" */
function listDays(days: Day[], today: Day): string {
  const names = days.map((d) =>
    d === addDays(today, -1) ? "yesterday" : diffDays(d, today) < 7 ? formatDay(d, { weekday: "long" }) : formatDay(d, { weekday: "short", day: "numeric", month: "short" }),
  );
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function baseText(
  before: PactState,
  after: DayPreview,
  me: string,
  day: Day,
  label: string,
  unit: "day" | "week",
  owedFreezes: number,
): { text: string; tone: Tone } {
  const pb = periodOf(before, day);
  const pa = after.period;
  if (!pb || !pa) return { text: "", tone: "plain" };
  const lost = (s: Period["status"]) => s === "missed";
  const kept = after.state.periods.filter((p) => p.end < after.state.today && (p.status === "done" || p.status === "frozen")).length;
  const units = (n: number) => `${n} ${n === 1 ? unit : unit + "s"}`;
  const keptText = `Your ${kept} kept ${kept === 1 ? unit : unit + "s"} still count.`;
  const before_ = before.freezesLeftBy[me] ?? 0;
  // freezes the days after it spend are told separately
  const leftHere = after.freezesLeft + owedFreezes;
  const back = leftHere > before_ && !after.frozen;
  const backText = (lead: string) => (back ? `${lead}your freeze comes back. You'll have ${leftHere}.` : "");
  // the miss spends one of your freezes by itself (past the make-up window, misses pay for themselves)
  const spent = leftHere < before_ && !after.frozen;
  // out of freezes in a group: the day counts without you
  const outNow = pa.paused.includes(me) && !pb.paused.includes(me);
  // paused for it, or not counted at all (paused, not started yet), and counted now
  const inAgain = (pb.paused.includes(me) || !pb.required.includes(me)) && pa.required.includes(me);
  const pausedAfter = !!after.state.paused[me];
  const pausedBefore = !!before.paused[me];
  const pauseNote =
    pausedAfter && !pausedBefore ? " You'll be paused until your next check-in." : !pausedAfter && pausedBefore ? " You're back in the chain." : "";

  if (!lost(pb.status) && !lost(pa.status)) {
    // a week that's still going: say where you are in it
    if (unit === "week" && pa.end >= after.state.today) {
      const count = pa.counts[me] ?? 0;
      const need = Math.min(after.state.need, diffDays(pa.start, pa.end) + 1);
      return count >= need
        ? { text: `That's your part of this week done.${pauseNote}`, tone: "good" }
        : { text: `You're on ${count} of ${need} this week.${pauseNote}`, tone: "plain" };
    }
    if (after.frozen) return { text: `${label} stays kept with one of your freezes. You'll have ${leftHere} left.${pauseNote}`, tone: "plain" };
    if (back) return { text: `${label} is kept on its own, so ${backText("")}${pauseNote}`, tone: "good" };
    if (outNow) return { text: `${label} counts without you, since you're out of freezes. The chain keeps going.${pauseNote}`, tone: "warn" };
    if (inAgain) return { text: `${label} counts with you in it.${pauseNote}`, tone: "good" };
    if (spent) return { text: `${label} uses one of your freezes, so the chain keeps going. You'll have ${leftHere} left.${pauseNote}`, tone: "plain" };
    if (pb.status !== pa.status && (pa.status === "done" || pa.status === "frozen")) return { text: `${label} is kept.${pauseNote}`, tone: "good" };
    if (pauseNote) return { text: pauseNote.trim(), tone: pausedAfter ? "warn" : "good" };
    return { text: "No change to the chain.", tone: "plain" };
  }
  if (lost(pb.status) && !lost(pa.status)) {
    const how = after.frozen || spent ? " with one of your freezes" : outNow ? " without you, since you're out of freezes" : "";
    const joins = after.state.streak > before.streak ? `, and the chain joins back up: ${units(after.state.streak)}.` : ".";
    const left = after.frozen || spent ? ` You'll have ${leftHere} left.` : "";
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
