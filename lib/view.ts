import type { PactBundle } from "./data";
import { formatDay, diffDays, type Day } from "./dates";
import { limitOn, planFreezes, type Cadence, type Kind, type LateOutcome } from "./streak";
import { weekAtRisk, weekEndsText, weekNote, weekOutlook } from "./week";

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
  return (b.state.late?.owing ?? []).filter((u) => u !== me).map((u) => nameOf(b, u));
}

function nameOf(b: Pick<PactBundle, "allMembers">, id: string) {
  return firstName(b.allMembers.find((m) => m.user_id === id)?.name ?? "Someone");
}

/** what happens to someone who still owes yesterday if they don't make it up (a freeze covers it unless told otherwise) */
export function lateOutcome(b: Pick<PactBundle, "state">, id: string): LateOutcome | null {
  const late = b.state.late;
  if (!late?.owing.includes(id)) return null;
  return late.ifMissed[id] ?? "freeze";
}

/** about to be paused when yesterday closes: their 3rd quiet day, or out of freezes */
export function pausingSoon(b: Pick<PactBundle, "state">, id: string) {
  const o = lateOutcome(b, id);
  return o === "quiet" || o === "out";
}

/**
 * First names of everyone else whose missed yesterday would break the chain. Anyone else who owes it is covered
 * either way (their own freeze, or a pause), so nobody waits on them.
 */
export function othersRiskingChain(b: PactBundle, me: string) {
  return (b.state.late?.owing ?? []).filter((u) => u !== me && lateOutcome(b, u) === "break").map((u) => nameOf(b, u));
}

/** "3 quiet days" (daily) or "a quiet week" (weekly) */
export function quietSpan(cadence: Cadence) {
  return cadence === "daily" ? "3 quiet days" : "a quiet week";
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

/** "Soda" → "soda" for use mid-sentence, but "TikTok" stays as typed. */
export function inSentence(s: string) {
  const t = s.trim();
  return /[A-Z]/.test(t.slice(1)) ? t : t.charAt(0).toLowerCase() + t.slice(1);
}

export type BreakMode = "none" | "days" | "amount";

/** What a break pact is called: "No soda" (none at all), "Less coffee" (some days, or a little each day). */
export function breakTitle(subject: string, mode: BreakMode) {
  const s = inSentence(subject);
  return s ? `${mode === "none" ? "No" : "Less"} ${s}`.slice(0, 60) : "";
}

type Nameable = {
  title?: string | null;
  kind?: Kind | null;
  subject?: string | null;
  cadence?: Cadence;
  measure?: string;
};

/** a break pact that allows none at all: daily, no amounts */
const givesUpAll = (p: Nameable) => p.cadence !== "weekly" && (p.measure ?? "none") === "none";

/**
 * What a pact is called, for either kind: its title, or for a break pact without one, "No soda".
 * Empty only when there's nothing to go on, so callers word the sentence around it.
 */
export function pactName(p: Nameable) {
  const title = (p.title ?? "").trim();
  if (title) return title;
  if (p.kind === "break") return breakTitle(p.subject ?? "", givesUpAll(p) ? "none" : "amount");
  return "";
}

/**
 * The message that goes with an invite link. The creator chooses to send it, so it can name the habit
 * (pushes never do). Never leaves empty quotes: with no name, the sentence doesn't need one.
 */
export function inviteText(p: Nameable & { emoji?: string | null }) {
  const emoji = (p.emoji ?? "").trim();
  const lead = emoji ? `${emoji} ` : "";
  const tail = "Let's not break the chain.";
  const subject = inSentence(p.subject ?? "");
  if (p.kind === "break" && subject) return `${lead}${givesUpAll(p) ? "Give up" : "Cut down on"} ${subject} with me. ${tail}`;
  const name = pactName(p);
  return name ? `${lead}Do "${name}" with me. ${tail}` : `${lead}Join my pact. ${tail}`;
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

/** Has the chain paused this person (3 quiet days, or a miss with no freezes left)? Their next check-in brings them back. */
export function isPaused(b: Pick<PactBundle, "state">, id: string) {
  return !!b.state.paused[id];
}

/** Has this person made a check-in that counts? Until then the chain doesn't count them (see countsFrom). */
export function hasStarted(b: Pick<PactBundle, "state">, id: string) {
  return !!b.state.countsFrom[id];
}

/**
 * In the pact and free to check in now, but not counted by the chain yet: they haven't checked in at all, or they
 * joined mid-pact and count from the next period (joining never reopens a period the group already closed).
 */
export function isStarting(b: Pick<PactBundle, "state" | "members">, id: string) {
  const cur = b.state.current;
  return b.state.phase === "active" && !!cur && b.members.some((m) => m.user_id === id) && !cur.required.includes(id);
}

/**
 * When the chain starts counting someone: after their first check-in, or once started, "from tomorrow" (or "from
 * Monday", the next pact week). Counting after the last period means this round ends first. No full stop, callers add one.
 */
export function chainCountsText(b: Pick<PactBundle, "state" | "members" | "today">, id: string, who: "you" | "them") {
  if (b.state.paused[id]) return `The chain counts ${who} again from ${who === "you" ? "your" : "their"} next check-in`;
  const from = b.state.countsFrom[id];
  if (!from) return `The chain starts counting ${who} after ${who === "you" ? "your" : "their"} first check-in`;
  if (from > b.state.endDate) return `This round ends before the chain counts ${who}`;
  const when = diffDays(b.today, from) === 1 ? "tomorrow" : formatDay(from, { weekday: "long" });
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
  // weeks run from the pact's own start day, so always say which day this one ends
  const ends = state.current ? `, ${weekEndsText(state.current.end, b.today)}` : "";
  const where =
    pact.cadence === "daily" ? `day ${state.dayNumber} of ${pact.duration_days}` : `week ${(state.current?.index ?? 0) + 1} of ${state.periods.length}${ends}`;
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
    const risky = othersRiskingChain(b, me);
    if (risky.length) return { text: `Waiting on ${listNames(risky)} to answer for yesterday`, tone: "wait" };
  }
  if (state.late) {
    const day = makeUpLabel(pact.cadence, state.late);
    if (owesMakeUp(b, me)) return { text: `${capitalize(day)} is still open. Make it up today.`, tone: "risk" };
    const risky = othersRiskingChain(b, me);
    if (risky.length) return { text: `Waiting on ${listNames(risky)} to make up ${day}`, tone: "wait" };
  }
  if (state.phase === "ended") {
    const unit = pact.cadence === "daily" ? "days" : "weeks";
    return { text: `${state.completion.done + state.periods.filter((p) => p.status === "frozen").length} of ${state.completion.total} ${unit} closed`, tone: "info" };
  }
  // with yesterday still open, the make-up card handles any older misses
  if (state.repair && !state.late) return { text: `Streak broke. A freeze can save it.`, tone: "risk" };
  if (pact.kind === "break") return breakLine(b, me);

  const cur = state.current!;
  const need = state.need;
  const owes = (id: string) =>
    pact.cadence === "daily" ? !b.checkins.some((c) => c.user_id === id && c.day === b.today) : (cur.counts[id] ?? 0) < need;
  const iOwe = owes(me);
  // someone being paused at midnight doesn't count toward today either way, and nor does someone who can't make
  // this week anymore (their own freeze or a pause settles it), unless the streak hangs on them
  const lostWeek = (id: string) => {
    const o = weekOutlook(b, id);
    return o?.pace === "short" && o.ifShort !== "break";
  };
  const othersOwing = others.filter((m) => cur.required.includes(m.user_id) && owes(m.user_id) && !pausingSoon(b, m.user_id) && !lostWeek(m.user_id));
  const othersDone = others.filter((m) => !owes(m.user_id));

  if (isPaused(b, me)) {
    const why = state.paused[me].why === "out" ? "You were out of freezes, so you're paused." : `You're paused after ${pact.cadence === "daily" ? "3 quiet days" : "a quiet week"}.`;
    return { text: `${why} Check in to jump back in.`, tone: "info" };
  }
  if (isStarting(b, me) && iOwe) {
    const start = pact.cadence === "daily" ? "Check in today." : "Log your days this week.";
    return { text: `You're in. ${start} ${chainCountsText(b, me, "you")}.`, tone: "info" };
  }
  if (pact.cadence === "weekly" && iOwe) {
    const o = weekOutlook(b, me);
    const note = o && weekNote(o, b.today);
    if (o && note) return { text: note.replace(/\.$/, ""), tone: weekAtRisk(o) ? "risk" : o.pace === "short" ? "info" : "act" };
    return { text: `${need - (cur.counts[me] ?? 0)} more this week`, tone: "act" };
  }
  if (iOwe) {
    if (!others.length) return { text: "Your turn today", tone: "act" };
    if (othersDone.length) return { text: `${listNames(othersDone.map((m) => firstName(m.name)))} did it. Your turn.`, tone: "act" };
    return { text: "Nobody's in yet. Go first.", tone: "act" };
  }
  if (!others.length) return { text: "Done. Invite someone to share the chain.", tone: "done" };
  if (othersOwing.length) return { text: `Waiting on ${listNames(othersOwing.map((m) => firstName(m.name)))}`, tone: "wait" };
  // the chain is safe, but someone in the pact hasn't checked in even once, or is paused
  const notYet = others.filter((m) => !hasStarted(b, m.user_id) && owes(m.user_id));
  const away = others.filter((m) => isPaused(b, m.user_id) && owes(m.user_id));
  const quiet = others.filter((m) => lateOutcome(b, m.user_id) === "quiet" && owes(m.user_id));
  // weekly: nothing logged all week and too few days left to make it, so the week's end pauses them
  const silent = others.filter((m) => weekOutlook(b, m.user_id)?.ifShort === "quiet");
  const out = others.filter((m) => lateOutcome(b, m.user_id) === "out" && owes(m.user_id));
  if (notYet.length || away.length || quiet.length || out.length || silent.length) {
    const names = (xs: typeof others) => listNames(xs.map((m) => firstName(m.name)));
    const bits = [
      notYet.length ? `${names(notYet)} ${notYet.length === 1 ? "hasn't" : "haven't"} started yet.` : "",
      away.length ? `${names(away)} ${away.length === 1 ? "is" : "are"} paused.` : "",
      quiet.length ? `${names(quiet)} ${quiet.length === 1 ? "has" : "have"} been quiet for ${pact.cadence === "daily" ? "3 days" : "a week"}.` : "",
      out.length ? `${names(out)} ${out.length === 1 ? "is" : "are"} out of freezes.` : "",
      silent.length ? `${names(silent)} ${silent.length === 1 ? "hasn't" : "haven't"} logged anything this week.` : "",
    ].filter(Boolean);
    return { text: `${pact.cadence === "daily" ? "Done for today" : "Target hit this week"}. ${bits.join(" ")}`, tone: "done" };
  }
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
    const until = cur.end === b.today ? "today" : `until ${formatDay(cur.end, { weekday: "long" })}`;
    return { text: left === 0 ? `No ${what} days left ${until}` : `${left} of ${allowed} ${what} ${allowed === 1 ? "day" : "days"} left ${until}`, tone: "info" };
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

/** your own freezes left in this pact */
export function myFreezes(b: Pick<PactBundle, "state">, me: string) {
  return b.state.freezesLeftBy[me] ?? 0;
}

/**
 * What tapping "use a freeze" for `periods` would do, from `me`'s side: whether it can, the button, and one line on
 * whose freezes it uses. Each person's miss uses their own; when they're out, `me` gives one of theirs.
 */
export function freezeOffer(b: Pick<PactBundle, "state" | "members">, me: string, periods: Day[]) {
  const plan = planFreezes(b.state, periods, me);
  const name = (u: string) => firstName(b.members.find((m) => m.user_id === u)?.name ?? "Someone");
  const n = plan.payments.length;
  const mine = myFreezes(b, me);
  const notes: string[] = [];
  const own = plan.payments.filter((p) => p.paidBy === me && p.covers === me).length;
  if (own) notes.push(`Uses ${own === 1 ? "1" : own} of your ${mine}.`);
  const theirs = [...new Set(plan.payments.filter((p) => p.paidBy === p.covers && p.covers !== me).map((p) => p.covers))];
  if (theirs.length) notes.push(theirs.length === 1 ? `Uses one of ${name(theirs[0])}'s own freezes.` : `Uses ${listNames(theirs.map(name))}'s own freezes.`);
  if (plan.gifts.length) {
    const g = listNames(plan.gifts.map(name));
    notes.push(`${g} ${plan.gifts.length === 1 ? "is" : "are"} out, so ${plan.gifts.length === 1 ? "it comes" : "they come"} from yours (${mine} left).`);
  }
  if (!plan.ok) {
    if (plan.stuck.includes(me)) {
      const givers = b.members.filter((m) => m.user_id !== me && myFreezes(b, m.user_id) > 0).map((m) => firstName(m.name));
      notes.splice(0, notes.length, `You're out of freezes.${givers.length ? ` ${listNames(givers)} can give you one.` : ""}`);
    } else {
      const s = listNames(plan.stuck.map(name));
      notes.splice(0, notes.length, `${s} ${plan.stuck.length === 1 ? "is" : "are"} out of freezes, and so are you.`);
    }
  }
  const button = plan.gifts.length
    ? `🎁 Give ${listNames(plan.gifts.map(name))} ${n === 1 ? "a freeze" : `${n} freezes`}`
    : `🧊 Use ${n === 1 ? "a freeze" : `${n} freezes`}`;
  return { ok: plan.ok, n, button, note: notes.join(" "), gifts: plan.gifts, payments: plan.payments };
}

/**
 * What a miss of yours does now: your own freeze covers it, or (out of freezes) you're paused and the chain carries
 * on without you. Only alone, with no freezes left, does it break. One or two sentences, ends with a full stop.
 */
export function missOutcome(b: Pick<PactBundle, "state" | "members">, me: string) {
  const left = myFreezes(b, me);
  if (left > 0) return `One of your freezes covers it, so the streak keeps going. You'll have ${left - 1} left.`;
  if (b.members.length > 1) return "You're out of freezes, so you're paused and the chain carries on without you. Check in any day to jump back in.";
  return `You're out of freezes, so the chain breaks. Your best stays ${b.state.best}.`;
}
