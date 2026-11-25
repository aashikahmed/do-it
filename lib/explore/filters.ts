import type { Domain, IdeaCard } from "./types";

export interface Filters {
  domain: Domain | null;
  minutes: number | null;
  when: "morning" | "evening" | null;
  place: "home" | "outside" | null;
  noKit: boolean;
  family: boolean;
}

export const NO_FILTERS: Filters = { domain: null, minutes: null, when: null, place: null, noKit: false, family: false };

export function passes(c: IdeaCard, f: Filters) {
  if (f.domain && c.domain !== f.domain) return false;
  if (f.minutes !== null && c.kind === "build" && c.minutes > f.minutes) return false;
  if (f.when && c.when !== f.when && c.when !== "anytime") return false;
  if (f.place && c.place !== f.place && c.place !== "anywhere") return false;
  if (f.noKit && !c.noKit) return false;
  if (f.family && !c.goodWith.includes("family")) return false;
  return true;
}

export interface Chip {
  id: string;
  label: string;
  on: Partial<Filters>;
  off: Partial<Filters>;
}

const CHIPS: Chip[] = [
  { id: "5", label: "5 min", on: { minutes: 5 }, off: { minutes: null } },
  { id: "10", label: "10 min", on: { minutes: 10 }, off: { minutes: null } },
  { id: "morning", label: "Mornings", on: { when: "morning" }, off: { when: null } },
  { id: "evening", label: "Evenings", on: { when: "evening" }, off: { when: null } },
  { id: "home", label: "At home", on: { place: "home" }, off: { place: null } },
  { id: "outside", label: "Outside", on: { place: "outside" }, off: { place: null } },
  { id: "kit", label: "No kit", on: { noKit: true }, off: { noKit: false } },
  { id: "family", label: "With family", on: { family: true }, off: { family: false } },
];

export function chipOn(chip: Chip, f: Filters) {
  return (Object.keys(chip.on) as (keyof Filters)[]).every((k) => f[k] === chip.on[k]);
}

/**
 * The chips worth showing for a list: only ones that narrow it, at most six so they fit two lines, each with how many
 * ideas it would leave. A chip that's on always stays, so it can be taken off.
 */
export function chipsFor(cards: IdeaCard[], f: Filters): { chip: Chip; on: boolean; count: number }[] {
  const pool = cards.filter((c) => !f.domain || c.domain === f.domain);
  const useful = CHIPS.filter((chip) => {
    if (chipOn(chip, f)) return true;
    const n = pool.filter((c) => passes(c, { ...NO_FILTERS, ...chip.on })).length;
    return n > 0 && n < pool.length && !("minutes" in chip.on && pool.every((c) => c.kind === "break"));
  });
  const on = useful.filter((c) => chipOn(c, f));
  const shown = useful.filter((c) => on.includes(c) || useful.filter((x) => !on.includes(x)).indexOf(c) < 6 - on.length);
  return shown.map((chip) => ({ chip, on: chipOn(chip, f), count: pool.filter((c) => passes(c, { ...f, ...chip.on })).length }));
}

export function anyFilter(f: Filters) {
  return f.minutes !== null || !!f.when || !!f.place || f.noKit || f.family;
}
