import type { PactColor } from "../data";
import type { Direction, Measure } from "../measure";
import type { BreakMode } from "../view";

export const LEVELS = ["starting", "regular", "further"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_NAMES: Record<Level, string> = { starting: "Starting out", regular: "Getting regular", further: "Going further" };

export type Domain =
  | "strong" | "move" | "bend" | "food" | "sleep" | "calm" | "learn" | "focus" | "make"
  | "people" | "faith" | "home" | "money" | "screens" | "cravings" | "spending" | "little-things";

/** What a level sets up, in the create flow's terms. `target` is seconds for time. */
export interface BuildRules {
  cadence: "daily" | "weekly";
  /** times a week (weekly only) */
  times?: number;
  days: number;
  measure?: Measure;
  unit?: string;
  target?: number;
  direction?: Direction;
}
export interface BreakRules {
  mode: BreakMode;
  days: number;
  /** "days": how many days a week it's OK */
  allowance?: number;
  /** "amount": the most per day, and what's counted */
  limit?: number;
  unit?: string;
  limitStep?: number;
  askNextMorning?: boolean;
  /** weekday bitmask, bit 0 = Sunday */
  restDays?: number;
}

export interface IdeaLevel<R> {
  rules: R;
  /** a fact someone can check about themselves */
  pickIf: string;
  /** why this number */
  why: string;
}

interface IdeaBase {
  id: string;
  /** its address; the id unless the id would give a break habit away */
  slug?: string;
  title: string;
  emoji: string;
  color: PactColor;
  domain: Domain;
  line: string;
  why: string;
  tags: string[];
  /** what people might type instead: other names, feelings, goals, common misspellings */
  synonyms: string[];
  /** a check-in at the first level, in minutes (0 for break ideas) */
  minutes: number;
  when: "morning" | "day" | "evening" | "anytime";
  place: "home" | "outside" | "gym" | "anywhere";
  needs: string[];
  cost: "free" | "low" | "paid";
  goodWith: ("solo" | "partner" | "group" | "family" | "remote")[];
  together: string;
  firstStep: string;
  /** ids that go well with it, or (break ideas) something to put in its place */
  next: string[];
  caution?: string;
  evidence: { grade: "study" | "guideline" | "programme" | "judgement"; note: string; source?: string; url?: string; checked: boolean };
}
export interface BuildIdea extends IdeaBase {
  kind: "build";
  levels: Record<Level, IdeaLevel<BuildRules>>;
}
export interface BreakIdea extends IdeaBase {
  kind: "break";
  /** what's given up, for "No …" and "How much … is OK?" */
  subject: string;
  cravingPlan?: string;
  levels: Record<Level, IdeaLevel<BreakRules>>;
}
export type Idea = BuildIdea | BreakIdea;

/** What a list, a filter or a search needs to know: the whole idea stays on its own page. */
export interface IdeaCard {
  id: string;
  slug: string;
  kind: "build" | "break";
  title: string;
  subject: string;
  emoji: string;
  color: PactColor;
  domain: Domain;
  line: string;
  /** "From 5 pages, every day" */
  from: string;
  minutes: number;
  when: Idea["when"];
  place: Idea["place"];
  /** nothing to buy or bring */
  noKit: boolean;
  goodWith: Idea["goodWith"];
  tags: string[];
  synonyms: string[];
}
