// Same days, your own number. Build pacts only: the number is a promise, not a gate (any check-in counts), so nothing in
// lib/streak.ts reads it. set_my_number() in SQL enforces who can set it and when.

import type { Member, Pact, PactBundle } from "./data";
import { formatValue } from "./measure";

/** Does this pact have a number people can each set for themselves? */
export function hasNumber(p: Pick<Pact, "kind" | "measure">) {
  return p.kind !== "break" && p.measure !== "none";
}

/** Someone's number: their own, or the pact's. Null is any amount. */
export function numberOf(p: Pick<Pact, "kind" | "measure" | "target">, m: Pick<Member, "target"> | undefined): number | null {
  if (!hasNumber(p) || m?.target === undefined || m.target === null) return p.target;
  return m.target || null;
}

/** The pact as this person sees it: every screen that words, charts or prefills the number then uses theirs. */
export function withOwnNumber(b: PactBundle, me: string): PactBundle {
  const target = numberOf(b.pact, b.members.find((m) => m.user_id === me));
  return target === b.pact.target ? b : { ...b, pact: { ...b.pact, target } };
}

/** Yours to set until your own first check-in. */
export function canSetNumber(b: Pick<PactBundle, "pact" | "members" | "checkins" | "changes" | "state">, me: string) {
  return (
    hasNumber(b.pact) &&
    b.state.phase !== "ended" &&
    b.members.some((m) => m.user_id === me) &&
    !b.checkins.some((c) => c.user_id === me) &&
    !b.changes.some((c) => c.user_id === me)
  );
}

/** "5 pages", "under 35:00" or "any amount" */
export function numberText(p: Pick<Pact, "measure" | "unit" | "direction">, target: number | null) {
  if (!target) return "any amount";
  const v = formatValue(p, target);
  return p.direction === "down" ? `under ${v}` : v;
}

/** Worth showing next to each name once someone has a number of their own. */
export function numbersDiffer(b: Pick<PactBundle, "pact" | "members">) {
  return hasNumber(b.pact) && new Set(b.members.map((m) => numberOf(b.pact, m))).size > 1;
}
