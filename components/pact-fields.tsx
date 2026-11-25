"use client";

// The pickers a pact is set up with, shared by the create flow (app/new) and Edit pact (app/p/[id]/edit-pact.tsx).

import { useState, type ReactNode } from "react";
import { ValueInput } from "@/components/measure-input";
import type { PactColor } from "@/lib/data";
import { weekdayOf, type Day } from "@/lib/dates";
import { DAILY_LENGTHS, WEEKLY_LENGTHS, lengthFor, startLabel, type RuleDraft } from "@/lib/edit";
import { MEASURES, type Direction, type Tracking } from "@/lib/measure";
import { restDaysText, type BreakMode } from "@/lib/view";
import { weeksRun } from "@/lib/week";

export const EMOJIS = ["🔥", "💪", "🏋️", "🏃", "📚", "🧘", "💻", "✍️", "💧", "🥗", "🍬", "🌅", "🎸", "🧠", "🚶", "🙏"];
export const BREAK_EMOJIS = ["✋", "🥤", "🍬", "🍷", "🍺", "🚬", "🍟", "🍫", "📱", "🎮", "🥡", "☕", "🛒", "💸", "🌙", "🚫"];
const COLORS: PactColor[] = ["blue", "ember", "sun", "mint", "violet", "rose"];

/** Monday first, as bits of the weekday mask (0 = Sunday) */
const WEEK = [
  { bit: 1, label: "M", name: "Mondays" },
  { bit: 2, label: "T", name: "Tuesdays" },
  { bit: 3, label: "W", name: "Wednesdays" },
  { bit: 4, label: "T", name: "Thursdays" },
  { bit: 5, label: "F", name: "Fridays" },
  { bit: 6, label: "S", name: "Saturdays" },
  { bit: 0, label: "S", name: "Sundays" },
];

type SetRules = (patch: Partial<RuleDraft>) => void;

// ───────────────────────── look ─────────────────────────

export function IconPicker({ kind, value, onPick, className = "" }: { kind: "build" | "break"; value: string; onPick: (e: string) => void; className?: string }) {
  const base = kind === "break" ? BREAK_EMOJIS : EMOJIS;
  // an icon from a template isn't always in the list: keep it there to go back to
  const [first] = useState(value);
  const icons = [...new Set([first, value].filter((e) => !base.includes(e)).concat(base))];
  return (
    <div className={`no-scrollbar flex gap-1 overflow-x-auto ${className}`} role="radiogroup" aria-label="Icon">
      {icons.map((e) => (
        <button
          key={e}
          role="radio"
          aria-checked={value === e}
          onClick={() => onPick(e)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[22px] ${value === e ? "bg-ink/10" : ""}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** `on` is what it sits on: the gap in the selected ring is that colour. */
export function ColorPicker({ value, onPick, on = "mist" }: { value: PactColor; onPick: (c: PactColor) => void; on?: "mist" | "paper" }) {
  return (
    <div className="flex justify-between" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => (
        <button key={c} data-color={c} role="radio" aria-checked={value === c} aria-label={c} onClick={() => onPick(c)} className="flex h-12 w-12 items-center justify-center rounded-full">
          <span
            className="h-10 w-10 rounded-full bg-[var(--pact)] transition-shadow"
            style={{ boxShadow: value === c ? `0 0 0 3px var(--color-${on}), 0 0 0 5.5px var(--pact)` : undefined }}
          />
        </button>
      ))}
    </div>
  );
}

// ───────────────────────── how often, how much ─────────────────────────

export function CadencePicker({ d, set }: { d: RuleDraft; set: SetRules }) {
  return (
    <>
      <div className="space-y-3" role="radiogroup" aria-label="How often">
        <Choice
          selected={d.cadence === "daily"}
          onClick={() => set({ cadence: "daily", durationDays: lengthFor("daily", d.durationDays) })}
          title="Every day"
          body="The chain grows one link per day."
        />
        <Choice
          selected={d.cadence === "weekly"}
          onClick={() => set({ cadence: "weekly", durationDays: lengthFor("weekly", d.durationDays) })}
          title="Some days a week"
          body="Pick a weekly target. One link per week."
        />
      </div>
      {d.cadence === "weekly" && (
        <div className="mt-6 rounded-[22px] bg-paper p-4">
          <StepRow label="Times a week" value={d.timesPerWeek} min={1} max={6} onChange={(v) => set({ timesPerWeek: v })} />
        </div>
      )}
    </>
  );
}

/** Break pacts: none at all, some days a week, or a little each day. */
export function HowMuchPicker({ d, set }: { d: RuleDraft; set: SetRules }) {
  function setMode(mode: BreakMode) {
    const weekly = mode === "days";
    set({
      mode,
      durationDays: lengthFor(weekly ? "weekly" : "daily", d.durationDays),
      restDays: weekly ? 0 : d.restDays,
      limitStep: mode === "amount" ? d.limitStep : null,
    });
  }
  return (
    <>
      <div className="space-y-3" role="radiogroup" aria-label="How much is OK">
        <Choice selected={d.mode === "none"} onClick={() => setMode("none")} title="None at all" body="Stay off it every day." />
        <Choice selected={d.mode === "days"} onClick={() => setMode("days")} title="Some days a week" body="Have it on a few days, stay off it the rest." />
        <Choice selected={d.mode === "amount"} onClick={() => setMode("amount")} title="A little each day" body="Stay under a daily limit." />
      </div>
      {d.mode === "days" && (
        <div className="mt-4 rounded-[22px] bg-paper p-4">
          <StepRow label="Days a week it's OK" value={d.allowance} min={1} max={6} onChange={(v) => set({ allowance: v })} />
        </div>
      )}
      {d.mode === "amount" && (
        <div className="mt-4 space-y-4 rounded-[22px] bg-paper p-4">
          <Field label="Up to, each day">
            <LimitInput d={d} set={set} />
          </Field>
          <Field label="Counted in">
            <input
              maxLength={24}
              value={d.limitUnit}
              onChange={(e) => set({ limitUnit: e.target.value })}
              placeholder="cans, cups, cigarettes, minutes"
              aria-label="Counted in"
              className="h-14 w-full rounded-2xl bg-mist px-4 text-[18px] font-semibold outline-none focus:ring-2 focus:ring-blue"
            />
          </Field>
        </div>
      )}
    </>
  );
}

/** A break pact's daily limit, set with the same input it's logged with. */
export function LimitInput({ d, set }: { d: RuleDraft; set: SetRules }) {
  return (
    <div className="rounded-2xl bg-mist/60 p-2">
      <ValueInput
        t={{ measure: "count", unit: d.limitUnit.trim() || null, direction: "down", target: null }}
        value={d.limit}
        min={1}
        size="md"
        onChange={(v) => {
          const limit = Math.max(1, Math.round(v ?? 1));
          set({ limit, limitStep: d.limitStep === null ? null : Math.min(limit, d.limitStep) });
        }}
      />
    </div>
  );
}

/** Break pacts with a daily limit: lower it each week. */
export function LimitStepPicker({ d, set }: { d: RuleDraft; set: SetRules }) {
  return (
    <div>
      <SwitchRow
        on={d.limitStep !== null}
        onChange={(v) => set({ limitStep: v ? 1 : null })}
        title="Lower the limit each week"
        body={`Start at ${d.limit} ${d.limitUnit || "a day"} and come down week by week, until it's zero.`}
      />
      {d.limitStep !== null && (
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-mist p-3">
          <span className="text-[15px] font-bold">Less each week</span>
          <div className="flex items-center gap-3">
            <Stepper label="Less" onClick={() => set({ limitStep: Math.max(1, (d.limitStep ?? 1) - 1) })} disabled={(d.limitStep ?? 1) <= 1}>
              −
            </Stepper>
            <span className="display tnum w-8 text-center text-[28px] font-extrabold">{d.limitStep}</span>
            <Stepper label="More" onClick={() => set({ limitStep: Math.min(d.limit, (d.limitStep ?? 1) + 1) })} disabled={(d.limitStep ?? 1) >= d.limit}>
              +
            </Stepper>
          </div>
        </div>
      )}
    </div>
  );
}

/** Break pacts, daily only: weekdays the rule doesn't apply. */
export function RestDaysPicker({ d, set }: { d: RuleDraft; set: SetRules }) {
  const offCount = WEEK.filter((w) => d.restDays & (1 << w.bit)).length;
  return (
    <div>
      <p className="text-[17px] font-bold">Days off</p>
      <p className="mt-0.5 text-[14px] leading-snug text-ink-2">
        {d.restDays ? `Fine to have it ${restDaysText(d.restDays).replace("except ", "on ")}. Those days never break the streak.` : "Days the rule doesn't apply, like Fridays. They never break the streak."}
      </p>
      <div className="mt-3 grid grid-cols-7 gap-1.5" role="group" aria-label="Days off">
        {WEEK.map((w) => {
          const on = (d.restDays & (1 << w.bit)) !== 0;
          return (
            <button
              key={w.bit}
              aria-pressed={on}
              aria-label={w.name}
              disabled={!on && offCount >= 6}
              onClick={() => set({ restDays: d.restDays ^ (1 << w.bit) })}
              className={`h-11 rounded-xl text-[15px] font-extrabold disabled:opacity-30 ${on ? "bg-ink text-white" : "bg-mist text-ink-2"}`}
            >
              {w.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────── how long, when ─────────────────────────

/** `on` is what it sits on: tiles are the other one. */
export function LengthPicker({ weekly, value, onPick, on = "mist" }: { weekly: boolean; value: number; onPick: (days: number) => void; on?: "mist" | "paper" }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Length">
      {(weekly ? WEEKLY_LENGTHS : DAILY_LENGTHS).map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          onClick={() => onPick(n)}
          className={`h-[84px] rounded-[22px] text-left transition-colors ${value === n ? "bg-blue text-white" : on === "mist" ? "bg-paper" : "bg-mist"}`}
        >
          <span className="display tnum block px-4 text-[36px] font-extrabold">{weekly ? n / 7 : n}</span>
          <span className="block px-4 text-[14px] font-semibold opacity-75">{weekly ? "weeks" : "days"}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Today, tomorrow, or (weekly pacts) next Monday. A weekly pact's weeks start on its start day, so say which weekdays
 * they'll run: whoever sets it up picks the week for everyone.
 */
export function StartPicker({ days, value, today, weekly, prefix = "", onPick, on = "mist" }: { days: Day[]; value: Day; today: Day; weekly: boolean; prefix?: string; onPick: (d: Day) => void; on?: "mist" | "paper" }) {
  const label = (d: Day) => {
    const l = startLabel(d, today);
    // the far-off one on offer is always next Monday; any other day (where it starts now) is named in full
    return l !== "today" && l !== "tomorrow" && d > today && weekdayOf(d) === 1 ? "Monday" : l;
  };
  // three buttons don't fit "Start tomorrow"
  const pre = days.length > 2 ? "" : prefix;
  return (
    <>
      <div className={`grid gap-2 ${days.length === 3 ? "grid-cols-3" : "grid-cols-2"}`} role="radiogroup" aria-label="Start">
        {days.map((d) => {
          const text = `${pre}${label(d)}`;
          return (
            <button
              key={d}
              role="radio"
              aria-checked={value === d}
              onClick={() => onPick(d)}
              className={`h-14 rounded-[18px] text-[17px] font-bold ${value === d ? "bg-ink text-white" : on === "mist" ? "bg-paper" : "bg-mist"}`}
            >
              {text[0].toUpperCase() + text.slice(1)}
            </button>
          );
        })}
      </div>
      {weekly && <p className="mt-3 text-[15px] leading-snug font-semibold text-ink-2">Weeks will run {weeksRun(value)}.</p>}
    </>
  );
}

// ───────────────────────── tracking ─────────────────────────

export function TrackPicker({ d, set }: { d: RuleDraft; set: SetRules }) {
  const tracking: Tracking = { measure: d.measure, direction: d.direction, unit: d.unit.trim() || null, target: d.target };
  return (
    <>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What to track">
        {MEASURES.map((m) => (
          <button
            key={m.value}
            role="radio"
            aria-checked={d.measure === m.value}
            onClick={() =>
              set({
                measure: m.value,
                target: m.value === d.measure ? d.target : null,
                unit: m.value === "distance" ? "km" : m.value === "weight" ? "kg" : m.value === "count" && d.measure === "count" ? d.unit : "",
                direction: "up",
              })
            }
            className={`rounded-[20px] p-4 text-left transition-colors ${m.value === "none" ? "col-span-2" : ""} ${d.measure === m.value ? "bg-blue text-white" : "bg-paper"}`}
          >
            <span className="block text-[18px] font-extrabold">{m.label}</span>
            <span className="block text-[14px] opacity-75">{m.hint}</span>
          </button>
        ))}
      </div>

      {d.measure !== "none" && (
        <div className="mt-4 space-y-4 rounded-[22px] bg-paper p-4">
          {d.measure === "count" && (
            <Field label="What are you counting?">
              <input
                maxLength={24}
                value={d.unit}
                onChange={(e) => set({ unit: e.target.value })}
                placeholder="push-ups, pages, glasses"
                aria-label="What are you counting?"
                className="h-14 w-full rounded-2xl bg-mist px-4 text-[18px] font-semibold outline-none focus:ring-2 focus:ring-blue"
              />
            </Field>
          )}
          {d.measure === "distance" && (
            <Field label="Unit">
              <Segmented options={[["km", "Kilometres"], ["mi", "Miles"], ["m", "Metres"]]} value={d.unit} onChange={(v) => set({ unit: v, target: null })} />
            </Field>
          )}
          {d.measure === "weight" && (
            <>
              <Field label="Unit">
                <Segmented options={[["kg", "kg"], ["lb", "lb"]]} value={d.unit} onChange={(v) => set({ unit: v, target: null })} />
              </Field>
              <Field label="Which way is progress?">
                <Segmented options={[["up", "Heavier"], ["down", "Lighter"]]} value={d.direction} onChange={(v) => set({ direction: v as Direction })} />
              </Field>
            </>
          )}
          {d.measure === "time" && (
            <Field label="Which way is progress?">
              <Segmented options={[["up", "Longer (a hold, practice)"], ["down", "Faster (a run, a mile)"]]} value={d.direction} onChange={(v) => set({ direction: v as Direction })} />
            </Field>
          )}
          <Field label={d.direction === "down" && (d.measure === "time" || d.measure === "weight") ? "Goal (optional)" : "Minimum each time (optional)"}>
            <div className="rounded-2xl bg-mist/60 p-2">
              <ValueInput t={tracking} value={d.target} onChange={(v) => set({ target: v })} size="md" />
            </div>
          </Field>
        </div>
      )}
    </>
  );
}

// ───────────────────────── pieces ─────────────────────────

export function Choice({ selected, onClick, title, body }: { selected: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-[22px] p-5 text-left transition-colors ${selected ? "bg-blue text-white" : "bg-paper"}`}
    >
      <span className="flex-1">
        <span className="block text-[20px] font-extrabold">{title}</span>
        <span className="mt-0.5 block text-[15px] opacity-75">{body}</span>
      </span>
      <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${selected ? "border-white bg-white" : "border-line"}`} aria-hidden>
        {selected && <span className="h-3 w-3 rounded-full bg-blue" />}
      </span>
    </button>
  );
}

export function StepRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[17px] font-bold">{label}</span>
      <div className="flex items-center gap-4">
        <Stepper label="Fewer" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
          −
        </Stepper>
        <span className="display tnum min-w-8 text-center text-[36px] font-extrabold" aria-live="polite">
          {value}
        </span>
        <Stepper label="More" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
          +
        </Stepper>
      </div>
    </div>
  );
}

function Stepper({ children, onClick, disabled, label }: { children: ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-mist text-[24px] font-bold disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[15px] font-bold text-ink-2">{label}</p>
      {children}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }: { options: [string, string][]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="grid gap-1 rounded-2xl bg-mist p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-11 rounded-xl px-2 py-2 text-[14px] leading-tight font-bold ${value === v ? "bg-ink text-white" : "text-ink-2"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function SwitchRow({ on, onChange, title, body }: { on: boolean; onChange: (v: boolean) => void; title: string; body: string }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-start gap-4 text-left">
      <span className="flex-1">
        <span className="block text-[17px] font-bold">{title}</span>
        <span className="mt-0.5 block text-[14px] leading-snug text-ink-2">{body}</span>
      </span>
      <span className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-blue" : "bg-line"}`} aria-hidden>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}
