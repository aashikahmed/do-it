/** A page this old (or this far in the future: a wrong clock) when it opens came out of a cache, not from the server. */
export const MAX_OPEN_AGE_MS = 20_000;

/**
 * Is what's on screen old? `stamp` is when the server rendered it.
 * - A page that was just opened: old when the browser put back a saved copy (iOS does that after it ends the app's page
 *   in the background, without asking the server) or when its stamp says so.
 * - A screen that comes back: the router keeps the last few alive, so back shows the very data it showed before.
 * Only an opened page looks at the clock. Anything later came over the network, and a device with a wrong clock would
 * otherwise refresh forever.
 */
export function isOld(p: { stamp: number; shown: number | null; opening: boolean; restored: boolean; now: number }) {
  if (p.shown === p.stamp) return true;
  if (!p.opening) return false;
  return p.restored || Math.abs(p.now - p.stamp) > MAX_OPEN_AGE_MS;
}

const RETRY_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

/** How long to wait before trying again, after `failed` attempts in a row (1 = the first one just failed). */
export function retryDelay(failed: number) {
  return RETRY_MS[Math.min(Math.max(failed, 1), RETRY_MS.length) - 1];
}
