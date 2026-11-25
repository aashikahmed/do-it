"use client";

import { useEffect } from "react";
import { watchHidden } from "@/lib/refresh";

if (typeof document !== "undefined") watchHidden();

/**
 * Before pages were sent with no-store (proxy.ts), iOS saved a copy of them inside the Home Screen app and never
 * replaced it: not with newer pages, not with no-store. Asking for the page again past the cache is what removes it.
 * Once per page and device. Safe to delete once nobody opens the app from before 26 November 2026.
 */
function dropSavedCopy() {
  const key = `doit.unsaved:${location.pathname}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch {
    return;
  }
  fetch(location.pathname + location.search, { cache: "reload", headers: { Accept: "text/html" } })
    .then((res) => res.text())
    .then(() => localStorage.setItem(key, "1"))
    .catch(() => {});
}

/** Registers the service worker and clears the app badge whenever the app is in front. */
export function ServiceWorker() {
  useEffect(() => {
    // after the page has settled: nothing on screen waits for it
    const t = setTimeout(dropSavedCopy, 3_000);
    return () => clearTimeout(t);
  }, []);

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
