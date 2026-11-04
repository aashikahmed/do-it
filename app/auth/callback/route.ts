import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashNonce, isNonce } from "@/lib/handoff";

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

/**
 * Google → Supabase → here with ?code=…
 * Same browser that started sign-in (it holds the PKCE verifier cookie): finish here.
 * Different context (iOS Home Screen app → Safari sheet): park the code for the app to collect.
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
    const { error } = await createAdminClient()
      .from("auth_handoffs")
      .upsert({ nonce_hash: hashNonce(nonce), code, created_at: new Date().toISOString() });
    if (error) return fail("failed");
    return NextResponse.redirect(new URL("/auth/handoff", url.origin));
  }
  return fail("failed");
}
