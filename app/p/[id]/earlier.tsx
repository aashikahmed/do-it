"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { setDays } from "@/lib/client-actions";
import { ValueInput } from "@/components/measure-input";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { batchText, canChangeDay, catchUpRun, periodOf, previewDays, type DayAnswer, type DayInputs, type EmptyRun } from "@/lib/activity";
import type { PactBundle } from "@/lib/data";
import { addDays, diffDays, formatDay, type Day } from "@/lib/dates";
import { formatValue, pactDays } from "@/lib/measure";
import { isRestDay, limitOn } from "@/lib/streak";
import { DaySheet, rowForDay, shortDay } from "./activity";

/**
 * Earlier days: your round as a calendar (the log sheet's Earlier tab) and the catch-up card for when you come back
 * after a few days with nothing logged. Both end in the same form as Change a day (set_day / set_days).
 */

// ───────────────────────── your days, as a calendar ─────────────────────────

type Look = "did" | "missed" | "frozen" | "empty" | "out" | "open" | "off" | "today" | "locked";

/** what one of your days looks like: done, missed, covered by a freeze, empty and counted, empty while you weren't counted */
function lookOf(b: PactBundle, me: string, day: Day): Look {
  const { pact, state } = b;
  if (day === b.today) return "today";
  if (isRestDay(pact, day)) return "off";
  const member = b.members.find((m) => m.user_id === me);
  if (day !== b.yesterday && !canChangeDay(pact, member, day, b.today)) return "locked";
  const p = periodOf(state, day);
  const covered =
    !!p &&
    (b.freezes.some((f) => f.period_start === p.start && (f.covers === me || !f.covers)) ||
      state.autoFreezes.some((a) => a.period === p.start && a.covers === me));
  const c = b.checkins.find((x) => x.user_id === me && x.day === day);
  if (c) {
    const limit = limitOn(pact, day);
    const over = limit !== null && c.value !== null && c.value > limit;
    return over ? (covered ? "frozen" : "missed") : "did";
  }
  if (b.misses.some((m) => m.user_id === me && m.day === day)) return covered ? "frozen" : "missed";
  if (!p) return "out";
  const counted = p.required.includes(me) || p.paused.includes(me);
  if (!counted) return "out";
  if (p.end >= b.today) return "open";
  const need = Math.min(state.need, diffDays(p.start, p.end) + 1);
  if ((p.counts[me] ?? 0) >= need) return "open";
  return covered ? "frozen" : "empty";
}

const LOOK: Record<Look, CSSProperties> = {
  did: { backgroundColor: "var(--pact)", color: "var(--pact-ink)" },
  missed: { backgroundColor: "#ffe2db", color: "#c4381b" },
  frozen: { backgroundColor: "color-mix(in srgb, var(--color-ice) 45%, white)", color: "var(--color-ink)" },
  empty: { boxShadow: "inset 0 0 0 2px var(--color-ember)", color: "#c4381b" },
  out: {
    boxShadow: "inset 0 0 0 1.5px var(--color-ink-3)",
    backgroundImage: "repeating-linear-gradient(135deg, transparent 0 4px, var(--color-line) 4px 6px)",
    color: "var(--color-ink-2)",
  },
  open: { boxShadow: "inset 0 0 0 1.5px var(--color-line)", color: "var(--color-ink-2)" },
  off: {
    boxShadow: "inset 0 0 0 1.5px var(--color-line)",
    backgroundImage: "radial-gradient(var(--color-line) 1px, transparent 1.4px)",
    backgroundSize: "6px 6px",
    color: "var(--color-ink-3)",
  },
  today: { boxShadow: "inset 0 0 0 2px var(--color-ink)", color: "var(--color-ink)" },
  locked: { color: "var(--color-ink-3)", opacity: 0.45 },
};

/** your round, oldest first, columns starting on the pact's own weekday; tap a day you can fill in or change */
export function RoundCalendar({ b, me, onPick }: { b: PactBundle; me: string; onPick: (d: Day) => void }) {
  const days = pactDays(b.pact.start_date, b.pact.duration_days, b.today);
  const isBreak = b.pact.kind === "break";
  const said: Record<Look, string> = {
    did: isBreak ? "stayed off it" : "done",
    missed: isBreak ? "gave in" : "missed",
    frozen: "covered by a freeze",
    empty: "nothing logged",
    out: "nothing logged, you weren't counted",
    open: "nothing logged",
    off: "day off",
    today: "today",
    locked: "can't be changed",
  };
  const legend: [Look, string][] = [
    ["did", isBreak ? "Stayed off it" : "Done"],
    ["missed", isBreak ? "Gave in" : "Missed"],
    ["frozen", "Freeze"],
    ["empty", "Nothing logged"],
    ["out", "Paused or not started"],
  ];
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const look = lookOf(b, me, d);
          const tappable = look !== "off" && look !== "today" && look !== "locked";
          return (
            <button
              key={d}
              type="button"
              disabled={!tappable}
              onClick={() => onPick(d)}
              aria-label={`${formatDay(d, { weekday: "long", day: "numeric", month: "long" })}: ${said[look]}`}
              className="flex aspect-square items-center justify-center rounded-[10px] text-[12px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--pact)] disabled:cursor-default"
              style={LOOK[look]}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-bold text-ink-3">
        {legend.map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-[4px]" style={LOOK[k]} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** is there a day before yesterday you could fill in or change? */
export function hasEarlierDays(b: PactBundle, me: string) {
  const member = b.members.find((m) => m.user_id === me);
  for (let d = b.pact.start_date; d < b.yesterday; d = addDays(d, 1)) if (canChangeDay(b.pact, member, d, b.today)) return true;
  return false;
}

/** the Earlier tab: pick a day, then the day's form. Yesterday hands back to its own tab when there is one. */
export function EarlierPanel({ b, me, onYesterday, onDone }: { b: PactBundle; me: string; onYesterday?: () => void; onDone: () => void }) {
  const [day, setDay] = useState<Day | null>(null);
  if (day) return <DaySheet key={day} b={b} me={me} row={rowForDay(b, me, day)} onClose={onDone} onBack={() => setDay(null)} />;
  return (
    <div>
      <p className="mb-3 text-[15px] text-ink-2">Tap a day to fill it in or change it.</p>
      <RoundCalendar b={b} me={me} onPick={(d) => (d === b.yesterday && onYesterday ? onYesterday() : setDay(d))} />
    </div>
  );
}

/** the same, in a sheet of its own (break pacts, whose today sheet has no tabs) */
export function EarlierSheet({ b, me, open, onClose }: { b: PactBundle; me: string; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Your days">
      {open && <EarlierPanel b={b} me={me} onDone={onClose} />}
    </Sheet>
  );
}

// ───────────────────────── catch-up ─────────────────────────

const SKIP_KEY = (pact: string) => `doit:catchup-skip:${pact}`;
const LATER_KEY = (pact: string) => `doit:catchup-later:${pact}`;

const storeListeners = new Set<() => void>();
function subscribeStore(fn: () => void) {
  storeListeners.add(fn);
  return () => storeListeners.delete(fn);
}
function readStore(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  storeListeners.forEach((fn) => fn());
}

/** the run the card offers: days you skipped in an earlier catch-up don't count, and "Not now" holds until the run grows */
function useCatchUp(b: PactBundle, me: string): EmptyRun | null {
  const skipped = useSyncExternalStore(subscribeStore, () => readStore(SKIP_KEY(b.pact.id)), () => "");
  const later = useSyncExternalStore(subscribeStore, () => readStore(LATER_KEY(b.pact.id)), () => "x");
  const member = b.members.find((m) => m.user_id === me);
  if (!member || b.state.phase === "upcoming") return null;
  const skip = new Set(skipped.split(",").filter(Boolean));
  const misses = [...b.misses, ...[...skip].map((day) => ({ user_id: me, day, created_at: "" }))];
  const run = catchUpRun(b.pact, b.state, b.checkins, misses, { id: me, joined_on: member.joined_on, left_on: member.left_on }, b.today);
  if (!run || later === `${run.start}|${run.days.length}`) return null;
  return run;
}

/** At the top of the Today tab after 3 or more of your days with nothing logged: fill them in, one at a time. */
export function CatchUpCard({ b, me }: { b: PactBundle; me: string }) {
  const run = useCatchUp(b, me);
  const [open, setOpen] = useState(false);
  if (!run) return null;
  const n = run.days.length;
  const paused = !!b.state.paused[me];
  const started = b.state.countsFrom[me] !== null;
  const why = paused ? "Fill them in and you're back in the chain." : !started ? "Fill them in and your days start counting." : "Fill them in so your days are right.";
  return (
    <section className="rounded-[24px] bg-[var(--pact)] p-4 text-[var(--pact-ink)]">
      <p className="text-[17px] font-extrabold">You have {n} days with nothing logged</p>
      <p className="mt-0.5 text-[15px] opacity-90">
        {diffDays(run.start, b.today) < 7
          ? `${formatDay(run.start, { weekday: "long" })} to ${formatDay(run.end, { weekday: "long" })}`
          : `${shortDay(run.start)} to ${shortDay(run.end)}`}
        . {why}
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setOpen(true)} className="h-11 flex-1 rounded-2xl bg-white text-[15px] font-extrabold text-ink">
          Catch up
        </button>
        <button onClick={() => writeStore(LATER_KEY(b.pact.id), `${run.start}|${n}`)} className="h-11 rounded-2xl bg-white/20 px-4 text-[15px] font-bold">
          Not now
        </button>
      </div>
      {open && <CatchUpSheet b={b} me={me} days={run.days} onClose={() => setOpen(false)} />}
    </section>
  );
}

type Answer = { did: boolean; value: number | null } | "skip";

function CatchUpSheet({ b, me, days, onClose }: { b: PactBundle; me: string; days: Day[]; onClose: () => void }) {
  const { pact } = b;
  const isBreak = pact.kind === "break";
  const amount = isBreak && pact.measure === "count";
  const tracked = !isBreak && pact.measure !== "none";
  const lastValue = b.checkins.find((c) => c.user_id === me && c.value !== null)?.value ?? pact.target ?? null;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<Day, Answer>>({});
  const [value, setValue] = useState<number | null>(amount ? 0 : tracked ? lastValue : null);
  const [busy, setBusy] = useState(false);
  // changing one answer from the summary goes straight back to it
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const day = days[step];

  function go(to: number) {
    setStep(to);
    const a = answers[days[to]];
    if (to < days.length) setValue(a && a !== "skip" && a.value !== null ? a.value : amount ? 0 : tracked ? lastValue : null);
  }
  function answer(a: Answer) {
    setAnswers((x) => ({ ...x, [day]: a }));
    if (editing) setEditing(false);
    go(editing ? days.length : step + 1);
  }

  const chosen: DayAnswer[] = days.flatMap((d) => {
    const a = answers[d];
    return a && a !== "skip" ? [{ day: d, did: a.did, value: a.value }] : [];
  });
  const skipped = days.filter((d) => answers[d] === "skip");
  const inputs: DayInputs = { pact, members: b.allMembers, checkins: b.checkins, misses: b.misses, freezes: b.freezes, today: b.today };
  const summary = step >= days.length && chosen.length ? batchText(b.state, previewDays(inputs, me, chosen), me, chosen, pact.cadence === "weekly" ? "week" : "day") : null;
  const tone = summary?.tone === "good" ? "bg-mint/15" : summary?.tone === "warn" ? "bg-ember/10" : "bg-mist";

  function rememberSkips() {
    if (!skipped.length) return;
    const prev = readStore(SKIP_KEY(pact.id)).split(",").filter(Boolean);
    writeStore(SKIP_KEY(pact.id), [...new Set([...prev, ...skipped])].join(","));
  }

  async function save() {
    if (busy) return;
    if (!chosen.length) {
      rememberSkips();
      return onClose();
    }
    setBusy(true);
    const res = await setDays({ pactId: pact.id, days: chosen });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    rememberSkips();
    toast(chosen.length === 1 ? "Saved 1 day" : `Saved ${chosen.length} days`);
    onClose();
    router.refresh();
  }

  const label = (a: Answer | undefined) => {
    if (!a || a === "skip") return "Skipped";
    if (amount) return a.value !== null ? `Had ${formatValue(pact, a.value)}` : "Answered";
    if (!a.did) return isBreak ? "Gave in" : "Missed it";
    if (isBreak) return "Stayed off it";
    return a.value !== null && tracked ? `Did ${formatValue(pact, a.value)}` : "Did it";
  };
  const limit = day ? limitOn(pact, day) : null;
  const title = step >= days.length ? `Your ${days.length} days` : `${step + 1} of ${days.length}`;

  return (
    <Sheet open onClose={onClose} title={title}>
      {step < days.length ? (
        <div>
          <div className="mb-5 flex gap-1" aria-hidden>
            {days.map((d, i) => (
              <i key={d} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-ink" : "bg-line"}`} />
            ))}
          </div>
          <p className="text-[24px] leading-tight font-extrabold">
            {isBreak ? `How did ${formatDay(day, { weekday: "long" })} go?` : `${formatDay(day, { weekday: "long", day: "numeric", month: "short" })}. Did you do it?`}
          </p>
          <p className="mt-1 text-[15px] text-ink-3">
            {amount
              ? `How many ${pact.unit ?? ""} did you have?${limit !== null ? ` Your limit was ${formatValue(pact, limit)}.` : ""}`
              : isBreak
                ? formatDay(day, { day: "numeric", month: "long" })
                : pact.title}
          </p>
          {(tracked || amount) && (
            <div className="mt-4 rounded-2xl bg-mist/60 p-2">
              <ValueInput t={pact} value={value} onChange={setValue} size="md" />
            </div>
          )}
          <div className="mt-5 grid gap-2">
            {amount ? (
              <button onClick={() => answer({ did: true, value })} className="h-14 rounded-2xl bg-ink text-[17px] font-extrabold text-white">
                Next
              </button>
            ) : (
              <>
                <button onClick={() => answer({ did: true, value: tracked ? value : null })} className="h-14 rounded-2xl bg-ink text-[17px] font-extrabold text-white">
                  {isBreak ? "I stayed off it" : "I did it"}
                </button>
                <button onClick={() => answer({ did: false, value: null })} className="h-14 rounded-2xl bg-mist text-[17px] font-bold">
                  {isBreak ? "I gave in" : "I missed it"}
                </button>
              </>
            )}
            <button onClick={() => answer("skip")} className="h-11 text-[15px] font-bold text-ink-2">
              Not sure, skip it
            </button>
            {/* always takes its space, so the answer buttons never move between days */}
            <button
              onClick={() => go(step - 1)}
              disabled={step === 0 || editing}
              className="h-9 text-[14px] font-semibold text-ink-3 disabled:invisible"
            >
              {step > 0 ? `Back to ${formatDay(days[step - 1], { weekday: "long" })}` : "Back"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <ul className="rounded-2xl bg-mist/60 px-4 py-1">
            {days.map((d, i) => (
              <li key={d} className="border-b border-line last:border-0">
                <button
                  onClick={() => {
                    setEditing(true);
                    go(i);
                  }}
                  className="flex h-11 w-full items-center justify-between text-[15px]" aria-label={`${shortDay(d)}: ${label(answers[d])}. Change it.`}>
                  <span className="text-ink-2">{shortDay(d)}</span>
                  <b className={answers[d] !== "skip" && answers[d] && !(answers[d] as { did: boolean }).did ? "text-ember" : ""}>{label(answers[d])}</b>
                </button>
              </li>
            ))}
          </ul>
          {summary && <p className={`mt-4 rounded-2xl px-4 py-3 text-[15px] leading-snug ${tone}`}>{summary.text}</p>}
          <button disabled={busy} onClick={save} className="mt-5 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-40">
            {busy ? "Saving…" : chosen.length ? `Save ${chosen.length === 1 ? "1 day" : `${chosen.length} days`}` : "Done"}
          </button>
          <p className="mt-2 mb-2 text-center text-[13px] text-ink-3">Tap a day to change your answer. Your partners see these days as changed.</p>
        </div>
      )}
    </Sheet>
  );
}
