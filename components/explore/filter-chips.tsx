import { anyFilter, chipsFor, NO_FILTERS, type Filters } from "@/lib/explore/filters";
import type { IdeaCard } from "@/lib/explore/types";

/** Filter chips for a list. They wrap, so none hide past the edge, and each says how many ideas it leaves. */
export function FilterChips({ cards, value, onChange }: { cards: IdeaCard[]; value: Filters; onChange: (f: Filters) => void }) {
  const chips = chipsFor(cards, value);
  if (!chips.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filters">
      {chips.map(({ chip, on, count }) => (
        <button
          key={chip.id}
          aria-pressed={on}
          disabled={!on && count === 0}
          onClick={() => onChange({ ...value, ...(on ? chip.off : chip.on) })}
          className={`flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold disabled:opacity-40 ${on ? "bg-ink text-white" : "bg-paper"}`}
        >
          {chip.label}
          <span className={`tnum text-[13px] ${on ? "text-white/75" : "text-ink-2"}`}>{count}</span>
        </button>
      ))}
    </div>
  );
}

export function IdeaCount({ n, filters, onClear }: { n: number; filters: Filters; onClear: (f: Filters) => void }) {
  return (
    <p className="tnum mt-4 mb-2 flex min-h-8 items-center gap-3 text-[14px] font-bold text-ink-2" aria-live="polite">
      {n === 1 ? "1 idea" : `${n} ideas`}
      {anyFilter(filters) && (
        <button onClick={() => onClear({ ...NO_FILTERS, domain: filters.domain })} className="h-8 text-blue">
          Clear filters
        </button>
      )}
    </p>
  );
}
