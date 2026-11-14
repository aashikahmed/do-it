import { describe, expect, it } from "vitest";
import { addDays, diffDays, todayIn } from "./dates";
import { computePactState, freezesFor, planFreezes, isRestDay, limitOn, type CheckinCore, type PactCore } from "./streak";

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
    expect(before.periods[3].status).toBe("late");
    expect(before.streak).toBe(3);
    expect(before.repair).toEqual({ periods: ["2026-11-04"], previous: 3 });

    const after = computePactState(daily, both, checks, [{ period_start: "2026-11-04", paid_by: B, covers: B }], "2026-11-05");
    expect(after.periods[3].status).toBe("frozen");
    expect(after.streak).toBe(4);
    expect(after.freezesLeftBy).toEqual({ [A]: 3, [B]: 2 });
    expect(after.repair).toBeNull();
  });

  it("does not offer a repair when the gap is larger than freezes left", () => {
    const days = range("2026-11-01", 3);
    const pact = { ...daily, freezes_allowed: 1 };
    // Nov 4 and 5 need freezes (only 1 left); Nov 6 could be made up but that isn't enough
    const s = computePactState(pact, both, [...ci(A, ...days), ...ci(B, ...days)], [], "2026-11-07");
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

describe("nobody counts until their first check-in", () => {
  // A and F built an 8-day streak; C joined on day 8 (counts from day 9) and never opened the app again
  const C = "c";
  const F = "f";
  const trio = [
    { user_id: A, joined_on: "2026-10-31" },
    { user_id: F, joined_on: "2026-10-31" },
    { user_id: C, joined_on: "2026-11-09" },
  ];
  const kept = (n: number) => [...ci(A, ...range("2026-11-01", n)), ...ci(F, ...range("2026-11-01", n))];

  it("someone who never checks in can't break the chain", () => {
    const s = computePactState(daily, trio, kept(14), [], "2026-11-15");
    expect(s.countsFrom[C]).toBeNull();
    expect(s.periods.slice(0, 14).every((p) => p.status === "done")).toBe(true);
    expect(s.periods[10].required).toEqual([A, F]);
    expect(s.streak).toBe(14);
    expect(s.late).toBeNull();
    expect(s.repair).toBeNull();
  });

  it("they count from their first check-in on, like everyone else", () => {
    const s = computePactState(daily, trio, [...kept(14), ...ci(C, "2026-11-12")], [], "2026-11-15");
    expect(s.countsFrom[C]).toBe("2026-11-12");
    expect(s.periods[10].required).toEqual([A, F]);
    expect(s.periods[11].required).toEqual([A, F, C]);
    // C skipped the 13th and 14th: now those break the chain for everyone
    expect(s.periods[11].status).toBe("done");
    expect(s.periods[12].status).toBe("missed");
    expect(s.streak).toBe(0);
  });

  it("never before the day they joined", () => {
    const s = computePactState(daily, trio, [...kept(9), ...ci(C, "2026-11-08")], [], "2026-11-10");
    expect(s.countsFrom[C]).toBe("2026-11-09");
  });

  it("weekly: a first check-in mid-week counts from the next week, on the first day it counts that week", () => {
    const weekly: PactCore = { cadence: "weekly", times_per_week: 3, duration_days: 28, start_date: "2026-11-02", freezes_allowed: 1 };
    const members = [{ user_id: A, joined_on: "2026-11-02" }, { user_id: C, joined_on: "2026-11-02" }];
    const aWeek = ci(A, "2026-11-02", "2026-11-03", "2026-11-04");
    const mid = computePactState(weekly, members, [...aWeek, ...ci(C, "2026-11-05")], [], "2026-11-06");
    expect(mid.countsFrom[C]).toBe("2026-11-09");
    expect(mid.current?.status).toBe("done");
    const first = computePactState(weekly, members, [...aWeek, ...ci(C, "2026-11-02")], [], "2026-11-06");
    expect(first.countsFrom[C]).toBe("2026-11-02");
    expect(first.current?.owing).toEqual([C]);
  });

  it("before anyone has started, whoever showed up counts, else everyone", () => {
    // weekly, nobody checked in on the first day: A's week still counts without C
    const weekly: PactCore = { cadence: "weekly", times_per_week: 3, duration_days: 28, start_date: "2026-11-02", freezes_allowed: 1 };
    const members = [{ user_id: A, joined_on: "2026-11-02" }, { user_id: C, joined_on: "2026-11-02" }];
    const w = computePactState(weekly, members, ci(A, "2026-11-03", "2026-11-04", "2026-11-05"), [], "2026-11-06");
    expect(w.periods[0].required).toEqual([A]);
    expect(w.periods[0].status).toBe("done");
    // daily, nobody checked in on day 1: it's still open for both to make up
    const d = computePactState(daily, both, [], [], "2026-11-02");
    expect(d.periods[0].required).toEqual([A, B]);
    expect(d.late?.owing).toEqual([A, B]);
    // A makes it up: A has started, day 1 counts with A alone
    const made = computePactState(daily, both, [{ user_id: A, day: "2026-11-01", made_up: true }], [], "2026-11-02");
    expect(made.periods[0].status).toBe("done");
  });

  it("a check-in over a break pact's limit isn't a start", () => {
    const cut: PactCore = { cadence: "daily", times_per_week: 7, duration_days: 30, start_date: "2026-11-01", freezes_allowed: 3, kind: "break", target: 2 };
    const s = computePactState(cut, both, [...ci(A, "2026-11-01", "2026-11-02"), { user_id: B, day: "2026-11-02", value: 5 }], [], "2026-11-03");
    expect(s.countsFrom[B]).toBeNull();
    expect(s.streak).toBe(2);
  });
});

describe("make-up day", () => {
  const days = range("2026-11-01", 3);
  // A and B kept Nov 1-3; on Nov 4 only A checked in. It's Nov 5.
  const base = [...ci(A, ...days, "2026-11-04"), ...ci(B, ...days)];

  it("yesterday stays open: the streak is on the line, not broken", () => {
    const s = computePactState(daily, both, base, [], "2026-11-05");
    expect(s.late?.start).toBe("2026-11-04");
    expect(s.late?.owing).toEqual([B]);
    expect(s.streak).toBe(3);
    expect(s.best).toBe(3);
    expect(s.completion.closed).toBe(3);
  });

  it("making it up closes the link and marks it", () => {
    const s = computePactState(daily, both, [...base, { user_id: B, day: "2026-11-04", made_up: true }], [], "2026-11-05");
    expect(s.periods[3].status).toBe("done");
    expect(s.periods[3].madeUp).toBe(true);
    expect(s.late).toBeNull();
    expect(s.repair).toBeNull();
    expect(s.streak).toBe(4);
  });

  it("logging late without making up isn't marked", () => {
    const s = computePactState(daily, both, [...base, ...ci(B, "2026-11-04")], [], "2026-11-05");
    expect(s.periods[3].madeUp).toBe(false);
    expect(s.periods[2].madeUp).toBe(false);
  });

  it("works in either order with today", () => {
    const s = computePactState(daily, both, [...base, ...ci(A, "2026-11-05"), ...ci(B, "2026-11-05")], [], "2026-11-05");
    expect(s.late?.start).toBe("2026-11-04");
    expect(s.current?.status).toBe("done");
    // today counts, yesterday is on the line
    expect(s.streak).toBe(4);
  });

  it("breaks at midnight if nobody makes it up", () => {
    const s = computePactState(daily, both, [...base, ...ci(A, "2026-11-05"), ...ci(B, "2026-11-05")], [], "2026-11-06");
    expect(s.periods[3].status).toBe("missed");
    expect(s.late).toBeNull();
    expect(s.streak).toBe(1);
  });

  it("only yesterday can be made up", () => {
    // Nov 3 and Nov 4 both missed by B: Nov 3 is a plain miss, Nov 4 is late
    const checks = [...ci(A, ...range("2026-11-01", 4)), ...ci(B, "2026-11-01", "2026-11-02")];
    const s = computePactState(daily, both, checks, [], "2026-11-05");
    expect(s.periods[2].status).toBe("missed");
    expect(s.periods[3].status).toBe("late");
    expect(s.streak).toBe(0);
    expect(s.repair).toEqual({ periods: ["2026-11-03", "2026-11-04"], previous: 2 });
  });

  it("offers the freeze for the older miss even when there aren't enough for both", () => {
    const pact = { ...daily, freezes_allowed: 1 };
    const checks = [...ci(A, ...range("2026-11-01", 4)), ...ci(B, "2026-11-01", "2026-11-02")];
    const s = computePactState(pact, both, checks, [], "2026-11-05");
    expect(s.repair?.periods).toEqual(["2026-11-03", "2026-11-04"]);
    // freeze Nov 3, then make up Nov 4
    const after = computePactState(pact, both, [...checks, { user_id: B, day: "2026-11-04", made_up: true }], ["2026-11-03"], "2026-11-05");
    expect(after.streak).toBe(4);
  });

  it("no freeze on offer when none are left; making up is still possible", () => {
    const pact = { ...daily, freezes_allowed: 0 };
    const s = computePactState(pact, both, base, [], "2026-11-05");
    expect(s.repair).toBeNull();
    expect(s.late?.start).toBe("2026-11-04");
  });

  it("calling it a miss breaks it now, and a freeze can still patch it", () => {
    const s = computePactState(daily, both, base, [], "2026-11-05", [{ user_id: B, day: "2026-11-04" }]);
    expect(s.periods[3].status).toBe("missed");
    expect(s.late).toBeNull();
    expect(s.streak).toBe(0);
    expect(s.repair).toEqual({ periods: ["2026-11-04"], previous: 3 });
  });

  it("an old miss call doesn't affect anything", () => {
    const s = computePactState(daily, both, base, [], "2026-11-05", [{ user_id: B, day: "2026-11-02" }]);
    expect(s.late?.start).toBe("2026-11-04");
  });

  it("a frozen yesterday stays frozen, and logging it after counts as done", () => {
    expect(computePactState(daily, both, base, ["2026-11-04"], "2026-11-05").periods[3].status).toBe("frozen");
    expect(computePactState(daily, both, [...base, ...ci(B, "2026-11-04")], ["2026-11-04"], "2026-11-05").periods[3].status).toBe("done");
  });

  it("the last day can be made up the morning after the pact ends", () => {
    const pact = { ...daily, duration_days: 4 };
    const s = computePactState(pact, both, base, [], "2026-11-05");
    expect(s.phase).toBe("ended");
    expect(s.late?.start).toBe("2026-11-04");
    expect(s.streak).toBe(3);
  });

  it("nobody required means nothing to make up", () => {
    const members = [{ user_id: A, joined_on: "2026-11-05" }];
    const s = computePactState(daily, members, [], [], "2026-11-05");
    expect(s.late).toBeNull();
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

  it("Monday can make up the week that ended on Sunday, if one check-in closes it", () => {
    const wk1 = ["2026-11-01", "2026-11-03", "2026-11-05"];
    // A did 3, B did 2 and not Sunday (Nov 7). It's Monday Nov 8.
    const checks = [...ci(A, ...wk1), ...ci(B, "2026-11-01", "2026-11-03")];
    const s = computePactState(weekly, both, checks, [], "2026-11-08");
    expect(s.late?.start).toBe("2026-11-01");
    expect(s.late?.owing).toEqual([B]);
    const fixed = computePactState(weekly, both, [...checks, { user_id: B, day: "2026-11-07", made_up: true }], [], "2026-11-08");
    expect(fixed.periods[0].status).toBe("done");
    expect(fixed.streak).toBe(1);
  });

  it("a week short by two can't be made up", () => {
    const checks = [...ci(A, "2026-11-01", "2026-11-03", "2026-11-05"), ...ci(B, "2026-11-01")];
    const s = computePactState(weekly, both, checks, [], "2026-11-08");
    expect(s.periods[0].status).toBe("missed");
    expect(s.late).toBeNull();
  });

  it("a week where the short member already logged Sunday can't be made up", () => {
    const checks = [...ci(A, "2026-11-01", "2026-11-03", "2026-11-05"), ...ci(B, "2026-11-01", "2026-11-07")];
    const s = computePactState(weekly, both, checks, [], "2026-11-08");
    expect(s.periods[0].status).toBe("missed");
  });

  it("a short week falls short and gets offered a freeze", () => {
    const wk1 = ["2026-11-01", "2026-11-03", "2026-11-05"];
    const s = computePactState(weekly, both, [...ci(A, ...wk1, "2026-11-08"), ...ci(B, ...wk1)], [], "2026-11-15");
    expect(s.periods[1].status).toBe("missed");
    expect(s.repair).toEqual({ periods: ["2026-11-08"], previous: 1 });
  });
});

describe("everyone has their own freezes", () => {
  const pact = { ...daily, freezes_allowed: 1 };
  // A and B kept Nov 1-3; B missed Nov 4 and today is Nov 5: make it up today, or freeze it
  const days = range("2026-11-01", 3);
  const checks = [...ci(A, ...days, "2026-11-04"), ...ci(B, ...days)];

  it("a miss is paid from the freezes of whoever missed, whoever taps it", () => {
    const s = computePactState(pact, both, checks, [], "2026-11-05");
    expect(s.periods[3].culprits).toEqual([B]);
    expect(s.repair).toEqual({ periods: ["2026-11-04"], previous: 3 });
    for (const viewer of [A, B]) {
      const plan = planFreezes(s, s.repair!.periods, viewer);
      expect(plan.ok).toBe(true);
      expect(plan.payments).toEqual([{ period: "2026-11-04", covers: B, paidBy: B }]);
      expect(plan.gifts).toEqual([]);
    }
  });

  it("when they're out, a partner can give one of theirs; they can't pay for themselves", () => {
    // B already spent their only freeze earlier
    const s = computePactState(pact, both, checks, [{ period_start: "2026-10-20", paid_by: B, covers: B }], "2026-11-05");
    expect(s.freezesLeftBy).toEqual({ [A]: 1, [B]: 0 });
    expect(s.repair).not.toBeNull();
    const fromA = planFreezes(s, s.repair!.periods, A);
    expect(fromA.ok).toBe(true);
    expect(fromA.payments).toEqual([{ period: "2026-11-04", covers: B, paidBy: A }]);
    expect(fromA.gifts).toEqual([B]);
    const fromB = planFreezes(s, s.repair!.periods, B);
    expect(fromB.ok).toBe(false);
    expect(fromB.stuck).toEqual([B]);
  });

  it("nobody has one to give: no repair, the chain breaks", () => {
    const spent = [
      { period_start: "2026-10-20", paid_by: A, covers: A },
      { period_start: "2026-10-21", paid_by: B, covers: B },
    ];
    const s = computePactState(pact, both, checks, spent, "2026-11-05");
    expect(s.repair).toBeNull();
    // making it up is still possible; past midnight it breaks
    expect(s.periods[3].status).toBe("late");
    expect(computePactState(pact, both, checks, spent, "2026-11-06").periods[3].status).toBe("missed");
  });

  it("both missed: each pays their own", () => {
    const s = computePactState(pact, both, [...ci(A, ...days), ...ci(B, ...days)], [], "2026-11-05");
    const plan = planFreezes(s, ["2026-11-04"], A);
    expect(plan.payments.map((x) => x.paidBy).sort()).toEqual([A, B]);
  });

  it("someone who left keeps no freezes", () => {
    const s = computePactState(pact, [both[0], { ...both[1], left_on: "2026-11-05" }], checks, [], "2026-11-05");
    expect(Object.keys(s.freezesLeftBy)).toEqual([A]);
  });

  it("old shared freezes still freeze the period, and count against whoever used them", () => {
    const s = computePactState(pact, both, checks, [{ period_start: "2026-11-04", paid_by: A }], "2026-11-05");
    expect(s.periods[3].status).toBe("frozen");
    expect(s.freezesLeftBy).toEqual({ [A]: 0, [B]: 1 });
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

describe("break pacts", () => {
  const quit: PactCore = { ...daily, kind: "break" };
  const slip = (u: string, day: string) => ({ user_id: u, day });

  it("a yes for every day keeps the chain, like a check-in", () => {
    const days = range("2026-11-01", 3);
    const s = computePactState(quit, both, [...ci(A, ...days), ...ci(B, ...days)], [], "2026-11-04");
    expect(s.streak).toBe(3);
    expect(s.current?.status).toBe("open");
  });

  it("giving in today loses today right away and resets the streak", () => {
    const days = range("2026-11-01", 3);
    const s = computePactState(quit, both, [...ci(A, ...days), ...ci(B, ...days)], [], "2026-11-04", [slip(A, "2026-11-04")]);
    expect(s.current?.status).toBe("missed");
    expect(s.current?.slips[A]).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.best).toBe(3);
    // and a freeze can save it today
    expect(s.repair).toEqual({ periods: ["2026-11-04"], previous: 3 });
  });

  it("a frozen slip today keeps the streak going", () => {
    const days = range("2026-11-01", 3);
    const s = computePactState(quit, both, [...ci(A, ...days), ...ci(B, ...days)], ["2026-11-04"], "2026-11-04", [slip(A, "2026-11-04")]);
    expect(s.current?.status).toBe("frozen");
    expect(s.streak).toBe(4);
    expect(s.repair).toBeNull();
  });

  it("giving in yesterday is a miss, not something to make up", () => {
    const days = range("2026-11-01", 3);
    const s = computePactState(quit, both, [...ci(A, ...days), ...ci(B, ...days), ...ci(A, "2026-11-04")], [], "2026-11-05", [slip(B, "2026-11-04")]);
    expect(s.periods[3].status).toBe("missed");
    expect(s.late).toBeNull();
    expect(s.streak).toBe(0);
  });

  it("an unanswered yesterday is still open until midnight", () => {
    const days = range("2026-11-01", 4);
    const s = computePactState(quit, both, [...ci(A, ...days), ...ci(B, ...days.slice(0, 3))], [], "2026-11-05");
    expect(s.late?.start).toBe("2026-11-04");
    expect(s.late?.owing).toEqual([B]);
    expect(s.streak).toBe(3);
  });

  describe("some days a week", () => {
    // sugar on up to 3 days a week: 4 days off it needed
    const sugar: PactCore = { cadence: "weekly", times_per_week: 4, duration_days: 28, start_date: "2026-11-02", freezes_allowed: 1, kind: "break" };

    it("days within the allowance don't break the week", () => {
      const s = computePactState(sugar, both, [...ci(A, "2026-11-02", "2026-11-04")], [], "2026-11-05", [slip(A, "2026-11-03"), slip(A, "2026-11-05")]);
      expect(s.current?.status).toBe("open");
      expect(s.current?.slips[A]).toBe(2);
    });

    it("one day over the allowance breaks the week straight away", () => {
      const slips = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((d) => slip(A, d));
      const s = computePactState(sugar, both, [], [], "2026-11-05", slips);
      expect(s.current?.status).toBe("missed");
    });

    it("closes once everyone has their days off it", () => {
      const four = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
      const s = computePactState(sugar, both, [...ci(A, ...four), ...ci(B, ...four)], [], "2026-11-05");
      expect(s.current?.status).toBe("done");
      expect(s.streak).toBe(1);
    });
  });

  describe("a little each day", () => {
    const coffee: PactCore = { ...quit, target: 2 };

    it("over the limit doesn't count", () => {
      const s = computePactState(
        coffee,
        [both[0]],
        [
          { user_id: A, day: "2026-11-01", value: 2 },
          { user_id: A, day: "2026-11-02", value: 3 },
        ],
        [],
        "2026-11-03",
      );
      expect(s.periods[0].status).toBe("done");
      expect(s.periods[1].status).toBe("missed");
    });

    it("the limit goes down each week when asked to", () => {
      const taper: PactCore = { ...coffee, target: 10, limit_step: 2 };
      expect(limitOn(taper, "2026-11-01")).toBe(10);
      expect(limitOn(taper, "2026-11-08")).toBe(8);
      expect(limitOn(taper, "2026-12-30")).toBe(0);
      expect(limitOn({ ...taper, kind: "build" }, "2026-11-01")).toBeNull();
    });
  });

  describe("days off", () => {
    // 2026-11-06 is a Friday
    const fridaysOff: PactCore = { ...quit, rest_days: 1 << 5 };

    it("knows which days are off", () => {
      expect(isRestDay(fridaysOff, "2026-11-06")).toBe(true);
      expect(isRestDay(fridaysOff, "2026-11-05")).toBe(false);
      expect(isRestDay({ ...fridaysOff, cadence: "weekly" }, "2026-11-06")).toBe(false);
    });

    it("a day off counts as kept without anyone answering", () => {
      const days = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-07"];
      const s = computePactState({ ...fridaysOff, start_date: "2026-11-03" }, [both[0]], ci(A, ...days), [], "2026-11-07");
      expect(s.periods[3].rest).toBe(true);
      expect(s.periods[3].status).toBe("done");
      expect(s.streak).toBe(5);
    });
  });
});
