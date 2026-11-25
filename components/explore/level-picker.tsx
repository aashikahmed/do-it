"use client";

import { ValueInput } from "@/components/measure-input";
import { LimitInput, Segmented, StepRow } from "@/components/pact-fields";
import type { RuleDraft } from "@/lib/edit";
import { LEVELS, LEVEL_NAMES, type Idea, type Level } from "@/lib/explore/types";
import { amountText, isWeekly, levelDraft } from "@/lib/explore/words";
import { unitFor } from "@/lib/measure";
import { freezesFor } from "@/lib/streak";

/**
 * Where to start, and how much. A level only fills in the number: from there it can go anywhere, with the same input the
 * number is logged with later. Build pacts can have no number at all (any amount counts); a limit can't go below 1.
 */
export function LevelPicker({ idea, level, draft: d, onLevel, set }: { idea: Idea; level: Level; draft: RuleDraft; onLevel: (l: Level) => void; set: (p: Partial<RuleDraft>) => void }) {
  const weekly = isWeekly(idea, d);
  const freezes = freezesFor(weekly ? "weekly" : "daily", d.durationDays);
  const counted = idea.kind === "build" && d.measure !== "none";
  return (
    <section>
      <h2 className="mb-3 text-[17px] font-extrabold">Where do you start?</h2>
      <div className="rounded-[22px] bg-paper p-3.5">
        <Segmented label="Level" options={LEVELS.map((l) => [l, LEVEL_NAMES[l]])} value={level} onChange={(v) => onLevel(v as Level)} />
        <p className="mx-1 mt-3 text-[15px] leading-snug text-ink-2">{idea.levels[level].pickIf}.</p>
        {/* a fresh input per level, so Reset, the chips and the time wheels fit the level that was tapped */}
        <div key={level} className="mt-3">
          <Amount idea={idea} level={level} d={d} set={set} />
        </div>
      </div>
      <p className="mt-3 text-[14px] leading-snug text-ink-2">
        {counted ? "The days are shared, the number is yours. Friends pick their own when they join." : "Everyone in the pact shares it, so set it for whoever finds it hardest."}{" "}
        {freezes === 1 ? "1 freeze" : `${freezes} freezes`} each.
      </p>
    </section>
  );
}

function Amount({ idea, level, d, set }: { idea: Idea; level: Level; d: RuleDraft; set: (p: Partial<RuleDraft>) => void }) {
  const base = levelDraft(idea, level);
  const name = LEVEL_NAMES[level].toLowerCase();
  if (idea.kind === "break") {
    if (d.mode === "none") return <p className="mx-1 pb-1 text-[16px] font-bold">None at all. There&apos;s nothing to set.</p>;
    if (d.mode === "days")
      return (
        <div className="px-1">
          <StepRow label="Days a week it's OK" value={d.allowance} min={1} max={6} onChange={(v) => set({ allowance: v })} />
          <Hint>{d.allowance === base.allowance ? `Suggested for ${name}.` : `Suggested: ${base.allowance}.`}</Hint>
        </div>
      );
    const step = d.limitStep ? ` ${d.limitStep} less each week.` : "";
    return (
      <>
        <Label>Up to, each day</Label>
        <LimitInput d={d} set={set} />
        <Hint>
          {d.limit === base.limit ? `Suggested for ${name}.` : `You set ${d.limit} ${unitFor(d.limit, d.limitUnit)}. Suggested: ${base.limit} ${unitFor(base.limit, base.limitUnit)}.`}
          {step}
        </Hint>
      </>
    );
  }
  if (d.measure === "none") {
    if (d.cadence === "daily") return <p className="mx-1 pb-1 text-[16px] font-bold">Once a day, every day. There&apos;s nothing to set.</p>;
    return (
      <div className="px-1">
        <StepRow label="Times a week" value={d.timesPerWeek} min={1} max={6} onChange={(v) => set({ timesPerWeek: v })} />
        <Hint>{d.timesPerWeek === base.timesPerWeek ? `Suggested for ${name}.` : `Suggested: ${base.timesPerWeek}.`}</Hint>
      </div>
    );
  }
  const suggested = amountText(base);
  return (
    <>
      <Label>{d.direction === "down" ? "Goal" : "At least, each time"}</Label>
      <div className="rounded-2xl bg-mist/60 p-2">
        <ValueInput t={{ measure: d.measure, direction: d.direction, unit: d.unit || null, target: base.target }} value={d.target} onChange={(v) => set({ target: v || null })} size="md" />
      </div>
      <Hint>
        {!d.target ? `Any amount counts. Suggested: ${suggested}.` : d.target === base.target ? `Suggested for ${name}.${d.direction === "down" ? "" : " Go lower if you like."}` : `You set ${amountText(d)}. Suggested: ${suggested}.`}
      </Hint>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mx-1 mb-2 text-[15px] font-bold text-ink-2">{children}</p>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-1 mt-2.5 text-[14px] leading-snug text-ink-2" aria-live="polite">
      {children}
    </p>
  );
}
