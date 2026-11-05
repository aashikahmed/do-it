import type { Day } from "./dates";
import { progressStats, type Direction } from "./measure";
import type { Phase, PactState } from "./streak";

export interface RoundLink {
  id: string;
  previous_id: string | null;
  round: number;
}

/** The rounds this pact belongs to, oldest first (only rounds the viewer can see). */
export function seriesIds(links: RoundLink[], id: string): string[] {
  const byId = new Map(links.map((l) => [l.id, l]));
  const nextOf = new Map(links.filter((l) => l.previous_id).map((l) => [l.previous_id as string, l.id]));
  if (!byId.has(id)) return [id];
  const back: string[] = [];
  const seen = new Set<string>([id]);
  for (let cur = byId.get(id)?.previous_id; cur && byId.has(cur) && !seen.has(cur); cur = byId.get(cur)?.previous_id) {
    back.unshift(cur);
    seen.add(cur);
  }
  const fwd: string[] = [];
  for (let cur = nextOf.get(id); cur && !seen.has(cur); cur = nextOf.get(cur)) {
    fwd.push(cur);
    seen.add(cur);
  }
  return [...back, id, ...fwd];
}

/** periods that count as kept: done, or saved with a freeze */
export function keptCount(state: Pick<PactState, "periods">) {
  return state.periods.filter((p) => p.status === "done" || p.status === "frozen").length;
}

export interface RoundSummary {
  id: string;
  round: number;
  start: Day;
  phase: Phase;
  kept: number;
  total: number;
  best: number;
}

export interface Series {
  /** visible rounds up to and including this one, oldest first */
  rounds: RoundSummary[];
  /** the round after this one, if someone tapped Go again */
  next: { id: string; round: number } | null;
  kept: number;
  best: number;
  /** the viewer's average per check-in, first week of the first round vs last week of this one */
  mine: { from: number; to: number; change: number } | null;
}

interface SeriesInput {
  pact: { id: string; round: number; start_date: Day; direction: Direction };
  state: Pick<PactState, "periods" | "best" | "phase">;
  checkins: { user_id: string; day: Day; value: number | null }[];
}

/** Lifetime totals for a pact's rounds. `bundles` holds every round the viewer can see, any order. */
export function buildSeries(bundles: SeriesInput[], ids: string[], currentId: string, me: string): Series | null {
  const byId = new Map(bundles.map((b) => [b.pact.id, b]));
  const at = ids.indexOf(currentId);
  if (at < 0 || ids.length < 2) return null;
  const upTo = ids.slice(0, at + 1).map((id) => byId.get(id)).filter((b): b is SeriesInput => !!b);
  const nextB = ids[at + 1] ? byId.get(ids[at + 1]) : undefined;
  const rounds = upTo.map((b) => ({
    id: b.pact.id,
    round: b.pact.round,
    start: b.pact.start_date,
    phase: b.state.phase,
    kept: keptCount(b.state),
    total: b.state.periods.length,
    best: b.state.best,
  }));
  const points = upTo.flatMap((b) => b.checkins.filter((c) => c.user_id === me && c.value !== null).map((c) => ({ day: c.day, value: c.value as number })));
  const current = byId.get(currentId)!;
  const stats = points.length && upTo.length > 1 ? progressStats(points, current.pact.direction, upTo[0].pact.start_date) : null;
  return {
    rounds,
    next: nextB ? { id: nextB.pact.id, round: nextB.pact.round } : null,
    kept: rounds.reduce((s, r) => s + r.kept, 0),
    best: rounds.reduce((m, r) => Math.max(m, r.best), 0),
    mine: stats && stats.change !== null ? { from: stats.firstWeekAvg!, to: stats.lastWeekAvg!, change: stats.change } : null,
  };
}
