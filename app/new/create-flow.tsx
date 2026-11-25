"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createPact } from "@/lib/client-actions";
import { StraightLanes } from "@/components/lanes";
import { TokenStrip } from "@/components/tokens";
import { inkOn, laneColor } from "@/lib/lanes";
import { buildTokens } from "@/lib/tokens";
import { PactCreated } from "@/components/pact-created";
import { Sheet } from "@/components/sheet";
import Link from "next/link";
import { toast } from "@/components/toast";
import { CadencePicker, Choice, ColorPicker, Field, HowMuchPicker, IconPicker, LengthPicker, LimitStepPicker, RestDaysPicker, StartPicker, SwitchRow, TrackPicker } from "@/components/pact-fields";
import { addDays, deviceTimeZone, diffDays, todayIn } from "@/lib/dates";
import type { RuleDraft } from "@/lib/edit";
import { saveCreateDraft, useCreateDraft, useHeld, type CreateDraft } from "@/lib/explore/handoff";
import { createInput } from "@/lib/pact-input";
import { freezesFor } from "@/lib/streak";
import { breakTitle, cadenceText, inSentence } from "@/lib/view";
import { startOffsets } from "@/lib/week";
import type { PactColor } from "@/lib/data";

type Draft = RuleDraft & {
  kind: "build" | "break" | null;
  title: string;
  emoji: string;
  color: PactColor;
  /** days from today: 0, 1, or the next Monday for weekly pacts */
  startOffset: number;
  /** break a habit: what's being given up */
  subject: string;
  cravingPlan: string;
};

/** an idea the create flow points to, instead of a template of its own */
export type IdeaLink = { slug: string; emoji: string; title: string };
export type IdeaLinks = { build: IdeaLink[]; break: IdeaLink[]; count: number };

const BUILD_STEPS = ["Kind", "What", "How often", "How long", "Track", "Look"] as const;
const BREAK_STEPS = ["Kind", "What", "How much", "How long"] as const;

/**
 * The router keeps this screen alive after you leave it, so without a key "New pact" would come back on the last
 * pact's "Now bring someone in". Every fresh visit starts over; going back to it doesn't.
 */
export function CreateFlow({ ideas }: { ideas: IdeaLinks }) {
  const { bfcacheId } = useRouter();
  // the query string is the current page's, even while this one is kept out of sight: only follow it while it's shown
  const live = useSearchParams().toString();
  const [query, setQuery] = useState(live);
  if (usePathname() === "/new" && live !== query) setQuery(live);
  return <Visit key={`${bfcacheId}-${query}`} ideas={ideas} query={query} />;
}

function Visit({ ideas, query }: { ideas: IdeaLinks; query: string }) {
  const params = new URLSearchParams(query);
  // an idea from Explore opened here to change everything, or a search there that found nothing
  const draft = useHeld(useCreateDraft(params.get("from") === "idea"));
  const name = params.get("name")?.trim().slice(0, 60) ?? "";
  // "Build a habit in its place" lands here with ?kind=build, already past the first question
  const preset = params.get("kind") === "build" || name ? "build" : null;
  return <Flow key={draft ? "idea" : "new"} ideas={ideas} from={draft} preset={preset} title={name} />;
}

function Flow({ ideas, from, preset, title }: { ideas: IdeaLinks; from: CreateDraft | null; preset: "build" | null; title: string }) {
  const router = useRouter();
  const [step, setStep] = useState(preset || from ? 1 : 0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; code: string; asked?: string } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [d, setD] = useState<Draft>(() => ({
    kind: preset,
    title,
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
    ...(from && { ...from.draft, ...from.look, startOffset: from.offset }),
  }));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const isBreak = d.kind === "break";
  const STEPS: readonly string[] = isBreak ? BREAK_STEPS : BUILD_STEPS;
  const name = STEPS[step];
  const breakCadence = d.mode === "days" ? "weekly" : "daily";
  const subject = inSentence(d.subject);

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
    const weekly = isBreak ? breakCadence === "weekly" : d.cadence === "weekly";
    const start = addDays(todayIn(tz), startFor(tz, d.startOffset, weekly));
    const res = await createPact({ ...createInput(d, { kind: isBreak ? "break" : "build", title: d.title, subject: d.subject, emoji: d.emoji, color: d.color, cravingPlan: d.cravingPlan, idea: from && from.look.kind === d.kind ? from.look.idea : undefined }, start, tz), ask: from?.ask ?? undefined });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    saveCreateDraft(null);
    setCreated(res.data!);
  }

  if (created) {
    return (
      <PactCreated
        id={created.id}
        code={created.code}
        color={d.color}
        emoji={d.emoji}
        asked={created.asked}
        // a break pact's title isn't in the draft: it's made from the subject when the pact is created
        pact={
          isBreak
            ? { kind: "break", title: breakTitle(d.subject, d.mode), subject, emoji: d.emoji, cadence: breakCadence, measure: d.mode === "amount" ? "count" : "none" }
            : { kind: "build", title: d.title, emoji: d.emoji }
        }
        next={isBreak ? { href: "/new?kind=build", label: "Build a habit in its place" } : undefined}
      />
    );
  }

  return (
    <main data-color={d.color} className="flex min-h-dvh flex-col px-5 pt-safe pb-safe">
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
                <IconPicker kind="break" value={d.emoji} onPick={(emoji) => set({ emoji })} className="-mx-5 mt-3 px-5" />
                <IdeaLinkChips label="Or start from an idea" links={ideas.break} all="/explore/lane/break" />
              </>
            )}

            {name === "How much" && (
              <>
                <h1 className="display text-[48px] font-extrabold">How much {subject} is OK?</h1>
                <div className="mt-8">
                  <HowMuchPicker d={d} set={set} />
                </div>
              </>
            )}

            {name === "How long" && isBreak && (
              <>
                <h1 className="display text-[48px] font-extrabold">For how long?</h1>
                <div className="mt-8">
                  <LengthPicker weekly={breakCadence === "weekly"} value={d.durationDays} onPick={(n) => set({ durationDays: n })} />
                </div>
                <div className="mt-4">
                  <StartOn offset={d.startOffset} weekly={breakCadence === "weekly"} prefix="Start " onPick={(o) => set({ startOffset: o })} />
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
                  {" "}Everyone gets {freezesFor(breakCadence, d.durationDays)} {freezesFor(breakCadence, d.durationDays) === 1 ? "freeze" : "freezes"} of their own. A slip uses one, automatically.
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
                <IconPicker kind="build" value={d.emoji} onPick={(emoji) => set({ emoji })} className="-mx-5 mt-3 px-5" />
                <IdeaLinkChips label="Or start from an idea" links={ideas.build} all="/explore" count={ideas.count} />
              </>
            )}

            {name === "How often" && (
              <>
                <h1 className="display text-[48px] font-extrabold">How often?</h1>
                <div className="mt-8">
                  <CadencePicker d={d} set={set} />
                </div>
              </>
            )}

            {name === "How long" && !isBreak && (
              <>
                <h1 className="display text-[48px] font-extrabold">For how long?</h1>
                <div className="mt-8">
                  <LengthPicker weekly={d.cadence === "weekly"} value={d.durationDays} onPick={(n) => set({ durationDays: n })} />
                </div>
                <p className="mt-8 mb-3 text-[15px] font-bold text-ink-2">Starting</p>
                <StartOn offset={d.startOffset} weekly={d.cadence === "weekly"} onPick={(o) => set({ startOffset: o })} />
                <p className="mt-6 text-[15px] leading-snug text-ink-2">
                  Everyone gets {freezesFor(d.cadence, d.durationDays)} {freezesFor(d.cadence, d.durationDays) === 1 ? "freeze" : "freezes"} of their own. A miss uses one, automatically.
                </p>
              </>
            )}

            {name === "Track" && (
              <>
                <h1 className="display text-[48px] font-extrabold">Track progress?</h1>
                <p className="mt-3 text-[16px] leading-snug text-ink-2">Log a number each time and you get a chart of how you&apos;re improving. Skip it to just keep the streak.</p>
                <div className="mt-6">
                  <TrackPicker d={d} set={set} />
                </div>
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
                    <LookPreview d={d} />
                  </div>
                </div>
                <div className="mt-4">
                  <ColorPicker value={d.color} onPick={(color) => set({ color })} />
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

/** A few ideas to start from: each opens its page in Explore, with a level to pick. */
function IdeaLinkChips({ label, links, all, count }: { label: string; links: IdeaLink[]; all: string; count?: number }) {
  const chip = "flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold active:scale-95";
  return (
    <>
      <p className="mt-8 mb-3 text-[15px] font-bold text-ink-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link key={l.slug} href={`/explore/${l.slug}`} className={`${chip} bg-paper`}>
            <span aria-hidden>{l.emoji}</span>
            {l.title}
          </Link>
        ))}
        <Link href={all} className={`${chip} bg-ink text-white`}>
          {count ? `All ${count} ideas` : "All of them"}
        </Link>
      </div>
    </>
  );
}

function optionCount(d: Draft) {
  return [d.askNextMorning, d.restDays !== 0, d.limitStep !== null, d.cravingPlan.trim() !== ""].filter(Boolean).length;
}

/** Everything beyond the basics, off by default. */
function MoreOptions({ d, set, subject, open, onClose }: { d: Draft; set: (p: Partial<Draft>) => void; subject: string; open: boolean; onClose: () => void }) {
  const daily = d.mode !== "days";
  return (
    <Sheet open={open} onClose={onClose} title="More options">
      <div className="space-y-5 pb-2">
        <SwitchRow
          on={d.askNextMorning}
          onChange={(v) => set({ askNextMorning: v })}
          title="Ask me the next morning"
          body="For habits that run into the night, like no phone after 10pm. You'll only answer once the day is over."
        />
        {daily && <RestDaysPicker d={d} set={set} />}
        {d.mode === "amount" && <LimitStepPicker d={d} set={set} />}
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
          <ColorPicker value={d.color} onPick={(color) => set({ color })} on="paper" />
        </div>
      </div>
      <button onClick={onClose} className="mt-4 mb-2 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white">
        Done
      </button>
    </Sheet>
  );
}

/** The "Look" step's card: what the home screen will show on day one, in the chosen color. */
function LookPreview({ d }: { d: Draft }) {
  if (d.kind === "break") {
    const tokens = buildTokens({
      pact: { kind: "break", cadence: d.cadence, times_per_week: d.timesPerWeek, duration_days: d.durationDays, start_date: "2026-01-01", target: null, limit_step: null, rest_days: d.restDays },
      phase: "active",
      userId: "you",
      checkins: [],
      misses: [],
      today: "2026-01-01",
    });
    return <TokenStrip model={tokens} pactId="preview" />;
  }
  const color = laneColor(d.color, 0);
  return (
    <StraightLanes
      pactId="preview"
      model={{ total: d.durationDays, today: 0, finished: false, hidden: 0, weekEnds: [], weekEnd: null, lanes: [{ userId: "you", name: "You", avatar: null, color, ink: inkOn(color), segs: [], pos: 0, kept: 0 }] }}
    />
  );
}

/** The start picker, in days from today: a Monday picked for a weekly pact falls back to today if it's daily now. */
function StartOn({ offset, weekly, prefix, onPick }: { offset: number; weekly: boolean; prefix?: string; onPick: (o: number) => void }) {
  const today = todayIn(deviceTimeZone());
  const options = startOffsets(today, weekly);
  const chosen = options.includes(offset) ? offset : 0;
  return (
    <StartPicker
      days={options.map((o) => addDays(today, o))}
      value={addDays(today, chosen)}
      today={today}
      weekly={weekly}
      prefix={prefix}
      onPick={(day) => onPick(diffDays(today, day))}
    />
  );
}

/** the start offset to save: a Monday picked for a weekly pact falls back to today if it's daily now */
function startFor(tz: string, offset: number, weekly: boolean) {
  return startOffsets(todayIn(tz), weekly).includes(offset) ? offset : 0;
}
