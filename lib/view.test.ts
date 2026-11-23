import { describe, expect, it } from "vitest";
import type { PactBundle } from "./data";
import { addDays, type Day } from "./dates";
import { computePactState, type Cadence } from "./streak";
import { breakTitle, chainCountsText, inviteText, isStarting, lateOutcome, missOutcome, othersRiskingChain, pactName, pausingSoon, progressText, statusLine } from "./view";

const A = "a";
const B = "b";

/** a pact A started on `start`, with B joining today (counts from the next period, as join_pact sets it) */
function bundle(opts: { cadence: Cadence; start: Day; days: number; today: Day; bJoinedOn: Day; bCheckedIn?: boolean }): PactBundle {
  const pact = {
    id: "p",
    title: "Run",
    emoji: "🏃",
    kind: "build" as const,
    cadence: opts.cadence,
    times_per_week: opts.cadence === "daily" ? 7 : 3,
    duration_days: opts.days,
    start_date: opts.start,
    freezes_allowed: 1,
    round: 1,
  };
  const members = [
    { user_id: A, name: "Aashik", joined_on: opts.start, joined_at: `${opts.start}T09:00:00Z`, left_on: null, avatar_url: null },
    { user_id: B, name: "Sam Lee", joined_on: opts.bJoinedOn, joined_at: `${opts.today}T09:00:00Z`, left_on: null, avatar_url: null },
  ];
  const checkin = (user_id: string, day: Day) => ({ id: `${user_id}${day}`, pact_id: "p", user_id, day, value: null, note: null, feel: null, made_up: false, created_at: "" });
  // A kept every day so far, so nothing is waiting to be made up
  const checkins = [];
  for (let d = opts.start; d < opts.today; d = addDays(d, 1)) checkins.push(checkin(A, d));
  if (opts.bCheckedIn) checkins.push(checkin(B, opts.today));
  return {
    pact,
    members,
    allMembers: members,
    checkins,
    freezes: [],
    nudges: [],
    misses: [],
    changes: [],
    hearts: [],
    canAnswerToday: true,
    state: computePactState(pact, members, checkins, [], opts.today),
    today: opts.today,
    yesterday: addDays(opts.today, -1),
  } as unknown as PactBundle;
}

describe("joining mid-pact", () => {
  const daily = bundle({ cadence: "daily", start: "2026-11-01", days: 30, today: "2026-11-10", bJoinedOn: "2026-11-11" });

  it("is starting until the chain counts them, the creator isn't", () => {
    expect(isStarting(daily, B)).toBe(true);
    expect(isStarting(daily, A)).toBe(false);
    const later = bundle({ cadence: "daily", start: "2026-11-01", days: 30, today: "2026-11-11", bJoinedOn: "2026-11-11", bCheckedIn: true });
    expect(isStarting(later, B)).toBe(false);
    // joined but never checked in: still not counted
    const quiet = bundle({ cadence: "daily", start: "2026-11-01", days: 30, today: "2026-11-11", bJoinedOn: "2026-11-11" });
    expect(isStarting(quiet, B)).toBe(true);
  });

  it("isn't starting before the pact starts", () => {
    const upcoming = bundle({ cadence: "daily", start: "2026-11-12", days: 30, today: "2026-11-10", bJoinedOn: "2026-11-10" });
    expect(isStarting(upcoming, B)).toBe(false);
  });

  it("says when the chain counts them", () => {
    expect(chainCountsText(daily, B, "them")).toBe("The chain starts counting them after their first check-in");
    const dailyIn = bundle({ cadence: "daily", start: "2026-11-01", days: 30, today: "2026-11-10", bJoinedOn: "2026-11-11", bCheckedIn: true });
    expect(chainCountsText(dailyIn, B, "them")).toBe("The chain counts them from tomorrow");
    // weekly pact started on a Wednesday: joining on a Tuesday counts from tomorrow, on a Friday from Wednesday
    const tue = bundle({ cadence: "weekly", start: "2026-11-04", days: 28, today: "2026-11-10", bJoinedOn: "2026-11-11", bCheckedIn: true });
    expect(chainCountsText(tue, B, "you")).toBe("The chain counts you from tomorrow");
    const fri = bundle({ cadence: "weekly", start: "2026-11-04", days: 28, today: "2026-11-06", bJoinedOn: "2026-11-11", bCheckedIn: true });
    expect(isStarting(fri, B)).toBe(true);
    expect(chainCountsText(fri, B, "you")).toBe("The chain counts you from Wednesday");
  });

  it("is honest when the round ends before the chain can count them", () => {
    const lastDay = bundle({ cadence: "daily", start: "2026-11-01", days: 10, today: "2026-11-10", bJoinedOn: "2026-11-11", bCheckedIn: true });
    expect(isStarting(lastDay, B)).toBe(true);
    expect(chainCountsText(lastDay, B, "them")).toBe("This round ends before the chain counts them");
  });

  it("tells the new member they're in and can check in now", () => {
    expect(statusLine(daily, B)).toEqual({ text: "You're in. Check in today. The chain starts counting you after your first check-in.", tone: "info" });
    const fri = bundle({ cadence: "weekly", start: "2026-11-04", days: 28, today: "2026-11-06", bJoinedOn: "2026-11-11" });
    expect(statusLine(fri, B).text).toBe("You're in. Log your days this week. The chain starts counting you after your first check-in.");
  });

  it("tells the others the chain is safe while someone hasn't started", () => {
    const aDone = bundle({ cadence: "daily", start: "2026-11-01", days: 30, today: "2026-11-12", bJoinedOn: "2026-11-11" });
    aDone.checkins.push({ id: "x", pact_id: "p", user_id: A, day: "2026-11-12", value: null, note: null, feel: null, made_up: false, created_at: "" } as never);
    aDone.state = computePactState(aDone.pact, aDone.members, aDone.checkins, [], "2026-11-12");
    expect(aDone.state.current?.status).toBe("done");
    expect(statusLine(aDone, A).text).toBe("Done for today. Sam hasn't started yet.");
  });

  it("doesn't change the creator's line: a new member doesn't hold up today's link", () => {
    expect(statusLine(daily, A).text).toBe("Nobody's in yet. Go first.");
    const checkedIn = bundle({ cadence: "daily", start: "2026-11-01", days: 30, today: "2026-11-10", bJoinedOn: "2026-11-11", bCheckedIn: true });
    expect(checkedIn.state.current?.required).toEqual([A]);
    expect(statusLine(checkedIn, A).text).toBe("Sam did it. Your turn.");
  });
});


describe("breakTitle", () => {
  it("says No for none at all, Less otherwise", () => {
    expect(breakTitle("Soda", "none")).toBe("No soda");
    expect(breakTitle("Coffee", "amount")).toBe("Less coffee");
    expect(breakTitle("Takeout", "days")).toBe("Less takeout");
    expect(breakTitle("TikTok", "none")).toBe("No TikTok");
  });
  it("is empty without a subject", () => {
    expect(breakTitle("  ", "none")).toBe("");
  });
});

describe("pactName", () => {
  it("uses the title for either kind", () => {
    expect(pactName({ kind: "build", title: " Push-ups " })).toBe("Push-ups");
    expect(pactName({ kind: "break", title: "No soda", subject: "soda" })).toBe("No soda");
  });
  it("names a break pact from its subject when there's no title", () => {
    expect(pactName({ kind: "break", title: "", subject: "soda", cadence: "daily", measure: "none" })).toBe("No soda");
    expect(pactName({ kind: "break", title: null, subject: "coffee", cadence: "daily", measure: "count" })).toBe("Less coffee");
    expect(pactName({ kind: "break", subject: "takeout", cadence: "weekly", measure: "none" })).toBe("Less takeout");
  });
  it("is empty only when there's nothing to go on", () => {
    expect(pactName({ kind: "build", title: "" })).toBe("");
    expect(pactName({ kind: "break", title: "", subject: null })).toBe("");
  });
});

describe("inviteText", () => {
  it("quotes a build pact's name", () => {
    expect(inviteText({ kind: "build", title: "Push-ups", emoji: "💪" })).toBe(`💪 Do "Push-ups" with me. Let's not break the chain.`);
  });
  it("says what a break pact gives up", () => {
    expect(inviteText({ kind: "break", title: "No soda", subject: "soda", emoji: "🥤", cadence: "daily", measure: "none" })).toBe(
      "🥤 Give up soda with me. Let's not break the chain.",
    );
    expect(inviteText({ kind: "break", title: "Less coffee", subject: "coffee", emoji: "☕", cadence: "daily", measure: "count" })).toBe(
      "☕ Cut down on coffee with me. Let's not break the chain.",
    );
    expect(inviteText({ kind: "break", title: "Less takeout", subject: "takeout", emoji: "🥡", cadence: "weekly", measure: "none" })).toBe(
      "🥡 Cut down on takeout with me. Let's not break the chain.",
    );
  });
  it("falls back to the title when a break pact has no subject", () => {
    expect(inviteText({ kind: "break", title: "No soda", subject: null, emoji: "🥤" })).toBe(`🥤 Do "No soda" with me. Let's not break the chain.`);
  });
  it("never leaves empty quotes", () => {
    const empty = [
      { kind: "build" as const, title: "", emoji: "🔥" },
      { kind: "break" as const, title: "", subject: "", emoji: "🔥" },
      { kind: "break" as const, title: "   ", subject: null, emoji: "🔥" },
    ];
    for (const p of empty) {
      const text = inviteText(p);
      expect(text).not.toContain('""');
      expect(text).toBe("🔥 Join my pact. Let's not break the chain.");
    }
    expect(inviteText({ title: "", emoji: "" })).toBe("Join my pact. Let's not break the chain.");
  });
});

describe("paused after 3 quiet days", () => {
  // B checked in Nov 1-6, then went quiet on the 7th, 8th and 9th. It's the 11th and A has checked in.
  const b = bundle({ cadence: "daily", start: "2026-11-01", days: 30, today: "2026-11-11", bJoinedOn: "2026-11-01" });
  const ci = (user_id: string, day: string) => ({ id: `${user_id}${day}`, pact_id: "p", user_id, day, value: null, note: null, feel: null, made_up: false, created_at: "" });
  for (let d = "2026-11-01"; d <= "2026-11-06"; d = addDays(d, 1)) b.checkins.push(ci(B, d) as never);
  b.checkins.push(ci(A, "2026-11-11") as never);
  b.state = computePactState({ ...b.pact, freezes_allowed: 3 }, b.members, b.checkins, [], "2026-11-11");

  it("is paused from the 10th, and the others see it", () => {
    expect(b.state.paused[B]).toEqual({ since: "2026-11-10", why: "quiet" });
    expect(statusLine(b, B)).toEqual({ text: "You're paused after 3 quiet days. Check in to jump back in.", tone: "info" });
    expect(statusLine(b, A).text).toBe("Done for today. Sam is paused.");
    expect(chainCountsText(b, B, "them")).toBe("The chain counts them again from their next check-in");
  });

  it("says what a miss would do", () => {
    expect(missOutcome(b, A)).toBe("One of your freezes covers it, so the streak keeps going. You'll have 2 left.");
    expect(missOutcome(b, B)).toBe("You're out of freezes, so you're paused and the chain carries on without you. Check in any day to jump back in.");
  });
});

describe("the night before a pause", () => {
  const ci = (user_id: string, day: string) => ({ id: `${user_id}${day}`, pact_id: "p", user_id, day, value: null, note: null, feel: null, made_up: false, created_at: "" });
  // A kept every day and checked in today (the 10th); B checked in up to `bUntil`, and the 9th is still open
  function night(bUntil: Day, freezes: number, aMissed9 = false) {
    const b = bundle({ cadence: "daily", start: "2026-11-01", days: 30, today: "2026-11-10", bJoinedOn: "2026-11-01" });
    if (aMissed9) b.checkins = b.checkins.filter((c) => c.day !== "2026-11-09") as never;
    for (let d = "2026-11-01"; d <= bUntil; d = addDays(d, 1)) b.checkins.push(ci(B, d) as never);
    b.checkins.push(ci(A, "2026-11-10") as never);
    b.state = computePactState({ ...b.pact, freezes_allowed: freezes }, b.members, b.checkins, [], "2026-11-10");
    return b;
  }

  it("third quiet day: nobody waits on them, and the line says why", () => {
    const b = night("2026-11-06", 3);
    expect(b.state.late?.start).toBe("2026-11-09");
    expect(lateOutcome(b, B)).toBe("quiet");
    expect(pausingSoon(b, B)).toBe(true);
    expect(othersRiskingChain(b, A)).toEqual([]);
    expect(statusLine(b, A)).toEqual({ text: "Done for today. Sam has been quiet for 3 days.", tone: "done" });
  });

  it("out of freezes: paused at midnight, and the chain is safe", () => {
    const b = night("2026-11-08", 0);
    expect(lateOutcome(b, B)).toBe("out");
    expect(statusLine(b, A).text).toBe("Done for today. Sam is out of freezes.");
  });

  it("one missed day with freezes left: their freeze covers it, so only today is waited on", () => {
    const b = night("2026-11-08", 3);
    expect(lateOutcome(b, B)).toBe("freeze");
    expect(pausingSoon(b, B)).toBe(false);
    expect(othersRiskingChain(b, A)).toEqual([]);
    expect(statusLine(b, A).text).toBe("Waiting on Sam");
  });

  it("nobody kept it and someone can't pay: the chain is at risk, so it's still waited on", () => {
    const b = night("2026-11-08", 0, true);
    expect(lateOutcome(b, A)).toBe("break");
    expect(lateOutcome(b, B)).toBe("break");
    expect(othersRiskingChain(b, A)).toEqual(["Sam"]);
  });

  it("already checked in today: no pause coming", () => {
    const b = night("2026-11-08", 0);
    b.checkins.push(ci(B, "2026-11-10") as never);
    b.state = computePactState({ ...b.pact, freezes_allowed: 0 }, b.members, b.checkins, [], "2026-11-10");
    expect(lateOutcome(b, B)).toBe("without");
    expect(pausingSoon(b, B)).toBe(false);
    expect(statusLine(b, A).text).toBe("Everyone's in today");
  });

  it("after midnight they're paused", () => {
    const b = night("2026-11-06", 3);
    const next = computePactState({ ...b.pact, freezes_allowed: 3 }, b.members, b.checkins, [], "2026-11-11");
    expect(next.paused[B]).toEqual({ since: "2026-11-10", why: "quiet" });
  });
});

describe("weekly pacts name the week's end", () => {
  // started Wednesday 11 November: weeks run Wednesday to Tuesday. A checked in on the 11th only.
  const b = bundle({ cadence: "weekly", start: "2026-11-11", days: 28, today: "2026-11-12", bJoinedOn: "2026-11-13" });

  it("in the progress line", () => {
    expect(progressText(b)).toBe("Week 1 of 4, ends Tuesday");
    const last = bundle({ cadence: "weekly", start: "2026-11-11", days: 28, today: "2026-11-17", bJoinedOn: "2026-11-18" });
    expect(progressText(last)).toBe("Week 1 of 4, last day");
  });

  it("in the status line", () => {
    expect(statusLine(b, A)).toEqual({ text: "2 more by Tuesday", tone: "act" });
  });
});
