const BASE = "http://local.invalid";

/**
 * A same-site path to send someone to after sign-in, or the fallback.
 * Parses like a browser does, so `/\evil.com`, `//evil.com` and tab tricks can't leave the site.
 */
export function safeNext(n: string | null | undefined, fallback = "/"): string {
  if (!n || !n.startsWith("/")) return fallback;
  try {
    const u = new URL(n, BASE);
    if (u.origin !== BASE) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
