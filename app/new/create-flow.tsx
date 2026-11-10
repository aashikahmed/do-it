"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createPact } from "@/lib/client-actions";
import { Chain } from "@/components/chain";
import { ShareInvite } from "@/components/share-invite";
import { Sheet } from "@/components/sheet";
import Link from "next/link";
import { toast } from "@/components/toast";
import { ValueInput } from "@/components/measure-input";
import { MEASURES, type Direction, type Measure, type Tracking } from "@/lib/measure";
import { addDays, deviceTimeZone, todayIn } from "@/lib/dates";
import { freezesFor } from "@/lib/streak";
import { breakTitle, cadenceText, inSentence, restDaysText, type BreakMode } from "@/lib/view";
import type { PactColor } from "@/lib/data";

type Draft = {
  kind: "build" | "break" | null;
  title: string;
  emoji: string;
  color: PactColor;
  cadence: "daily" | "weekly";
  timesPerWeek: number;
  durationDays: number;
  startOffset: 0 | 1;
  measure: Measure;
  direction: Direction;
  unit: string;
  /** minimum per check-in in the measure's unit (seconds for time) */
  target: number | null;
  // break a habit
  subject: string;
  mode: BreakMode;
  /** "some days a week": how many days it's OK */
  allowance: number;
  /** "a little each day": the most per day, and what's counted */
  limit: number;
  limitUnit: string;
  /** lower the limit each week by this much (null = off) */
  limitStep: number | null;
  /** weekday bitmask, bit 0 = Sunday */
  restDays: number;
  askNextMorning: boolean;
  cravingPlan: string;
};

type BreakTemplate = { subject: string; emoji: string; color: PactColor; mode?: BreakMode; allowance?: number; limit?: number; limitUnit: string };

const BREAK_TEMPLATES: BreakTemplate[] = [
  { subject: "Soda", emoji: "🥤", color: "rose", limitUnit: "cans" },
  { subject: "Sugar", emoji: "🍬", color: "sun", limitUnit: "treats" },
  { subject: "Alcohol", emoji: "🍷", color: "violet", limitUnit: "drinks" },
  { subject: "Smoking", emoji: "🚬", color: "ember", limitUnit: "cigarettes" },
  { subject: "Junk food", emoji: "🍟", color: "sun", limitUnit: "snacks" },
  { subject: "Social media", emoji: "📱", color: "blue", mode: "amount", limit: 30, limitUnit: "minutes" },
  { subject: "Takeout", emoji: "🥡", color: "mint", mode: "days", allowance: 2, limitUnit: "meals" },
  { subject: "Coffee", emoji: "☕", color: "ember", mode: "amount", limit: 2, limitUnit: "cups" },
];

const BREAK_EMOJIS = ["✋", "🥤", "🍬", "🍷", "🍺", "🚬", "🍟", "🍫", "📱", "🎮", "🥡", "☕", "🛒", "💸", "🌙", "🚫"];
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

const TEMPLATES: (Partial<Draft> & { title: string; emoji: string })[] = [
  { emoji: "💪", title: "Push-ups", cadence: "daily", measure: "count", unit: "push-ups", target: 20, color: "ember" },
  { emoji: "🏋️", title: "Hit the gym", cadence: "weekly", timesPerWeek: 3, measure: "none", color: "blue" },
  { emoji: "📚", title: "Read every day", cadence: "daily", measure: "count", unit: "pages", target: 10, color: "violet" },
  { emoji: "🧘", title: "Meditate", cadence: "daily", measure: "time", direction: "up", target: 600, color: "mint" },
  { emoji: "🏃", title: "Go for a run", cadence: "weekly", timesPerWeek: 3, measure: "distance", unit: "km", target: 3, color: "rose" },
  { emoji: "💻", title: "Deep work", cadence: "daily", measure: "time", direction: "up", target: 3600, color: "blue" },
  { emoji: "🍬", title: "No sugar", cadence: "daily", measure: "none", color: "sun" },
  { emoji: "✍️", title: "Write", cadence: "daily", measure: "count", unit: "words", target: 300, color: "violet" },
];

const EMOJIS = ["🔥", "💪", "🏋️", "🏃", "📚", "🧘", "💻", "✍️", "💧", "🥗", "🍬", "🌅", "🎸", "🧠", "🚶", "🙏"];
const COLORS: PactColor[] = ["blue", "ember", "sun", "mint", "violet", "rose"];
const DAILY_LENGTHS = [7, 14, 21, 30, 60, 90];
const WEEKLY_LENGTHS = [4, 8, 12];

const BUILD_STEPS = ["Kind", "What", "How often", "How long", "Track", "Look"] as const;
const BREAK_STEPS = ["Kind", "What", "How much", "How long"] as const;

export function CreateFlow() {
  const router = useRouter();
  const params = useSearchParams();
  // "Build a habit in its place" lands here with ?kind=build, already past the first question
  const preset = params.get("kind") === "build" ? "build" : null;
  const [step, setStep] = useState(preset ? 1 : 0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [d, setD] = useState<Draft>({
    kind: preset,
    title: "",
    emoji: "🔥",
    color: "blue",
    cadence: "daily",
    timesPerWeek: 3,
    durationDays: 30,
    startOffset: 0,
    measure: "none",
    direction: "up",
    unit: "",
    target: null,
    subject: "",
    mode: "none",
    allowance: 3,
    limit: 2,
    limitUnit: "",
    limitStep: null,
    restDays: 0,
    askNextMorning: false,
    cravingPlan: "",
  });
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const isBreak = d.kind === "break";
  const STEPS: readonly string[] = isBreak ? BREAK_STEPS : BUILD_STEPS;
  const name = STEPS[step];
  const breakCadence = d.mode === "days" ? "weekly" : "daily";
  const subject = inSentence(d.subject);

  const tracking: Tracking = { measure: d.measure, direction: d.direction, unit: d.unit.trim() || null, target: d.target };
  const canNext =
    name === "Kind"
      ? d.kind !== null
      : name === "What"
        ? (isBreak ? d.subject : d.title).trim().length > 0
        : name === "Track"
          ? d.measure !== "count" || d.unit.trim().length > 0
          : name === "How much"
            ? d.mode !== "amount" || d.limitUnit.trim().length > 0
            : true;

  function go(n: number) {
    setDir(n > step ? 1 : -1);
    setStep(n);
  }

  async function submit() {
    setBusy(true);
    const tz = deviceTimeZone();
    const res = isBreak ? await createBreak(tz) : await createPact({
      title: d.title.trim(),
      emoji: d.emoji,
      color: d.color,
      cadence: d.cadence,
      timesPerWeek: d.cadence === "daily" ? 7 : d.timesPerWeek,
      durationDays: d.durationDays,
      startDate: addDays(todayIn(tz), d.startOffset),
      timezone: tz,
      measure: d.measure,
      direction: d.measure === "time" || d.measure === "weight" ? d.direction : "up",
      unit: d.measure === "none" || d.measure === "time" ? undefined : d.unit.trim() || undefined,
      target: d.measure !== "none" && d.target ? d.target : null,
    });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setCreated(res.data!);
  }

  function createBreak(tz: string) {
    const amount = d.mode === "amount";
    return createPact({
      kind: "break",
      title: breakTitle(d.subject, d.mode),
      subject: subject,
      emoji: d.emoji,
      color: d.color,
      cadence: breakCadence,
      timesPerWeek: d.mode === "days" ? 7 - d.allowance : 7,
      durationDays: d.durationDays,
      startDate: addDays(todayIn(tz), d.startOffset),
      timezone: tz,
      measure: amount ? "count" : "none",
      direction: "down",
      unit: amount ? d.limitUnit.trim() : undefined,
      target: amount ? d.limit : null,
      limitStep: amount ? d.limitStep : null,
      restDays: breakCadence === "daily" ? d.restDays : 0,
      askNextMorning: d.askNextMorning,
      cravingPlan: d.cravingPlan.trim() || undefined,
    });
  }

  function pickBreak(t: BreakTemplate) {
    const mode = t.mode ?? "none";
    set({
      subject: t.subject,
      emoji: t.emoji,
      color: t.color,
      mode,
      allowance: t.allowance ?? 3,
      limit: t.limit ?? 2,
      limitUnit: t.limitUnit,
      durationDays: mode === "days" ? 28 : 30,
    });
    go(step + 1);
  }

  function setMode(mode: BreakMode) {
    const weekly = mode === "days";
    set({
      mode,
      durationDays: weekly
        ? WEEKLY_LENGTHS.map((w) => w * 7).includes(d.durationDays) ? d.durationDays : 28
        : DAILY_LENGTHS.includes(d.durationDays) ? d.durationDays : 30,
      restDays: weekly ? 0 : d.restDays,
      limitStep: mode === "amount" ? d.limitStep : null,
    });
  }

  if (created) {
    return (
      <main data-color={d.color} className="flex min-h-dvh flex-col bg-[var(--pact)] px-6 pt-safe pb-safe text-[var(--pact-ink)]">
        <motion.div
          className="flex flex-1 flex-col justify-center"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
        >
          <span className="text-[64px]" aria-hidden>
            {d.emoji}
          </span>
          <h1 className="display mt-4 text-[60px] font-extrabold">Now bring someone in.</h1>
          <p className="mt-5 max-w-[32ch] text-[18px] leading-snug opacity-85">
            Send the link to your partner, or to the whole group. Once they join, you share one chain.
          </p>
        </motion.div>
        <div className="space-y-3">
          <ShareInvite
            code={created.code}
            // a break pact's title isn't in the draft: it's made from the subject when the pact is created
            pact={
              isBreak
                ? { kind: "break", title: breakTitle(d.subject, d.mode), subject, emoji: d.emoji, cadence: breakCadence, measure: d.mode === "amount" ? "count" : "none" }
                : { kind: "build", title: d.title, emoji: d.emoji }
            }
            label="Send invite link"
            className="h-16 w-full rounded-[22px] bg-white text-[18px] font-extrabold text-ink"
          />
          <button onClick={() => router.replace(`/p/${created.id}`)} className="h-14 w-full rounded-[22px] text-[17px] font-bold opacity-90">
            Go to the pact
          </button>
          {isBreak && (
            <Link href="/new?kind=build" className="flex h-11 items-center justify-center text-[15px] font-semibold underline-offset-4 opacity-80 hover:underline">
              Build a habit in its place
            </Link>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col px-5 pt-safe pb-safe">
      <div className="flex items-center gap-3 pt-3">
        <button
          onClick={() => (step === 0 ? router.back() : go(step - 1))}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full"
          aria-label={step === 0 ? "Cancel" : "Back"}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            {step === 0 ? (
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            ) : (
              <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-blue" : "bg-line"}`} />
          ))}
        </div>
      </div>

      <div className="relative flex-1 overflow-x-clip">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.section
            key={step}
            custom={dir}
            initial={{ x: 40 * dir, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40 * dir, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pt-8 pb-6"
          >
            {name === "Kind" && (
              <>
                <h1 className="display text-[48px] font-extrabold">What do you want to do?</h1>
                <div className="mt-8 space-y-3" role="radiogroup" aria-label="Build or break">
                  <Choice
                    selected={d.kind === "build"}
                    onClick={() => {
                      setD((x) => ({ ...x, kind: "build", emoji: x.kind === "build" ? x.emoji : "🔥", color: x.kind === "build" ? x.color : "blue", durationDays: 30, cadence: "daily" }));
                      go(1);
                    }}
                    title="Build a habit"
                    body="Start doing something. Push-ups, reading, a walk."
                  />
                  <Choice
                    selected={d.kind === "break"}
                    onClick={() => {
                      setD((x) => ({ ...x, kind: "break", emoji: x.kind === "break" ? x.emoji : "✋", color: x.kind === "break" ? x.color : "mint", durationDays: x.mode === "days" ? 28 : 30 }));
                      go(1);
                    }}
                    title="Break a habit"
                    body="Stop or cut down on something. Soda, sugar, smoking, scrolling."
                  />
                </div>
              </>
            )}

            {name === "What" && isBreak && (
              <>
                <h1 className="display text-[48px] font-extrabold">What are you giving up?</h1>
                <div className="mt-6 flex items-center gap-2 rounded-[20px] border-2 border-line bg-paper pr-2 focus-within:border-blue">
                  <span className="pl-4 text-[26px]" aria-hidden>
                    {d.emoji}
                  </span>
                  <input
                    autoFocus
                    maxLength={40}
                    value={d.subject}
                    onChange={(e) => set({ subject: e.target.value })}
                    placeholder="e.g. soda"
                    className="h-16 min-w-0 flex-1 bg-transparent text-[19px] font-semibold outline-none placeholder:text-ink-3"
                    aria-label="What you're giving up"
                    onKeyDown={(e) => e.key === "Enter" && canNext && go(step + 1)}
                  />
                </div>
                <div className="no-scrollbar -mx-5 mt-3 flex gap-1 overflow-x-auto px-5" role="radiogroup" aria-label="Icon">
                  {BREAK_EMOJIS.map((e) => (
                    <button
                      key={e}
                      role="radio"
                      aria-checked={d.emoji === e}
                      onClick={() => set({ emoji: e })}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[22px] ${d.emoji === e ? "bg-ink/10" : ""}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <p className="mt-8 mb-3 text-[15px] font-bold text-ink-2">Or pick one</p>
                <div className="flex flex-wrap gap-2">
                  {BREAK_TEMPLATES.map((t) => (
                    <button key={t.subject} onClick={() => pickBreak(t)} className="flex h-11 items-center gap-2 rounded-full bg-paper px-4 text-[15px] font-semibold active:scale-95">
                      <span aria-hidden>{t.emoji}</span>
                      {t.subject}
                    </button>
                  ))}
                </div>
              </>
            )}

            {name === "How much" && (
              <>
                <h1 className="display text-[48px] font-extrabold">How much {subject} is OK?</h1>
                <div className="mt-8 space-y-3" role="radiogroup" aria-label="How much is OK">
                  <Choice selected={d.mode === "none"} onClick={() => setMode("none")} title="None at all" body="Stay off it every day." />
                  <Choice selected={d.mode === "days"} onClick={() => setMode("days")} title="Some days a week" body="Have it on a few days, stay off it the rest." />
                  <Choice selected={d.mode === "amount"} onClick={() => setMode("amount")} title="A little each day" body="Stay under a daily limit." />
                </div>
                {d.mode === "days" && (
                  <div className="mt-4 flex items-center justify-between rounded-[22px] bg-paper p-4">
                    <span className="text-[17px] font-bold">Days a week it&apos;s OK</span>
                    <div className="flex items-center gap-4">
                      <Stepper label="Fewer" onClick={() => set({ allowance: Math.max(1, d.allowance - 1) })} disabled={d.allowance <= 1}>
                        −
                      </Stepper>
                      <span className="display tnum w-8 text-center text-[36px] font-extrabold" aria-live="polite">
                        {d.allowance}
                      </span>
                      <Stepper label="More" onClick={() => set({ allowance: Math.min(6, d.allowance + 1) })} disabled={d.allowance >= 6}>
                        +
                      </Stepper>
                    </div>
                  </div>
                )}
                {d.mode === "amount" && (
                  <div className="mt-4 space-y-4 rounded-[22px] bg-paper p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[17px] font-bold">Up to, each day</span>
                      <div className="flex items-center gap-4">
                        <Stepper label="Less" onClick={() => set({ limit: Math.max(1, d.limit - 1) })} disabled={d.limit <= 1}>
                          −
                        </Stepper>
                        <span className="display tnum min-w-8 text-center text-[36px] font-extrabold" aria-live="polite">
                          {d.limit}
                        </span>
                        <Stepper label="More" onClick={() => set({ limit: Math.min(999, d.limit + 1) })}>
                          +
                        </Stepper>
                      </div>
                    </div>
                    <Field label="Counted in">
                      <input
                        maxLength={24}
                        value={d.limitUnit}
                        onChange={(e) => set({ limitUnit: e.target.value })}
                        placeholder="cans, cups, cigarettes, minutes"
                        className="h-14 w-full rounded-2xl bg-mist px-4 text-[18px] font-semibold outline-none focus:ring-2 focus:ring-blue"
                      />
                    </Field>
                  </div>
                )}
              </>
            )}

            {name === "How long" && isBreak && (
              <>
                <h1 className="display text-[48px] font-extrabold">For how long?</h1>
                <div className="mt-8 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Length">
                  {(breakCadence === "daily" ? DAILY_LENGTHS : WEEKLY_LENGTHS.map((w) => w * 7)).map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={d.durationDays === n}
                      onClick={() => set({ durationDays: n })}
                      className={`h-[84px] rounded-[22px] text-left transition-colors ${d.durationDays === n ? "bg-blue text-white" : "bg-paper"}`}
                    >
                      <span className="display tnum block px-4 text-[36px] font-extrabold">{breakCadence === "daily" ? n : n / 7}</span>
                      <span className="block px-4 text-[14px] font-semibold opacity-75">{breakCadence === "daily" ? "days" : "weeks"}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Start">
                  {([0, 1] as const).map((o) => (
                    <button
                      key={o}
                      role="radio"
                      aria-checked={d.startOffset === o}
                      onClick={() => set({ startOffset: o })}
                      className={`h-14 rounded-[18px] text-[17px] font-bold ${d.startOffset === o ? "bg-ink text-white" : "bg-paper"}`}
                    >
                      {o === 0 ? "Start today" : "Start tomorrow"}
                    </button>
                  ))}
                </div>
                <div className="mt-5 rounded-[22px] bg-[#e3e6ff] p-4 text-[16px] leading-snug">
                  <p>
                    Each morning we&apos;ll ask: <b>how did yesterday go?</b>
                    {d.askNextMorning ? "" : " You can also answer from 6pm."}
                  </p>
                  <p className="mt-2 text-[14px] text-ink-2">No reminders at night, and notifications never mention {subject || "it"}.</p>
                </div>
                <p className="mt-4 text-[15px] leading-snug text-ink-2">
                  {cadenceText({ kind: "break", cadence: breakCadence, times_per_week: 7 - d.allowance, duration_days: d.durationDays, measure: d.mode === "amount" ? "count" : "none", target: d.limit, unit: d.limitUnit, rest_days: d.restDays, limit_step: d.limitStep })}.
                  {" "}You get {freezesFor(breakCadence, d.durationDays)} {freezesFor(breakCadence, d.durationDays) === 1 ? "freeze" : "freezes"} to save the chain.
                </p>
                <button onClick={() => setMoreOpen(true)} className="mt-3 h-11 text-[16px] font-bold text-blue">
                  More options{optionCount(d) ? ` (${optionCount(d)} on)` : ""}
                </button>
              </>
            )}

            {name === "What" && !isBreak && (
              <>
                <h1 className="display text-[48px] font-extrabold">What are you committing to?</h1>
                <div className="mt-6 flex items-center gap-2 rounded-[20px] border-2 border-line bg-paper pr-2 focus-within:border-blue">
                  <span className="pl-4 text-[26px]" aria-hidden>
                    {d.emoji}
                  </span>
                  <input
                    autoFocus
                    maxLength={60}
                    value={d.title}
                    onChange={(e) => set({ title: e.target.value })}
                    placeholder="e.g. 50 push-ups"
                    className="h-16 min-w-0 flex-1 bg-transparent text-[19px] font-semibold outline-none placeholder:text-ink-3"
                    aria-label="Pact name"
                    onKeyDown={(e) => e.key === "Enter" && canNext && go(step + 1)}
                  />
                </div>
                <div className="no-scrollbar -mx-5 mt-3 flex gap-1 overflow-x-auto px-5" role="radiogroup" aria-label="Icon">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      role="radio"
                      aria-checked={d.emoji === e}
                      onClick={() => set({ emoji: e })}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[22px] ${d.emoji === e ? "bg-ink/10" : ""}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <p className="mt-8 mb-3 text-[15px] font-bold text-ink-2">Or start from one of these</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.title}
                      onClick={() => {
                        set({ ...t, measure: t.measure ?? "none", direction: t.direction ?? "up", unit: t.unit ?? "", target: t.target ?? null, timesPerWeek: t.timesPerWeek ?? 3, durationDays: t.cadence === "weekly" ? 28 : 30 });
                        go(step + 1);
                      }}
                      className="flex h-11 items-center gap-2 rounded-full bg-paper px-4 text-[15px] font-semibold active:scale-95"
                    >
                      <span aria-hidden>{t.emoji}</span>
                      {t.title}
                    </button>
                  ))}
                </div>
              </>
            )}

            {name === "How often" && (
              <>
                <h1 className="display text-[48px] font-extrabold">How often?</h1>
                <div className="mt-8 space-y-3" role="radiogroup" aria-label="How often">
                  <Choice
                    selected={d.cadence === "daily"}
                    onClick={() => set({ cadence: "daily", durationDays: DAILY_LENGTHS.includes(d.durationDays) ? d.durationDays : 30 })}
                    title="Every day"
                    body="The chain grows one link per day."
                  />
                  <Choice
                    selected={d.cadence === "weekly"}
                    onClick={() => set({ cadence: "weekly", durationDays: WEEKLY_LENGTHS.map((w) => w * 7).includes(d.durationDays) ? d.durationDays : 28 })}
                    title="Some days a week"
                    body="Pick a weekly target. One link per week."
                  />
                </div>
                {d.cadence === "weekly" && (
                  <div className="mt-6 flex items-center justify-between rounded-[22px] bg-paper p-4">
                    <span className="text-[17px] font-bold">Times a week</span>
                    <div className="flex items-center gap-4">
                      <Stepper label="Fewer" onClick={() => set({ timesPerWeek: Math.max(1, d.timesPerWeek - 1) })} disabled={d.timesPerWeek <= 1}>
                        −
                      </Stepper>
                      <span className="display tnum w-8 text-center text-[36px] font-extrabold" aria-live="polite">
                        {d.timesPerWeek}
                      </span>
                      <Stepper label="More" onClick={() => set({ timesPerWeek: Math.min(6, d.timesPerWeek + 1) })} disabled={d.timesPerWeek >= 6}>
                        +
                      </Stepper>
                    </div>
                  </div>
                )}
              </>
            )}

            {name === "How long" && !isBreak && (
              <>
                <h1 className="display text-[48px] font-extrabold">For how long?</h1>
                <div className="mt-8 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Length">
                  {(d.cadence === "daily" ? DAILY_LENGTHS : WEEKLY_LENGTHS.map((w) => w * 7)).map((n) => (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={d.durationDays === n}
                      onClick={() => set({ durationDays: n })}
                      className={`h-[84px] rounded-[22px] text-left transition-colors ${d.durationDays === n ? "bg-blue text-white" : "bg-paper"}`}
                    >
                      <span className="display tnum block px-4 text-[36px] font-extrabold">{d.cadence === "daily" ? n : n / 7}</span>
                      <span className="block px-4 text-[14px] font-semibold opacity-75">{d.cadence === "daily" ? "days" : "weeks"}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-8 mb-3 text-[15px] font-bold text-ink-2">Starting</p>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Start">
                  {([0, 1] as const).map((o) => (
                    <button
                      key={o}
                      role="radio"
                      aria-checked={d.startOffset === o}
                      onClick={() => set({ startOffset: o })}
                      className={`h-14 rounded-[18px] text-[17px] font-bold ${d.startOffset === o ? "bg-ink text-white" : "bg-paper"}`}
                    >
                      {o === 0 ? "Today" : "Tomorrow"}
                    </button>
                  ))}
                </div>
                <p className="mt-6 text-[15px] leading-snug text-ink-2">
                  You get {freezesFor(d.cadence, d.durationDays)} {freezesFor(d.cadence, d.durationDays) === 1 ? "freeze" : "freezes"} to save the chain if someone slips.
                </p>
              </>
            )}

            {name === "Track" && (
              <>
                <h1 className="display text-[48px] font-extrabold">Track progress?</h1>
                <p className="mt-3 text-[16px] leading-snug text-ink-2">Log a number each time and you get a chart of how you&apos;re improving. Skip it to just keep the streak.</p>
                <div className="mt-6 grid grid-cols-2 gap-2" role="radiogroup" aria-label="What to track">
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
                <p className="mt-4 text-[14px] leading-snug text-ink-3">Every check-in can also be rated Tough, Good or Strong, so you see how it felt over time.</p>
              </>
            )}

            {name === "Look" && (
              <>
                <h1 className="display text-[48px] font-extrabold">Make it yours.</h1>
                <div data-color={d.color} className="mt-6 rounded-[28px] bg-[var(--pact)] p-5 text-[var(--pact-ink)] transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-[26px]" aria-hidden>
                      {d.emoji}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[20px] font-extrabold">{d.title || "Your pact"}</p>
                      <p className="text-[14px] font-medium opacity-75">{cadenceText({ cadence: d.cadence, times_per_week: d.timesPerWeek, duration_days: d.durationDays })}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Chain
                      periods={Array.from({ length: 7 }, (_, i) => ({ index: i, start: String(i), status: i === 0 ? "open" : "upcoming" }))}
                      size={0.86}
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-between" role="radiogroup" aria-label="Color">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      data-color={c}
                      role="radio"
                      aria-checked={d.color === c}
                      aria-label={c}
                      onClick={() => set({ color: c })}
                      className="flex h-12 w-12 items-center justify-center rounded-full"
                    >
                      <span
                        className="h-10 w-10 rounded-full bg-[var(--pact)] transition-shadow"
                        style={{ boxShadow: d.color === c ? "0 0 0 3px var(--color-mist), 0 0 0 5.5px var(--pact)" : undefined }}
                      />
                    </button>
                  ))}
                </div>

              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      {isBreak && <MoreOptions d={d} set={set} subject={subject} open={moreOpen} onClose={() => setMoreOpen(false)} />}

      {name !== "Kind" && (
      <button
        disabled={!canNext || busy}
        onClick={() => (step < STEPS.length - 1 ? go(step + 1) : submit())}
        className="mb-2 h-16 w-full rounded-[22px] bg-blue text-[18px] font-extrabold text-white transition-opacity disabled:opacity-40"
      >
        {step < STEPS.length - 1 ? "Continue" : busy ? "Creating…" : "Create pact"}
      </button>
      )}
    </main>
  );
}

function Choice({ selected, onClick, title, body }: { selected: boolean; onClick: () => void; title: string; body: string }) {
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

function Stepper({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[15px] font-bold text-ink-2">{label}</p>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1 rounded-2xl bg-mist p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup">
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

function optionCount(d: Draft) {
  return [d.askNextMorning, d.restDays !== 0, d.limitStep !== null, d.cravingPlan.trim() !== ""].filter(Boolean).length;
}

/** Everything beyond the basics, off by default. */
function MoreOptions({ d, set, subject, open, onClose }: { d: Draft; set: (p: Partial<Draft>) => void; subject: string; open: boolean; onClose: () => void }) {
  const daily = d.mode !== "days";
  const offCount = WEEK.filter((w) => d.restDays & (1 << w.bit)).length;
  return (
    <Sheet open={open} onClose={onClose} title="More options">
      <div className="space-y-5 pb-2">
        <Toggle
          on={d.askNextMorning}
          onChange={(v) => set({ askNextMorning: v })}
          title="Ask me the next morning"
          body="For habits that run into the night, like no phone after 10pm. You'll only answer once the day is over."
        />
        {daily && (
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
        )}
        {d.mode === "amount" && (
          <div>
            <Toggle
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
        )}
        <Field label="My plan for cravings">
          <input
            maxLength={140}
            value={d.cravingPlan}
            onChange={(e) => set({ cravingPlan: e.target.value })}
            placeholder={`When I want ${subject || "it"}, I'll…`}
            className="h-14 w-full rounded-2xl bg-mist px-4 text-[16px] font-semibold outline-none focus:ring-2 focus:ring-blue"
          />
          <p className="mt-1.5 text-[14px] text-ink-2">Shows up when you tap &ldquo;Having a craving?&rdquo;</p>
        </Field>
        <div>
          <p className="mb-2 text-[15px] font-bold text-ink-2">Colour</p>
          <div className="flex justify-between" role="radiogroup" aria-label="Color">
            {COLORS.map((c) => (
              <button key={c} data-color={c} role="radio" aria-checked={d.color === c} aria-label={c} onClick={() => set({ color: c })} className="flex h-12 w-12 items-center justify-center rounded-full">
                <span className="h-10 w-10 rounded-full bg-[var(--pact)]" style={{ boxShadow: d.color === c ? "0 0 0 3px var(--color-paper), 0 0 0 5.5px var(--pact)" : undefined }} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <button onClick={onClose} className="mt-4 mb-2 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white">
        Done
      </button>
    </Sheet>
  );
}

function Toggle({ on, onChange, title, body }: { on: boolean; onChange: (v: boolean) => void; title: string; body: string }) {
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
