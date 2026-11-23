import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import {
  activityDays,
  batchText,
  canChangeDay,
  catchUpRun,
  changeText,
  emptyRuns,
  previewDay,
  previewDays,
  type ActivityCheckin,
  type ActivityFreeze,
  type DayChange,
  type DayInputs,
} from "./activity";
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

  it("a miss covers itself: the chip shows before the cron writes the freeze down", () => {
    const miss = rowsOn(feed(daily, checkins, today), "2026-11-04").find((r) => r.type === "miss");
    expect(miss).toMatchObject({ user: A, cover: { by: A } });
  });

  it("out of freezes: the day still has a row, with no chip", () => {
    const miss = rowsOn(feed({ ...daily, freezes_allowed: 0 }, checkins, today), "2026-11-04").find((r) => r.type === "miss");
    expect(miss).toMatchObject({ user: A, said: false, cover: null });
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

describe("your own days with nothing logged", () => {
  // A checks in Nov 1-3, then nothing; B every day. No freezes, so A's Nov 4 miss pauses them from then on.
  const pact: PactCore = { ...daily, freezes_allowed: 0 };
  const today = "2026-11-10";
  const checkins = [...ci(A, range("2026-11-01", 3)), ...ci(B, range("2026-11-01", 9))];
  const me = { id: A, joined_on: "2026-11-01" };
  const runs = (p: PactCore, c: ActivityCheckin[], t: string, who = me, misses: MissCore[] = []) =>
    emptyRuns(p, computePactState(p, both, c, [], t, misses), c, misses, who, t);

  it("one run, from the first empty day to the day before yesterday", () => {
    // Nov 4 is a "didn't check in" row and still counts as empty
    expect(runs(pact, checkins, today)).toEqual([{ start: "2026-11-04", end: "2026-11-08", days: range("2026-11-04", 5) }]);
  });

  it("days before your first check-in count too, and a miss you said doesn't", () => {
    expect(runs(pact, ci(B, range("2026-11-01", 9)), today)[0].days).toEqual(range("2026-11-01", 8));
    expect(runs(pact, checkins, today, me, [{ user_id: A, day: "2026-11-06" }])).toEqual([
      { start: "2026-11-04", end: "2026-11-05", days: ["2026-11-04", "2026-11-05"] },
      { start: "2026-11-07", end: "2026-11-08", days: ["2026-11-07", "2026-11-08"] },
    ]);
  });

  it("a day off inside a run is skipped without splitting it", () => {
    // Nov 6 2026 is a Friday (bit 5)
    expect(runs({ ...pact, rest_days: 1 << 5 }, checkins, today)[0].days).toEqual(["2026-11-04", "2026-11-05", "2026-11-07", "2026-11-08"]);
  });

  it("weekly pacts: the open week's empty days, until you've met it", () => {
    const weekly: PactCore = { cadence: "weekly", times_per_week: 3, duration_days: 28, start_date: "2026-11-01", freezes_allowed: 1 };
    const wk1 = ["2026-11-01", "2026-11-02", "2026-11-03"];
    expect(runs(weekly, [...ci(A, [...wk1, "2026-11-08"]), ...ci(B, [...wk1, "2026-11-08"])], "2026-11-12").map((r) => r.days)).toEqual([["2026-11-09", "2026-11-10"]]);
    expect(runs(weekly, [...ci(A, [...wk1, ...range("2026-11-08", 3)]), ...ci(B, wk1)], "2026-11-12")).toEqual([]);
  });

  it("the catch-up card: 3 days or more, only while you're just back", () => {
    const run = (c: ActivityCheckin[], t: string) => catchUpRun(pact, computePactState(pact, both, c, [], t, []), c, [], me, t);
    expect(run(checkins, today)?.days).toEqual(range("2026-11-04", 5));
    // only 2 empty days
    expect(run([...ci(A, range("2026-11-01", 6)), ...ci(B, range("2026-11-01", 9))], today)).toBeNull();
    // back since Nov 7: the run ended 3 days before today
    expect(run([...checkins, ...ci(A, range("2026-11-07", 3))], today)).toBeNull();
  });

  it("filling in a paused day says the days after it count again", () => {
    const x: DayInputs = { pact, members: both, checkins, misses: [], freezes: [], today };
    const before = computePactState(pact, both, checkins, [], today, []);
    const p = previewDay(x, A, "2026-11-06", true, null, false);
    expect(changeText(before, p, A, "2026-11-06", "Friday", "day")).toEqual({
      text: "Friday counts with you in it. Saturday counts for you now too. Fill it in, or you'll be paused.",
      tone: "warn",
    });
    // the last day before yesterday: back in, and yesterday is yours to log
    const last = previewDay(x, A, "2026-11-08", true, null, false);
    expect(changeText(before, last, A, "2026-11-08", "Sunday", "day").text).toBe(
      "Sunday counts with you in it. You're back in the chain. Yesterday counts for you now too. Fill it in.",
    );
  });

  it("a refunded freeze isn't counted twice when the days after it spend it", () => {
    const withFreezes: PactCore = { ...daily, freezes_allowed: 3 };
    const x: DayInputs = { pact: withFreezes, members: both, checkins, misses: [], freezes: [], today };
    const before = computePactState(withFreezes, both, checkins, [], today, []);
    const p = previewDay(x, A, "2026-11-04", true, null, false);
    expect(changeText(before, p, A, "2026-11-04", "Wednesday", "day").text).toBe(
      "Wednesday is kept on its own, so your freeze comes back. You'll have 1. Saturday counts for you now too. Fill it in, or it'll use your last freeze and you'll be paused.",
    );
  });

  it("a day in the open week says where you are in it", () => {
    const weekly: PactCore = { cadence: "weekly", times_per_week: 3, duration_days: 28, start_date: "2026-11-01", freezes_allowed: 1 };
    const c = [...ci(A, ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-08"]), ...ci(B, ["2026-11-01", "2026-11-02", "2026-11-03"])];
    const x: DayInputs = { pact: weekly, members: both, checkins: c, misses: [], freezes: [], today: "2026-11-12" };
    const before = computePactState(weekly, both, c, [], "2026-11-12", []);
    const p = previewDay(x, A, "2026-11-09", true, null, false);
    expect(changeText(before, p, A, "2026-11-09", "That week", "week")).toEqual({ text: "You're on 2 of 3 this week.", tone: "plain" });
  });
});

describe("catching up on several days at once", () => {
  // A checks in Nov 1-3, then nothing; B every day. Today Nov 10.
  const today = "2026-11-10";
  const checkins = [...ci(A, range("2026-11-01", 3)), ...ci(B, range("2026-11-01", 9))];
  const answer = (days: string[], missed: string[] = []) => days.map((day) => ({ day, did: !missed.includes(day), value: null }));
  const run = (freezes_allowed: number, answers: ReturnType<typeof answer>) => {
    const pact: PactCore = { ...daily, freezes_allowed };
    const x: DayInputs = { pact, members: both, checkins, misses: [], freezes: [], today };
    const before = computePactState(pact, both, checkins, [], today, []);
    return batchText(before, previewDays(x, A, answers), A, answers, "day");
  };

  it("back in from the first day, and yesterday is yours to log", () => {
    expect(run(0, answer(range("2026-11-04", 5)))).toEqual({
      text: "You're back in the chain from Wednesday. Yesterday counts for you too, so log it before midnight.",
      tone: "good",
    });
  });

  it("a miss with no freezes left counts without you", () => {
    expect(run(0, answer(range("2026-11-04", 5), ["2026-11-06"])).text).toBe(
      "You're back in the chain from Wednesday. Friday counts without you, since you're out of freezes. Yesterday counts for you too, so log it before midnight.",
    );
  });

  it("freezes the quiet days used come back, less the one a miss spends", () => {
    expect(run(3, answer(range("2026-11-04", 5), ["2026-11-06"])).text).toBe(
      "You're back in the chain from Saturday. 2 freezes come back. You'll have 2. Yesterday counts for you too, so log it before midnight.",
    );
  });

  it("skipping the days after one you fill keeps you paused", () => {
    expect(run(0, answer(["2026-11-05"]))).toEqual({ text: "Thursday counts with you in it. You're still paused until your next check-in.", tone: "warn" });
  });

  it("solo: filling the gap joins the chain back up", () => {
    const solo: PactCore = { ...daily, freezes_allowed: 0 };
    const one = [{ user_id: A, joined_on: "2026-11-01" }];
    const c = ci(A, range("2026-11-01", 3));
    const x: DayInputs = { pact: solo, members: one, checkins: c, misses: [], freezes: [], today };
    const answers = answer(range("2026-11-04", 5));
    expect(batchText(computePactState(solo, one, c, [], today, []), previewDays(x, A, answers), A, answers, "day")).toEqual({
      text: "The chain joins back up: 8 days.",
      tone: "good",
    });
  });
});

describe("break pacts with days allowed each week", () => {
  const pact: PactCore = { ...daily, kind: "break", cadence: "weekly", times_per_week: 5, duration_days: 28 };
  const today = "2026-11-12";
  const checkins = [...ci(A, range("2026-11-01", 9)), ...ci(B, range("2026-11-01", 9))];
  const x: DayInputs = { pact, members: both, checkins, misses: [], freezes: [], today };
  const before = computePactState(pact, both, checkins, [], today, []);
  it("a slip the week allows says so", () => {
    expect(changeText(before, previewDay(x, A, "2026-11-03", false, null, false), A, "2026-11-03", "That week", "week", "break").text).toBe(
      "That's 1 of the 2 days that week allows, so the week still counts.",
    );
    expect(changeText(before, previewDay(x, A, "2026-11-09", false, null, false), A, "2026-11-09", "That week", "week", "break").text).toBe(
      "That's 1 of the 2 days this week allows.",
    );
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

  it("a kept day changed to missed uses one of your freezes by itself", () => {
    const x = base();
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    const p = previewDay(x, A, "2026-11-04", false, null, false);
    expect(p.needsFreeze).toBe(false);
    expect(p.period?.status).toBe("frozen");
    expect(p.state.streak).toBe(9);
    expect(p.freezesLeft).toBe(2);
    expect(changeText(before, p, A, "2026-11-04", "Wednesday", "day")).toEqual({
      text: "Wednesday uses one of your freezes, so the chain keeps going. You'll have 2 left.",
      tone: "plain",
    });
    // there's nothing to tap: asking for a freeze changes nothing
    const asked = previewDay(x, A, "2026-11-04", false, null, true);
    expect(asked.frozen).toBe(false);
    expect(asked.freezesLeft).toBe(2);
  });

  it("out of freezes in a pair: the day counts without you", () => {
    const x = base({ pact: { ...daily, freezes_allowed: 0 } });
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    const p = previewDay(x, A, "2026-11-04", false, null, false);
    expect(p.needsFreeze).toBe(false);
    expect(p.period?.status).toBe("done");
    expect(p.period?.paused).toEqual([A]);
    expect(p.state.streak).toBe(9);
    // checked in after it, so already back
    expect(p.state.paused[A]).toBeUndefined();
    expect(changeText(before, p, A, "2026-11-04", "Wednesday", "day")).toEqual({
      text: "Wednesday counts without you, since you're out of freezes. The chain keeps going.",
      tone: "warn",
    });
  });

  it("out of freezes on the last day: paused until your next check-in", () => {
    const x = base({ pact: { ...daily, freezes_allowed: 0 } });
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    const p = previewDay(x, A, "2026-11-09", false, null, false);
    expect(p.state.paused[A]).toMatchObject({ since: "2026-11-09", why: "out" });
    expect(changeText(before, p, A, "2026-11-09", "Yesterday", "day").text).toBe(
      "Yesterday counts without you, since you're out of freezes. The chain keeps going. You'll be paused until your next check-in.",
    );
  });

  it("a new miss takes the freeze a later miss was using", () => {
    // one freeze: A missed Nov 6 and it covered that; now A says they missed Nov 4 too
    const x = base({ pact: { ...daily, freezes_allowed: 1 }, checkins: [...ci(A, days.filter((d) => d !== "2026-11-06")), ...ci(B, days)] });
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    const p = previewDay(x, A, "2026-11-04", false, null, false);
    expect(changeText(before, p, A, "2026-11-04", "Wednesday", "day")).toEqual({
      text: "Wednesday uses one of your freezes, so the chain keeps going. You'll have 0 left. Friday counts without you now, since you're out of freezes.",
      tone: "warn",
    });
  });

  it("fixing a day nobody kept joins the chain back up", () => {
    // both missed Wednesday with no freezes: the chain broke
    const x = base({
      pact: { ...daily, freezes_allowed: 0 },
      checkins: [...ci(A, days.filter((d) => d !== "2026-11-04")), ...ci(B, days.filter((d) => d !== "2026-11-04"))],
    });
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    expect(before.streak).toBe(5);
    const p = previewDay(x, A, "2026-11-04", true, null, false);
    expect(p.period?.paused).toEqual([B]);
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

  it("nobody kept it and a partner can't pay: it breaks, and a freeze from you alone won't keep it", () => {
    const x = base({ pact: { ...daily, freezes_allowed: 0 }, checkins: [...ci(A, days), ...ci(B, days.filter((d) => d !== "2026-11-04"))] });
    const before = computePactState(x.pact, x.members, x.checkins, x.freezes, today, x.misses);
    const p = previewDay(x, A, "2026-11-04", false, null, true);
    expect(p.period?.status).toBe("missed");
    expect(p.needsFreeze).toBe(true);
    expect(p.othersUncovered).toBe(true);
    expect(p.canFreeze).toBe(false);
    expect(p.frozen).toBe(false);
    expect(changeText(before, p, A, "2026-11-04", "Wednesday", "day")).toEqual({
      text: "Wednesday breaks the chain. Your 8 kept days still count.",
      tone: "warn",
    });
  });
});
