// What a running pact still knows about the idea it came from. Server only in practice: it reads the whole catalog.

import type { Pact } from "../data";
import type { RuleDraft } from "../edit";
import { ideaById } from "./catalog";
import { LEVELS, LEVEL_NAMES, type Idea, type Level } from "./types";
import { isWeekly, levelDraft, sentence } from "./words";

/** A level someone can pick for their own number. */
export interface NumberLevel {
  id: Level;
  name: string;
  pickIf: string;
  target: number;
}

/** The idea's levels as numbers for this pact, or none if what's counted has changed since (or isn't the same at every level). */
export function numberLevels(p: Pick<Pact, "measure" | "unit" | "kind"> & { idea_id?: string | null }): NumberLevel[] {
  const idea = p.idea_id ? ideaById(p.idea_id) : undefined;
  if (!idea || idea.kind !== "build" || p.kind === "break") return [];
  const all = LEVELS.flatMap((l) => {
    const d = levelDraft(idea, l);
    return d.measure === p.measure && (d.unit || null) === p.unit && d.target ? [{ id: l, name: LEVEL_NAMES[l], pickIf: idea.levels[l].pickIf, target: d.target }] : [];
  });
  return all.length === LEVELS.length ? all : [];
}

export interface NextLevel {
  idea: Idea;
  level: Level;
  name: string;
  draft: RuleDraft;
  /** "At least 20 pages, every day for 30 days" */
  text: string;
  weekly: boolean;
}

type From = Pick<Pact, "kind" | "measure" | "unit" | "target" | "cadence" | "times_per_week" | "direction"> & { idea_id?: string | null; idea_level?: string | null };

/** The level to offer after this round: the next one that asks more than the pact already does. */
export function nextLevel(p: From): NextLevel | null {
  const idea = p.idea_id ? ideaById(p.idea_id) : undefined;
  const at = LEVELS.indexOf(p.idea_level as Level);
  if (!idea || idea.kind !== p.kind || at < 0) return null;
  for (const level of LEVELS.slice(at + 1)) {
    const draft = levelDraft(idea, level);
    const weekly = isWeekly(idea, draft);
    if (idea.kind === "build" && draft.measure === p.measure && (draft.unit || null) === p.unit && draft.target && p.target && draft.direction === p.direction) {
      const times = weekly ? draft.timesPerWeek : 7;
      const now = p.cadence === "daily" ? 7 : p.times_per_week;
      const notMore = p.direction === "down" ? draft.target >= p.target : draft.target <= p.target;
      // they set it higher themselves: skip a level that would be a step down
      if (notMore && times <= now) continue;
    }
    return { idea, level, name: LEVEL_NAMES[level], draft, text: sentence(idea, draft), weekly };
  }
  return null;
}
