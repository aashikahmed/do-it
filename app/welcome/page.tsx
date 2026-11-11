import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getMe, requireUser } from "@/lib/data";
import { safeNext } from "@/lib/safe-next";
import { WelcomeForm } from "./welcome-form";

export const metadata = { title: "Welcome" };

export default function Page({ searchParams }: PageProps<"/welcome">) {
  return (
    <main className="flex min-h-dvh flex-col px-6 pt-safe pb-safe">
      <Suspense fallback={null}>
        <Welcome searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Welcome({ searchParams }: { searchParams: PageProps<"/welcome">["searchParams"] }) {
  const sp = await searchParams;
  const target = safeNext(typeof sp.next === "string" ? sp.next : null);
  const next = target.startsWith("/welcome") ? "/" : target;
  const { supabase, userId } = await requireUser();
  const me = await getMe(supabase, userId);
  if (me.name) redirect(next);
  return <WelcomeForm next={next} />;
}
