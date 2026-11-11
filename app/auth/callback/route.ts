import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONFIRM_COOKIE, HANDOFF_TTL_MS, hashNonce, hashToken, isNonce, newConfirmToken } from "@/lib/handoff";
import { safeNext } from "@/lib/safe-next";

/**
 * Google → Supabase → here with ?code=…
 * Same browser that started sign-in (it holds the PKCE verifier cookie): finish here.
 * Different context (iOS Home Screen app → Safari sheet): park the code for the app to collect, once the
 * person confirms in this browser (see /auth/handoff). The confirm secret lives only in this browser's cookie,
 * so someone who started the sign-in elsewhere and sent the link can't collect the code on their own.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const nonce = url.searchParams.get("h");
  const fail = (reason: string) => NextResponse.redirect(new URL(`/signin?error=${reason}`, url.origin));

  if (!code) return fail(url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed");

  const hasVerifier = req.cookies.getAll().some((c) => c.name.endsWith("-code-verifier"));
  if (hasVerifier) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(`/welcome?next=${encodeURIComponent(next)}`, url.origin));
    if (!isNonce(nonce)) return fail("failed");
  }

  if (isNonce(nonce)) {
    const token = newConfirmToken();
    const { error } = await createAdminClient().from("auth_handoffs").upsert({
      nonce_hash: hashNonce(nonce),
      code,
      confirm_hash: hashToken(token),
      confirmed_at: null,
      created_at: new Date().toISOString(),
    });
    if (error) return fail("failed");
    const res = NextResponse.redirect(new URL("/auth/handoff", url.origin));
    res.cookies.set(CONFIRM_COOKIE, token, {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/auth/handoff",
      maxAge: HANDOFF_TTL_MS / 1000,
    });
    return res;
  }
  return fail("failed");
}
