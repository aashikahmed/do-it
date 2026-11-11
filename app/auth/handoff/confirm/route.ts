import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONFIRM_COOKIE, HANDOFF_TTL_MS, hashToken } from "@/lib/handoff";

/**
 * Belt and braces against cross-site posts (the SameSite=lax cookie already stops them carrying the secret).
 * Only refuses on positive evidence, so a browser that leaves these headers out can still sign in.
 */
function crossSite(req: NextRequest) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).host !== (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return true;
  }
}

/** "Yes, that was me" or "No, cancel" on /auth/handoff. Only the browser holding the confirm cookie can answer. */
export async function POST(req: NextRequest) {
  const url = req.nextUrl;
  const back = (s: "done" | "cancelled" | "expired") => {
    const res = NextResponse.redirect(new URL(`/auth/handoff?s=${s}`, url.origin), 303);
    res.cookies.delete({ name: CONFIRM_COOKIE, path: "/auth/handoff" });
    return res;
  };
  if (crossSite(req)) return new NextResponse("Forbidden", { status: 403 });

  const token = req.cookies.get(CONFIRM_COOKIE)?.value;
  if (!token) return back("expired");
  const form = await req.formData().catch(() => null);
  const admin = createAdminClient();
  const mine = admin.from("auth_handoffs");

  if (form?.get("choice") !== "confirm") {
    await mine.delete().eq("confirm_hash", hashToken(token));
    return back("cancelled");
  }
  const { data } = await mine
    .update({ confirmed_at: new Date().toISOString() })
    .eq("confirm_hash", hashToken(token))
    .is("confirmed_at", null)
    .gte("created_at", new Date(Date.now() - HANDOFF_TTL_MS).toISOString())
    .select("nonce_hash")
    .maybeSingle();
  return back(data ? "done" : "expired");
}
