import type { PactBundle } from "./data";
import { formatDay, diffDays } from "./dates";

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

export function cadenceText(p: { cadence: "daily" | "weekly"; times_per_week: number; duration_days: number }) {
  if (p.cadence === "daily") return `Every day for ${p.duration_days} days`;
  const weeks = Math.round(p.duration_days / 7);
  const freq = p.times_per_week === 1 ? "Once a week" : `${p.times_per_week} times a week`;
  return `${freq} for ${weeks} weeks`;
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
  if (state.phase === "ended") return "Finished";
  if (pact.cadence === "daily") return `Day ${state.dayNumber} of ${pact.duration_days}`;
  const week = (state.current?.index ?? 0) + 1;
  return `Week ${week} of ${state.periods.length}`;
}

export type Tone = "act" | "wait" | "done" | "info" | "risk";

/** One line that tells the viewer what's going on in this pact right now. */
export function statusLine(b: PactBundle, me: string): { text: string; tone: Tone } {
  const { state, members, pact } = b;
  const others = members.filter((m) => m.user_id !== me);
  if (state.phase === "upcoming") {
    return others.length ? { text: `${startsText(pact.start_date, b.today)} with ${listNames(others.map((m) => firstName(m.name)))}`, tone: "info" } : { text: "Invite someone before it starts", tone: "info" };
  }
  if (state.phase === "ended") {
    const unit = pact.cadence === "daily" ? "days" : "weeks";
    return { text: `${state.completion.done + state.periods.filter((p) => p.status === "frozen").length} of ${state.completion.total} ${unit} closed`, tone: "info" };
  }
  if (state.repair) return { text: `Streak broke. A freeze can save it.`, tone: "risk" };

  const cur = state.current!;
  const need = state.need;
  const owes = (id: string) =>
    pact.cadence === "daily" ? !b.checkins.some((c) => c.user_id === id && c.day === b.today) : (cur.counts[id] ?? 0) < need;
  const iOwe = owes(me);
  const othersOwing = others.filter((m) => cur.required.includes(m.user_id) && owes(m.user_id));
  const othersDone = others.filter((m) => !owes(m.user_id));

  const iCount = cur.required.includes(me);
  if (!iCount && iOwe) {
    return { text: pact.cadence === "daily" ? "You join the chain tomorrow. Check in anyway." : "You join the chain next week. Check in anyway.", tone: "info" };
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

/** has this person done their part for the current period (today for daily, the weekly target for weekly)? */
export function didTheirPart(b: PactBundle, id: string) {
  const cur = b.state.current;
  if (!cur) return false;
  if (b.pact.cadence === "daily") return b.checkins.some((c) => c.user_id === id && c.day === b.today);
  return (cur.counts[id] ?? 0) >= b.state.need;
}

export function needsMe(b: PactBundle, me: string) {
  if (b.state.phase !== "active" || !b.state.current) return false;
  if (!b.state.current.required.includes(me)) return false;
  if (b.pact.cadence === "daily") return !b.checkins.some((c) => c.user_id === me && c.day === b.today);
  return (b.state.current.counts[me] ?? 0) < b.state.need;
}
