"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { editPact, undoCheckIn } from "@/lib/client-actions";
import {
  CadencePicker,
  Choice,
  ColorPicker,
  HowMuchPicker,
  IconPicker,
  LengthPicker,
  LimitStepPicker,
  RestDaysPicker,
  StartPicker,
  TrackPicker,
} from "@/components/pact-fields";
import { toast } from "@/components/toast";
import type { PactBundle } from "@/lib/data";
import { addDays, formatDay } from "@/lib/dates";
import { changedSince, draftOf, draftRules, editLock, lockText, rulesOf, ruleChanges, sameRules, startChoices, startLabel, trackText, type RuleDraft } from "@/lib/edit";
import { freezesFor } from "@/lib/streak";
import { breakTitle, cadenceText, capitalize, firstName, inSentence, restDaysText, subjectOf } from "@/lib/view";
import { weeksRun } from "@/lib/week";

/** Where a row of the rules leads. */
type Panel = "often" | "howmuch" | "long" | "start" | "track" | "off" | "asks";

const PANEL_TITLE: Record<Panel, string> = {
  often: "How often?",
  howmuch: "How much is OK?",
  long: "For how long?",
  start: "When does it start?",
  track: "Track progress?",
  off: "Any days off?",
  asks: "When do we ask?",
};

/** Edit pact, from the pact's menu (creator only). Full screen, so the pickers have room. */
export function EditPact({ b, me, open, onClose }: { b: PactBundle; me: string; open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <Editor b={b} me={me} onClose={onClose} />}</AnimatePresence>;
}

function Editor({ b, me, onClose }: { b: PactBundle; me: string; onClose: () => void }) {
  const { pact } = b;
  const isBreak = pact.kind === "break";
  const router = useRouter();
  const [title, setTitle] = useState(pact.title);
  const [subject, setSubject] = useState(subjectOf(pact));
  const [emoji, setEmoji] = useState(pact.emoji);
  const [color, setColor] = useState(pact.color);
  const [d, setD] = useState<RuleDraft>(() => draftOf(pact));
  const [start, setStart] = useState(pact.start_date);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const set = (patch: Partial<RuleDraft>) => setD((x) => ({ ...x, ...patch }));

  // someone can log something while this is open: the rules lock under you, the rest carries on
  const lock = editLock(b, me);
  const at = lock ? null : panel;

  const weekly = isBreak ? d.mode === "days" : d.cadence === "weekly";
  const starts = startChoices(pact.start_date, b.today, weekly);
  // a Monday picked for a weekly pact isn't on offer once it's daily: back to where it starts now
  const startDay = starts.includes(start) ? start : pact.start_date;
  const saved = draftRules(draftOf(pact), pact.kind, pact.start_date);
  const rules = lock ? rulesOf(pact) : draftRules(d, pact.kind, startDay);
  const rulesDirty = !lock && !sameRules(saved, rules);
  const name = isBreak ? subject.trim() : title.trim();
  const lookDirty = emoji !== pact.emoji || color !== pact.color || (isBreak ? inSentence(name) !== inSentence(subjectOf(pact)) : name !== pact.title);

  const mode = isBreak ? (rules.cadence === "weekly" ? "days" : rules.measure === "count" ? "amount" : "none") : "none";
  const shownTitle = isBreak ? (rulesDirty || lookDirty ? breakTitle(name, mode) : pact.title) : name;
  const others = b.members.filter((m) => m.user_id !== me);
  // a unit still being typed would save as something else ("times")
  const missing = lock ? null : isBreak ? (d.mode === "amount" && !d.limitUnit.trim() ? "howmuch" : null) : d.measure === "count" && !d.unit.trim() ? "track" : null;
  const end = addDays(rules.start_date, rules.duration_days - 1);
  const over = end < b.today;
  const canSave = !busy && name.length > 0 && !missing && !(rulesDirty && over) && (lookDirty || rulesDirty);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (at ? setPanel(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [at, onClose]);

  async function save() {
    setBusy(true);
    const res = await editPact({
      pactId: pact.id,
      title: isBreak ? undefined : name,
      subject: isBreak ? name : undefined,
      emoji,
      color,
      rules: rulesDirty
        ? {
            cadence: rules.cadence,
            timesPerWeek: rules.times_per_week,
            durationDays: rules.duration_days,
            startDate: rules.start_date,
            measure: rules.measure,
            direction: rules.direction,
            unit: rules.unit,
            target: rules.target,
            restDays: rules.rest_days,
            limitStep: rules.limit_step,
            askNextMorning: rules.ask_next_morning,
          }
        : undefined,
    });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    if (res.data?.locked) toast(lookDirty ? "Someone just logged a day, so only the name and look were saved" : "Someone just logged a day, so the rules can't change now", "error");
    else toast("Saved");
    onClose();
    router.refresh();
  }

  async function undo(day: string) {
    setBusy(true);
    const res = await undoCheckIn({ pactId: pact.id, day });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Check-in removed");
    router.refresh();
  }

  const weeks = rules.duration_days / 7;
  const limitText = rules.measure === "count" ? `Up to ${rules.target} ${rules.unit ?? ""} a day${rules.limit_step ? `, ${rules.limit_step} less each week` : ""}`.replace(/ +/g, " ") : "";
  const rows: { panel: Panel; k: string; v: string }[] = [
    isBreak
      ? { panel: "howmuch", k: "How much is OK", v: mode === "days" ? `${7 - rules.times_per_week} ${rules.times_per_week === 6 ? "day" : "days"} a week` : mode === "amount" ? limitText : "None at all" }
      : { panel: "often", k: "How often", v: rules.cadence === "daily" ? "Every day" : rules.times_per_week === 1 ? "Once a week" : `${rules.times_per_week} times a week` },
    { panel: "long", k: "How long", v: rules.cadence === "daily" ? `${rules.duration_days} days` : `${weeks} weeks` },
    { panel: "start", k: rules.start_date < b.today ? "Started" : "Starts", v: capitalize(startLabel(rules.start_date, b.today)) },
    ...(isBreak
      ? [
          ...(rules.cadence === "daily" ? [{ panel: "off" as const, k: "Days off", v: rules.rest_days ? restDaysText(rules.rest_days).replace("except ", "") : "None" }] : []),
          { panel: "asks" as const, k: "Asks", v: rules.ask_next_morning ? "The next morning" : "From 6pm, or the next morning" },
        ]
      : [{ panel: "track" as const, k: "Tracking", v: capitalize(trackText(rules)) }]),
  ];

  const freezes = freezesFor(rules.cadence, rules.duration_days);
  const comeBack = rulesDirty && rules.start_date !== pact.start_date && b.state.freezesUsed > 0;
  const told = others.length === 1 ? firstName(others[0].name) : "everyone else";
  // direction alone with nothing to say about it changes no words, so nobody is told
  const tells = rulesDirty && others.length > 0 && ruleChanges(rulesOf(pact), rules, pact.kind, b.today).length > 0;

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Edit pact"
      data-color={color}
      className="fixed inset-0 z-50 mx-auto flex max-w-[440px] flex-col bg-mist text-ink"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 420, damping: 40 }}
    >
      <div className="flex shrink-0 items-center px-4 pt-safe">
        <button onClick={() => (at ? setPanel(null) : onClose())} aria-label={at ? "Back" : "Close"} className="-ml-1 flex h-14 w-11 items-center justify-center">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            {at ? (
              <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
        <h2 className="flex-1 pr-10 text-center text-[18px] font-extrabold">{at ? "" : "Edit pact"}</h2>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        {at ? (
          <div className="pt-2">
            <h3 className="display text-[40px] font-extrabold">{at === "howmuch" ? `How much ${inSentence(name) || "of it"} is OK?` : PANEL_TITLE[at]}</h3>
            <div className="mt-6">
              {at === "often" && <CadencePicker d={d} set={set} />}
              {at === "howmuch" && (
                <div className="space-y-4">
                  <HowMuchPicker d={d} set={set} />
                  {d.mode === "amount" && (
                    <div className="rounded-[22px] bg-paper p-4">
                      <LimitStepPicker d={d} set={set} />
                    </div>
                  )}
                </div>
              )}
              {at === "long" && <LengthPicker weekly={weekly} value={d.durationDays} onPick={(durationDays) => set({ durationDays })} />}
              {at === "start" && <StartPicker days={starts} value={startDay} today={b.today} weekly={weekly} onPick={setStart} />}
              {at === "track" && <TrackPicker d={d} set={set} />}
              {at === "off" && (
                <div className="rounded-[22px] bg-paper p-4">
                  <RestDaysPicker d={d} set={set} />
                </div>
              )}
              {at === "asks" && (
                <div className="space-y-3" role="radiogroup" aria-label="When we ask">
                  <Choice selected={!d.askNextMorning} onClick={() => set({ askNextMorning: false })} title="From 6pm" body="You can also answer the next morning." />
                  <Choice selected={d.askNextMorning} onClick={() => set({ askNextMorning: true })} title="The next morning" body="For habits that run into the night, like no phone after 10pm." />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-[24px] bg-[var(--pact)] p-4 text-[var(--pact-ink)] transition-colors">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-[26px]" aria-hidden>
                {emoji}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[20px] font-extrabold">{shownTitle || "Your pact"}</p>
                <p className="text-[14px] font-medium opacity-80">{cadenceText({ ...pact, ...rules })}</p>
              </div>
            </div>

            <section className="space-y-3 rounded-[24px] bg-paper p-4">
              <label className="block">
                <span className="mb-2 block text-[15px] font-bold text-ink-2">{isBreak ? "What you're giving up" : "Name"}</span>
                <input
                  maxLength={isBreak ? 40 : 60}
                  value={isBreak ? subject : title}
                  onChange={(e) => (isBreak ? setSubject(e.target.value) : setTitle(e.target.value))}
                  className="h-14 w-full rounded-2xl bg-mist px-4 text-[18px] font-semibold outline-none focus:ring-2 focus:ring-blue"
                />
              </label>
              <IconPicker kind={pact.kind} value={emoji} onPick={setEmoji} className="-mx-4 px-4" />
              <ColorPicker value={color} onPick={setColor} on="paper" />
            </section>

            {lock ? (
              <section className="rounded-[24px] bg-ink/[0.06] px-4 py-1.5">
                <dl>
                  {rows.map((r) => (
                    <div key={r.panel} className="flex min-h-12 items-center justify-between gap-4 text-[16px]">
                      <dt className="shrink-0 text-ink-2">{r.k}</dt>
                      <dd className="text-right font-semibold text-ink-2">{r.v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : (
              <section className="divide-y divide-mist rounded-[24px] bg-paper px-4 py-1.5">
                {rows.map((r) => (
                  <button key={r.panel} onClick={() => setPanel(r.panel)} className="flex min-h-13 w-full items-center gap-4 py-2 text-left text-[16px]">
                    <span className="shrink-0 text-ink-2">{r.k}</span>
                    <span className={`min-w-0 flex-1 text-right font-bold ${missing === r.panel ? "text-ember" : ""}`}>{missing === r.panel ? "Say what you're counting" : r.v}</span>
                    <svg viewBox="0 0 12 12" width="12" height="12" className="shrink-0 text-ink-3" aria-hidden>
                      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </section>
            )}

            {lock ? (
              <div className="px-1 text-[15px] leading-snug text-ink-2">
                <p>
                  {lockText(lock, pact.kind, me)}
                  {lock.undo ? "" : " New rules can start with the next round."}
                </p>
                {lock.undo && (
                  <button disabled={busy} onClick={() => (confirmUndo ? undo(lock.undo!) : setConfirmUndo(true))} className={`h-11 font-bold ${confirmUndo ? "text-ember" : "text-blue"}`}>
                    {confirmUndo ? "Tap again to remove today's check-in" : "Undo today's check-in to change these"}
                  </button>
                )}
              </div>
            ) : (
              <p className="px-1 text-[15px] leading-snug text-ink-2">
                {rulesDirty && over
                  ? "That would already be over. Pick a later start or a longer pact."
                  : `Ends ${formatDay(end, { day: "numeric", month: "short" })}. Everyone gets ${freezes} ${freezes === 1 ? "freeze" : "freezes"}.${rules.cadence === "weekly" ? ` Weeks run ${weeksRun(rules.start_date)}.` : ""}${comeBack ? " Freezes spent on days nobody logged come back." : ""}`}
                {tells && !over && <b className="text-ink"> {isBreak ? `${capitalize(told)} will see what changed the next time they open it.` : `${capitalize(told)} will be told what changed.`}</b>}
                {!rulesDirty && " You can change these until someone checks in."}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pt-2 pb-safe">
        {at ? (
          <button onClick={() => setPanel(null)} className="mb-2 h-16 w-full rounded-[22px] bg-ink text-[18px] font-extrabold text-white">
            Done
          </button>
        ) : (
          <button disabled={!canSave} onClick={save} className="mb-2 h-16 w-full rounded-[22px] bg-blue text-[18px] font-extrabold text-white transition-opacity disabled:opacity-40">
            {busy ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** For whoever joined under different rules: what the creator changed since. Goes away once they've logged something. */
export function ChangedCard({ b, me }: { b: PactBundle; me: string }) {
  const changed = changedSince(b, me);
  if (!changed) return null;
  const who = firstName(b.allMembers.find((m) => m.user_id === b.pact.created_by)?.name ?? "Someone");
  return (
    <section className="rounded-[24px] bg-paper p-5">
      <p className="text-[19px] leading-tight font-extrabold">{who} changed this pact</p>
      <ul className="mt-2 space-y-1 text-[15px] leading-snug text-ink-2">
        {changed.changes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </section>
  );
}
