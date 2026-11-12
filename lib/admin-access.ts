/**
 * Who can open /admin: the emails in the ADMIN_EMAILS env var (comma-separated), set in Vercel.
 * Kept out of the repo because the repo is public. Unset or empty means nobody.
 */
export function adminEmails(raw: string | undefined = process.env.ADMIN_EMAILS): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** `email` comes from the verified session claims, never from the request. */
export function isAdminEmail(email: unknown, raw?: string): boolean {
  if (typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  return !!e && adminEmails(raw).has(e);
}
