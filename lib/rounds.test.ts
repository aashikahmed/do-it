import { describe, expect, it } from "vitest";
import { buildSeries, seriesIds } from "./rounds";
import { computePactState } from "./streak";
import { addDays } from "./dates";

describe("seriesIds", () => {
  const links = [
    { id: "r1", previous_id: null, round: 1 },
    { id: "r2", previous_id: "r1", round: 2 },
    { id: "r3", previous_id: "r2", round: 3 },
    { id: "x", previous_id: null, round: 1 },
  ];
  it("walks back and forward from any round", () => {
    expect(seriesIds(links, "r2")).toEqual(["r1", "r2", "r3"]);
    expect(seriesIds(links, "r1")).toEqual(["r1", "r2", "r3"]);
    expect(seriesIds(links, "x")).toEqual(["x"]);
  });
  it("stops at rounds the viewer can't see", () => {
    expect(seriesIds(links.filter((l) => l.id !== "r1"), "r3")).toEqual(["r2", "r3"]);
  });
  it("survives a cycle", () => {
    expect(seriesIds([{ id: "a", previous_id: "b", round: 2 }, { id: "b", previous_id: "a", round: 2 }], "a")).toEqual(["b", "a"]);
  });
});

describe("buildSeries", () => {
  const me = "u1";
  const round = (id: string, n: number, start: string, keptDays: number, value: (i: number) => number) => {
    const pact = { id, round: n, start_date: start, direction: "up" as const, cadence: "daily" as const, times_per_week: 7, duration_days: 10, freezes_allowed: 1 };
    const checkins = Array.from({ length: keptDays }, (_, i) => ({ user_id: me, day: addDays(start, i), value: value(i) }));
    const state = computePactState(pact, [{ user_id: me, joined_on: start }], checkins, [], addDays(start, 40));
    return { pact, state, checkins };
  };
  const r1 = round("r1", 1, "2026-01-01", 10, () => 20);
  const r2 = round("r2", 2, "2026-01-12", 7, () => 40);

  it("adds rounds up to the one being viewed", () => {
    const s = buildSeries([r2, r1], ["r1", "r2"], "r2", me)!;
    expect(s.rounds.map((r) => r.kept)).toEqual([10, 7]);
    expect(s.kept).toBe(17);
    expect(s.best).toBe(10);
    expect(s.next).toBeNull();
    expect(s.mine).toEqual({ from: 20, to: 40, change: 20 });
  });
  it("points at the next round from an earlier one", () => {
    const s = buildSeries([r1, r2], ["r1", "r2"], "r1", me)!;
    expect(s.rounds).toHaveLength(1);
    expect(s.next).toEqual({ id: "r2", round: 2 });
    expect(s.mine).toBeNull();
  });
  it("is null for a single round", () => {
    expect(buildSeries([r1], ["r1"], "r1", me)).toBeNull();
  });
});
