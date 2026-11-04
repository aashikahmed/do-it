import { Suspense } from "react";
import { getMe, requireUser } from "@/lib/data";
import { Settings } from "./settings";

export const metadata = { title: "You" };

export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <Me />
    </Suspense>
  );
}

async function Me() {
  const { supabase, userId, email } = await requireUser();
  const [me, claims] = await Promise.all([getMe(supabase, userId), supabase.auth.getClaims()]);
  const meta = (claims.data?.claims?.user_metadata ?? {}) as { avatar_url?: string; picture?: string };
  const g = meta.avatar_url || meta.picture || "";
  const googlePhoto = /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(g) ? g : null;
  return <Settings me={me} email={email} googlePhoto={googlePhoto} />;
}
