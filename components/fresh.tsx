"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { isOld } from "@/lib/fresh";
import { refreshSoon, wasHidden } from "@/lib/refresh";

// the page itself is only checked once; every later screen came over the network
let opened = false;

function wasRestored() {
  const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "back_forward";
}

/**
 * Never leave old data on screen. Every page that shows someone's data renders this with `stamp` (`at` from
 * lib/data.ts: when the server loaded it). Refreshes when the page opened from a saved copy, when a kept screen comes back, when the
 * app comes to the front, and when the connection returns.
 */
export function Fresh({ stamp }: { stamp: number }) {
  const router = useRouter();
  const shown = useRef<number | null>(null);

  // runs when this data first shows, and again every time the router brings the same screen back
  useEffect(() => {
    const opening = !opened;
    opened = true;
    if (isOld({ stamp, shown: shown.current, opening, restored: opening && (wasRestored() || wasHidden()), now: Date.now() })) refreshSoon(router.refresh, 0);
    shown.current = stamp;
  }, [stamp, router]);

  useEffect(() => {
    const soon = () => document.visibilityState === "visible" && refreshSoon(router.refresh);
    // the browser put the whole page back from memory, scripts and all
    const onShow = (e: PageTransitionEvent) => e.persisted && soon();
    document.addEventListener("visibilitychange", soon);
    window.addEventListener("focus", soon);
    window.addEventListener("online", soon);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", soon);
      window.removeEventListener("focus", soon);
      window.removeEventListener("online", soon);
      window.removeEventListener("pageshow", onShow);
    };
  }, [router]);

  return null;
}
