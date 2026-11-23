import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { buildLanes, inkOn, laneColor, MAX_LANES } from "./lanes";
import { computePactState, type CheckinCore, type PactCore } from "./streak";

const pact: PactCore & { color: string } = { cadence: "daily", times_per_week: 7, duration_days: 10, start_date: "2026-11-01", freezes_allowed: 2, color: "blue" };
const A = "a";
const B = "b";
const people = [
  { user_id: B, name: "Bea", avatar_url: null, joined_at: "2026-10-30T10:00:00Z" },
  { user_id: A, name: "Ann", avatar_url: null, joined_at: "2026-10-30T09:00:00Z" },
];
const members = people.map((p) => ({ user_id: p.user_id, joined_on: "2026-10-31" }));
const ci = (u: string, ...days: string[]): CheckinCore[] => days.map((day) => ({ user_id: u, day }));
const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

function lanes(checkins: CheckinCore[], today: string, me = B, p = pact, freezes: { period_start: string; paid_by: string; covers: string }[] = []) {
  const state = computePactState(p, members, checkins, freezes, today);
  return buildLanes({ pact: p, state, members: people, me, today });
}

describe("lanes", () => {
  it("puts the viewer in the first lane but keeps colors by join order", () => {
    const m = lanes([], "2026-11-01");
    expect(m.lanes.map((l) => l.userId)).toEqual([B, A]);
    // Ann joined first, so she gets the first color, whoever is looking
    expect(m.lanes[1].color).toBe(laneColor("blue", 0));
    expect(m.lanes[0].color).toBe(laneColor("blue", 1));
    expect(lanes([], "2026-11-01", A).lanes[0].color).toBe(laneColor("blue", 0));
  });

  it("paints days each person did, and moves the runner past today once they've done it", () => {
    const days = range("2026-11-01", 3);
    const m = lanes([...ci(A, ...days, "2026-11-04"), ...ci(B, ...days)], "2026-11-04");
    const ann = m.lanes.find((l) => l.userId === A)!;
    const bea = m.lanes.find((l) => l.userId === B)!;
    expect(bea.segs).toEqual([{ from: 0, to: 3, mark: "did" }]);
    expect(bea.pos).toBe(3);
    expect(ann.segs).toEqual([{ from: 0, to: 4, mark: "did" }]);
    expect(ann.pos).toBe(4);
    expect(ann.kept).toBe(4);
    expect(m.finished).toBe(false);
  });

  it("marks a day someone missed: a freeze covers it, and it's missed when nobody kept it", () => {
    // day 2: Ann misses, Bea keeps it, so Ann's own freeze covers it automatically
    const m = lanes([...ci(A, "2026-11-01", "2026-11-03", "2026-11-04"), ...ci(B, ...range("2026-11-01", 4))], "2026-11-05");
    expect(m.lanes.find((l) => l.userId === A)!.segs).toEqual([
      { from: 0, to: 1, mark: "did" },
      { from: 1, to: 2, mark: "froze" },
      { from: 2, to: 4, mark: "did" },
    ]);
    // no freezes, and both missed day 3: the chain broke
    const noFreezes = { ...pact, freezes_allowed: 0 };
    const kept = [...ci(A, "2026-11-01", "2026-11-02", "2026-11-04"), ...ci(B, "2026-11-01", "2026-11-02", "2026-11-04")];
    const broke = lanes(kept, "2026-11-05", B, noFreezes);
    expect(broke.lanes[0].segs.map((s) => s.mark)).toEqual(["did", "missed", "did"]);
  });

  it("shows yesterday as on the line while it can still be made up", () => {
    const m = lanes([...ci(A, "2026-11-01", "2026-11-02"), ...ci(B, "2026-11-01")], "2026-11-03");
    expect(m.lanes.find((l) => l.userId === B)!.segs).toEqual([
      { from: 0, to: 1, mark: "did" },
      { from: 1, to: 2, mark: "late" },
    ]);
  });

  it("puts everyone past the finish once the pact has ended", () => {
    const all = range("2026-11-01", 10);
    const m = lanes([...ci(A, ...all), ...ci(B, ...all)], "2026-11-20");
    expect(m.finished).toBe(true);
    expect(m.lanes.every((l) => l.pos === 10 && l.kept === 10)).toBe(true);
  });

  it("paints a weekly pact's week once the target is met", () => {
    const weekly = { ...pact, cadence: "weekly" as const, times_per_week: 2, duration_days: 14 };
    const m = lanes([...ci(A, "2026-11-01", "2026-11-03"), ...ci(B, "2026-11-02")], "2026-11-04", B, weekly);
    expect(m.lanes.find((l) => l.userId === A)!.segs).toEqual([{ from: 0, to: 4, mark: "did" }]);
    expect(m.lanes.find((l) => l.userId === A)!.pos).toBe(4);
    expect(m.lanes.find((l) => l.userId === B)!.segs).toEqual([]);
    expect(m.lanes.find((l) => l.userId === B)!.pos).toBe(3);
  });

  it("caps the lanes and counts the rest", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ user_id: `u${i}`, name: `U${i}`, avatar_url: null, joined_at: `2026-10-30T0${i}:00:00Z` }));
    const state = computePactState(pact, many.map((p) => ({ user_id: p.user_id, joined_on: "2026-10-31" })), [], [], "2026-11-02");
    const m = buildLanes({ pact, state, members: many, me: "u5", today: "2026-11-02" });
    expect(m.lanes).toHaveLength(MAX_LANES);
    expect(m.lanes[0].userId).toBe("u5");
    expect(m.hidden).toBe(2);
  });

  it("picks readable text for each lane color", () => {
    expect(inkOn("#10143A")).toBe("#FFFFFF");
    expect(inkOn("#FFC23D")).toBe("#10143A");
    // sun pacts never get a sun-colored runner
    expect(Array.from({ length: 6 }, (_, i) => laneColor("sun", i))).not.toContain("#FFC23D");
  });
});

describe("weekly lanes", () => {
  // 3 a week for 4 weeks from Sunday 1 November: weeks run Sunday to Saturday
  const weekly: PactCore & { color: string } = { cadence: "weekly", times_per_week: 3, duration_days: 28, start_date: "2026-11-01", freezes_allowed: 1, color: "blue" };

  function weekLanes(checkins: CheckinCore[], today: string) {
    const state = computePactState(weekly, members, checkins, [], today);
    return buildLanes({ pact: weekly, state, members: people, me: B, today, checkins });
  }

  it("marks where each week ends, and the one in progress", () => {
    const m = weekLanes([], "2026-11-10");
    expect(m.weekEnds).toEqual([7, 14, 21]);
    expect(m.weekEnd).toBe(14);
  });

  it("paints this week's check-ins faintly until the target is hit", () => {
    const week1 = [...ci(A, "2026-11-01", "2026-11-03", "2026-11-05"), ...ci(B, "2026-11-01", "2026-11-03", "2026-11-05")];
    const m = weekLanes([...week1, ...ci(B, "2026-11-08", "2026-11-10"), ...ci(A, "2026-11-08", "2026-11-09", "2026-11-10")], "2026-11-10");
    const bea = m.lanes.find((l) => l.userId === B)!;
    const ann = m.lanes.find((l) => l.userId === A)!;
    // Bea: 2 of 3 this week, so the two days she did show faintly
    expect(bea.segs).toEqual([
      { from: 0, to: 7, mark: "did" },
      { from: 7, to: 8, mark: "part" },
      { from: 9, to: 10, mark: "part" },
    ]);
    // Ann hit 3: the week is hers, painted in full up to today
    expect(ann.segs).toEqual([{ from: 0, to: 10, mark: "did" }]);
    expect(bea.kept).toBe(1);
  });
});
