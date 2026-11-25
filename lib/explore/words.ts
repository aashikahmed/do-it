// How Explore words a level, from the same draft the create flow works on.

import type { RuleDraft } from "../edit";
import { formatValue, unitFor } from "../measure";
import { breakTitle } from "../view";
import type { Idea, Level } from "./types";

/** A level as the create flow would hold it. */
export function levelDraft(idea: Idea, level: Level): RuleDraft {
  const base: RuleDraft = {
    cadence: "daily",
    timesPerWeek: 3,
    durationDays: 30,
    measure: "none",
    direction: "up",
    unit: "",
    target: null,
    mode: "none",
    allowance: 3,
    limit: 2,
    limitUnit: "",
    limitStep: null,
    restDays: 0,
    askNextMorning: false,
  };
  if (idea.kind === "break") {
    const r = idea.levels[level].rules;
    return {
      ...base,
      cadence: r.mode === "days" ? "weekly" : "daily",
      durationDays: r.days,
      mode: r.mode,
      allowance: r.allowance ?? 3,
      limit: r.limit ?? 2,
      limitUnit: r.unit ?? "",
      limitStep: r.limitStep ?? null,
      restDays: r.restDays ?? 0,
      askNextMorning: !!r.askNextMorning,
    };
  }
  const r = idea.levels[level].rules;
  return {
    ...base,
    cadence: r.cadence,
    timesPerWeek: r.times ?? 3,
    durationDays: r.days,
    measure: r.measure ?? "none",
    direction: r.direction ?? "up",
    unit: r.unit ?? (r.measure === "distance" ? "km" : ""),
    target: r.target ?? null,
  };
}

/** 1200 → "20 min", 5400 → "1 h 30 min", 20 → "20 sec", 95 → "1:35 min" */
export function spokenTime(seconds: number) {
  const s = Math.round(seconds);
  if (s < 60) return `${s} sec`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min` : `${s / 60} min`;
  const m = Math.round((s % 3600) / 60);
  return `${Math.floor(s / 3600)} h${m ? ` ${m} min` : ""}`;
}

/** "5 pages", "20 min", or null when any amount counts (or there's nothing to count) */
export function amountText(d: Pick<RuleDraft, "measure" | "unit" | "target">) {
  if (d.measure === "none" || !d.target) return null;
  return d.measure === "time" ? spokenTime(d.target) : formatValue({ measure: d.measure, unit: d.unit || null }, d.target);
}

export function oftenText(idea: Pick<Idea, "kind">, d: RuleDraft) {
  if (idea.kind === "break") {
    if (d.mode === "days") return `up to ${d.allowance} ${d.allowance === 1 ? "day" : "days"} a week`;
    if (d.mode === "amount") return `up to ${d.limit} ${unitFor(d.limit, d.limitUnit)} a day`;
    return "none at all";
  }
  return d.cadence === "daily" ? "every day" : d.timesPerWeek === 1 ? "once a week" : `${d.timesPerWeek} times a week`;
}

export function isWeekly(idea: Pick<Idea, "kind">, d: RuleDraft) {
  return idea.kind === "break" ? d.mode === "days" : d.cadence === "weekly";
}

export function spanText(idea: Pick<Idea, "kind">, d: RuleDraft) {
  return isWeekly(idea, d) ? `${d.durationDays / 7} weeks` : `${d.durationDays} days`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "5 pages, every day", "up to 2 days a week" */
export function headline(idea: Pick<Idea, "kind">, d: RuleDraft) {
  const often = oftenText(idea, d);
  const a = idea.kind === "build" ? amountText(d) : null;
  return a ? `${d.direction === "down" ? "under " : ""}${a}, ${often}` : often;
}

/** "At least 5 pages, every day for 14 days" */
export function sentence(idea: Pick<Idea, "kind">, d: RuleDraft) {
  const often = oftenText(idea, d);
  const span = spanText(idea, d);
  if (idea.kind === "break") return `${cap(often)}${d.mode === "amount" && d.limitStep ? `, ${d.limitStep} less each week` : ""}, for ${span}`;
  const a = amountText(d);
  return `${cap(a ? `${d.direction === "down" ? "under" : "at least"} ${a}, ${often}` : often)} for ${span}`;
}

/** The one-liner on a row: where the first level starts. */
export function fromText(idea: Idea) {
  const d = levelDraft(idea, "starting");
  if (idea.kind === "build" && amountText(d) && d.direction !== "down") return `From ${headline(idea, d)}`;
  return `${cap(headline(idea, d))}${idea.kind === "break" && d.mode === "none" ? "" : " to start"}`;
}

/** What the button says it does. */
export function startText(idea: Idea, d: RuleDraft) {
  const verb = idea.kind === "build" ? "Start" : d.mode === "none" ? "Give it up" : "Cut down";
  return `${verb}: ${headline(idea, d)}`;
}

/** What the pact is called: break pacts are named from what's given up. */
export function pactTitle(idea: Idea, d: RuleDraft) {
  return idea.kind === "break" ? breakTitle(idea.subject, d.mode) : idea.title;
}
