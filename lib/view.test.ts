import { describe, expect, it } from "vitest";
import type { PactBundle } from "./data";
import { addDays, type Day } from "./dates";
import { computePactState, type Cadence } from "./streak";
import { breakTitle, chainCountsText, inviteText, isStarting, pactName, statusLine } from "./view";

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
    const later = bundle({ cadence: "daily", start: "2026-11-01", days: 30, today: "2026-11-11", bJoinedOn: "2026-11-11" });
    expect(isStarting(later, B)).toBe(false);
  });

  it("isn't starting before the pact starts", () => {
    const upcoming = bundle({ cadence: "daily", start: "2026-11-12", days: 30, today: "2026-11-10", bJoinedOn: "2026-11-10" });
    expect(isStarting(upcoming, B)).toBe(false);
  });

  it("says when the chain counts them", () => {
    expect(chainCountsText(daily, B, "them")).toBe("The chain counts them from tomorrow");
    // weekly pact started on a Wednesday: joining on a Tuesday counts from tomorrow, on a Friday from Wednesday
    const tue = bundle({ cadence: "weekly", start: "2026-11-04", days: 28, today: "2026-11-10", bJoinedOn: "2026-11-11" });
    expect(chainCountsText(tue, B, "you")).toBe("The chain counts you from tomorrow");
    const fri = bundle({ cadence: "weekly", start: "2026-11-04", days: 28, today: "2026-11-06", bJoinedOn: "2026-11-11" });
    expect(isStarting(fri, B)).toBe(true);
    expect(chainCountsText(fri, B, "you")).toBe("The chain counts you from Wednesday");
  });

  it("is honest when the round ends before the chain can count them", () => {
    const lastDay = bundle({ cadence: "daily", start: "2026-11-01", days: 10, today: "2026-11-10", bJoinedOn: "2026-11-11" });
    expect(isStarting(lastDay, B)).toBe(true);
    expect(chainCountsText(lastDay, B, "them")).toBe("This round ends before the chain counts them");
  });

  it("tells the new member they're in and can check in now", () => {
    expect(statusLine(daily, B)).toEqual({ text: "You're in. Check in today. The chain counts you from tomorrow.", tone: "info" });
    const fri = bundle({ cadence: "weekly", start: "2026-11-04", days: 28, today: "2026-11-06", bJoinedOn: "2026-11-11" });
    expect(statusLine(fri, B).text).toBe("You're in. Log your days this week. The chain counts you from Wednesday.");
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
