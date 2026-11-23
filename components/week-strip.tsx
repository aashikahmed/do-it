import type { WeekDays } from "@/lib/week";
import { weekEndsText } from "@/lib/week";

/**
 * A weekly pact's week, day by day, starting on the pact's own weekday. Weeks run from the day the pact started, so
 * the letters (W T F S S M T) and "ends" under the last day show where this week stops.
 */

/** The home card's version: your 7 days as squares, in the card's own color. */
export function WeekSquares({ week, today }: { week: WeekDays; today: string }) {
  const ends = weekEndsText(week.end, today);
  return (
    <div role="img" aria-label={`This week ${week.count} of ${week.need}, ${ends}`}>
      <div className="grid grid-cols-7 gap-1.5" aria-hidden>
        {week.days.map((d, i) => (
          <div key={d.day} className="flex flex-col items-center gap-1 text-[11px] font-bold">
            <span
              className={`aspect-square w-full max-w-[30px] rounded-[8px] ${
                d.mark === "in"
                  ? "bg-current"
                  : d.mark === "open"
                    ? "link-open border-2 border-current"
                    : d.mark === "past"
                      ? "border-[1.5px] border-current opacity-40"
                      : "border-[1.5px] border-dashed border-current opacity-40"
              }`}
            />
            <span className={`leading-none ${d.today ? "" : "opacity-70"}`}>{d.letter}</span>
            {i === week.days.length - 1 && <span className="-mt-0.5 text-[9.5px] leading-none font-semibold opacity-80">ends</span>}
          </div>
        ))}
      </div>
      <p className="mt-1.5 flex justify-between gap-2 text-[13px] font-bold" aria-hidden>
        <span>
          This week {week.count} of {week.need}
        </span>
        <span className="font-semibold opacity-80">{ends === "last day" ? "Last day" : ends[0].toUpperCase() + ends.slice(1)}</span>
      </p>
    </div>
  );
}

const DOT = "h-[11px] w-[11px] shrink-0";

/** The roster's version: one person's 7 days as dots. Pair with WeekLetters above the list so the columns line up. */
export function WeekDots({ week }: { week: WeekDays }) {
  return (
    <div className="mt-1 flex gap-[7px]" role="img" aria-label={week.days.map((d) => `${d.letter} ${d.mark === "in" ? "done" : d.mark === "future" ? "to come" : d.mark === "open" ? "today" : "none"}`).join(", ")}>
      {week.days.map((d) => (
        <span
          key={d.day}
          className={`${DOT} rounded-full ${
            d.mark === "in"
              ? "bg-[var(--pact)]"
              : d.mark === "open"
                ? "border-2 border-ink"
                : d.mark === "past"
                  ? "border-2 border-line"
                  : "border-[1.5px] border-dashed border-ink-3/60"
          }`}
        />
      ))}
    </div>
  );
}

/** The weekday letters over the roster's dots, today in bold. */
export function WeekLetters({ week }: { week: WeekDays }) {
  return (
    <div className="flex gap-[7px]" aria-hidden>
      {week.days.map((d) => (
        <span key={d.day} className={`${DOT} text-center text-[10px] leading-[11px] ${d.today ? "font-extrabold text-ink" : "font-semibold text-ink-3"}`}>
          {d.letter}
        </span>
      ))}
    </div>
  );
}
