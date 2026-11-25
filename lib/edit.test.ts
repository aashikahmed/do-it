import { describe, expect, it } from "vitest";
import type { Checkin, Member, Pact, PactBundle } from "./data";
import { changedSince, changesBody, changeText, draftOf, draftRules, editLock, lockText, ruleChanges, rulesOf, sameRules, startChoices, startLabel, type PactRules } from "./edit";

const TODAY = "2026-11-25"; // a Wednesday
const ME = "me";
const PRIYA = "priya";

const build: PactRules = {
  cadence: "daily",
  times_per_week: 7,
  duration_days: 30,
  start_date: "2026-11-26",
  measure: "count",
  direction: "up",
  unit: "push-ups",
  target: 20,
  rest_days: 0,
  limit_step: null,
  ask_next_morning: false,
};
const noSoda: PactRules = { ...build, measure: "none", direction: "down", unit: null, target: null };

describe("the form", () => {
  const cases: [string, Pact["kind"], PactRules][] = [
    ["daily count", "build", build],
    ["streak only", "build", { ...build, measure: "none", unit: null, target: null }],
    ["weekly run", "build", { ...build, cadence: "weekly", times_per_week: 3, duration_days: 28, measure: "distance", unit: "km", target: 3 }],
    ["faster mile", "build", { ...build, measure: "time", direction: "down", unit: null, target: 480 }],
    ["no soda, Fridays off", "break", { ...noSoda, rest_days: 32, ask_next_morning: true }],
    ["takeout 2 days a week", "break", { ...noSoda, cadence: "weekly", times_per_week: 5, duration_days: 28 }],
    ["coffee, 3 cups, one less each week", "break", { ...noSoda, measure: "count", unit: "cups", target: 3, limit_step: 1 }],
  ];
  it.each(cases)("leaves %s as it was when nothing is touched", (_, kind, rules) => {
    expect(draftRules(draftOf({ ...rules, kind }), kind, rules.start_date)).toEqual(rules);
  });

  it("drops what doesn't apply any more", () => {
    const d = { ...draftOf({ ...noSoda, rest_days: 32, kind: "break" }), mode: "days" as const, allowance: 2, limitStep: 1 };
    expect(draftRules(d, "break", TODAY)).toMatchObject({ cadence: "weekly", times_per_week: 5, rest_days: 0, limit_step: null, measure: "none", target: null });
    expect(draftRules({ ...draftOf({ ...build, kind: "build" }), measure: "none" }, "build", TODAY)).toMatchObject({ unit: null, target: null });
  });

  it("offers today, tomorrow, Monday for weekly pacts, and where it starts now", () => {
    expect(startChoices("2026-11-26", TODAY, false)).toEqual(["2026-11-25", "2026-11-26"]);
    expect(startChoices("2026-11-26", TODAY, true)).toEqual(["2026-11-25", "2026-11-26", "2026-11-30"]);
    expect(startChoices("2026-11-23", TODAY, false)).toEqual(["2026-11-23", "2026-11-25", "2026-11-26"]);
    expect(["2026-11-24", TODAY, "2026-11-26"].map((x) => startLabel(x, TODAY))).toEqual(["yesterday", "today", "tomorrow"]);
  });
});

const member = (user_id: string, joined_at: string): Member => ({ user_id, name: user_id === ME ? "Sam Lee" : "Priya Rao", joined_on: "2026-11-23", joined_at, left_on: null, avatar_url: null });
const checkin = (user_id: string, day: string, created_at = `${day}T10:00:00Z`): Checkin => ({ id: user_id + day, pact_id: "p", user_id, day, value: null, note: null, feel: null, made_up: false, created_at });

function bundle(over: Partial<PactBundle> = {}, pact: Partial<Pact> = {}): PactBundle {
  const members = [member(ME, "2026-11-23T08:00:00Z"), member(PRIYA, "2026-11-23T09:00:00Z")];
  return {
    pact: { ...build, kind: "build", created_by: ME, edits: [], ...pact },
    members,
    allMembers: members,
    checkins: [],
    misses: [],
    changes: [],
    today: TODAY,
    state: { phase: "upcoming" },
    ...over,
  } as unknown as PactBundle;
}

describe("editLock", () => {
  it("is open until anyone logs anything", () => {
    expect(editLock(bundle(), ME)).toBeNull();
  });

  it("names whoever logged first", () => {
    const lock = editLock(bundle({ checkins: [checkin(ME, TODAY), checkin(PRIYA, "2026-11-24")] }), ME)!;
    expect(lock).toMatchObject({ by: PRIYA, name: "Priya", undo: null });
    expect(lockText(lock, "build", ME)).toBe("Priya checked in, so these stay as they are.");
  });

  it("a miss locks it too, and never says who gave in", () => {
    const lock = editLock(bundle({ misses: [{ user_id: PRIYA, day: TODAY, created_at: `${TODAY}T10:00:00Z` }] }), ME)!;
    expect(lockText(lock, "build", ME)).toBe("Priya called a day a miss, so these stay as they are.");
    expect(lockText(lock, "break", ME)).toBe("Priya answered, so these stay as they are.");
  });

  it("offers to undo your own check-in from today when it's the only thing logged", () => {
    expect(editLock(bundle({ checkins: [checkin(ME, TODAY)] }), ME)!.undo).toBe(TODAY);
    expect(editLock(bundle({ checkins: [checkin(ME, "2026-11-24")] }), ME)!.undo).toBeNull();
    expect(editLock(bundle({ checkins: [checkin(PRIYA, TODAY)] }), ME)!.undo).toBeNull();
    expect(editLock(bundle({ checkins: [checkin(ME, TODAY)], misses: [{ user_id: PRIYA, day: "2026-11-24", created_at: "2026-11-25T09:00:00Z" }] }), ME)!.undo).toBeNull();
  });
});

describe("ruleChanges", () => {
  const texts = (was: PactRules, now: PactRules, kind: Pact["kind"] = "build") => ruleChanges(was, now, kind, TODAY).map(changeText);

  it("says nothing when nothing changed", () => {
    expect(texts(build, { ...build })).toEqual([]);
    expect(sameRules(build, rulesOf({ ...build }))).toBe(true);
  });

  it("words build changes", () => {
    expect(texts(build, { ...build, duration_days: 60, start_date: "2026-11-27", target: 25 })).toEqual([
      "For 60 days (was 30 days)",
      "Starts Fri, Nov 27 (was tomorrow)",
      "Tracking: at least 25 push-ups (was at least 20 push-ups)",
    ]);
    expect(texts(build, { ...build, cadence: "weekly", times_per_week: 1, duration_days: 28 })).toEqual(["Once a week (was every day)", "For 4 weeks (was 30 days)"]);
    expect(texts({ ...build, start_date: "2026-11-23" }, { ...build, start_date: TODAY })).toEqual(["Starts today (was Mon, Nov 23)"]);
  });

  it("notices which way is progress even without a goal", () => {
    const time: PactRules = { ...build, measure: "time", unit: null, target: null };
    expect(texts(time, { ...time, direction: "down" })).toEqual(["Tracking: time, faster is better (was time, longer is better)"]);
  });

  it("words break changes", () => {
    expect(texts(noSoda, { ...noSoda, rest_days: 32, ask_next_morning: true }, "break")).toEqual(["Days off: Fridays (was none)", "Asks the next morning (was from 6pm)"]);
    expect(texts(noSoda, { ...noSoda, measure: "count", unit: "cans", target: 2, limit_step: 1 }, "break")).toEqual(["Up to 2 cans a day (was none at all)", "1 less each week"]);
    expect(texts(noSoda, { ...noSoda, cadence: "weekly", times_per_week: 6, duration_days: 28 }, "break")).toEqual(["Up to 1 day a week (was none at all)", "For 4 weeks (was 30 days)"]);
  });

  it("the push says which days the weeks run when that moved", () => {
    const weekly: PactRules = { ...build, cadence: "weekly", times_per_week: 3, duration_days: 28, measure: "none", unit: null, target: null };
    expect(changesBody(weekly, { ...weekly, start_date: "2026-11-30" }, TODAY)).toBe("Starts Mon, Nov 30 (was tomorrow). Weeks run Monday to Sunday.");
    expect(changesBody(weekly, { ...weekly, times_per_week: 4 }, TODAY)).toBe("4 times a week (was 3 times a week).");
  });
});

describe("changedSince", () => {
  const edits = [
    { at: "2026-11-24T09:00:00Z", was: build },
    { at: "2026-11-24T20:00:00Z", was: { ...build, duration_days: 14 } },
  ];
  const now = { duration_days: 60, edits };

  it("compares with the rules you joined under", () => {
    expect(changedSince(bundle({}, now), PRIYA)).toEqual({ changes: ["For 60 days (was 30 days)"] });
    const later = [member(ME, "2026-11-23T08:00:00Z"), member(PRIYA, "2026-11-24T12:00:00Z")];
    expect(changedSince(bundle({ members: later }, now), PRIYA)).toEqual({ changes: ["For 60 days (was 14 days)"] });
    const last = [member(ME, "2026-11-23T08:00:00Z"), member(PRIYA, "2026-11-25T12:00:00Z")];
    expect(changedSince(bundle({ members: last }, now), PRIYA)).toBeNull();
  });

  it("says nothing to the creator, after a change was put back, once you've logged, or at the end", () => {
    expect(changedSince(bundle({}, now), ME)).toBeNull();
    expect(changedSince(bundle({}, { edits }), PRIYA)).toBeNull();
    expect(changedSince(bundle({ checkins: [checkin(PRIYA, TODAY)] }, now), PRIYA)).toBeNull();
    expect(changedSince(bundle({ checkins: [checkin(ME, TODAY)] }, now), PRIYA)).not.toBeNull();
    expect(changedSince(bundle({ state: { phase: "ended" } as PactBundle["state"] }, now), PRIYA)).toBeNull();
  });
});
