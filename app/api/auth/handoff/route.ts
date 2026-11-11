import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HANDOFF_TTL_MS, hashNonce, isNonce } from "@/lib/handoff";

/** The app polls this with its nonce; returns the parked auth code once it has been confirmed, then deletes it. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { nonce?: unknown } | null;
  if (!isNonce(body?.nonce)) return NextResponse.json({ code: null }, { status: 400 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("auth_handoffs")
    .delete()
    .eq("nonce_hash", hashNonce(body.nonce))
    .not("confirmed_at", "is", null)
    .gte("created_at", new Date(Date.now() - HANDOFF_TTL_MS).toISOString())
    .select("code")
    .maybeSingle();
  // housekeeping: drop stale parked codes
  await admin.from("auth_handoffs").delete().lt("created_at", new Date(Date.now() - HANDOFF_TTL_MS).toISOString());
  return NextResponse.json({ code: data?.code ?? null }, { headers: { "Cache-Control": "no-store" } });
}
