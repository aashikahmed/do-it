import Link from "next/link";
import type { IdeaCard } from "@/lib/explore/types";

/** One idea in a list. `why` is what a search matched on when the title doesn't show it. */
export function IdeaRow({ card, why }: { card: IdeaCard; why?: string }) {
  const meta = card.kind === "break" ? "Break a habit" : [`${card.minutes || 1} min`, card.when === "day" ? "daytime" : card.when === "anytime" ? "" : card.when].filter(Boolean).join(", ");
  return (
    <Link href={`/explore/${card.slug}`} data-color={card.color} className="flex items-center gap-3 rounded-[20px] bg-paper p-3 active:scale-[0.985]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--pact-soft)] text-[24px]" aria-hidden>
        {card.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] leading-tight font-extrabold tracking-tight">{card.title}</span>
        <span className="mt-0.5 block text-[14px] leading-snug font-semibold text-ink-2">{card.from}</span>
        <span className="block text-[13px] leading-snug text-ink-2">
          {meta}
          {why && <span className="ml-1.5 text-blue">&ldquo;{why}&rdquo;</span>}
        </span>
      </span>
    </Link>
  );
}

export function IdeaRows({ cards, whys }: { cards: IdeaCard[]; whys?: Record<string, string> }) {
  return (
    <div className="space-y-2">
      {cards.map((c) => (
        <IdeaRow key={c.id} card={c} why={whys?.[c.id]} />
      ))}
    </div>
  );
}
