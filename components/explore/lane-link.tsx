"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { ExploreLane } from "@/lib/explore/lanes";

/** One lane of the track. Tapping it sends a runner down the lane on the way to its ideas. */
export function LaneLink({ lane, count }: { lane: ExploreLane; count: number }) {
  const router = useRouter();
  const [run, setRun] = useState(false);
  const href = `/explore/lane/${lane.id}`;
  return (
    <Link
      href={href}
      prefetch
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        e.preventDefault();
        if (run) return;
        setRun(true);
        setTimeout(() => {
          router.push(href);
          setRun(false);
        }, 220);
      }}
      className="relative flex h-[50px] items-center overflow-hidden pr-4"
      style={{ background: lane.bg, color: lane.ink }}
    >
      {/* staggered starts: each lane's line sits a little further along */}
      <span className="display tnum shrink-0 pl-4 text-[19px] font-extrabold opacity-75" style={{ width: 32 + lane.n * 6 }} aria-hidden>
        {lane.n}
      </span>
      <span className="w-[3px] shrink-0 self-stretch bg-white/90" aria-hidden />
      <span className="display pl-4 text-[28px] font-extrabold whitespace-nowrap">{lane.name}</span>
      <span className="tnum ml-auto text-[15px] font-bold opacity-85">
        {count}
        <span className="sr-only"> ideas</span>
      </span>
      <span
        aria-hidden
        className={`absolute top-1/2 left-0 -mt-[7px] h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_0_2px_rgba(16,20,58,0.25)] ${run ? "translate-x-[440px] transition-transform duration-[220ms] ease-in" : "opacity-0"}`}
        style={{ marginLeft: 38 + lane.n * 6 }}
      />
    </Link>
  );
}
