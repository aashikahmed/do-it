"use client";

import Link from "next/link";
import { useSaved } from "@/lib/explore/saved";

export function SavedLink() {
  const n = useSaved().length;
  if (!n) return null;
  return (
    <Link href="/explore/saved" className="flex h-11 items-center text-[15px] font-bold text-blue">
      Saved ({n})
    </Link>
  );
}
