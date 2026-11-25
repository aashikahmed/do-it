"use client";

import { Field, LengthPicker, StartPicker, StepRow } from "@/components/pact-fields";
import { addDays, deviceTimeZone, diffDays, todayIn } from "@/lib/dates";
import type { RuleDraft } from "@/lib/edit";
import type { Idea } from "@/lib/explore/types";
import { isWeekly, sentence } from "@/lib/explore/words";
import { freezesFor } from "@/lib/streak";
import { restDaysText } from "@/lib/view";
import { startOffsets } from "@/lib/week";

/** The last step before a pact exists: how long, when it starts, and create. Only rendered while its sheet is open. */
export function StartForm({
  idea,
  draft,
  set,
  offset,
  onOffset,
  plan,
  onPlan,
  busy,
  onCreate,
  onChangeAll,
}: {
  idea: Idea;
  draft: RuleDraft;
  set: (p: Partial<RuleDraft>) => void;
  offset: number;
  onOffset: (o: number) => void;
  plan: string;
  onPlan: (s: string) => void;
  busy: boolean;
  onCreate: () => void;
  onChangeAll: () => void;
}) {
  const weekly = isWeekly(idea, draft);
  const today = todayIn(deviceTimeZone());
  const options = startOffsets(today, weekly);
  const chosen = options.includes(offset) ? offset : 0;
  const freezes = freezesFor(weekly ? "weekly" : "daily", draft.durationDays);
  return (
    <div data-color={idea.color} className="pb-2">
      <p className="text-[17px] leading-snug font-semibold text-ink-2">
        {sentence(idea, draft)}
        {idea.kind === "break" && draft.restDays ? `, ${restDaysText(draft.restDays)}` : ""}.
      </p>
      <div className="mt-4 space-y-4">
        {idea.kind === "build" && weekly && draft.measure !== "none" && (
          <StepRow label="Times a week" value={draft.timesPerWeek} min={1} max={6} onChange={(v) => set({ timesPerWeek: v })} />
        )}
        <LengthPicker weekly={weekly} value={draft.durationDays} onPick={(n) => set({ durationDays: n })} on="paper" />
        <div>
          <StartPicker days={options.map((o) => addDays(today, o))} value={addDays(today, chosen)} today={today} weekly={weekly} onPick={(d) => onOffset(diffDays(today, d))} on="paper" />
        </div>
        {idea.kind === "break" && (
          <Field label="My plan for cravings">
            <input
              maxLength={140}
              value={plan}
              onChange={(e) => onPlan(e.target.value)}
              placeholder={`When I want ${idea.subject}, I'll…`}
              aria-label="My plan for cravings"
              className="h-14 w-full rounded-2xl bg-mist px-4 text-[16px] font-semibold outline-none focus:ring-2 focus:ring-blue"
            />
          </Field>
        )}
        <p className="text-[14px] leading-snug text-ink-2">
          Everyone gets {freezes} {freezes === 1 ? "freeze" : "freezes"} of their own.
          {idea.kind === "break" ? ` Each morning we'll ask how yesterday went${draft.askNextMorning ? "" : ", and you can answer from 6pm"}. Notifications never mention ${idea.subject}.` : ""}
        </p>
      </div>
      <button disabled={busy} onClick={onCreate} className="mt-4 h-16 w-full rounded-[22px] bg-[var(--pact)] text-[18px] font-extrabold text-[var(--pact-ink)] disabled:opacity-50">
        {busy ? "Creating…" : "Create pact"}
      </button>
      <button onClick={onChangeAll} className="mt-1 h-12 w-full text-[15px] font-bold text-blue">
        Change everything else
      </button>
    </div>
  );
}
