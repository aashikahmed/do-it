"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPact } from "@/lib/client-actions";
import { Chain } from "@/components/chain";
import { ShareInvite } from "@/components/share-invite";
import { toast } from "@/components/toast";
import { ValueInput } from "@/components/measure-input";
import { MEASURES, type Direction, type Measure, type Tracking } from "@/lib/measure";
import { addDays, deviceTimeZone, todayIn } from "@/lib/dates";
import { freezesFor } from "@/lib/streak";
import { cadenceText } from "@/lib/view";
import type { PactColor } from "@/lib/data";

type Draft = {
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
};

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

const STEPS = ["What", "How often", "How long", "Track", "Look"] as const;

export function CreateFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  const [d, setD] = useState<Draft>({
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
  });
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const tracking: Tracking = { measure: d.measure, direction: d.direction, unit: d.unit.trim() || null, target: d.target };
  const canNext = step === 0 ? d.title.trim().length > 0 : step === 3 ? d.measure !== "count" || d.unit.trim().length > 0 : true;

  function go(n: number) {
    setDir(n > step ? 1 : -1);
    setStep(n);
  }

  async function submit() {
    setBusy(true);
    const tz = deviceTimeZone();
    const res = await createPact({
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
            title={d.title}
            emoji={d.emoji}
            label="Send invite link"
            className="h-16 w-full rounded-[22px] bg-white text-[18px] font-extrabold text-ink"
          />
          <button onClick={() => router.replace(`/p/${created.id}`)} className="h-14 w-full rounded-[22px] text-[17px] font-bold opacity-90">
            Go to the pact
          </button>
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

      <div className="relative flex-1 overflow-x-hidden">
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
            {step === 0 && (
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
                    onKeyDown={(e) => e.key === "Enter" && canNext && go(1)}
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
                        go(1);
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

            {step === 1 && (
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

            {step === 2 && (
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

            {step === 3 && (
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

            {step === 4 && (
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

      <button
        disabled={!canNext || busy}
        onClick={() => (step < STEPS.length - 1 ? go(step + 1) : submit())}
        className="mb-2 h-16 w-full rounded-[22px] bg-blue text-[18px] font-extrabold text-white transition-opacity disabled:opacity-40"
      >
        {step < STEPS.length - 1 ? "Continue" : busy ? "Creating…" : "Create pact"}
      </button>
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
