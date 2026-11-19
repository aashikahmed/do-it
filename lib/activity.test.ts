import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { activityDays, canChangeDay, changeText, previewDay, type ActivityCheckin, type ActivityFreeze, type DayChange, type DayInputs } from "./activity";
import { computePactState, type MissCore, type PactCore } from "./streak";

const A = "a";
const B = "b";
const both = [
  { user_id: A, joined_on: "2026-11-01" },
  { user_id: B, joined_on: "2026-11-01" },
];
const daily: PactCore = { cadence: "daily", times_per_week: 7, duration_days: 30, start_date: "2026-11-01", freezes_allowed: 3 };
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
let n = 0;
const ci = (u: string, days: string[], extra: Partial<ActivityCheckin> = {}): ActivityCheckin[] =>
  days.map((day) => ({ id: `${u}-${day}-${n++}`, user_id: u, day, created_at: `${day}T12:00:00Z`, ...extra }));

function feed(pact: PactCore, checkins: ActivityCheckin[], today: string, misses: MissCore[] = [], freezes: ActivityFreeze[] = [], changes: DayChange[] = []) {
  const state = computePactState(pact, both, checkins, freezes, today, misses);
  return activityDays({ pact, state, checkins, misses, freezes, changes, today });
}
const rowsOn = (days: ReturnType<typeof feed>, day: string) => days.find((d) => d.day === day)?.rows ?? [];

describe("activity: daily build pacts", () => {
  // Nov 1-6 all checked in by both, except A never logged Nov 4 and B said "I missed it" on Nov 5
  const today = "2026-11-08";
  const days = range("2026-11-01", 7);
  const checkins = [...ci(A, days.filter((d) => d !== "2026-11-04")), ...ci(B, days.filter((d) => d !== "2026-11-05"))];

  it("shows a day someone never logged, once it's over", () => {
    const out = feed(daily, checkins, today);
    const nov4 = rowsOn(out, "2026-11-04");
    expect(nov4.map((r) => [r.type, r.user, r.type === "miss" && r.said])).toEqual([
      ["checkin", B, false],
      ["miss", A, false],
    ]);
  });

  it("shows an 'I missed it' as said, and no second row for the same day", () => {
    const out = feed(daily, checkins, today, [{ user_id: B, day: "2026-11-05" }]);
    const nov5 = rowsOn(out, "2026-11-05").filter((r) => r.user === B);
    expect(nov5).toHaveLength(1);
    expect(nov5[0]).toMatchObject({ type: "miss", said: true });
  });

  it("doesn't call yesterday missed while it can still be made up", () => {
    const out = feed(daily, [...ci(A, range("2026-11-01", 7)), ...ci(B, range("2026-11-01", 6))], today);
    expect(rowsOn(out, "2026-11-07").filter((r) => r.type === "miss")).toEqual([]);
  });

  it("marks a miss a freeze covered, and whose freeze it was", () => {
    const freezes: ActivityFreeze[] = [{ period_start: "2026-11-04", covers: A, paid_by: B }];
    const miss = rowsOn(feed(daily, checkins, today, [], freezes), "2026-11-04").find((r) => r.type === "miss");
    expect(miss).toMatchObject({ cover: { by: B } });
  });

  it("puts the newest entries first and silent rows last, newest day first", () => {
    const out = feed(daily, checkins, today);
    expect(out[0].day).toBe("2026-11-07");
    expect(out.map((d) => d.day)).toEqual([...out.map((d) => d.day)].sort().reverse());
  });

  it("skips days off", () => {
    // Nov 4 2026 is a Wednesday (bit 3)
    const out = feed({ ...daily, rest_days: 1 << 3 }, checkins, today);
    expect(rowsOn(out, "2026-11-04").filter((r) => r.type === "miss")).toEqual([]);
  });

  it("attaches the latest change to the row", () => {
    const changes: DayChange[] = [
      { user_id: A, day: "2026-11-03", before: "none", before_value: null, after: "did", after_value: null, created_at: "2026-11-05T10:00:00Z" },
      { user_id: A, day: "2026-11-03", before: "did", before_value: null, after: "missed", after_value: null, created_at: "2026-11-06T10:00:00Z" },
      { user_id: A, day: "2026-11-03", before: "missed", before_value: null, after: "did", after_value: null, created_at: "2026-11-07T10:00:00Z" },
    ];
    const row = rowsOn(feed(daily, checkins, today, [], [], changes), "2026-11-03").find((r) => r.user === A);
    expect(row).toMatchObject({ type: "checkin", change: { before: "missed", created_at: "2026-11-07T10:00:00Z" } });
  });
});

describe("activity: break and weekly pacts", () => {
  it("shows 'I gave in' and days nobody answered", () => {
    const pact: PactCore = { ...daily, kind: "break" };
    const today = "2026-11-06";
    const checkins = [...ci(A, ["2026-11-01", "2026-11-02", "2026-11-04"]), ...ci(B, range("2026-11-01", 5))];
    const out = feed(pact, checkins, today, [{ user_id: A, day: "2026-11-03" }]);
    expect(rowsOn(out, "2026-11-03").find((r) => r.user === A)).toMatchObject({ type: "miss", said: true });
    // Nov 5 is yesterday and still open for A's answer
    expect(rowsOn(out, "2026-11-05").filter((r) => r.type === "miss")).toEqual([]);
  });

  it("weekly pacts get one row for a week that ended short, on its last day", () => {
    const weekly: PactCore = { cadence: "weekly", times_per_week: 3, duration_days: 28, start_date: "2026-11-01", freezes_allowed: 1 };
    const checkins = [...ci(A, ["2026-11-01", "2026-11-03"]), ...ci(B, ["2026-11-01", "2026-11-02", "2026-11-03"])];
    const out = feed(weekly, checkins, "2026-11-10");
    const row = rowsOn(out, "2026-11-07").find((r) => r.type === "short");
    expect(row).toMatchObject({ user: A, count: 2, need: 3, start: "2026-11-01" });
  });
});

describe("which days can be changed", () => {
  const me = { joined_on: "2026-11-01", left_on: null };
  it("any day of the round that's over, until a week after it ends", () => {
    expect(canChangeDay(daily, me, "2026-11-03", "2026-11-10")).toBe(true);
    expect(canChangeDay(daily, me, "2026-11-10", "2026-11-10")).toBe(false);
    expect(canChangeDay(daily, me, "2026-10-31", "2026-11-10")).toBe(false);
    // ends Nov 30: changeable through Dec 7
    expect(canChangeDay(daily, me, "2026-11-30", "2026-12-07")).toBe(true);
    expect(canChangeDay(daily, me, "2026-11-30", "2026-12-08")).toBe(false);
  });
  it("not before you joined, after you left, or on a day off", () => {
    expect(canChangeDay(daily, { joined_on: "2026-11-05", left_on: null }, "2026-11-04", "2026-11-10")).toBe(false);
    expect(canChangeDay(daily, { joined_on: "2026-11-01", left_on: "2026-11-08" }, "2026-11-04", "2026-11-10")).toBe(false);
    expect(canChangeDay({ ...daily, rest_days: 1 << 3 }, me, "2026-11-04", "2026-11-10")).toBe(false);
  });
});

describe("previewing a change", () => {
  const today = "2026-11-10";
  const days = range("2026-11-01", 9);
  const base = (over: Partial<DayInputs> = {}): DayInputs => ({
    pact: daily,
    members: both,
    checkins: [...ci(A, days), ...ci(B, days)],
    misses: [],
    freezes: [],
    today,
    ...over,
  });

  it("a kept day changed to missed breaks the chain, and says what still counts", () => {
    const x = base();
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    const p = previewDay(x, A, "2026-11-04", false, null, false);
    expect(p.needsFreeze).toBe(true);
    expect(p.canFreeze).toBe(true);
    expect(p.period?.status).toBe("missed");
    expect(changeText(before, p, A, "2026-11-04", "Wednesday", "day")).toEqual({
      text: "Wednesday breaks the chain. Your 8 kept days still count.",
      tone: "warn",
    });
  });

  it("with a freeze it stays kept, and costs one of yours", () => {
    const x = base();
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    const p = previewDay(x, A, "2026-11-04", false, null, true);
    expect(p.frozen).toBe(true);
    expect(p.period?.status).toBe("frozen");
    expect(p.state.streak).toBe(9);
    expect(changeText(before, p, A, "2026-11-04", "Wednesday", "day").text).toBe("Wednesday stays kept with one of your freezes. You'll have 2 left.");
  });

  it("fixing a missed day joins the chain back up", () => {
    const x = base({ checkins: [...ci(A, days.filter((d) => d !== "2026-11-04")), ...ci(B, days)] });
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    expect(before.streak).toBe(5);
    const p = previewDay(x, A, "2026-11-04", true, null, false);
    expect(changeText(before, p, A, "2026-11-04", "Wednesday", "day")).toEqual({
      text: "Wednesday is kept, and the chain joins back up: 9 days.",
      tone: "good",
    });
  });

  it("fixing a frozen day hands your freeze back", () => {
    const freezes: ActivityFreeze[] = [{ period_start: "2026-11-04", covers: A, paid_by: A }];
    const x = base({ checkins: [...ci(A, days.filter((d) => d !== "2026-11-04")), ...ci(B, days)], freezes });
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    const p = previewDay(x, A, "2026-11-04", true, null, false);
    expect(p.freezesLeft).toBe(3);
    expect(changeText(before, p, A, "2026-11-04", "Wednesday", "day").text).toBe("Wednesday is kept on its own, so your freeze comes back. You'll have 3.");
  });

  it("a freeze from you alone can't keep a day someone else missed too", () => {
    const x = base({ checkins: [...ci(A, days), ...ci(B, days.filter((d) => d !== "2026-11-04"))] });
    const p = previewDay(x, A, "2026-11-04", false, null, true);
    expect(p.othersUncovered).toBe(true);
    expect(p.canFreeze).toBe(false);
    expect(p.frozen).toBe(false);
  });

  it("out of freezes: can't cover it", () => {
    const x = base({ pact: { ...daily, freezes_allowed: 0 } });
    const p = previewDay(x, A, "2026-11-04", false, null, true);
    expect(p.needsFreeze).toBe(true);
    expect(p.canFreeze).toBe(false);
  });
});
