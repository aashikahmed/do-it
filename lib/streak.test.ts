import { describe, expect, it } from "vitest";
import { addDays, diffDays, todayIn } from "./dates";
import { computePactState, freezesFor, type CheckinCore, type PactCore } from "./streak";

const daily: PactCore = { cadence: "daily", times_per_week: 7, duration_days: 30, start_date: "2026-11-01", freezes_allowed: 3 };
const A = "a";
const B = "b";
const both = [
  { user_id: A, joined_on: "2026-10-31" },
  { user_id: B, joined_on: "2026-10-31" },
];
const ci = (u: string, ...days: string[]): CheckinCore[] => days.map((day) => ({ user_id: u, day }));
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe("dates", () => {
  it("adds and diffs across month and DST boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(diffDays("2026-11-01", "2026-12-01")).toBe(30);
  });
  it("resolves today per timezone", () => {
    const t = new Date("2026-11-04T22:30:00Z");
    expect(todayIn("UTC", t)).toBe("2026-11-04");
    expect(todayIn("Asia/Dubai", t)).toBe("2026-11-05");
    expect(todayIn("America/Los_Angeles", t)).toBe("2026-11-04");
    expect(todayIn("Not/AZone", t)).toBe("2026-11-04");
  });
});

describe("daily pacts", () => {
  it("is upcoming before start", () => {
    const s = computePactState(daily, both, [], [], "2026-10-31");
    expect(s.phase).toBe("upcoming");
    expect(s.streak).toBe(0);
    expect(s.current).toBeNull();
  });

  it("open today does not break the streak", () => {
    const days = range("2026-11-01", 3);
    const s = computePactState(daily, both, [...ci(A, ...days), ...ci(B, ...days)], [], "2026-11-04");
    expect(s.current?.status).toBe("open");
    expect(s.streak).toBe(3);
    expect(s.dayNumber).toBe(4);
  });

  it("counts today once everyone checked in", () => {
    const days = range("2026-11-01", 4);
    const s = computePactState(daily, both, [...ci(A, ...days), ...ci(B, ...days)], [], "2026-11-04");
    expect(s.current?.status).toBe("done");
    expect(s.streak).toBe(4);
    expect(s.best).toBe(4);
  });

  it("one partner missing breaks the shared chain", () => {
    const days = range("2026-11-01", 3);
    const s = computePactState(daily, both, [...ci(A, ...days), ...ci(B, "2026-11-01", "2026-11-03")], [], "2026-11-04");
    expect(s.periods[1].status).toBe("missed");
    expect(s.streak).toBe(1);
    expect(s.best).toBe(1);
  });

  it("offers a freeze for the trailing miss and the freeze restores it", () => {
    const days = range("2026-11-01", 3);
    const checks = [...ci(A, ...days), ...ci(B, ...days), ...ci(A, "2026-11-04")];
    const before = computePactState(daily, both, checks, [], "2026-11-05");
    expect(before.periods[3].status).toBe("missed");
    expect(before.streak).toBe(0);
    expect(before.repair).toEqual({ periods: ["2026-11-04"], previous: 3 });

    const after = computePactState(daily, both, checks, ["2026-11-04"], "2026-11-05");
    expect(after.periods[3].status).toBe("frozen");
    expect(after.streak).toBe(4);
    expect(after.freezesLeft).toBe(2);
    expect(after.repair).toBeNull();
  });

  it("does not offer a repair when the gap is larger than freezes left", () => {
    const days = range("2026-11-01", 3);
    const pact = { ...daily, freezes_allowed: 1 };
    const s = computePactState(pact, both, [...ci(A, ...days), ...ci(B, ...days)], [], "2026-11-06");
    expect(s.repair).toBeNull();
  });

  it("repair window closes once a later day completes", () => {
    const checks = [
      ...ci(A, "2026-11-01", "2026-11-02", "2026-11-04"),
      ...ci(B, "2026-11-01", "2026-11-02", "2026-11-04"),
    ];
    const s = computePactState(daily, both, checks, [], "2026-11-05");
    expect(s.repair).toBeNull();
    expect(s.streak).toBe(1);
    expect(s.best).toBe(2);
  });

  it("no repair when nothing would be restored", () => {
    const s = computePactState(daily, both, [], [], "2026-11-02");
    expect(s.repair).toBeNull();
  });

  it("late joiners only count from the day they joined", () => {
    const members = [
      { user_id: A, joined_on: "2026-10-31" },
      { user_id: B, joined_on: "2026-11-03" },
    ];
    const s = computePactState(daily, members, [...ci(A, "2026-11-01", "2026-11-02", "2026-11-03"), ...ci(B, "2026-11-03")], [], "2026-11-04");
    expect(s.streak).toBe(3);
  });

  it("a member leaving does not rewrite past periods", () => {
    const days = range("2026-11-01", 3);
    const members = [
      { user_id: A, joined_on: "2026-10-31" },
      { user_id: B, joined_on: "2026-10-31", left_on: "2026-11-03" },
    ];
    // B missed day 2 then left on day 3: day 2 stays missed, day 3 onwards only needs A
    const s = computePactState(daily, members, [...ci(A, ...days), ...ci(B, "2026-11-01")], [], "2026-11-04");
    expect(s.periods[1].status).toBe("missed");
    expect(s.periods[2].status).toBe("done");
    expect(s.periods[2].required).toEqual([A]);
    expect(s.streak).toBe(1);
  });

  it("a late joiner counting from tomorrow does not reopen today", () => {
    const members = [
      { user_id: A, joined_on: "2026-10-31" },
      { user_id: B, joined_on: "2026-11-05" },
    ];
    const s = computePactState(daily, members, ci(A, "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"), [], "2026-11-04");
    expect(s.current?.status).toBe("done");
    expect(s.current?.required).toEqual([A]);
    expect(s.streak).toBe(4);
  });

  it("ignores duplicate, out-of-range and non-member check-ins", () => {
    const s = computePactState(
      daily,
      both,
      [...ci(A, "2026-11-01", "2026-11-01", "2026-10-30", "2026-12-15"), ...ci("ghost", "2026-11-01"), ...ci(B, "2026-11-01")],
      [],
      "2026-11-02",
    );
    expect(s.periods[0].counts[A]).toBe(1);
    expect(s.periods[0].status).toBe("done");
    expect(s.streak).toBe(1);
  });

  it("ends after the last day and keeps the final streak", () => {
    const pact = { ...daily, duration_days: 7 };
    const days = range("2026-11-01", 7);
    const s = computePactState(pact, both, [...ci(A, ...days), ...ci(B, ...days)], [], "2026-11-10");
    expect(s.phase).toBe("ended");
    expect(s.streak).toBe(7);
    expect(s.completion).toEqual({ done: 7, closed: 7, total: 7 });
    expect(s.dayNumber).toBe(7);
  });
});

describe("weekly pacts", () => {
  const weekly: PactCore = { cadence: "weekly", times_per_week: 3, duration_days: 28, start_date: "2026-11-01", freezes_allowed: 1 };

  it("week stays open until the target is met", () => {
    const s = computePactState(weekly, both, [...ci(A, "2026-11-01", "2026-11-02"), ...ci(B, "2026-11-01", "2026-11-03", "2026-11-04")], [], "2026-11-04");
    expect(s.periods.length).toBe(4);
    expect(s.current?.status).toBe("open");
    expect(s.need).toBe(3);
  });

  it("completed weeks build the streak in weeks", () => {
    const wk1 = ["2026-11-01", "2026-11-03", "2026-11-05"];
    const wk2 = ["2026-11-08", "2026-11-09", "2026-11-10"];
    const s = computePactState(weekly, both, [...ci(A, ...wk1, ...wk2), ...ci(B, ...wk1, ...wk2)], [], "2026-11-10");
    expect(s.periods[0].status).toBe("done");
    expect(s.current?.status).toBe("done");
    expect(s.streak).toBe(2);
  });

  it("a short week falls short and gets offered a freeze", () => {
    const wk1 = ["2026-11-01", "2026-11-03", "2026-11-05"];
    const s = computePactState(weekly, both, [...ci(A, ...wk1, "2026-11-08"), ...ci(B, ...wk1)], [], "2026-11-15");
    expect(s.periods[1].status).toBe("missed");
    expect(s.repair).toEqual({ periods: ["2026-11-08"], previous: 1 });
  });
});

describe("freezesFor", () => {
  it("matches the SQL allowance", () => {
    expect(freezesFor("daily", 7)).toBe(1);
    expect(freezesFor("daily", 30)).toBe(3);
    expect(freezesFor("weekly", 28)).toBe(1);
    expect(freezesFor("weekly", 84)).toBe(3);
  });
});
