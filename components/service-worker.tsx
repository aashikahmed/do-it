"use client";

import { useEffect } from "react";

/** Registers the service worker and clears the app badge whenever the app is in front. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});

    const clear = () => {
      if (document.visibilityState !== "visible") return;
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      nav.clearAppBadge?.().catch(() => {});
    };
    clear();
    document.addEventListener("visibilitychange", clear);
    // notification click on a page the worker doesn't control yet: navigate ourselves
    const onMessage = (e: MessageEvent) => {
      const url = e.data?.type === "open" && typeof e.data.url === "string" ? new URL(e.data.url, location.origin) : null;
      if (url && url.origin === location.origin) location.assign(url.href);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", clear);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
