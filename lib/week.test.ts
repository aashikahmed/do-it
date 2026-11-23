import { describe, expect, it } from "vitest";
import { addDays, type Day } from "./dates";
import { computePactState, type PactCore } from "./streak";
import { daysNeeded, weekAtRisk, weekEndOn, weekEndsText, weekEvening, weekHeadsUp, weekNote, weekOutlook, weekRange } from "./week";

// Hit the gym, 3 times a week for 4 weeks, from Wednesday 11 November: weeks run Wednesday to Tuesday.
// Week 2 is Wed 18 to Tue 24 November.
const START = "2026-11-11";
const W2 = "2026-11-18";
const Y = "you";
const M = "maya";
const J = "jon";

type Opts = {
  today: Day;
  /** week 2 check-ins, as days from W2 (0 = Wednesday … 6 = Tuesday) */
  week2: Record<string, number[]>;
  people?: string[];
  freezes?: number;
  kind?: "build" | "break";
  cadence?: "weekly" | "daily";
};

function setup({ today, week2, people = [Y, M, J], freezes = 1, kind = "build", cadence = "weekly" }: Opts) {
  const pact: PactCore = {
    cadence,
    kind,
    times_per_week: cadence === "daily" ? 7 : 3,
    duration_days: 28,
    start_date: START,
    freezes_allowed: freezes,
  } as PactCore;
  const members = people.map((u) => ({ user_id: u, joined_on: START, left_on: null }));
  const checkins: { user_id: string; day: Day }[] = [];
  // everyone kept week 1: Wednesday, Friday, Sunday
  for (const u of people) for (const d of [0, 2, 4]) checkins.push({ user_id: u, day: addDays(START, d) });
  for (const [u, days] of Object.entries(week2)) for (const d of days) if (addDays(W2, d) <= today) checkins.push({ user_id: u, day: addDays(W2, d) });
  const state = computePactState(pact, members, checkins, [], today);
  return { b: { pact, state, checkins, today }, state };
}

const MON = addDays(W2, 5); // 2026-11-23
const TUE = addDays(W2, 6);
const SUN = addDays(W2, 4);

describe("weekOutlook", () => {
  it("is on track while there are more days left than check-ins to go", () => {
    const { b } = setup({ today: MON, week2: { [Y]: [1, 3], [M]: [0, 2, 4] } });
    const o = weekOutlook(b, Y)!;
    expect(o).toMatchObject({ count: 2, togo: 1, daysLeft: 2, room: 2, pace: "ok", end: TUE });
    expect(weekNote(o, MON)).toBe("1 more by Tuesday.");
    expect(weekAtRisk(o)).toBe(false);
  });

  it("is tight with 2 to go and 2 days left: today and tomorrow", () => {
    const { b } = setup({ today: MON, week2: { [Y]: [1], [M]: [0, 2, 4] } });
    const o = weekOutlook(b, Y)!;
    expect(o.pace).toBe("tight");
    expect(weekNote(o, MON)).toBe("You need today and tomorrow.");
    expect(weekAtRisk(o)).toBe(true);
  });

  it("is tight with 3 to go and 3 days left: every day until the end", () => {
    const { b } = setup({ today: SUN, week2: { [M]: [0, 2, 4] } });
    const o = weekOutlook(b, Y)!;
    expect(o).toMatchObject({ togo: 3, room: 3, pace: "tight" });
    expect(weekNote(o, SUN)).toBe("You need every day until Tuesday.");
  });

  it("counts from tomorrow once today is logged", () => {
    const { b } = setup({ today: MON, week2: { [Y]: [1, 5], [M]: [0, 2, 4] } });
    const o = weekOutlook(b, Y)!;
    expect(o).toMatchObject({ count: 2, doneToday: true, room: 1, pace: "tight" });
    expect(weekNote(o, MON)).toBe("You need tomorrow.");
  });

  it("says so on the week's last day", () => {
    const { b } = setup({ today: TUE, week2: { [Y]: [1, 3], [M]: [0, 2, 4] } });
    const o = weekOutlook(b, Y)!;
    expect(o).toMatchObject({ lastDay: true, pace: "tight" });
    expect(weekNote(o, TUE)).toBe("Last day of the week. You need 1 more.");
    expect(weekNote(o, TUE, "Jon")).toBe("Last day of the week. Jon needs 1 more.");
  });

  it("is done once the target is hit", () => {
    const { b } = setup({ today: MON, week2: { [M]: [0, 2, 4] } });
    const o = weekOutlook(b, M)!;
    expect(o.pace).toBe("done");
    expect(weekNote(o, MON)).toBeNull();
  });

  it("short with a check-in and a freeze left: the freeze covers it", () => {
    const { b } = setup({ today: TUE, week2: { [Y]: [1], [M]: [0, 2, 4] } });
    const o = weekOutlook(b, Y)!;
    expect(o).toMatchObject({ pace: "short", ifShort: "freeze" });
    expect(weekNote(o, TUE)).toBe("Can't make 3 this week. A freeze will cover it.");
    expect(weekAtRisk(o)).toBe(false);
  });

  it("short with nothing logged: one check-in avoids the pause", () => {
    const { b } = setup({ today: MON, week2: { [M]: [0, 2, 4] } });
    const o = weekOutlook(b, J)!;
    expect(o).toMatchObject({ pace: "short", ifShort: "quiet", count: 0 });
    expect(weekNote(o, MON, "Jon")).toBe("Nothing logged this week. One check-in by tomorrow and Jon isn't paused.");
    expect(weekNote({ ...o, lastDay: true, daysLeft: 1, room: 1 }, TUE)).toBe("Nothing logged this week. One check-in by midnight and you aren't paused.");
    expect(weekAtRisk(o)).toBe(true);
  });

  it("short and out of freezes: paused", () => {
    const { b } = setup({ today: TUE, week2: { [Y]: [1], [M]: [0, 2, 4] }, freezes: 0 });
    expect(weekOutlook(b, Y)!.ifShort).toBe("out");
  });

  it("short, out of freezes, and nobody else can keep it: the streak ends", () => {
    const { b } = setup({ today: TUE, week2: { [Y]: [1] }, people: [Y], freezes: 0 });
    const o = weekOutlook(b, Y)!;
    expect(o.ifShort).toBe("break");
    expect(weekNote(o, TUE)).toBe("Can't make 3 this week, and nobody can cover it. The streak ends tonight.");
  });

  it("never applies to break pacts, daily pacts, or someone who doesn't count this week", () => {
    expect(weekOutlook(setup({ today: MON, week2: {}, kind: "break" }).b, Y)).toBeNull();
    expect(weekOutlook(setup({ today: MON, week2: {}, cadence: "daily" }).b, Y)).toBeNull();
    expect(weekOutlook(setup({ today: MON, week2: {} }).b, "stranger")).toBeNull();
  });

  // the prediction has to match what the engine does once the week is over
  it("matches the engine: a silent week pauses, a short one spends a freeze", () => {
    const after = addDays(TUE, 2); // Thursday of week 3, past the make-up window
    const silent = setup({ today: after, week2: { [Y]: [0, 1, 2], [M]: [0, 2, 4] } }).state;
    expect(silent.paused[J]?.why).toBe("quiet");
    const short = setup({ today: after, week2: { [Y]: [0, 1, 2], [M]: [0, 2, 4], [J]: [0] } }).state;
    expect(short.paused[J]).toBeUndefined();
    expect(short.freezesLeftBy[J]).toBe(0);
  });
});

describe("week wording", () => {
  it("names the end", () => {
    expect(weekEndsText(TUE, MON)).toBe("ends Tuesday");
    expect(weekEndsText(TUE, TUE)).toBe("last day");
    expect(weekRange(W2, TUE)).toBe("Nov 18 to 24");
    expect(weekRange("2026-11-25", "2026-12-01")).toBe("Nov 25 to Dec 1");
  });

  it("lists the days still needed", () => {
    expect(daysNeeded({ room: 2, doneToday: false, end: TUE }, MON)).toBe("today and tomorrow");
    expect(daysNeeded({ room: 2, doneToday: true, end: TUE }, SUN)).toBe("tomorrow and Tuesday");
    expect(daysNeeded({ room: 4, doneToday: false, end: TUE }, addDays(W2, 3))).toBe("every day until Tuesday");
  });
});

describe("weekly pushes", () => {
  const gym = { emoji: "🏋️", title: "Hit the gym" };

  it("heads up the morning it turns tight", () => {
    const o = weekOutlook(setup({ today: MON, week2: { [Y]: [1], [M]: [0, 2, 4] } }).b, Y)!;
    expect(weekHeadsUp(gym, o, MON)).toEqual({ title: "🏋️ 2 to go, 2 days left", body: "Hit the gym: your week ends tomorrow, so you need today and tomorrow." });
    expect(weekEvening(gym, o, MON, "midnight").body).toBe("Your week ends tomorrow, so you need today and tomorrow. Check in before midnight.");
  });

  it("3 to go with 3 days left", () => {
    const o = weekOutlook(setup({ today: SUN, week2: { [M]: [0, 2, 4] } }).b, Y)!;
    expect(weekHeadsUp(gym, o, SUN).title).toBe("🏋️ 3 to go, 3 days left");
    expect(weekHeadsUp(gym, o, SUN).body).toBe("Hit the gym: your week ends Tuesday, so you need every day until Tuesday.");
  });

  it("last day, one short", () => {
    const o = weekOutlook(setup({ today: TUE, week2: { [Y]: [1, 3], [M]: [0, 2, 4] } }).b, Y)!;
    expect(weekHeadsUp(gym, o, TUE)).toEqual({ title: "🏋️ Last day of the week", body: "Hit the gym: one more today makes 3 this week." });
  });

  it("last day of a silent week: one check-in keeps you in", () => {
    const o = weekOutlook(setup({ today: TUE, week2: { [M]: [0, 2, 4] } }).b, J)!;
    expect(o.ifShort).toBe("quiet");
    expect(weekHeadsUp(gym, o, TUE).body).toBe("Nothing logged for Hit the gym this week. Check in once today to stay in.");
    expect(weekEvening(gym, o, TUE, "midnight").title).toBe("🏋️ Check in once to stay in");
  });

  it("finds the week's end from the pact's dates", () => {
    expect(weekEndOn({ start_date: START, duration_days: 28 }, MON)).toBe(TUE);
    expect(weekEndOn({ start_date: START, duration_days: 28 }, W2)).toBe(TUE);
    expect(weekEndOn({ start_date: START, duration_days: 28 }, START)).toBe(addDays(START, 6));
  });
});
