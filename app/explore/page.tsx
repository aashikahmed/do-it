import Link from "next/link";
import { cacheLife } from "next/cache";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { BackButton } from "@/components/explore/back-button";
import { LaneLink } from "@/components/explore/lane-link";
import { SavedLink } from "@/components/explore/saved-link";
import { ThreePicks } from "@/components/explore/three-picks";
import { threeFor } from "@/lib/explore/catalog";
import { IDEAS } from "@/lib/explore/ideas";
import { EXPLORE_LANES } from "@/lib/explore/lanes";

export const metadata = { title: "Explore", description: "Ideas for things to do together, with a good place to start." };

export default function Page() {
  return (
    <main className="min-h-dvh pt-safe pb-safe">
      <div className="px-5">
        <div className="flex h-14 items-center justify-between pt-3">
          <BackButton fallback="/" />
          <SavedLink />
        </div>
        <h1 className="display pt-2 pb-5 text-[56px] font-extrabold">Pick a lane.</h1>
        <Link href="/explore/search" className="flex h-14 items-center gap-2.5 rounded-[18px] bg-paper px-4 text-[16px] font-semibold text-ink-2">
          <Search size={20} strokeWidth={2.6} aria-hidden />
          Search, or say how you feel
        </Link>
      </div>
      <nav aria-label="Domains" className="mt-4 grid gap-0.5 bg-white py-0.5">
        {EXPLORE_LANES.map((lane) => (
          <LaneLink key={lane.id} lane={lane} count={IDEAS.filter((i) => lane.domains.includes(i.domain)).length} />
        ))}
      </nav>
      <div className="px-5 pb-6">
        <Suspense fallback={<div className="h-[320px]" />}>
          <ThisWeek />
        </Suspense>
        <Link href="/explore/all" className="mt-2 flex h-12 items-center justify-center text-[15px] font-bold text-blue">
          See all {IDEAS.length}
        </Link>
      </div>
    </main>
  );
}

/** Weeks since 1970, worked out at most once a day. */
async function weekNumber() {
  "use cache";
  cacheLife("days");
  return Math.floor(Date.now() / 604_800_000);
}

/** The same three for everyone, changing each week. */
async function ThisWeek() {
  const week = await weekNumber();
  return <ThreePicks sets={[0, 1, 2, 3, 4].map((k) => threeFor(week + k * 11))} />;
}
