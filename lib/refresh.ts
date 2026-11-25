"use client";

import { retryDelay } from "./fresh";

// iOS reloads an ended page while the app is still in the background, and React only hydrates the data once the page
// is seen: by then "came to the front" has come and gone. Remembered from the moment the layout's script runs.
let hidden = false;

/** Has this page been in the background since it opened? Keep `watchHidden()` in the layout: page scripts load too late. */
export const wasHidden = () => hidden;

export function watchHidden() {
  const note = () => {
    if (document.visibilityState === "hidden") hidden = true;
  };
  note();
  document.addEventListener("visibilitychange", note);
}

// One refresh at a time for the whole app, however many things ask for it.
let timer: ReturnType<typeof setTimeout> | null = null;
let turn = 0;
let failed = 0;

/** Can we reach our own server? A tiny static file, so it's quick and never touches the session. */
async function reachable() {
  if (navigator.onLine === false) return false;
  const stop = new AbortController();
  // right after a phone wakes up, the first request can hang on a dead connection
  const t = setTimeout(() => stop.abort(), 5_000);
  try {
    await fetch("/sw.js", { method: "HEAD", cache: "no-store", signal: stop.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Refresh the screen's data soon. Checks the connection first: when a refresh fails, Next.js falls back to loading the
 * whole page, and offline that swaps the app for the browser's error page, with no way back in a Home Screen app.
 * Offline it keeps what's on screen and tries again until it gets through.
 */
export function refreshSoon(refresh: () => void, delay = 250) {
  if (timer) clearTimeout(timer);
  const mine = ++turn;
  timer = setTimeout(async () => {
    timer = null;
    // coming back to the front asks again
    if (document.visibilityState !== "visible") return;
    const ok = await reachable();
    if (mine !== turn) return;
    if (ok) {
      failed = 0;
      refresh();
    } else refreshSoon(refresh, retryDelay(++failed));
  }, delay);
}
