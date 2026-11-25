"use client";

import Link from "next/link";
import { useSaved } from "@/lib/explore/saved";
import type { IdeaCard } from "@/lib/explore/types";
import { IdeaRows } from "./idea-row";

export function SavedList({ cards }: { cards: IdeaCard[] }) {
  const saved = useSaved().flatMap((id) => cards.find((c) => c.id === id) ?? []);
  if (!saved.length)
    return (
      <>
        <p className="max-w-[32ch] text-[17px] leading-snug text-ink-2">Nothing saved on this device yet. Tap the bookmark on an idea to keep it for later.</p>
        <Link href="/explore" className="mt-6 flex h-14 items-center justify-center rounded-[22px] bg-blue text-[17px] font-extrabold text-white">
          Look through ideas
        </Link>
      </>
    );
  return <IdeaRows cards={saved} />;
}
