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

/** a run of your own days with nothing logged: `days` skips days off, `start` and `end` are its first and last */
export interface EmptyRun {
  start: Day;
  end: Day;
  days: Day[];
}

/**
 * Your own days that are over (not yesterday: the make-up has it) with nothing logged, in runs. A day only counts as
 * empty while you're short in its period, so a weekly pact's week you already met has none. Days off don't end a run.
 */
export function emptyRuns(
  pact: PactCore,
  state: PactState,
  checkins: CheckinCore[],
  misses: MissCore[],
  me: { id: string; joined_on: Day; left_on?: Day | null },
  today: Day,
): EmptyRun[] {
  const yesterday = addDays(today, -1);
  const answered = new Set([...checkins, ...misses].filter((x) => x.user_id === me.id).map((x) => x.day));
  const out: EmptyRun[] = [];
  let run: Day[] = [];
  const flush = () => {
    if (run.length) out.push({ start: run[0], end: run[run.length - 1], days: run });
    run = [];
  };
  for (const p of state.periods) {
    if (p.start >= yesterday) break;
    const need = Math.min(state.need, diffDays(p.start, p.end) + 1);
    const short = (p.counts[me.id] ?? 0) < need;
    for (let d = p.start; d <= p.end && d < yesterday; d = addDays(d, 1)) {
      if (isRestDay(pact, d)) continue;
      if (short && !answered.has(d) && canChangeDay(pact, me, d, today)) run.push(d);
      else flush();
    }
  }
  flush();
  return out;
}

/** days in a row with nothing logged before the catch-up card offers to fill them in */
export const CATCH_UP_DAYS = 3;

/**
 * The catch-up card: your latest run of empty days, when it's long enough and you're only just back (it reaches the
 * day before yesterday). Once you've been back a couple of days, it stops asking.
 */
export function catchUpRun(...args: Parameters<typeof emptyRuns>): EmptyRun | null {
  const [pact, , , , , today] = args;
  const last = emptyRuns(...args).at(-1);
  if (!last || last.days.length < CATCH_UP_DAYS) return null;
  // the day before yesterday, or the working day before it when that's a day off
  let edge = addDays(today, -2);
  while (edge > last.end && isRestDay(pact, edge)) edge = addDays(edge, -1);
  return last.end >= edge ? last : null;
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

/** one answer in a batch: did it (with a number) or not */
export interface DayAnswer {
  day: Day;
  did: boolean;
  value: number | null;
}

/**
 * What the chain looks like after several of your days are answered at once (the catch-up). Mirrors set_days() in
 * SQL, which runs set_day() for each day in date order: swap the check-in or miss, then hand back the freezes each
 * change made unnecessary. No manual freezes: misses past the make-up window pay for themselves.
 */
export function previewDays(x: DayInputs, me: string, answers: DayAnswer[]): PactState {
  let checkins = [...x.checkins];
  let misses = [...x.misses];
  let freezes = [...x.freezes];
  for (const a of [...answers].sort((p, q) => (p.day < q.day ? -1 : 1))) {
    checkins = checkins.filter((c) => !(c.user_id === me && c.day === a.day));
    misses = misses.filter((m) => !(m.user_id === me && m.day === a.day));
    if (a.did) checkins.push({ user_id: me, day: a.day, value: a.value, made_up: false });
    else misses.push({ user_id: me, day: a.day });
    const p = periodOf(compute(x, checkins, misses, freezes), a.day);
    if (!p) continue;
    if (settled(p)) freezes = freezes.filter((f) => f.period_start !== p.start);
    else if (!p.culprits.includes(me)) freezes = freezes.filter((f) => !(f.period_start === p.start && f.covers === me));
  }
  return compute(x, checkins, misses, freezes);
}

/**
 * One summary for a batch of answers (the catch-up's last screen): the chain, your freezes, whether you're in or
 * paused, and yesterday if it's now yours to log. Never "back to 0".
 */
export function batchText(before: PactState, after: PactState, me: string, answers: DayAnswer[], unit: "day" | "week"): { text: string; tone: Tone } {
  const yesterday = addDays(after.today, -1);
  const units = (n: number) => `${n} ${n === 1 ? unit : unit + "s"}`;
  const parts: string[] = [];
  let tone: Tone = "plain";
  const days = new Set(answers.map((a) => a.day));
  const touched = after.periods.filter((p) => answers.some((a) => p.start <= a.day && a.day <= p.end));
  const brokeNow = touched.filter((p) => p.status === "missed" && before.periods[p.index]?.status !== "missed");
  // the earliest day you're counted in again
  const back = touched.find(
    (p) => p.required.includes(me) && !before.periods[p.index]?.required.includes(me) && answers.some((a) => a.did && p.start <= a.day && a.day <= p.end),
  );
  const pausedBefore = !!before.paused[me];
  const pausedAfter = after.paused[me];
  if (pausedBefore && !pausedAfter) parts.push(back ? `You're back in the chain from ${dayName(back.start, after.today)}.` : "You're back in the chain.");
  else if (back) parts.push(`${capital(dayName(back.start, after.today))} counts with you in it.`);
  if (brokeNow.length) {
    const kept = after.periods.filter((p) => p.end < after.today && (p.status === "done" || p.status === "frozen")).length;
    parts.push(`${capital(dayName(brokeNow[0].start, after.today))} breaks the chain. Your ${kept} kept ${kept === 1 ? unit : unit + "s"} still count.`);
    tone = "warn";
  } else if (after.streak > before.streak) {
    parts.push(`The chain joins back up: ${units(after.streak)}.`);
    tone = "good";
  }
  // misses that count without you: out of freezes, while someone else kept the day
  const without = answers.filter((a) => !a.did && periodOf(after, a.day)?.paused.includes(me)).map((a) => a.day);
  if (without.length) {
    parts.push(`${capital(listDays(without, after.today))} ${without.length === 1 ? "counts" : "count"} without you, since you're out of freezes.`);
    tone = "warn";
  }
  // freezes: the misses you just told us spend them, the days you fixed hand theirs back
  const was = before.freezesLeftBy[me] ?? 0;
  const left = after.freezesLeftBy[me] ?? 0;
  const autoFor = (st: PactState, d: Day) => {
    const p = periodOf(st, d);
    return !!p && st.autoFreezes.some((a) => a.period === p.start && a.covers === me);
  };
  const spentOn = answers.filter((a) => !a.did && autoFor(after, a.day) && !autoFor(before, a.day)).map((a) => a.day);
  const back_ = left - was + spentOn.length;
  if (back_ > 0 && spentOn.length) {
    parts.push(
      `${back_ === 1 ? "A freeze comes" : `${back_} freezes come`} back${spentOn.length ? ` and ${spentOn.length === 1 ? "covers" : "cover"} ${listDays(spentOn, after.today)}` : ""}. You'll have ${left}.`,
    );
  } else if (back_ > 0) {
    parts.push(`${back_ === 1 ? "A freeze comes" : `${back_} freezes come`} back. You'll have ${left}.`);
    if (tone === "plain") tone = "good";
  } else if (spentOn.length) {
    parts.push(`${capital(listDays(spentOn, after.today))} ${spentOn.length === 1 ? "uses one" : `use ${spentOn.length}`} of your freezes. You'll have ${left} left.`);
  } else if (left < was) {
    parts.push(`${was - left === 1 ? "It uses one of your freezes" : `It uses ${was - left} of your freezes`}. You'll have ${left} left.`);
  }
  if (pausedAfter && (!pausedBefore || pausedAfter.since !== before.paused[me]?.since)) {
    parts.push(pausedBefore ? "You're still paused until your next check-in." : "You'll be paused until your next check-in.");
    tone = "warn";
  }
  // yesterday is now yours to log (or answer): it counts for you again
  const late = after.periods.find((p) => p.end === yesterday && p.status === "late");
  const lateWas = late && before.periods[late.index];
  if (late && unit === "day" && late.owing.includes(me) && !lateWas?.owing.includes(me) && !days.has(yesterday)) {
    parts.push("Yesterday counts for you too, so log it before midnight.");
    if (tone === "good") tone = "plain";
  }
  if (!parts.length) return { text: "No change to the chain.", tone: "plain" };
  if (tone === "plain" && pausedBefore && !pausedAfter) tone = "good";
  return { text: parts.join(" "), tone };
}

function dayName(d: Day, today: Day): string {
  return d === addDays(today, -1) ? "yesterday" : diffDays(d, today) < 7 ? formatDay(d, { weekday: "long" }) : formatDay(d, { weekday: "short", day: "numeric", month: "short" });
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
  kind: "build" | "break" = "build",
): { text: string; tone: Tone } {
  // days after it that count for you now and didn't before (a check-in brings you back from a pause, or starts you
  // earlier): they spend your freezes, or pause you, until you fill them in
  const owed = newlyOwed(before, after.state, me, day);
  const owedFreezes = owed.filter((p) => after.state.autoFreezes.some((a) => a.period === p.start && a.covers === me)).length;
  const base = baseText(before, after, me, day, label, unit, owedFreezes, kind);
  // freezes go to the earliest misses first: a new miss can take the freeze a later day was using
  const moved = after.state.periods.filter(
    (p) => !(p.start <= day && day <= p.end) && p.paused.includes(me) && !!before.periods[p.index]?.required.includes(me),
  );
  const r = moved.length
    ? {
        text: `${base.text} ${capital(listDays(moved.map((p) => p.start), after.state.today))} ${moved.length === 1 ? "counts" : "count"} without you now, since you're out of freezes.`,
        tone: "warn" as Tone,
      }
    : base;
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
  const names = days.map((d) => dayName(d, today));
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
  kind: "build" | "break",
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
  const autoHere = (st: PactState) => !!pb && st.autoFreezes.some((a) => a.period === pb.start && a.covers === me);
  const spent = (leftHere < before_ || (autoHere(after.state) && !autoHere(before))) && !after.frozen;
  // out of freezes in a group: the day counts without you
  const outNow = pa.paused.includes(me) && !pb.paused.includes(me);
  // paused for it, or not counted at all (paused, not started yet), and counted now
  const inAgain = (pb.paused.includes(me) || !pb.required.includes(me)) && pa.required.includes(me);
  const pausedAfter = !!after.state.paused[me];
  const pausedBefore = !!before.paused[me];
  const pauseNote =
    pausedAfter && !pausedBefore ? " You'll be paused until your next check-in." : !pausedAfter && pausedBefore ? " You're back in the chain." : "";

  if (!lost(pb.status) && !lost(pa.status)) {
    // "some days a week" break pacts: a slip the week allows
    const slips = pa.slips[me] ?? 0;
    if (kind === "break" && unit === "week" && slips > (pb.slips[me] ?? 0)) {
      const days = diffDays(pa.start, pa.end) + 1;
      const allowed = days - Math.min(after.state.need, days);
      const open = pa.end >= after.state.today;
      if (allowed > 0 && slips <= allowed) {
        return {
          text: `That's ${slips} of the ${allowed} ${allowed === 1 ? "day" : "days"} ${open ? "this" : "that"} week allows${open ? "" : ", so the week still counts"}.${pauseNote}`,
          tone: "plain",
        };
      }
    }
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
