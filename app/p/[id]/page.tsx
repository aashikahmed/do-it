import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getPact } from "@/lib/data";
import { TimeZoneSync } from "@/components/time-zone";
import { PactView } from "./pact-view";

export default function Page({ params }: PageProps<"/p/[id]">) {
  return (
    <Suspense fallback={<PactSkeleton />}>
      <PactScreen params={params} />
    </Suspense>
  );
}

async function PactScreen({ params }: { params: PageProps<"/p/[id]">["params"] }) {
  const { id } = await params;
  const { me, bundle, series } = await getPact(id);
  if (!me.name) redirect(`/welcome?next=/p/${id}`);
  if (!bundle) notFound();
  return (
    <>
      <TimeZoneSync saved={me.timezone} />
      <PactView key={bundle.pact.id} b={bundle} me={me} series={series} />
    </>
  );
}

function PactSkeleton() {
  return (
    <main aria-busy="true">
      <div className="bg-[#d9ddef] px-5 pt-safe pb-8">
        <div className="h-11" />
        <div className="mt-6 h-6 w-40 rounded-full bg-white/50" />
        <div className="mt-6 h-24 w-32 rounded-2xl bg-white/50" />
        <div className="mt-6 h-16 w-full rounded-2xl bg-white/40" />
      </div>
      <div className="space-y-3 p-4">
        <div className="skeleton h-40 !rounded-[24px]" />
        <div className="skeleton h-24 !rounded-[24px]" />
      </div>
    </main>
  );
}
