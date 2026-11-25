"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { NO_FILTERS, passes, type Filters } from "@/lib/explore/filters";
import { buildIndex, searchIdeas } from "@/lib/explore/search";
import type { IdeaCard } from "@/lib/explore/types";
import { BackButton } from "./back-button";
import { FilterChips, IdeaCount } from "./filter-chips";
import { IdeaRows } from "./idea-row";
import { Suggest } from "./suggest";

const TRY = ["I'm always tired", "less phone", "5 minutes", "with my mum", "stronger", "anxious", "something creative", "save money"];
const SHOWN = 30;

export function SearchView({ cards }: { cards: IdeaCard[] }) {
  // what was typed is still there on the way back from an idea, and a new visit starts empty
  const { bfcacheId } = useRouter();
  return <View key={bfcacheId} cards={cards} />;
}

function View({ cards }: { cards: IdeaCard[] }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const index = useMemo(() => buildIndex(cards), [cards]);
  const query = useDeferredValue(q).trim();
  const hits = useMemo(() => (query ? searchIdeas(index, query) : []), [index, query]);
  const all = hits.map((h) => h.card);
  const shown = all.filter((c) => passes(c, f));
  const own = `/new?name=${encodeURIComponent(query.slice(0, 60))}`;

  return (
    <main className="min-h-dvh px-5 pt-safe pb-8">
      <div className="flex items-center gap-1 pt-3">
        <BackButton fallback="/explore" />
        <label className="flex h-13 min-w-0 flex-1 items-center gap-2 rounded-2xl border-2 border-transparent bg-paper px-3.5 focus-within:border-blue">
          <Search size={20} strokeWidth={2.6} aria-hidden className="shrink-0 text-ink-2" />
          <input
            autoFocus
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={60}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setF(NO_FILTERS);
            }}
            placeholder="Search, or say how you feel"
            aria-label="Search ideas"
            className="h-12 min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-ink-3"
          />
        </label>
      </div>

      {!query ? (
        <>
          <p className="mt-6 mb-3 text-[15px] font-bold text-ink-2">Try</p>
          <div className="flex flex-wrap gap-2">
            {TRY.map((t) => (
              <button key={t} onClick={() => setQ(t)} className="h-11 rounded-full bg-paper px-4 text-[15px] font-semibold active:scale-95">
                {t}
              </button>
            ))}
          </div>
          <p className="mt-4 text-[14px] leading-snug text-ink-2">Names, feelings, goals and minutes all work.</p>
        </>
      ) : !all.length ? (
        <div className="pt-8" aria-live="polite">
          <p className="text-[28px] leading-tight font-extrabold tracking-tight break-words">Nothing called &ldquo;{query}&rdquo; yet.</p>
          <p className="mt-2 text-[16px] leading-snug text-ink-2">Start it yourself. You set the target, and it works the same way.</p>
          <Link href={own} className="mt-6 flex min-h-14 items-center justify-center rounded-[22px] bg-ink px-5 py-2 text-center text-[17px] font-extrabold break-words text-white">
            Make it a pact
          </Link>
          <Link href="/explore" className="mt-2 flex h-12 items-center justify-center text-[15px] font-bold text-blue">
            Look through the lanes
          </Link>
          <Suggest key={query} text={query} />
        </div>
      ) : (
        <>
          {all.length > 5 && <FilterChips cards={all} value={f} onChange={setF} />}
          <IdeaCount n={shown.length} filters={f} onClear={setF} />
          <IdeaRows cards={shown.slice(0, SHOWN)} whys={Object.fromEntries(hits.map((h) => [h.card.id, h.why]))} />
          {shown.length > SHOWN && <p className="mt-3 text-center text-[14px] text-ink-2">Showing the first {SHOWN}. Add a word to narrow it down.</p>}
          <Link href={own} className="mt-3 flex min-h-12 items-center justify-center text-center text-[15px] font-bold text-blue">
            Not here? Make it your own pact
          </Link>
        </>
      )}
    </main>
  );
}
