import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Search } from "lucide-react";
import { BackButton } from "@/components/explore/back-button";
import { IdeaList } from "@/components/explore/idea-list";
import { Suggest } from "@/components/explore/suggest";
import { allCards } from "@/lib/explore/catalog";
import { EXPLORE_LANES } from "@/lib/explore/lanes";

export function generateStaticParams() {
  return EXPLORE_LANES.map((l) => ({ lane: l.id }));
}

export async function generateMetadata({ params }: PageProps<"/explore/lane/[lane]">) {
  const { lane } = await params;
  return { title: EXPLORE_LANES.find((l) => l.id === lane)?.name ?? "Explore" };
}

export default function Page({ params }: PageProps<"/explore/lane/[lane]">) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <Lane params={params} />
    </Suspense>
  );
}

async function Lane({ params }: { params: PageProps<"/explore/lane/[lane]">["params"] }) {
  const { lane: id } = await params;
  const lane = EXPLORE_LANES.find((l) => l.id === id);
  if (!lane) notFound();
  return (
    <main className="min-h-dvh pb-safe">
      <header className="px-5 pt-safe pb-6" style={{ background: lane.bg, color: lane.ink }}>
        <div className="flex h-14 items-center justify-between pt-3">
          <BackButton fallback="/explore" />
          <Link href="/explore/search" aria-label="Search ideas" className="-mr-2 flex h-11 w-11 items-center justify-center">
            <Search size={22} strokeWidth={2.6} aria-hidden />
          </Link>
        </div>
        <h1 className="display pt-2 text-[56px] font-extrabold">
          <span className="mr-2.5 opacity-55" aria-hidden>
            {lane.n}
          </span>
          {lane.name}
        </h1>
        <p className="mt-2 text-[17px] opacity-90">{lane.tag}</p>
      </header>
      <div className="px-5 pb-8">
        <IdeaList key={lane.id} cards={allCards().filter((c) => lane.domains.includes(c.domain))} domains={lane.domains} />
        <Suggest />
      </div>
    </main>
  );
}
