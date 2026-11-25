import { describe, expect, it } from "vitest";
import { DAILY_LENGTHS, WEEKLY_LENGTHS } from "../edit";
import { createInput, createSchema } from "../pact-input";
import { allCards, ideaById, ideaBySlug, publicIdea, slugOf, threeFor } from "./catalog";
import { anyFilter, chipsFor, NO_FILTERS, passes } from "./filters";
import { IDEAS } from "./ideas";
import { EXPLORE_LANES, laneOf } from "./lanes";
import { buildIndex, near, parseMinutes, searchIdeas } from "./search";
import { LEVELS, type Idea } from "./types";
import { amountText, fromText, headline, isWeekly, levelDraft, sentence, spokenTime, startText } from "./words";

const inputFor = (i: Idea, level: (typeof LEVELS)[number]) =>
  createInput(
    levelDraft(i, level),
    { kind: i.kind, title: i.title, subject: i.kind === "break" ? i.subject : "", emoji: i.emoji, color: i.color, cravingPlan: i.kind === "break" ? (i.cravingPlan ?? "") : "" },
    "2026-12-01",
    "Asia/Dubai",
  );

describe("every idea", () => {
  it("has its own id and address", () => {
    expect(new Set(IDEAS.map((i) => i.id)).size).toBe(IDEAS.length);
    expect(new Set(IDEAS.map(slugOf)).size).toBe(IDEAS.length);
    // /explore/search, /explore/saved and /explore/lane are pages of their own
    for (const i of IDEAS) expect(["search", "saved", "lane", "all"]).not.toContain(slugOf(i));
  });

  it("never names a break habit in its address", () => {
    for (const i of IDEAS.filter((x) => x.kind === "break")) {
      expect(i.slug, i.id).toMatch(/^[a-z0-9]{5}$/);
    }
  });

  it.each(IDEAS.flatMap((i) => LEVELS.map((l) => [i.id, l] as const)))("%s at %s can be created", (id, level) => {
    const i = ideaById(id)!;
    const parsed = createSchema.safeParse(inputFor(i, level));
    expect(parsed.error?.issues ?? []).toEqual([]);
    const d = levelDraft(i, level);
    expect(isWeekly(i, d) ? WEEKLY_LENGTHS : DAILY_LENGTHS).toContain(d.durationDays);
    // create_pact() rules the schema can't see
    const v = parsed.data!;
    if (i.kind === "break") {
      expect(v.subject).toBeTruthy();
      expect(v.measure === "none" || v.measure === "count").toBe(true);
      if (v.measure === "count") expect(v.target).toBeGreaterThanOrEqual(1);
      if (v.limitStep) expect(v.limitStep).toBeLessThanOrEqual(v.target!);
      if (v.cadence === "weekly") expect(v.timesPerWeek).toBeLessThanOrEqual(6);
    } else if (v.measure === "count") {
      expect(v.unit).toBeTruthy();
    }
  });

  it("has three levels that differ", () => {
    for (const i of IDEAS) expect(new Set(LEVELS.map((l) => JSON.stringify(i.levels[l].rules))).size, i.id).toBe(3);
  });

  it("points at ideas that exist", () => {
    for (const i of IDEAS) for (const n of i.next) expect(ideaById(n), `${i.id} → ${n}`).toBeTruthy();
  });

  it("reads like the app: plain sentences, no arrows, dashes or exclamation marks", () => {
    for (const i of IDEAS) {
      const text = [i.title, i.line, i.why, i.together, i.firstStep, i.caution ?? "", i.evidence.note, ...LEVELS.flatMap((l) => [i.levels[l].pickIf, i.levels[l].why])];
      for (const t of text) expect(t, i.id).not.toMatch(/[—→!]/);
      for (const t of [i.line, i.why, i.together, i.firstStep]) expect(/[.?][']?$/.test(t), `${i.id}: ${t}`).toBe(true);
      expect(i.title.length, i.id).toBeLessThanOrEqual(34);
      for (const l of LEVELS) expect(i.levels[l].pickIf.endsWith("."), i.id).toBe(false);
    }
  });

  it("leaves out weight and calories, and warns where it matters", () => {
    for (const i of IDEAS) {
      for (const l of LEVELS) expect(levelDraft(i, l).measure, i.id).not.toBe("weight");
      expect([i.title, i.line, ...i.tags].join(" "), i.id).not.toMatch(/calorie|lose weight|weight loss|fasting/i);
    }
    expect(ideaById("alcohol")!.caution).toMatch(/doctor/);
    expect(ideaById("smoking")!.caution).toBeTruthy();
  });

  it("keeps hard training off daily", () => {
    for (const id of ["push-ups", "gym-sessions", "bodyweight-circuit", "first-pull-up", "start-running", "fastest-kilometre", "skip-rope", "swim-lengths"])
      for (const l of LEVELS) expect(levelDraft(ideaById(id)!, l).cadence, id).toBe("weekly");
  });

  it("belongs to a lane, and every lane has some", () => {
    for (const i of IDEAS) expect(laneOf(i.domain), i.id).toBeTruthy();
    for (const lane of EXPLORE_LANES) expect(IDEAS.filter((i) => lane.domains.includes(i.domain)).length, lane.id).toBeGreaterThan(5);
    for (const i of IDEAS) expect(laneOf(i.domain).id === "break", i.id).toBe(i.kind === "break");
  });

  it("never shows a source nobody has checked", () => {
    for (const i of IDEAS.map(publicIdea)) {
      expect(i.evidence.checked).toBe(true);
      if (i.evidence.url) expect(i.evidence.url).toMatch(/^https:\/\//);
    }
    expect(IDEAS.some((i) => !i.evidence.checked && publicIdea(i).evidence.url === undefined)).toBe(true);
  });

  it("is found by its slug", () => {
    expect(ideaBySlug("read-pages")!.id).toBe("read-pages");
    expect(ideaBySlug("smoking")).toBeUndefined();
    expect(ideaBySlug(slugOf(ideaById("smoking")!))!.id).toBe("smoking");
  });
});

describe("words", () => {
  const read = ideaById("read-pages")!;
  it("says what a level is", () => {
    expect(sentence(read, levelDraft(read, "starting"))).toBe("At least 5 pages, every day for 14 days");
    expect(fromText(read)).toBe("From 5 pages, every day");
    expect(startText(read, levelDraft(read, "starting"))).toBe("Start: 5 pages, every day");
  });
  it("handles one, and any amount", () => {
    expect(headline(read, { ...levelDraft(read, "starting"), target: 1 })).toBe("1 page, every day");
    expect(sentence(read, { ...levelDraft(read, "starting"), target: null })).toBe("Every day for 14 days");
    expect(amountText({ ...levelDraft(read, "starting"), target: 0 })).toBeNull();
  });
  it("says what a break idea allows", () => {
    const media = ideaById("social-media")!;
    expect(sentence(media, levelDraft(media, "starting"))).toBe("Up to 60 minutes a day, for 14 days");
    expect(startText(media, levelDraft(media, "starting"))).toBe("Cut down: up to 60 minutes a day");
    expect(startText(media, levelDraft(media, "further"))).toBe("Give it up: none at all");
    const gym = ideaById("gym-sessions")!;
    expect(fromText(gym)).toBe("2 times a week to start");
  });
  it("speaks time", () => {
    expect([20, 95, 300, 5400, 7200, 25200].map(spokenTime)).toEqual(["20 sec", "1:35 min", "5 min", "1 h 30 min", "2 h", "7 h"]);
  });
});

describe("search", () => {
  const index = buildIndex(allCards());
  const ids = (q: string) => searchIdeas(index, q).map((h) => h.card.id);
  it("finds titles, feelings, goals and times", () => {
    expect(ids("quran")[0]).toBe("read-quran");
    expect(ids("juz")).toEqual(["read-quran"]);
    expect(ids("anxious")).toContain("slow-sighs");
    expect(ids("get stronger")).toContain("push-ups");
    expect(ids("save money")).toContain("save-the-same-amount");
    expect(ids("I'm always tired")).toContain("seven-hours");
    expect(ids("can’t sleep")).toContain("wind-down");
    expect(ids("with my mum")).toEqual(["call-family"]);
  });
  it("forgives typos", () => {
    expect(ids("meditaton")).toContain("meditate");
    expect(ids("cofee")).toContain("coffee-shops");
    expect(near("pushpus", "pushups")).toBe(true);
    expect(near("cat", "car")).toBe(false);
  });
  it("reads minutes out of the query", () => {
    expect(parseMinutes("10 min outside")).toEqual({ minutes: 10, rest: "  outside" });
    const found = searchIdeas(index, "10 min outside");
    expect(found.length).toBeGreaterThan(0);
    for (const h of found) expect(h.card.minutes).toBeLessThanOrEqual(10);
  });
  it("comes back empty for something that isn't there", () => {
    expect(ids("xylophone")).toEqual([]);
  });
});

describe("filters", () => {
  const cards = allCards();
  const body = cards.filter((c) => laneOf(c.domain).id === "body");
  it("offers at most six chips, each of which leaves something", () => {
    for (const lane of EXPLORE_LANES) {
      const list = cards.filter((c) => lane.domains.includes(c.domain));
      const chips = chipsFor(list, NO_FILTERS);
      expect(chips.length).toBeLessThanOrEqual(6);
      for (const c of chips) {
        expect(c.count).toBeGreaterThan(0);
        expect(c.count).toBeLessThan(list.length);
      }
    }
  });
  it("counts what's left with the others on, and keeps a chip that's on", () => {
    const f = { ...NO_FILTERS, minutes: 10, place: "home" as const };
    const chips = chipsFor(body, f);
    expect(chips.filter((c) => c.on).map((c) => c.chip.id)).toEqual(["10", "home"]);
    expect(chips.length).toBeLessThanOrEqual(6);
    expect(chips.find((c) => c.chip.id === "10")!.count).toBe(body.filter((c) => passes(c, f)).length);
    expect(anyFilter(f)).toBe(true);
    expect(anyFilter(NO_FILTERS)).toBe(false);
  });
});

describe("three for this week", () => {
  it("is three different ideas, whatever the week", () => {
    for (let s = 0; s < 200; s++) {
      const three = threeFor(s);
      expect(new Set(three.map((c) => c.id)).size).toBe(3);
      expect(three[2].kind).toBe("break");
      expect(three[2].domain).not.toBe("cravings");
    }
  });
});
