import { describe, expect, it } from "vitest";
import {
  countJumps,
  formatDuration,
  formatValue,
  heldStep,
  isBetter,
  jumpLabel,
  niceStep,
  pactDays,
  plateStep,
  progressStats,
  tapeFor,
  targetText,
  timeJumps,
  timeWheels,
} from "./measure";

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(95)).toBe("1:35");
    expect(formatDuration(1760)).toBe("29:20");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
  it("formats values by measure", () => {
    expect(formatValue({ measure: "count", unit: "push-ups" }, 35)).toBe("35 push-ups");
    expect(formatValue({ measure: "time", unit: null }, 600)).toBe("10:00");
    expect(formatValue({ measure: "distance", unit: "km" }, 5.25)).toBe("5.3 km");
    expect(formatValue({ measure: "weight", unit: "kg" }, 62.5)).toBe("62.5 kg");
  });
  it("words the minimum by direction", () => {
    expect(targetText({ measure: "count", direction: "up", unit: "push-ups", target: 20 })).toBe("At least 20 push-ups");
    expect(targetText({ measure: "time", direction: "down", unit: null, target: 2100 })).toBe("Under 35:00");
    expect(targetText({ measure: "none", direction: "up", unit: null, target: null })).toBeNull();
  });
});

describe("progressStats", () => {
  const start = "2026-11-01";
  it("measures improvement when more is better", () => {
    const pts = [
      { day: "2026-11-01", value: 20 },
      { day: "2026-11-03", value: 22 },
      { day: "2026-11-22", value: 40 },
      { day: "2026-11-23", value: 42 },
    ];
    const s = progressStats(pts, "up", start);
    expect(s.best).toBe(42);
    expect(s.latest).toBe(42);
    expect(s.firstWeekAvg).toBe(21);
    expect(s.lastWeekAvg).toBe(41);
    expect(s.change).toBe(20);
    expect(Math.round(s.changePct!)).toBe(95);
  });
  it("treats lower as better for faster-is-better", () => {
    const pts = [
      { day: "2026-11-01", value: 2050 },
      { day: "2026-11-20", value: 1760 },
    ];
    const s = progressStats(pts, "down", start);
    expect(s.best).toBe(1760);
    expect(s.change).toBe(290);
    expect(isBetter("down", 1760, 2050)).toBe(true);
  });
  it("has no change with a single week of data", () => {
    const s = progressStats([{ day: "2026-11-02", value: 5 }], "up", start);
    expect(s.change).toBeNull();
    expect(s.best).toBe(5);
  });
  it("handles no data", () => {
    expect(progressStats([], "up", start).count).toBe(0);
  });
});

describe("pactDays", () => {
  it("stops at today, or at the pact end", () => {
    expect(pactDays("2026-11-01", 30, "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(pactDays("2026-11-01", 3, "2026-12-01")).toHaveLength(3);
    expect(pactDays("2026-11-05", 30, "2026-11-03")).toHaveLength(0);
  });
});

describe("pickers", () => {
  it("rounds to tidy steps", () => {
    expect([0, 1, 1.4, 3, 7, 9, 50, 120, 4000].map(niceStep)).toEqual([1, 1, 1, 2, 5, 10, 50, 100, 5000]);
  });
  it("sizes count chips to the target", () => {
    expect(countJumps(20)).toEqual([1, 2, 10]);
    expect(countJumps(1000)).toEqual([50, 100, 500]);
    expect(countJumps(10)).toEqual([1, 5]);
    expect(countJumps(null)).toEqual([1, 2, 10]);
  });
  it("speeds up a held button with the number's size", () => {
    expect(heldStep(1000, 0)).toBe(1);
    expect(heldStep(1000, 1000)).toBe(10);
    expect(heldStep(1000, 2500)).toBe(100);
    expect(heldStep(12, 1000)).toBe(1);
    expect(heldStep(15000, 1000)).toBe(100);
  });
  it("shows seconds for short holds and race times, hours for long sessions", () => {
    expect(timeWheels({ direction: "up", target: 60 }, 60)).toEqual({ hours: false, seconds: true });
    expect(timeWheels({ direction: "up", target: 3600 }, 2700)).toEqual({ hours: true, seconds: false });
    expect(timeWheels({ direction: "down", target: 1500 }, 1490)).toEqual({ hours: true, seconds: true });
    expect(timeWheels({ direction: "up", target: 1200 }, 1235)).toEqual({ hours: true, seconds: true });
    expect(timeWheels({ direction: "up", target: 300 }, 3700)).toEqual({ hours: true, seconds: true });
    expect(timeWheels({ direction: "up", target: null }, null)).toEqual({ hours: true, seconds: true });
  });
  it("labels time jumps", () => {
    expect(timeJumps(true).map(jumpLabel)).toEqual(["−5 min", "+5 min", "+15 min"]);
    expect(timeJumps(false).map(jumpLabel)).toEqual(["−15 s", "+15 s", "+30 s"]);
    expect(jumpLabel(3600)).toBe("+1 h");
  });
  it("uses 0.1 ticks, or 10 m for metres", () => {
    expect(tapeFor({ measure: "distance", unit: "km" }).tick).toBe(0.1);
    expect(tapeFor({ measure: "distance", unit: "m" }).tick).toBe(10);
    expect(tapeFor({ measure: "weight", unit: "kg" }).tick).toBe(0.1);
    expect(plateStep("kg")).toBe(2.5);
    expect(plateStep("lb")).toBe(5);
  });
  it("formats metres", () => {
    expect(formatValue({ measure: "distance", unit: "m" }, 1500)).toBe("1,500 m");
  });
});
