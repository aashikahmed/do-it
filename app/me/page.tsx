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
  const me = await getMe(supabase, userId);
  return <Settings me={me} email={email} />;
}
