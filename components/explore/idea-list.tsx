"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NO_FILTERS, passes, type Filters } from "@/lib/explore/filters";
import { DOMAIN_NAMES } from "@/lib/explore/lanes";
import type { Domain, IdeaCard } from "@/lib/explore/types";
import { FilterChips, IdeaCount } from "./filter-chips";
import { IdeaRows } from "./idea-row";

/** A list of ideas with its filters. Filters survive going to an idea and back, and start fresh on a new visit. */
export function IdeaList(props: { cards: IdeaCard[]; domains?: Domain[] }) {
  const { bfcacheId } = useRouter();
  return <List key={bfcacheId} {...props} />;
}

function List({ cards, domains = [] }: { cards: IdeaCard[]; domains?: Domain[] }) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const shown = cards.filter((c) => passes(c, f));
  return (
    <>
      {domains.length > 1 && (
        <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pt-3" role="group" aria-label="Narrow it down">
          {[null, ...domains].map((d) => (
            <button
              key={d ?? "all"}
              aria-pressed={f.domain === d}
              onClick={() => setF({ ...f, domain: d })}
              className={`h-11 shrink-0 border-b-[3px] text-[16px] font-bold ${f.domain === d ? "border-ink" : "border-transparent text-ink-2"}`}
            >
              {d ? DOMAIN_NAMES[d] : "All"}
            </button>
          ))}
        </div>
      )}
      <FilterChips cards={cards} value={f} onChange={setF} />
      <IdeaCount n={shown.length} filters={f} onClear={setF} />
      {shown.length ? (
        <IdeaRows cards={shown} />
      ) : (
        <div className="py-4">
          <p className="text-[24px] leading-tight font-extrabold tracking-tight">Nothing fits all of that.</p>
          <p className="mt-1.5 text-[16px] text-ink-2">Take one filter off and look again.</p>
        </div>
      )}
    </>
  );
}
