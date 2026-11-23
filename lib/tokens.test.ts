import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { buildTokens, MILESTONES, topToken } from "./tokens";
import type { PactCore } from "./streak";

const none: PactCore = { kind: "break", cadence: "daily", times_per_week: 7, duration_days: 30, start_date: "2026-11-01", freezes_allowed: 3 };
// "some days a week": 5 clean days a week
const fiveAWeek: PactCore = { ...none, cadence: "weekly", times_per_week: 5, duration_days: 28 };
const ME = "me";
const yes = (...days: string[]) => days.map((day) => ({ user_id: ME, day }));
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

function tokens(pact: PactCore, checkins: { user_id: string; day: string; value?: number | null }[], today: string, misses: { user_id: string; day: string }[] = [], phase: "active" | "ended" = "active") {
  return buildTokens({ pact, phase, userId: ME, checkins, misses, today });
}

describe("tokens", () => {
  it("counts clean days and earns tokens on the day each milestone is reached", () => {
    const t = tokens(none, yes(...range("2026-11-01", 3)), "2026-11-04");
    expect(t.clean).toBe(3);
    expect(t.tokens.filter((x) => x.earnedOn !== null).map((x) => [x.m, x.earnedOn])).toEqual([
      [1, 0],
      [3, 2],
    ]);
    expect(t.next).toEqual({ m: 7, need: 4, progress: 0, bonus: false });
    expect(t.days.slice(0, 5)).toEqual(["clean", "clean", "clean", "today", "future"]);
    expect(topToken(t)).toBe(3);
  });

  it("never takes a token back: a day you had it only pushes the next one further", () => {
    const days = range("2026-11-01", 5);
    const t = tokens(none, yes(...days), "2026-11-07", [{ user_id: ME, day: "2026-11-06" }]);
    expect(t.clean).toBe(5);
    expect(t.days[5]).toBe("had");
    expect(topToken(t)).toBe(3);
    expect(t.next?.m).toBe(7);
    expect(t.next?.progress).toBeCloseTo(0.5);
  });

  it("an 'I gave in' replaces a yes on the same day", () => {
    const t = tokens(none, yes("2026-11-01"), "2026-11-02", [{ user_id: ME, day: "2026-11-01" }]);
    expect(t.days[0]).toBe("had");
    expect(t.clean).toBe(0);
  });

  it("over the day's limit doesn't count as clean", () => {
    const limited: PactCore = { ...none, target: 2 };
    const t = tokens(limited, [{ user_id: ME, day: "2026-11-01", value: 1 }, { user_id: ME, day: "2026-11-02", value: 3 }], "2026-11-03");
    expect(t.days.slice(0, 2)).toEqual(["clean", "had"]);
  });

  it("only counts the viewer's own days", () => {
    const t = tokens(none, [{ user_id: "someone", day: "2026-11-01" }], "2026-11-02");
    expect(t.clean).toBe(0);
    expect(t.days[0]).toBe("blank");
  });

  it("offers milestones that fit the pact and marks the ones past its pace as bonus", () => {
    const t = tokens(fiveAWeek, [], "2026-11-01");
    // 28 days at 5 a week: 20 clean days is the pace
    expect(t.goal).toBe(20);
    expect(t.tokens.map((x) => x.m)).toEqual(MILESTONES.filter((m) => m <= 28));
    expect(t.tokens.filter((x) => x.bonus).map((x) => x.m)).toEqual([21]);
  });

  it("gives each week a target: the pact's weekly count, or every day for none at all", () => {
    const t = tokens(fiveAWeek, yes(...range("2026-11-01", 4)), "2026-11-08");
    expect(t.weeks[0]).toEqual({ from: 0, to: 7, clean: 4, target: 5 });
    expect(tokens(none, [], "2026-11-01").weeks.map((w) => w.target)).toEqual([7, 7, 7, 7, 2]);
  });

  it("skips days off: never asked, never counted against you", () => {
    // Sundays off (bit 0); 2026-11-01 is a Sunday
    const rest: PactCore = { ...none, rest_days: 1 };
    const t = tokens(rest, [], "2026-11-03");
    expect(t.days[0]).toBe("rest");
    expect(t.weeks[0].target).toBe(6);
    expect(t.goal).toBe(25);
  });

  it("at the end, nothing is left to come", () => {
    const t = tokens(none, yes(...range("2026-11-01", 30)), "2026-12-05", [], "ended");
    expect(t.finished).toBe(true);
    expect(t.todayAt).toBe(30);
    expect(t.clean).toBe(30);
    expect(t.days.includes("future")).toBe(false);
    expect(topToken(t)).toBe(30);
  });
});
