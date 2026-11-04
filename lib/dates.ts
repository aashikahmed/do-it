// Calendar-day helpers. Days are ISO strings (YYYY-MM-DD) and all math is done in UTC
// so it never drifts with the device's local timezone or DST.

export type Day = string;

const fmtCache = new Map<string, Intl.DateTimeFormat>();

export function todayIn(timeZone: string, now: Date = new Date()): Day {
  let fmt = fmtCache.get(timeZone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    }
    fmtCache.set(timeZone, fmt);
  }
  return fmt.format(now);
}

export function hourIn(timeZone: string, now: Date = new Date()): number {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now);
    return Number(h);
  } catch {
    return now.getUTCHours();
  }
}

function toUtc(d: Day): number {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
}

export function addDays(d: Day, n: number): Day {
  return new Date(toUtc(d) + n * 86_400_000).toISOString().slice(0, 10);
}

/** b - a in whole days */
export function diffDays(a: Day, b: Day): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function formatDay(d: Day, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat("en", { ...opts, timeZone: "UTC" }).format(new Date(toUtc(d)));
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
