import { describe, expect, it } from "vitest";
import { addDays, todayIn } from "./dates";
import { deadlineText, eveningDue, eveningSendAt, firstRunAt, morningDue, morningSendAt, pactDeadline, tzFor, zonedTime } from "./reminders";

const HOUR = 3_600_000;
const DUBAI = "Asia/Dubai";
const D = "2026-11-18"; // a Wednesday; no DST changes near it except where a test says so

/** "2026-11-18 20:00" on that person's clock */
function local(t: number, tz: string) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));
  return s.replace(",", "");
}

/** The first hourly run (top of the UTC hour) in [from, to) for which `due` says yes. */
function firstDueRun(from: number, to: number, due: (now: number) => boolean) {
  for (let t = firstRunAt(from); t < to; t += HOUR) if (due(t)) return t;
  return null;
}

/** The evening push for pact day `day`, as the cron would send it: the first run that finds it due. */
function eveningRun(pactTz: string, day: string, tz: string) {
  const start = zonedTime(day, 0, pactTz);
  const t = firstDueRun(start, pactDeadline(pactTz, day), (now) => eveningDue(now, pactTz, day, tz));
  return t === null ? null : local(t, tz);
}

/** The make-up push for pact day `day`: after it closes, before the make-up window closes a day later. */
function makeUpRun(pactTz: string, day: string, tz: string) {
  const closed = pactDeadline(pactTz, day);
  const until = pactDeadline(pactTz, addDays(day, 1));
  const t = firstDueRun(closed, until, (now) => morningDue(now, closed, tz, until));
  return t === null ? null : local(t, tz);
}

describe("evening push, Dubai pact", () => {
  it.each([
    // recipient,              deadline on their clock,   evening push,        make-up push
    ["Asia/Dubai", "2026-11-19 00:00", "2026-11-18 20:00", "2026-11-19 09:00"],
    ["Europe/London", "2026-11-18 20:00", "2026-11-18 16:00", "2026-11-18 20:00"],
    ["Australia/Sydney", "2026-11-19 07:00", "2026-11-18 20:00", "2026-11-19 09:00"],
    ["America/New_York", "2026-11-18 15:00", "2026-11-18 11:00", "2026-11-18 15:00"],
    ["America/Los_Angeles", "2026-11-18 12:00", "2026-11-18 08:00", "2026-11-18 12:00"],
    ["Pacific/Honolulu", "2026-11-18 10:00", "2026-11-18 08:00", "2026-11-18 10:00"],
    ["Asia/Kolkata", "2026-11-19 01:30", "2026-11-18 20:30", "2026-11-19 09:30"],
  ])("%s: deadline %s, evening %s, make-up %s", (tz, deadline, evening, makeUp) => {
    expect(local(pactDeadline(DUBAI, D), tz)).toBe(deadline);
    expect(eveningRun(DUBAI, D, tz)).toBe(evening);
    expect(makeUpRun(DUBAI, D, tz)).toBe(makeUp);
  });

  it("New York gets it on the morning of the deadline, not 19 hours early the evening before", () => {
    const t = eveningSendAt(DUBAI, D, "America/New_York");
    expect(pactDeadline(DUBAI, D) - t).toBe(4 * HOUR);
    // the previous pact day closed at 3pm the day before; 8pm then would be right after it
    expect(t).toBeGreaterThan(pactDeadline(DUBAI, addDays(D, -1)) + 12 * HOUR);
  });

  it("Honolulu: 4 hours before is 6am, quiet hours, so it moves to 8am", () => {
    expect(local(pactDeadline(DUBAI, D) - 4 * HOUR, "Pacific/Honolulu")).toBe("2026-11-18 06:00");
    expect(local(eveningSendAt(DUBAI, D, "Pacific/Honolulu"), "Pacific/Honolulu")).toBe("2026-11-18 08:00");
  });

  it("when 8am is too close to the deadline, it comes at 9pm the evening before", () => {
    // India pact: deadline 18:30 UTC, 8:30am in Honolulu. 4h before is 4:30am, 8am is only 30 minutes before.
    const india = "Asia/Kolkata";
    expect(local(pactDeadline(india, D), "Pacific/Honolulu")).toBe("2026-11-18 08:30");
    expect(local(eveningSendAt(india, D, "Pacific/Honolulu"), "Pacific/Honolulu")).toBe("2026-11-17 21:00");
    expect(eveningRun(india, D, "Pacific/Honolulu")).toBe("2026-11-17 21:00");
  });

  it("a recipient with no timezone, or a bad one, goes by the pact's", () => {
    expect(eveningSendAt(DUBAI, D, null)).toBe(eveningSendAt(DUBAI, D, DUBAI));
    expect(eveningSendAt(DUBAI, D, "Mars/Olympus")).toBe(eveningSendAt(DUBAI, D, DUBAI));
    expect(tzFor("", DUBAI)).toBe(DUBAI);
    expect(tzFor("Europe/London", DUBAI)).toBe("Europe/London");
  });

  it("is never due after the deadline", () => {
    const T = pactDeadline(DUBAI, D);
    expect(eveningDue(T - HOUR, DUBAI, D, "Australia/Sydney")).toBe(true);
    expect(eveningDue(T, DUBAI, D, "Australia/Sydney")).toBe(false);
  });
});

describe("DST", () => {
  it("follows the recipient's clock when only one side has changed", () => {
    // London pact, New York partner. Both on standard time, then the weeks the US is on summer time and the UK
    // isn't yet, then both on summer time. The deadline moves on their clock, and the push moves with it.
    const ldn = "Europe/London";
    const ny = "America/New_York";
    expect(local(pactDeadline(ldn, "2026-03-03"), ny)).toBe("2026-03-03 19:00");
    expect(eveningRun(ldn, "2026-03-03", ny)).toBe("2026-03-03 15:00");
    expect(local(pactDeadline(ldn, "2026-03-10"), ny)).toBe("2026-03-10 20:00");
    expect(eveningRun(ldn, "2026-03-10", ny)).toBe("2026-03-10 16:00");
    expect(local(pactDeadline(ldn, "2026-04-01"), ny)).toBe("2026-04-01 19:00");
    expect(eveningRun(ldn, "2026-04-01", ny)).toBe("2026-04-01 15:00");
  });

  it("handles a 23-hour pact day", () => {
    // UK clocks go forward on 29 March 2026: that pact day is 23 hours long
    const ldn = "Europe/London";
    expect(pactDeadline(ldn, "2026-03-29") - zonedTime("2026-03-29", 0, ldn)).toBe(23 * HOUR);
    expect(eveningRun(ldn, "2026-03-29", ldn)).toBe("2026-03-29 20:00");
    expect(eveningRun(ldn, "2026-03-29", DUBAI)).toBe("2026-03-29 20:00");
    expect(makeUpRun(ldn, "2026-03-28", ldn)).toBe("2026-03-29 09:00");
  });

  it("resolves skipped and repeated hours", () => {
    // New York skips 2am on 8 March 2026
    expect(local(zonedTime("2026-03-08", 2, "America/New_York"), "America/New_York")).toBe("2026-03-08 03:00");
    // Chile skips midnight on 6 September 2026: that day starts at 1am
    const start = zonedTime("2026-09-06", 0, "America/Santiago");
    expect(todayIn("America/Santiago", new Date(start))).toBe("2026-09-06");
    expect(todayIn("America/Santiago", new Date(start - 1))).toBe("2026-09-05");
    // London repeats 1am on 25 October 2026: the first one
    expect(new Date(zonedTime("2026-10-25", 1, "Europe/London")).toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });

  it("keeps every evening push inside its pact day, out of quiet hours, and at least 10 hours from the next", () => {
    const zones = [
      "Asia/Dubai",
      "Europe/London",
      "Australia/Sydney",
      "America/New_York",
      "America/Los_Angeles",
      "Pacific/Honolulu",
      "Asia/Kolkata",
      "Asia/Kathmandu",
      "Pacific/Auckland",
      "America/Santiago",
      "Pacific/Chatham",
    ];
    for (const pactTz of zones) {
      for (const tz of zones) {
        let prev: number | null = null;
        // through both hemispheres' DST changes
        for (let day = "2026-03-01"; day <= "2026-04-15"; day = addDays(day, 1)) {
          const T = pactDeadline(pactTz, day);
          const t = eveningSendAt(pactTz, day, tz);
          const run = firstRunAt(t);
          // 9pm the evening before can be 12h45 out when the clocks go back overnight (Chatham, early April)
          expect(t).toBeGreaterThanOrEqual(T - 13 * HOUR);
          expect(t).toBeLessThanOrEqual(T - HOUR);
          expect(run).toBeLessThan(T);
          const h = Number(local(t, tz).slice(11, 13));
          expect(h >= 22 || h < 8, `${pactTz} → ${tz} on ${day}: ${local(t, tz)}`).toBe(false);
          if (prev !== null) expect(run - prev).toBeGreaterThanOrEqual(10 * HOUR);
          prev = run;
        }
      }
    }
  }, 30_000);
});

describe("morning pushes", () => {
  it("wait for the recipient's 9am", () => {
    const closed = pactDeadline(DUBAI, D);
    expect(local(morningSendAt(closed, DUBAI), DUBAI)).toBe("2026-11-19 09:00");
    expect(local(morningSendAt(closed, "Australia/Sydney"), "Australia/Sydney")).toBe("2026-11-19 09:00");
    // closes at 3pm in New York: daytime, so straight away
    expect(local(morningSendAt(closed, "America/New_York"), "America/New_York")).toBe("2026-11-18 15:00");
  });

  it("never go out at night or after the window closes", () => {
    const closed = pactDeadline(DUBAI, D);
    const until = pactDeadline(DUBAI, addDays(D, 1));
    expect(morningDue(closed, closed, DUBAI, until)).toBe(false); // midnight in Dubai
    expect(morningDue(closed - HOUR, closed, "America/New_York", until)).toBe(false); // before the day closed
    expect(morningDue(until, closed, "America/New_York", until)).toBe(false);
    expect(morningDue(until - HOUR, closed, "America/New_York", until)).toBe(true); // 2pm the next day
  });
});

describe("deadlineText", () => {
  const T = pactDeadline(DUBAI, D);
  it.each([
    ["Asia/Dubai", "2026-11-18T16:00:00Z", "midnight"],
    ["Asia/Muscat", "2026-11-18T16:00:00Z", "midnight"],
    ["Europe/London", "2026-11-18T16:00:00Z", "8pm your time"],
    ["Australia/Sydney", "2026-11-18T09:00:00Z", "7am tomorrow your time"],
    ["Australia/Sydney", "2026-11-18T19:00:00Z", "7am your time"],
    ["America/New_York", "2026-11-18T16:00:00Z", "3pm your time"],
    ["America/Los_Angeles", "2026-11-18T16:00:00Z", "noon your time"],
    ["Asia/Kolkata", "2026-11-18T15:00:00Z", "1:30am tomorrow your time"],
    ["Not/AZone", "2026-11-18T16:00:00Z", "midnight"],
  ])("%s at %s: %s", (tz, now, text) => {
    expect(deadlineText(T, tz, new Date(now))).toBe(text);
  });
});
