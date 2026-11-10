import type { PactBundle } from "./data";
import { formatDay, diffDays, type Day } from "./dates";
import { limitOn, type Cadence, type Kind } from "./streak";

export function listNames(names: string[], max = 2) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2 && max >= 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - (max - 1);
  return `${names.slice(0, max - 1).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/** how to name the link that can still be made up: "Tuesday" (daily) or "last week" (weekly) */
export function makeUpLabel(cadence: Cadence, late: { start: Day }) {
  return cadence === "daily" ? formatDay(late.start, { weekday: "long" }) : "last week";
}

const num = (n: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(n);

export function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** does this person still have to make up yesterday? */
export function owesMakeUp(b: PactBundle, id: string) {
  return !!b.state.late?.owing.includes(id);
}

/** first names of everyone else who still has to make up yesterday */
export function othersOwingMakeUp(b: PactBundle, me: string) {
  return (b.state.late?.owing ?? []).filter((u) => u !== me).map((u) => firstName(b.allMembers.find((m) => m.user_id === u)?.name ?? "Someone"));
}

const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** "except Fridays", "except Saturdays and Sundays" (Monday first) */
export function restDaysText(mask: number) {
  if (!mask) return "";
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => mask & (1 << d)).map((d) => WEEKDAYS[d]);
  return `except ${listNames(days, days.length)}`;
}

/** what a break pact gives up, for sentences: "soda" */
export function subjectOf(p: { subject?: string | null; title: string }) {
  return (p.subject || p.title).trim();
}

type ScheduleBits = {
  cadence: "daily" | "weekly";
  times_per_week: number;
  duration_days: number;
  kind?: Kind;
  subject?: string | null;
  measure?: string;
  target?: number | null;
  unit?: string | null;
  rest_days?: number;
  limit_step?: number | null;
};

/** The days a break pact allows each week ("some days a week"). */
export function allowedDays(p: { times_per_week: number }) {
  return 7 - p.times_per_week;
}

export function cadenceText(p: ScheduleBits) {
  if (p.kind === "break") {
    const weeks = Math.round(p.duration_days / 7);
    const off = p.rest_days ? `, ${restDaysText(p.rest_days)}` : "";
    if (p.cadence === "weekly") {
      const n = allowedDays(p);
      return `Up to ${n} ${n === 1 ? "day" : "days"} a week, for ${weeks} weeks`;
    }
    if (p.measure === "count" && p.target) {
      const less = p.limit_step ? `, ${num(p.limit_step)} less each week` : "";
      return `Up to ${num(p.target)} ${p.unit ?? ""} a day${less}${off}, for ${p.duration_days} days`.replace(/ +/g, " ");
    }
    return `Every day${off}, for ${p.duration_days} days`;
  }
  if (p.cadence === "daily") return `Every day for ${p.duration_days} days`;
  const weeks = Math.round(p.duration_days / 7);
  const freq = p.times_per_week === 1 ? "Once a week" : `${p.times_per_week} times a week`;
  return `${freq} for ${weeks} weeks`;
}

/**
 * Joined mid-pact: in it and free to check in now, but the chain counts them from the next period
 * (joining never reopens a period the group already closed; see join_pact in SQL).
 */
export function isStarting(b: Pick<PactBundle, "state" | "members">, id: string) {
  const cur = b.state.current;
  return b.state.phase === "active" && !!cur && b.members.some((m) => m.user_id === id) && !cur.required.includes(id);
}

/**
 * When the chain starts counting someone who just joined: "The chain counts them from tomorrow" (or "from Monday",
 * the next pact week). Joining in the last period means this round ends first. No full stop, callers add one.
 */
export function chainCountsText(b: Pick<PactBundle, "state" | "members" | "today">, id: string, who: "you" | "them") {
  const joinedOn = b.members.find((m) => m.user_id === id)?.joined_on;
  if (!joinedOn || joinedOn > b.state.endDate) return `This round ends before the chain counts ${who}`;
  const when = diffDays(b.today, joinedOn) === 1 ? "tomorrow" : formatDay(joinedOn, { weekday: "long" });
  return `The chain counts ${who} from ${when}`;
}

export function streakUnit(b: Pick<PactBundle, "pact">, n: number) {
  const u = b.pact.cadence === "daily" ? "day" : "week";
  return n === 1 ? u : `${u}s`;
}

export function startsText(start: string, today: string) {
  const d = diffDays(today, start);
  if (d <= 0) return "Starts today";
  if (d === 1) return "Starts tomorrow";
  return `Starts ${formatDay(start)}`;
}

export function progressText(b: PactBundle) {
  const { state, pact } = b;
  if (state.phase === "upcoming") return startsText(pact.start_date, b.today);
  const round = pact.round > 1 ? `Round ${pact.round}` : "";
  if (state.phase === "ended") return round ? `${round} finished` : "Finished";
  const where =
    pact.cadence === "daily" ? `day ${state.dayNumber} of ${pact.duration_days}` : `week ${(state.current?.index ?? 0) + 1} of ${state.periods.length}`;
  return round ? `${round}, ${where}` : where[0].toUpperCase() + where.slice(1);
}

export type Tone = "act" | "wait" | "done" | "info" | "risk";

/** One line that tells the viewer what's going on in this pact right now. */
export function statusLine(b: PactBundle, me: string): { text: string; tone: Tone } {
  const { state, members, pact } = b;
  const others = members.filter((m) => m.user_id !== me);
  if (state.phase === "upcoming") {
    return others.length ? { text: `${startsText(pact.start_date, b.today)} with ${listNames(others.map((m) => firstName(m.name)))}`, tone: "info" } : { text: "Invite someone before it starts", tone: "info" };
  }
  if (pact.kind === "break") {
    if (owesYesterdayAnswer(b, me)) return { text: "How did yesterday go?", tone: "act" };
    if (state.late) return { text: `Waiting on ${listNames(othersOwingMakeUp(b, me))} to answer for yesterday`, tone: "wait" };
  }
  if (state.late) {
    const day = makeUpLabel(pact.cadence, state.late);
    if (owesMakeUp(b, me)) return { text: `${capitalize(day)} is still open. Make it up today.`, tone: "risk" };
    return { text: `Waiting on ${listNames(othersOwingMakeUp(b, me))} to make up ${day}`, tone: "wait" };
  }
  if (state.phase === "ended") {
    const unit = pact.cadence === "daily" ? "days" : "weeks";
    return { text: `${state.completion.done + state.periods.filter((p) => p.status === "frozen").length} of ${state.completion.total} ${unit} closed`, tone: "info" };
  }
  if (state.repair) return { text: `Streak broke. A freeze can save it.`, tone: "risk" };
  if (pact.kind === "break") return breakLine(b, me);

  const cur = state.current!;
  const need = state.need;
  const owes = (id: string) =>
    pact.cadence === "daily" ? !b.checkins.some((c) => c.user_id === id && c.day === b.today) : (cur.counts[id] ?? 0) < need;
  const iOwe = owes(me);
  const othersOwing = others.filter((m) => cur.required.includes(m.user_id) && owes(m.user_id));
  const othersDone = others.filter((m) => !owes(m.user_id));

  if (isStarting(b, me) && iOwe) {
    const start = pact.cadence === "daily" ? "Check in today." : "Log your days this week.";
    return { text: `You're in. ${start} ${chainCountsText(b, me, "you")}.`, tone: "info" };
  }
  if (pact.cadence === "weekly" && iOwe) {
    const left = need - (cur.counts[me] ?? 0);
    return { text: `${left} more this week to keep the chain`, tone: "act" };
  }
  if (iOwe) {
    if (!others.length) return { text: "Your turn today", tone: "act" };
    if (othersDone.length) return { text: `${listNames(othersDone.map((m) => firstName(m.name)))} did it. Your turn.`, tone: "act" };
    return { text: "Nobody's in yet. Go first.", tone: "act" };
  }
  if (!others.length) return { text: "Done. Invite someone to share the chain.", tone: "done" };
  if (othersOwing.length) return { text: `Waiting on ${listNames(othersOwing.map((m) => firstName(m.name)))}`, tone: "wait" };
  return { text: pact.cadence === "daily" ? "Everyone's in today" : "Everyone hit the target this week", tone: "done" };
}

/** Where a break pact stands right now. Never a nudge to answer today: the app asks in the morning. */
function breakLine(b: PactBundle, me: string): { text: string; tone: Tone } {
  const { state, pact } = b;
  const cur = state.current!;
  const what = subjectOf(pact);
  if (cur.rest) return { text: "Day off today", tone: "info" };
  if (cur.status === "missed") return { text: "Back at it tomorrow", tone: "info" };
  if (pact.cadence === "weekly") {
    const allowed = allowedDays(pact);
    const left = Math.max(0, allowed - (cur.slips[me] ?? 0));
    return { text: left === 0 ? `No ${what} days left this week` : `${left} of ${allowed} ${what} ${allowed === 1 ? "day" : "days"} left this week`, tone: "info" };
  }
  const n = state.streak;
  if (n === 0) return { text: "A fresh start today", tone: "info" };
  const days = n === 1 ? "day" : "days";
  return { text: pact.measure === "count" ? `${n} ${days} within your limit` : `${n} ${days} without ${what}`, tone: "done" };
}

/**
 * Break pacts: does this person still need to answer for yesterday? Daily pacts: yesterday's link is waiting on
 * them. Weekly ones: every day counts toward the week, so any unanswered yesterday in a week that's still open.
 */
export function owesYesterdayAnswer(b: PactBundle, userId: string) {
  if (b.pact.kind !== "break") return false;
  const y = b.yesterday;
  if (y < b.pact.start_date || y > b.state.endDate) return false;
  const p = b.state.periods.find((x) => x.start <= y && y <= x.end);
  if (!p || p.rest || !p.required.includes(userId)) return false;
  if (p.status !== "late" && p.status !== "open") return false;
  if (p.status === "late" && !p.owing.includes(userId)) return false;
  return answerOn(b, userId, y) === null;
}

/** A break pact's answer for a day: "yes" (stayed off it / within the limit), "no" (gave in), or none yet. */
export function answerOn(b: PactBundle, userId: string, day: Day): "yes" | "no" | null {
  if (b.misses.some((m) => m.user_id === userId && m.day === day)) return "no";
  const c = b.checkins.find((x) => x.user_id === userId && x.day === day);
  if (!c) return null;
  const limit = limitOn(b.pact, day);
  return limit !== null && c.value !== null && c.value > limit ? "no" : "yes";
}

/** has this person done their part for the current period (today for daily, the weekly target for weekly)? */
export function didTheirPart(b: PactBundle, id: string) {
  const cur = b.state.current;
  if (!cur) return false;
  if (b.pact.cadence === "daily") return b.checkins.some((c) => c.user_id === id && c.day === b.today);
  return (cur.counts[id] ?? 0) >= b.state.need;
}

export function needsMe(b: PactBundle, me: string) {
  // break pacts only ever need you for yesterday; today is answered when you like, never chased
  if (b.pact.kind === "break") return owesYesterdayAnswer(b, me);
  if (b.state.phase !== "active" || !b.state.current) return false;
  if (!b.state.current.required.includes(me)) return false;
  if (b.pact.cadence === "daily") return !b.checkins.some((c) => c.user_id === me && c.day === b.today);
  return (b.state.current.counts[me] ?? 0) < b.state.need;
}
