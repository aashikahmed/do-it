import { describe, expect, it } from "vitest";
import type { PactBundle } from "./data";
import { addDays, type Day } from "./dates";
import { computePactState, type Cadence } from "./streak";
import { chainCountsText, isStarting, statusLine } from "./view";

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
