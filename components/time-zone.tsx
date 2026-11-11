"use client";

import { useEffect, useSyncExternalStore } from "react";
import { syncTimeZone } from "@/lib/client-actions";
import { deviceTimeZone, isValidTimeZone } from "@/lib/dates";

// one write per timezone per page load, however many screens mount this
let sent = "";

/**
 * Keeps `profiles.timezone` on the device's clock, so reminders arrive at sensible times after travel.
 * Compares first and writes only when they differ, after render, and again when the app comes back to the front.
 */
export function TimeZoneSync({ saved }: { saved: string }) {
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const tz = deviceTimeZone();
      if (tz === saved || tz === sent || !isValidTimeZone(tz)) return;
      sent = tz;
      syncTimeZone(tz).then((res) => {
        if (!res.ok) sent = "";
      });
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [saved]);
  return null;
}

const noop = () => () => {};

/** The viewer's timezone: the device's, or `saved` (their profile's) while hydrating, so server and client agree. */
export function useViewerTimeZone(saved: string) {
  return useSyncExternalStore(noop, deviceTimeZone, () => saved);
}
