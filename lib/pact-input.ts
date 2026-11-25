// What creating a pact takes. createPact() parses it; the create flow and Explore build it from the same draft.

import { z } from "zod";
import type { PactColor } from "./data";
import type { Day } from "./dates";
import { draftRules, type RuleDraft } from "./edit";
import { LEVELS, type Level } from "./explore/types";
import { breakTitle, inSentence } from "./view";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createSchema = z.object({
  title: z.string().trim().min(1, "Name your pact").max(60),
  emoji: z.string().min(1).max(16),
  color: z.enum(["blue", "sun", "ember", "mint", "violet", "rose"]),
  cadence: z.enum(["daily", "weekly"]),
  timesPerWeek: z.number().int().min(1).max(7),
  durationDays: z.number().int().min(7).max(365),
  startDate: day,
  timezone: z.string().max(64),
  measure: z.enum(["none", "count", "time", "distance", "weight"]),
  direction: z.enum(["up", "down"]),
  unit: z.string().trim().max(24).optional(),
  target: z.number().positive().max(999999).nullable().optional(),
  kind: z.enum(["build", "break"]).default("build"),
  /** break pacts: what's being given up */
  subject: z.string().trim().max(40).optional(),
  /** weekday bitmask, bit 0 = Sunday; never every day */
  restDays: z.number().int().min(0).max(126).optional(),
  limitStep: z.number().positive().max(999999).nullable().optional(),
  askNextMorning: z.boolean().optional(),
  cravingPlan: z.string().trim().max(140).optional(),
  /** the Explore idea it came from, and at which level */
  ideaId: z.string().max(60).optional(),
  ideaLevel: z.enum(LEVELS).optional(),
});

export type CreateInput = z.input<typeof createSchema>;

export interface PactLook {
  kind: "build" | "break";
  /** build pacts; a break pact is named from its subject */
  title: string;
  subject: string;
  emoji: string;
  color: PactColor;
  cravingPlan: string;
  idea?: { id: string; level: Level };
}

export function createInput(d: RuleDraft, look: PactLook, start: Day, timezone: string): CreateInput {
  const r = draftRules(d, look.kind, start);
  const isBreak = look.kind === "break";
  return {
    kind: look.kind,
    title: isBreak ? breakTitle(look.subject, d.mode) : look.title.trim(),
    subject: isBreak ? inSentence(look.subject) : undefined,
    emoji: look.emoji,
    color: look.color,
    cadence: r.cadence,
    timesPerWeek: r.times_per_week,
    durationDays: r.duration_days,
    startDate: start,
    timezone,
    measure: r.measure,
    direction: r.direction,
    unit: r.unit ?? undefined,
    target: r.target,
    restDays: r.rest_days,
    limitStep: r.limit_step,
    askNextMorning: r.ask_next_morning,
    cravingPlan: isBreak ? look.cravingPlan.trim() || undefined : undefined,
    ideaId: look.idea?.id,
    ideaLevel: look.idea?.level,
  };
}
