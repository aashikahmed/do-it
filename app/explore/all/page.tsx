import Link from "next/link";
import { Search } from "lucide-react";
import { BackButton } from "@/components/explore/back-button";
import { IdeaList } from "@/components/explore/idea-list";
import { allCards } from "@/lib/explore/catalog";

export const metadata = { title: "All ideas" };

export default function Page() {
  return (
    <main className="min-h-dvh px-5 pt-safe pb-8">
      <div className="flex h-14 items-center justify-between pt-3">
        <BackButton fallback="/explore" />
        <Link href="/explore/search" aria-label="Search ideas" className="-mr-2 flex h-11 w-11 items-center justify-center">
          <Search size={22} strokeWidth={2.6} aria-hidden />
        </Link>
      </div>
      <h1 className="display pt-2 pb-2 text-[56px] font-extrabold">Everything.</h1>
      <IdeaList cards={allCards()} />
    </main>
  );
}
