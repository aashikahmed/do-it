"use client";

import { useState } from "react";
import type { IdeaCard } from "@/lib/explore/types";
import { IdeaRows } from "./idea-row";

/** Three ideas for the week, and a few more sets for anyone who wants to look on. */
export function ThreePicks({ sets }: { sets: IdeaCard[][] }) {
  const [i, setI] = useState(0);
  return (
    <section className="mt-7">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-extrabold">Three for this week</h2>
        <button onClick={() => setI((i + 1) % sets.length)} className="h-11 text-[15px] font-bold text-blue">
          Show three more
        </button>
      </div>
      <div className="mt-1" aria-live="polite">
        <IdeaRows cards={sets[i]} />
      </div>
    </section>
  );
}
