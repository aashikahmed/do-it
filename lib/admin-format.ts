/** Times on the admin pages, in the admin's own timezone. Server-side only (they read the clock). */

export function ago(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) {
    const d = Math.floor(s / 86_400);
    return d === 1 ? "yesterday" : `${d} days ago`;
  }
  return "";
}

export function dateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function dateOnly(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function clock(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "3 min ago", falling back to the date once it's over a week old */
export function recent(iso: string | null, tz: string, now: number = Date.now()): string {
  if (!iso) return "Never";
  return ago(iso, now) || dateOnly(iso, tz);
}
