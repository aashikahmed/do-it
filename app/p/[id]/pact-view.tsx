"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { applyFreeze, askForHelp, callMiss, checkIn, leavePact, nudge, saveCravingPlan, startNextRound, undoCheckIn, updateCheckIn } from "@/lib/client-actions";
import { Avatar } from "@/components/avatar";
import { Burst } from "@/components/burst";
import { BottomDock } from "@/components/bottom-dock";
import { Chain } from "@/components/chain";
import { HoldButton } from "@/components/hold-button";
import { Live } from "@/components/live";
import { PushCard } from "@/components/push";
import { Sheet } from "@/components/sheet";
import { ShareInvite } from "@/components/share-invite";
import { toast } from "@/components/toast";
import type { Checkin, Me, PactBundle } from "@/lib/data";
import { addDays, diffDays, formatDay, todayIn } from "@/lib/dates";
import {
  allowedDays,
  answerOn,
  cadenceText,
  capitalize,
  firstName,
  listNames,
  makeUpLabel,
  othersOwingMakeUp,
  owesMakeUp,
  owesYesterdayAnswer,
  progressText,
  startsText,
  subjectOf,
} from "@/lib/view";
import { limitOn, type Period } from "@/lib/streak";
import { FEELS, formatAvg, formatValue, isBetter, progressStats, targetText, type Feel, type Tracking } from "@/lib/measure";
import { keptCount, type Series } from "@/lib/rounds";
import { logAvatarTap } from "@/lib/track";
import { FeelPicker, ValueInput } from "@/components/measure-input";
import { ProgressView } from "@/components/progress-view";

export function PactView({ b, me, series }: { b: PactBundle; me: Me; series: Series | null }) {
  const { pact, state, members } = b;
  const [menuOpen, setMenuOpen] = useState(false);
  const [burst, setBurst] = useState<{ title: string; subtitle?: string } | null>(null);
  useFinishMoment(b, setBurst);
  const [tab, setTab] = useState<"today" | "progress">("today");
  const isSolo = members.length === 1;

  return (
    <main data-color={pact.color} className="min-h-dvh pb-6">
      <Live pactIds={[pact.id]} days={[{ tz: pact.timezone, today: b.today }]} />
      <Hero b={b} onMenu={() => setMenuOpen(true)} />

      {state.phase !== "upcoming" && (
        <div className="sticky top-0 z-20 bg-mist/90 px-4 pt-safe pb-1 backdrop-blur-md [padding-top:max(env(safe-area-inset-top),8px)]">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-paper p-1" role="tablist" aria-label="Pact view">
            {(["today", "progress"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`h-10 rounded-full text-[15px] font-extrabold transition-colors ${tab === k ? "bg-ink text-white" : "text-ink-2"}`}
              >
                {k === "today" ? (state.phase === "ended" ? "Summary" : pact.cadence === "daily" ? "Today" : "This week") : "Progress"}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "progress" ? (
        <div className="px-4 pt-3">
          <ProgressView b={b} me={me} />
        </div>
      ) : (
      <div className="space-y-3 px-4 pt-3">
        {pact.kind === "break" ? (
          owesYesterdayAnswer(b, me.id) || state.late ? <YesterdayCard b={b} me={me.id} onCelebrate={setBurst} /> : state.repair && <RepairCard b={b} />
        ) : state.late ? (
          <MakeUpCard b={b} me={me.id} onCelebrate={setBurst} />
        ) : (
          state.repair && <RepairCard b={b} />
        )}
        {state.phase === "ended" ? (
          <>
            <Recap b={b} me={me} />
            <GoAgain b={b} me={me} series={series} />
            {series && series.rounds.length > 1 && <AllRounds b={b} series={series} />}
          </>
        ) : (
          <>
            {isSolo && <SoloInvite b={b} />}
            {!isSolo && <PushCard partner={firstName(members.find((m) => m.user_id !== me.id)?.name ?? "")} />}
            <Roster b={b} me={me} />
          </>
        )}
        <Activity b={b} me={me} />
      </div>
      )}

      {state.phase === "active" && (pact.kind === "break" ? <BreakBar b={b} me={me} onCelebrate={setBurst} /> : <ActionBar b={b} me={me} onCelebrate={setBurst} />)}
      {state.phase === "upcoming" && (
        <BottomDock className="bg-gradient-to-t from-mist via-mist to-transparent px-4 pt-10 pb-safe" estimate={110}>
          <div className="rounded-[22px] bg-paper p-4 text-center text-[17px] font-bold">{startsText(pact.start_date, b.today)}. Check-ins open then.</div>
        </BottomDock>
      )}

      <MenuSheet b={b} me={me} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <Burst show={!!burst} title={burst?.title ?? ""} subtitle={burst?.subtitle} onDone={() => setBurst(null)} />
    </main>
  );
}

// ───────────────────────── hero ─────────────────────────

function Hero({ b, onMenu }: { b: PactBundle; onMenu: () => void }) {
  const { pact, state } = b;
  const ended = state.phase === "ended";
  const currentIndex = state.current?.index ?? null;
  const shown = useMemo(() => chainWindow(state.periods, currentIndex), [state.periods, currentIndex]);
  const big = ended ? keptCount(state) : state.streak;
  const unit = pact.cadence === "daily" ? "day" : "week";
  const isBreak = pact.kind === "break";
  const label = ended
    ? `of ${state.periods.length} ${unit}s kept`
    : !isBreak || pact.cadence === "weekly"
      ? `${unit} streak`
      : pact.measure === "count"
        ? `${big === 1 ? "day" : "days"} within your limit`
        : `${big === 1 ? "day" : "days"} without ${subjectOf(pact)}`;

  return (
    <section className="bg-[var(--pact)] px-5 pt-safe pb-7 text-[var(--pact-ink)]">
      <div className="flex items-center justify-between pt-1">
        <Link href="/" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full" aria-label="Back to today">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <button onClick={onMenu} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full" aria-label="Pact options">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            <circle cx="5" cy="12" r="2.2" fill="currentColor" />
            <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            <circle cx="19" cy="12" r="2.2" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-[34px]" aria-hidden>
          {pact.emoji}
        </span>
        <div className="min-w-0">
          <h1 className="text-[24px] leading-tight font-extrabold tracking-tight">{pact.title}</h1>
          <p className="text-[15px] font-medium opacity-80">
            {cadenceText(pact)}
            {!isBreak && targetText(pact) ? `. ${targetText(pact)}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <motion.p
            key={big}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="display tnum text-[112px] font-extrabold"
          >
            {big}
          </motion.p>
          <p className="mt-1 text-[17px] font-bold">
            {label}
            {state.late && !isBreak && <span className="ml-2 rounded-full bg-white/20 px-2.5 py-0.5 text-[14px] font-extrabold">on the line</span>}
          </p>
        </div>
        <dl className="space-y-1 pb-1 text-right text-[14px] font-semibold opacity-90">
          <div>
            <dt className="sr-only">Progress</dt>
            <dd>{progressText(b)}</dd>
          </div>
          <div>
            <dt className="sr-only">Best streak</dt>
            <dd>{ended ? `Best streak ${state.best}` : `Best ${state.best}`}</dd>
          </div>
          {!ended && (
            <div>
              <dt className="sr-only">Freezes</dt>
              <dd>
                🧊 {state.freezesLeft} {state.freezesLeft === 1 ? "freeze" : "freezes"} left
              </dd>
            </div>
          )}
        </dl>
      </div>

      {state.phase !== "upcoming" && (
        <div className="mt-6">
          <Chain periods={shown} perRow={7} fluid />
          {shown.length < state.periods.length && (
            <p className="mt-2 text-[13px] font-medium opacity-70">
              Showing {pact.cadence === "daily" ? "days" : "weeks"} {shown[0].index + 1}–{shown[shown.length - 1].index + 1} of {state.periods.length}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Long pacts: show a 6-row window around now instead of every link. */
function chainWindow<T extends { index: number }>(periods: T[], current: number | null) {
  const rows = 6 * 7;
  if (periods.length <= rows) return periods;
  const anchor = current ?? periods.length - 1;
  const rowStart = Math.floor(anchor / 7) * 7;
  const start = Math.max(0, Math.min(rowStart - 4 * 7, periods.length - rows));
  return periods.slice(start, start + rows);
}

// ───────────────────────── roster ─────────────────────────

function Roster({ b, me }: { b: PactBundle; me: Me }) {
  const { pact, state, members } = b;
  const cur = state.current;
  const title = state.phase === "upcoming" ? "Who's in" : pact.cadence === "daily" ? "Today" : "This week";

  return (
    <section className="rounded-[24px] bg-paper p-2">
      <h2 className="px-3 pt-3 pb-1 text-[17px] font-extrabold">{title}</h2>
      <ul>
        {members.map((m) => {
          const isMe = m.user_id === me.id;
          const todays = b.checkins.find((c) => c.user_id === m.user_id && c.day === b.today);
          const count = cur?.counts[m.user_id] ?? 0;
          const required = cur ? cur.required.includes(m.user_id) : true;
          const done = pact.cadence === "daily" ? !!todays : count >= state.need;
          const nudged = b.nudges.some((n) => n.from_user === me.id && n.to_user === m.user_id);
          const isBreak = pact.kind === "break";
          const owesLate = isBreak ? owesYesterdayAnswer(b, m.user_id) : owesMakeUp(b, m.user_id);
          let status: string;
          if (state.phase === "upcoming") status = isMe ? "Ready" : `Joined ${formatDay(m.joined_at.slice(0, 10), { day: "numeric", month: "short" })}`;
          else if (!required) status = pact.cadence === "daily" ? "Joins the chain tomorrow" : "Joins the chain next week";
          else if (isBreak) status = breakStatus(b, m.user_id, todays);
          else if (pact.cadence === "daily") status = todays ? describe(todays, pact) : "Not yet";
          else status = `${count} of ${state.need} this week${todays ? ", done today" : ""}`;

          return (
            <li key={m.user_id} className="flex items-center gap-3 rounded-[18px] px-3 py-3">
              <Avatar
                id={m.user_id}
                name={m.name}
                src={m.avatar_url}
                size={44}
                done={state.phase === "active" && (isBreak ? answerOn(b, m.user_id, b.today) === "yes" : done)}
                onTap={isMe ? undefined : () => logAvatarTap(pact.id, m.user_id)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold">
                  {m.name}
                  {isMe && <span className="font-medium text-ink-3"> (you)</span>}
                </p>
                <p className={`truncate text-[15px] ${done ? "font-semibold text-ink" : "text-ink-2"}`}>{status}</p>
                {todays?.note && <p className="mt-0.5 line-clamp-2 text-[15px] text-ink-2">“{todays.note}”</p>}
                {owesLate && isBreak && <p className="truncate text-[14px] font-semibold text-ink-2">Hasn&apos;t answered for yesterday</p>}
                {owesLate && !isBreak && state.late && (
                  <p className="truncate text-[14px] font-bold text-[#c4381b]">Still owes {makeUpLabel(pact.cadence, state.late)}</p>
                )}
              </div>
              {!isMe && (state.phase === "active" || owesLate) && (isBreak ? owesLate : (required && !done) || owesLate) && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <WhatsAppNudge b={b} me={me} name={firstName(m.name)} yesterday={owesLate} />
                  <NudgeButton pactId={pact.id} toUser={m.user_id} name={firstName(m.name)} nudged={nudged} yesterday={owesLate} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Stayed off it today", "1 of 2 cups today", "2 of 3 days used". */
function breakStatus(b: PactBundle, userId: string, todays: Checkin | undefined) {
  const { pact, state } = b;
  const cur = state.current;
  if (cur?.rest) return "Day off";
  const t = answerOn(b, userId, b.today);
  const today = t === "yes" ? (todays?.value !== null && todays?.value !== undefined && pact.measure === "count" ? `${formatValue(pact, todays.value)} today` : "Stayed off it today") : t === "no" ? "Gave in today" : null;
  if (pact.cadence === "weekly" && cur) {
    const allowed = allowedDays(pact);
    const used = `${cur.slips[userId] ?? 0} of ${allowed} ${allowed === 1 ? "day" : "days"} used`;
    return today ? `${used}, ${t === "yes" ? "off it today" : "had some today"}` : used;
  }
  return today ?? "Not yet";
}

function describe(c: Checkin, t: Tracking) {
  const bits = ["Done"];
  if (c.value !== null && t.measure !== "none") bits.push(formatValue(t, c.value));
  if (c.feel) bits.push(FEELS[c.feel - 1].label.toLowerCase());
  return bits.join(", ");
}

/** Where a new check-in's number starts: your last logged value, else the minimum. */
function startValue(b: PactBundle, me: string) {
  const last = b.checkins.find((c) => c.user_id === me && c.value !== null);
  return last?.value ?? b.pact.target ?? null;
}

/**
 * Opens WhatsApp with a ready-made nudge; the sender picks the contact there.
 * Works for partners who haven't turned on alerts, and needs no WhatsApp integration.
 */
function WhatsAppNudge({ b, me, name, yesterday }: { b: PactBundle; me: Me; name: string; yesterday?: boolean }) {
  const iDidIt = b.checkins.some((c) => c.user_id === me.id && c.day === b.today);
  function open() {
    const url = `${window.location.origin}/p/${b.pact.id}`;
    const day = b.state.late ? makeUpLabel(b.pact.cadence, b.state.late) : "yesterday";
    const line = b.pact.kind === "break"
      ? `How did yesterday go, ${name}? You can answer until midnight.`
      : yesterday
      ? `There's still time to make up ${day}, ${name}. The chain breaks at midnight.`
      : iDidIt
        ? `I've done mine today. Your turn, ${name} 👀`
        : `Still on for today, ${name}? Let's not break the chain.`;
    // break pacts never name the habit, here either
    const text = b.pact.kind === "break" ? `${b.pact.emoji} ${line}\n${url}` : `${b.pact.emoji} ${b.pact.title}: ${line}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={open}
      aria-label={`Nudge ${name} on WhatsApp`}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25d366] text-white"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="currentColor">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.02c-.24.68-1.41 1.3-1.95 1.35-.5.05-1.13.07-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.25-4.79-4.17-4.94-4.36-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36h.56c.18 0 .42-.07.66.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.2-.14.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.3-.13.59.17.29.74 1.22 1.59 1.98 1.09.97 2.01 1.27 2.3 1.42.29.14.46.12.63-.07.17-.2.72-.84.92-1.13.19-.29.38-.24.65-.14.26.1 1.68.79 1.97.94.29.14.48.21.55.33.07.12.07.7-.17 1.38Z" />
      </svg>
    </motion.button>
  );
}

function NudgeButton({ pactId, toUser, name, nudged, yesterday }: { pactId: string; toUser: string; name: string; nudged: boolean; yesterday?: boolean }) {
  const [sent, setSent] = useState(nudged);
  const [pending, start] = useTransition();
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      disabled={sent || pending}
      onClick={() =>
        start(async () => {
          const res = await nudge({ pactId, toUser, about: yesterday ? "yesterday" : "today" });
          if (res.ok) {
            setSent(true);
            navigator.vibrate?.(10);
            toast(`Nudged ${name}`);
          } else {
            if (res.error === "Already nudged today") setSent(true);
            toast(res.error, "error");
          }
        })
      }
      className={`h-10 shrink-0 rounded-full px-4 text-[15px] font-extrabold ${sent ? "bg-mist text-ink-3" : "bg-ember text-white"}`}
    >
      {sent ? "Nudged" : pending ? "…" : "👋 Nudge"}
    </motion.button>
  );
}

// ───────────────────────── check-in ─────────────────────────

function ActionBar({ b, me, onCelebrate }: { b: PactBundle; me: Me; onCelebrate: (x: { title: string; subtitle?: string }) => void }) {
  const { pact, state } = b;
  const mineToday = b.checkins.find((c) => c.user_id === me.id && c.day === b.today);
  const mineYesterday = b.checkins.find((c) => c.user_id === me.id && c.day === b.yesterday);
  // the make-up card covers this when yesterday's link is waiting on me; this is for logging it anyway
  const canBackfill =
    !mineYesterday && !owesMakeUp(b, me.id) && b.yesterday >= pact.start_date && diffDays(pact.start_date, b.yesterday) < pact.duration_days;
  const tracked = pact.measure !== "none";
  const [value, setValue] = useState<number | null>(() => startValue(b, me.id));
  const [feel, setFeel] = useState<Feel | null>(null);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const router = useRouter();

  const myCount = state.current?.counts[me.id] ?? 0;

  async function commit() {
    if (busy) return;
    setBusy(true);
    const prevBest = b.checkins.filter((c) => c.user_id === me.id && c.value !== null).reduce<number | null>((best, c) => (best === null || isBetter(pact.direction, c.value!, best) ? c.value! : best), null);
    const res = await checkIn({ pactId: pact.id, when: "today", value: tracked ? value : null, note: note.trim() || null, feel });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");

    // predict the moment: did this close the link for everyone?
    const others = b.members.filter((m) => m.user_id !== me.id && state.current?.required.includes(m.user_id));
    const owing =
      pact.cadence === "daily"
        ? others.filter((m) => !b.checkins.some((c) => c.user_id === m.user_id && c.day === b.today))
        : others.filter((m) => (state.current?.counts[m.user_id] ?? 0) < state.need);
    const iClose = pact.cadence === "daily" || myCount + 1 >= state.need;
    const unit = pact.cadence === "daily" ? "day" : "week";
    if (owing.length === 0 && iClose && state.current?.status !== "done") {
      const n = state.streak + 1;
      onCelebrate({ title: `${n} ${n === 1 ? unit : unit + "s"}`, subtitle: b.members.length > 1 ? "Everyone's in. The chain holds." : "Link closed." });
    } else if (tracked && value !== null && prevBest !== null && isBetter(pact.direction, value, prevBest)) {
      onCelebrate({ title: "New best.", subtitle: `${formatValue(pact, value)}${owing.length ? `. ${listNames(owing.map((m) => firstName(m.name)))}'s turn now.` : ""}` });
    } else if (owing.length > 0) {
      onCelebrate({ title: "Done.", subtitle: `${listNames(owing.map((m) => firstName(m.name)))}'s turn now.` });
    } else {
      onCelebrate({ title: "Done.", subtitle: pact.cadence === "weekly" ? `${myCount + 1} of ${state.need} this week` : undefined });
    }
    setNote("");
    setFeel(null);
    setNoteOpen(false);
    router.refresh();
  }

  return (
    <BottomDock className="bg-gradient-to-t from-mist via-mist/95 to-transparent px-4 pt-10 pb-safe" estimate={tracked ? 280 : 200}>
      <AnimatePresence mode="wait" initial={false}>
        {mineToday ? (
          <motion.div
            key="done"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="flex items-center gap-3 rounded-[22px] bg-paper p-3 pl-4 shadow-[0_10px_30px_-16px_rgba(16,20,58,0.35)]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--pact)] text-[var(--pact-ink)]" aria-hidden>
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d="M5 12.5 10 17.5 19.5 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-extrabold">You did it today</p>
              <p className="truncate text-[14px] text-ink-2">
                {describe(mineToday, pact).replace(/^Done, ?/, "") || "Checked in"}
                {mineToday.note ? `, “${mineToday.note}”` : ""}
              </p>
            </div>
            <button onClick={() => setEditOpen(true)} className="h-11 rounded-full bg-mist px-4 text-[15px] font-bold">
              Edit
            </button>
          </motion.div>
        ) : (
          <motion.div key="todo" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="space-y-2">
            <div className="space-y-2.5 rounded-[22px] bg-paper p-3 shadow-[0_10px_30px_-16px_rgba(16,20,58,0.35)]">
              {tracked && <ValueInput t={pact} value={value} onChange={setValue} />}
              <FeelPicker value={feel} onChange={setFeel} />
              {noteOpen && (
                <textarea
                  autoFocus
                  rows={2}
                  maxLength={280}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything to remember about today?"
                  aria-label="Note"
                  className="w-full resize-none rounded-2xl bg-mist px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-[var(--pact)]"
                />
              )}
            </div>
            <HoldButton
              label={pact.cadence === "weekly" ? `Hold to log today (${myCount}/${state.need})` : "Hold to check in"}
              busy={busy}
              onComplete={commit}
            />
            <div className="flex justify-center gap-5 pt-0.5">
              {!noteOpen && (
                <button onClick={() => setNoteOpen(true)} className="h-9 text-[15px] font-bold text-ink-2">
                  Add a note
                </button>
              )}
              {canBackfill && (
                <button onClick={() => setBackfillOpen(true)} className="h-9 text-[15px] font-bold text-ink-2">
                  Forgot yesterday?
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {mineToday && <EditSheet b={b} c={mineToday} open={editOpen} onClose={() => setEditOpen(false)} />}
      <MakeUpSheet b={b} me={me.id} open={backfillOpen} onClose={() => setBackfillOpen(false)} onCelebrate={onCelebrate} />
    </BottomDock>
  );
}

function EntryFields({
  t,
  value,
  setValue,
  feel,
  setFeel,
  note,
  setNote,
}: {
  t: Tracking;
  value: number | null;
  setValue: (v: number | null) => void;
  feel: Feel | null;
  setFeel: (v: Feel | null) => void;
  note: string;
  setNote: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      {t.measure !== "none" && (
        <div className="rounded-2xl bg-mist/60 p-2">
          <ValueInput t={t} value={value} onChange={setValue} size="md" />
        </div>
      )}
      <FeelPicker value={feel} onChange={setFeel} />
      <textarea
        rows={3}
        maxLength={280}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything to remember? (optional)"
        aria-label="Note"
        className="w-full resize-none rounded-2xl bg-mist px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-[var(--pact)]"
      />
    </div>
  );
}

function EditSheet({ b, c, open, onClose }: { b: PactBundle; c: Checkin; open: boolean; onClose: () => void }) {
  const [value, setValue] = useState<number | null>(c.value);
  const [feel, setFeel] = useState<Feel | null>(c.feel);
  const [note, setNote] = useState(c.note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const router = useRouter();

  async function save() {
    setBusy(true);
    const res = await updateCheckIn({ pactId: b.pact.id, day: c.day, value: b.pact.measure !== "none" ? value : null, note: note.trim() || null, feel });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Saved");
    onClose();
    router.refresh();
  }

  async function undo() {
    setBusy(true);
    const res = await undoCheckIn({ pactId: b.pact.id, day: c.day });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Check-in removed");
    onClose();
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Today's check-in">
      <EntryFields t={b.pact} value={value} setValue={setValue} feel={feel} setFeel={setFeel} note={note} setNote={setNote} />
      <button disabled={busy} onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
        Save
      </button>
      <button
        disabled={busy}
        onClick={() => (confirmUndo ? undo() : setConfirmUndo(true))}
        className={`mt-2 h-14 w-full rounded-2xl text-[16px] font-bold ${confirmUndo ? "bg-ember text-white" : "text-ember"}`}
      >
        {confirmUndo ? "Tap again to remove it" : "Remove check-in"}
      </button>
    </Sheet>
  );
}

type Celebrate = (x: { title: string; subtitle?: string }) => void;

/** Log yesterday: either you did it and forgot to log, or you're doing it today to make up. Both count. */
function MakeUpSheet({ b, me, open, onClose, onCelebrate }: { b: PactBundle; me: string; open: boolean; onClose: () => void; onCelebrate: Celebrate }) {
  const { pact, state } = b;
  const [how, setHow] = useState<"forgot" | "made" | null>(null);
  const [value, setValue] = useState<number | null>(() => startValue(b, me));
  const [feel, setFeel] = useState<Feel | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const day = formatDay(b.yesterday, { weekday: "long" });
  const others = b.members.filter((m) => m.user_id !== me).map((m) => firstName(m.name));

  async function save() {
    if (!how) return;
    setBusy(true);
    const res = await checkIn({
      pactId: pact.id,
      when: "yesterday",
      madeUp: how === "made",
      value: pact.measure !== "none" ? value : null,
      note: note.trim() || null,
      feel,
    });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    onClose();
    setHow(null);
    // did this close yesterday's link? (I was the last one it was waiting on)
    const closes = !!state.late && state.late.owing.length === 1 && state.late.owing[0] === me;
    if (closes) {
      const n = state.streak + 1;
      const unit = pact.cadence === "daily" ? "day" : "week";
      onCelebrate({ title: `${capitalize(makeUpLabel(pact.cadence, state.late!))}'s back.`, subtitle: `${n} ${n === 1 ? unit : unit + "s"}. The chain holds.` });
    } else toast(`Logged for ${day}`);
    router.refresh();
  }

  const options = [
    { k: "forgot" as const, title: "I did it, I forgot to log", sub: "Shows as logged late" },
    { k: "made" as const, title: "I'm doing it today to make up", sub: "Shows as made up" },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={`Make up ${day}`}>
      <p className="mb-4 text-[16px] text-ink-2">
        It counts for {day} either way{others.length ? `. ${listNames(others)} will see which one you picked` : ""}. You have until midnight.
      </p>
      <div role="radiogroup" aria-label="What happened" className="mb-4 space-y-2">
        {options.map((o) => (
          <button
            key={o.k}
            role="radio"
            aria-checked={how === o.k}
            onClick={() => setHow(o.k)}
            className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${how === o.k ? "border-[var(--pact)] bg-[var(--pact-soft)]" : "border-line"}`}
          >
            <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ${how === o.k ? "border-[6px] border-[var(--pact)]" : "border-ink-3"}`} aria-hidden />
            <span>
              <span className="block text-[16px] font-bold">{o.title}</span>
              <span className="block text-[14px] text-ink-2">{o.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <EntryFields t={pact} value={value} setValue={setValue} feel={feel} setFeel={setFeel} note={note} setNote={setNote} />
      <button disabled={busy || !how} onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-40">
        {busy ? "Saving…" : how ? `Log for ${day}` : "Pick one first"}
      </button>
    </Sheet>
  );
}

// ───────────────────────── make-up day ─────────────────────────

/** Yesterday's link is still open until midnight: make it up, freeze it, or call it a miss. */
function MakeUpCard({ b, me, onCelebrate }: { b: PactBundle; me: string; onCelebrate: Celebrate }) {
  const { pact, state } = b;
  const late = state.late!;
  const label = makeUpLabel(pact.cadence, late);
  const iOwe = owesMakeUp(b, me);
  const others = othersOwingMakeUp(b, me);
  const [sheet, setSheet] = useState<"make" | "miss" | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // older misses in the same run: only a freeze saves those, and it has to happen before the make-up
  const older = state.repair ? state.repair.periods.filter((p) => p !== late.start) : [];
  const olderLabel =
    pact.cadence === "weekly" ? (older.length === 1 ? "The week before" : `${older.length} weeks before that`) : older.length === 1 ? formatDay(older[0], { weekday: "long" }) : `${older.length} days before that`;
  const canFreezeAll = !!state.repair && state.repair.periods.length <= state.freezesLeft;
  const n = b.members.length;
  const breaks = n === 1 ? "After that the chain breaks." : n === 2 ? "After that the chain breaks for both of you." : "After that the chain breaks for everyone.";

  async function freeze(which: "all" | "older") {
    setBusy(true);
    const res = await applyFreeze(pact.id, which);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast(which === "older" ? `🧊 Frozen. Now make up ${label}.` : "🧊 Streak saved");
    router.refresh();
  }

  return (
    <motion.section initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[24px] bg-[#ffe2db] p-5 text-ink">
      <p className="text-[20px] leading-tight font-extrabold">{iOwe ? `${capitalize(label)} is still open` : `Waiting on ${listNames(others)} for ${label}`}</p>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-2">
        {iOwe
          ? pact.cadence === "daily"
            ? `You have until midnight to make it up. ${breaks}`
            : `One more check-in, logged for yesterday, closes it. You have until midnight.`
          : `${others.length === 1 ? `${others[0]} has` : "They have"} until midnight to make it up. A nudge might help.`}
      </p>
      {older.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white/70 p-3">
          <p className="text-[15px] leading-snug font-semibold">
            {olderLabel} {older.length === 1 ? "was" : "were"} missed too, and only a freeze can save {older.length === 1 ? "it" : "them"}. Freeze first, then make up {label}.
          </p>
          <button disabled={busy} onClick={() => freeze("older")} className="mt-2 h-11 rounded-full bg-ink px-4 text-[15px] font-extrabold text-white disabled:opacity-50">
            {busy ? "Freezing…" : `🧊 Use ${older.length === 1 ? "a freeze" : `${older.length} freezes`}`}
          </button>
        </div>
      )}
      {iOwe ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setSheet("make")} className="h-12 rounded-full bg-ink px-5 text-[16px] font-extrabold text-white">
            Make it up
          </button>
          <button onClick={() => setSheet("miss")} className="h-12 rounded-full bg-ink/[0.07] px-5 text-[16px] font-bold text-ink">
            I missed it
          </button>
        </div>
      ) : (
        canFreezeAll &&
        older.length === 0 && (
          <button disabled={busy} onClick={() => freeze("all")} className="mt-4 h-11 rounded-full bg-ink/[0.07] px-4 text-[15px] font-bold text-ink disabled:opacity-50">
            {busy ? "Freezing…" : "🧊 Use a freeze instead"}
          </button>
        )
      )}
      <MakeUpSheet b={b} me={me} open={sheet === "make"} onClose={() => setSheet(null)} onCelebrate={onCelebrate} />
      <MissSheet b={b} me={me} open={sheet === "miss"} onClose={() => setSheet(null)} />
    </motion.section>
  );
}

/** "I missed it": spend a freeze, or let the link break now (partners are told, and can still freeze it). */
function MissSheet({ b, me, open, onClose }: { b: PactBundle; me: string; open: boolean; onClose: () => void }) {
  const { pact, state } = b;
  const late = state.late;
  const repair = state.repair;
  const canFreeze = !!repair && repair.periods.length <= state.freezesLeft;
  const [pick, setPick] = useState<"freeze" | "break">(canFreeze ? "freeze" : "break");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const label = late ? makeUpLabel(pact.cadence, late) : "yesterday";
  const unit = pact.cadence === "daily" ? "day" : "week";
  const others = b.members.filter((m) => m.user_id !== me).map((m) => firstName(m.name));
  const nf = repair?.periods.length ?? 1;
  const choice = canFreeze ? pick : "break";

  async function go() {
    setBusy(true);
    const res = choice === "freeze" ? await applyFreeze(pact.id, "all") : await callMiss(pact.id);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    onClose();
    toast(choice === "freeze" ? "🧊 Streak saved" : pact.cadence === "daily" ? "Starting again today" : "Starting again this week");
    router.refresh();
  }

  const options = [
    {
      k: "freeze" as const,
      title: `🧊 Use ${nf === 1 ? "a freeze" : `${nf} freezes`} (${state.freezesLeft} left)`,
      sub: `Keeps your ${repair?.previous ?? 0}-${unit} streak.${others.length ? ` Freezes are shared with ${listNames(others)}.` : ""}`,
    },
    {
      k: "break" as const,
      title: "Let it break",
      sub: `The streak starts again ${pact.cadence === "daily" ? "today" : "this week"}. Your best stays ${state.best}.`,
    },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={`${capitalize(label)} was a miss`}>
      {canFreeze ? (
        <>
          <p className="mb-4 text-[16px] text-ink-2">What should happen to the chain?</p>
          <div role="radiogroup" aria-label="What happens to the chain" className="space-y-2">
            {options.map((o) => (
              <button
                key={o.k}
                role="radio"
                aria-checked={pick === o.k}
                onClick={() => setPick(o.k)}
                className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${pick === o.k ? "border-[var(--pact)] bg-[var(--pact-soft)]" : "border-line"}`}
              >
                <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ${pick === o.k ? "border-[6px] border-[var(--pact)]" : "border-ink-3"}`} aria-hidden />
                <span>
                  <span className="block text-[16px] font-bold">{o.title}</span>
                  <span className="block text-[14px] text-ink-2">{o.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[16px] text-ink-2">
          {state.freezesLeft === 0 ? "There are no freezes left, so the chain breaks." : "There's no streak to save yet, so the chain just starts again."} Your best stays {state.best}.
        </p>
      )}
      {choice === "break" && others.length > 0 && (
        <p className="mt-3 text-[14px] text-ink-2">
          {listNames(others)} will know you called it{canFreeze ? ", and can still use a freeze today" : ""}.
        </p>
      )}
      <button disabled={busy} onClick={go} className="mt-4 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
        {busy ? "Saving…" : choice === "freeze" ? `Use ${nf === 1 ? "a freeze" : `${nf} freezes`}` : "Let it break"}
      </button>
    </Sheet>
  );
}

// ───────────────────────── freeze ─────────────────────────

function RepairCard({ b }: { b: PactBundle }) {
  const repair = b.state.repair!;
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const n = repair.periods.length;
  const unit = b.pact.cadence === "daily" ? "day" : "week";
  const first = repair.periods[0];
  const when =
    n === 1
      ? b.pact.cadence === "daily"
        ? first === b.today
          ? "today"
          : first === b.yesterday
            ? "yesterday"
            : formatDay(first, { weekday: "long" })
        : first === b.state.current?.start
          ? "this week"
          : "last week"
      : `${n} ${unit}s in a row`;

  async function use() {
    setBusy(true);
    const res = await applyFreeze(b.pact.id);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast(`🧊 Streak saved`);
    router.refresh();
  }

  return (
    <motion.section
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="rounded-[24px] bg-[#dff2ff] p-5 text-ink"
    >
      <p className="text-[20px] leading-tight font-extrabold">
        The chain broke {when}.
      </p>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-2">
        Use {n === 1 ? "a freeze" : `${n} freezes`} to bring back your {repair.previous}-{unit} streak. You have {b.state.freezesLeft} for this pact.
      </p>
      <button disabled={busy} onClick={use} className="mt-4 h-12 rounded-full bg-ink px-5 text-[16px] font-extrabold text-white disabled:opacity-50">
        {busy ? "Freezing…" : `🧊 Use ${n === 1 ? "a freeze" : `${n} freezes`}`}
      </button>
    </motion.section>
  );
}

// ───────────────────────── break a habit ─────────────────────────
// Break pacts ask one question a day: did you stay off it? Today's opens at 6pm (it isn't over before then), and
// yesterday's stays open until midnight. Nothing here pushes: notifications only go out in the morning.

const panel = "rounded-[22px] bg-paper p-4 shadow-[0_10px_30px_-16px_rgba(16,20,58,0.35)]";

function BreakBar({ b, me, onCelebrate }: { b: PactBundle; me: Me; onCelebrate: Celebrate }) {
  const { pact, state } = b;
  const what = subjectOf(pact);
  const cur = state.current;
  const answer = answerOn(b, me.id, b.today);
  const mine = b.checkins.find((c) => c.user_id === me.id && c.day === b.today);
  const amount = pact.measure === "count";
  const limit = limitOn(pact, b.today);
  const weekly = pact.cadence === "weekly";
  const allowed = allowedDays(pact);
  const left = Math.max(0, allowed - (cur?.slips[me.id] ?? 0));
  const [value, setValue] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"gave-in" | "over" | "craving" | null>(null);
  const router = useRouter();

  async function yes() {
    if (busy) return;
    if (amount && limit !== null && (value ?? 0) > limit) return setSheet("over");
    setBusy(true);
    const res = await checkIn({ pactId: pact.id, when: "today", value: amount ? (value ?? 0) : null });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    const waiting = b.members.filter((m) => m.user_id !== me.id && cur?.required.includes(m.user_id) && answerOn(b, m.user_id, b.today) !== "yes");
    if (!weekly && !waiting.length && cur?.status === "open") {
      const n = state.streak + 1;
      onCelebrate({ title: `${n} ${n === 1 ? "day" : "days"}.`, subtitle: b.members.length > 1 ? "Everyone stayed off it today." : "Another day kept." });
    } else onCelebrate({ title: "Day kept.", subtitle: waiting.length ? `${listNames(waiting.map((m) => firstName(m.name)))} can answer later.` : undefined });
    router.refresh();
  }

  async function undo() {
    setBusy(true);
    const res = await undoCheckIn({ pactId: pact.id, day: b.today });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    router.refresh();
  }

  // one question at a time: yesterday's card comes first
  const yesterdayFirst = owesYesterdayAnswer(b, me.id);
  const asking = answer === null && !cur?.rest && b.canAnswerToday && !yesterdayFirst;
  const weekLine = weekly ? (left === 0 ? `No ${what} days left this week.` : `${left} of ${allowed} ${what} ${allowed === 1 ? "day" : "days"} left this week.`) : null;
  const links = (
    <div className="flex justify-center gap-5 pt-0.5">
      {answer === null && !cur?.rest && !asking && (
        <button onClick={() => setSheet("gave-in")} className="h-9 text-[15px] font-bold text-ink-2">
          {weekly ? "I had some today" : "I gave in"}
        </button>
      )}
      <button onClick={() => setSheet("craving")} className="h-9 text-[15px] font-bold text-ink-2">
        Having a craving?
      </button>
    </div>
  );

  let content: React.ReactNode;
  if (yesterdayFirst && answer === null) {
    content = null;
  } else if (cur?.rest) {
    content = (
      <div className={panel}>
        <p className="text-[17px] font-extrabold">Day off today</p>
        <p className="mt-0.5 text-[15px] text-ink-2">No need to answer. Back to it tomorrow.</p>
      </div>
    );
  } else if (answer === "no") {
    const lost = cur?.status === "missed";
    const saved = cur?.status === "frozen";
    content = (
      <div className={panel}>
        <p className="text-[17px] font-extrabold">
          {saved ? `${weekly ? "This week is" : "Today is"} saved with a freeze` : weekly && !lost ? "You had some today" : weekly ? "This week won't count" : "Today won't count"}
        </p>
        <p className="mt-0.5 text-[15px] text-ink-2">{saved ? "The streak keeps going. Back at it tomorrow." : weekly && !lost ? weekLine : weekly ? `A fresh week starts ${formatDay(addDays(cur!.end, 1), { weekday: "long" })}.` : "Back at it tomorrow."}</p>
      </div>
    );
  } else if (answer === "yes") {
    content = (
      <div className={`${panel} flex items-center gap-3`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--pact)] text-[var(--pact-ink)]" aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M5 12.5 10 17.5 19.5 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-extrabold">{amount && mine?.value !== null && mine?.value !== undefined ? `${formatValue(pact, mine.value)} today` : `You stayed off ${what} today`}</p>
          <button onClick={() => setSheet("gave-in")} className="text-[14px] font-semibold text-ink-2 underline-offset-2 hover:underline">
            I gave in after all
          </button>
        </div>
        <button disabled={busy} onClick={undo} className="h-11 rounded-full bg-mist px-4 text-[15px] font-bold disabled:opacity-50">
          Undo
        </button>
      </div>
    );
  } else if (asking) {
    content = (
      <div className={`${panel} space-y-3`}>
        <div>
          <p className="text-[19px] leading-tight font-extrabold">{amount ? `How many ${pact.unit} today?` : `Did you stay off ${what} today?`}</p>
          <p className="mt-1 text-[15px] text-ink-2">{amount && limit !== null ? `Your limit today is ${formatValue(pact, limit)}.` : weekLine ?? "You can also answer tomorrow morning."}</p>
        </div>
        {amount && <ValueInput t={pact} value={value} onChange={setValue} />}
        {amount ? (
          <button disabled={busy} onClick={yes} className="h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        ) : (
          <div className="grid gap-2">
            <button disabled={busy} onClick={yes} className="h-14 rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Yes, I did"}
            </button>
            <button onClick={() => setSheet("gave-in")} className="h-14 rounded-2xl bg-mist text-[17px] font-bold">
              {weekly ? "No, I had some" : "No, I gave in"}
            </button>
          </div>
        )}
      </div>
    );
  } else {
    content = (
      <div className={panel}>
        <p className="text-[17px] font-extrabold">{pact.ask_next_morning ? "We'll ask you tomorrow morning" : "Nothing to do until 6pm"}</p>
        <p className="mt-0.5 text-[15px] text-ink-2">
          {pact.ask_next_morning ? "Once today is over, you say how it went." : "Then you can say how today went, or leave it until tomorrow morning."}
          {weekLine ? ` ${weekLine}` : ""}
        </p>
      </div>
    );
  }

  return (
    <BottomDock className="bg-gradient-to-t from-mist via-mist/95 to-transparent px-4 pt-10 pb-safe" estimate={!content ? 60 : amount && asking ? 300 : 170}>
      <div className="space-y-2">
        {content}
        {links}
      </div>
      <GiveInSheet b={b} me={me.id} when="today" over={sheet === "over" ? value : null} open={sheet === "gave-in" || sheet === "over"} onClose={() => setSheet(null)} />
      <CravingSheet b={b} me={me} open={sheet === "craving"} onClose={() => setSheet(null)} />
    </BottomDock>
  );
}

/** Yesterday's question, or who it's waiting on. Calm, not an alarm: answering the next morning is the normal way. */
function YesterdayCard({ b, me, onCelebrate }: { b: PactBundle; me: string; onCelebrate: Celebrate }) {
  const { pact, state } = b;
  const what = subjectOf(pact);
  const amount = pact.measure === "count";
  const limit = limitOn(pact, b.yesterday);
  const day = formatDay(b.yesterday, { weekday: "long" });
  const iOwe = owesYesterdayAnswer(b, me);
  const [value, setValue] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"gave-in" | "over" | null>(null);
  const router = useRouter();

  // older misses in the same run can only be saved by a freeze, before yesterday closes
  const late = state.late;
  const older = state.repair && late ? state.repair.periods.filter((p) => p !== late.start) : [];

  async function yes() {
    if (busy) return;
    if (amount && limit !== null && (value ?? 0) > limit) return setSheet("over");
    setBusy(true);
    const res = await checkIn({ pactId: pact.id, when: "yesterday", value: amount ? (value ?? 0) : null });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    const closes = !!late && late.owing.length === 1 && late.owing[0] === me;
    if (closes) {
      const n = state.streak + 1;
      const unit = pact.cadence === "daily" ? "day" : "week";
      onCelebrate({ title: `${n} ${n === 1 ? unit : unit + "s"}.`, subtitle: `${capitalize(day)} is kept.` });
    } else toast(`Saved for ${day}`);
    router.refresh();
  }

  async function freezeOlder() {
    setBusy(true);
    const res = await applyFreeze(pact.id, "older");
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast("🧊 Frozen. Now answer for yesterday.");
    router.refresh();
  }

  if (!iOwe) {
    const others = othersOwingMakeUp(b, me);
    if (!others.length) return null;
    return (
      <section className="rounded-[24px] bg-paper p-5">
        <p className="text-[18px] leading-tight font-extrabold">Waiting on {listNames(others)} to answer for {day}</p>
        <p className="mt-1.5 text-[15px] leading-snug text-ink-2">They have until midnight. A nudge might help.</p>
      </section>
    );
  }

  return (
    <motion.section initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[24px] bg-[var(--pact-soft)] p-5 text-ink">
      <p className="text-[20px] leading-tight font-extrabold">How did {day} go?</p>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-2">
        {amount ? `How many ${pact.unit} did you have? Your limit was ${formatValue(pact, limit ?? 0)}.` : `Did you stay off ${what}?`} You can answer until midnight.
      </p>
      {older.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white/70 p-3">
          <p className="text-[15px] leading-snug font-semibold">
            The {older.length === 1 ? "day" : `${older.length} days`} before {older.length === 1 ? "was" : "were"} lost too, and only a freeze can save {older.length === 1 ? "it" : "them"}. Freeze first, then answer.
          </p>
          <button disabled={busy} onClick={freezeOlder} className="mt-2 h-11 rounded-full bg-ink px-4 text-[15px] font-extrabold text-white disabled:opacity-50">
            {busy ? "Freezing…" : `🧊 Use ${older.length === 1 ? "a freeze" : `${older.length} freezes`}`}
          </button>
        </div>
      )}
      {amount && (
        <div className="mt-4 rounded-2xl bg-white/70 p-2">
          <ValueInput t={pact} value={value} onChange={setValue} size="md" />
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={busy} onClick={yes} className="h-12 rounded-full bg-ink px-5 text-[16px] font-extrabold text-white disabled:opacity-50">
          {busy ? "Saving…" : amount ? "Save" : "Yes, I did"}
        </button>
        {!amount && (
          <button onClick={() => setSheet("gave-in")} className="h-12 rounded-full bg-ink/[0.07] px-5 text-[16px] font-bold text-ink">
            {pact.cadence === "weekly" ? "No, I had some" : "No, I gave in"}
          </button>
        )}
      </div>
      <GiveInSheet b={b} me={me} when="yesterday" over={sheet === "over" ? value : null} open={sheet !== null} onClose={() => setSheet(null)} />
    </motion.section>
  );
}

/** "I gave in": thanks for saying so, what it means for the chain, and a freeze if one can save it. */
function GiveInSheet({ b, me, when, over, open, onClose }: { b: PactBundle; me: string; when: "today" | "yesterday"; over: number | null; open: boolean; onClose: () => void }) {
  const { pact, state } = b;
  const day = when === "today" ? b.today : b.yesterday;
  const period: Period | undefined = state.periods.find((p) => p.start <= day && day <= p.end);
  const weekly = pact.cadence === "weekly";
  const allowed = allowedDays(pact);
  const used = period?.slips[me] ?? 0;
  // weekly: the week only breaks once the days it allows run out
  const breaks = !weekly || (period?.status !== "done" && used + 1 > allowed);
  const others = b.members.filter((m) => m.user_id !== me).map((m) => firstName(m.name));
  const late = state.late?.start;
  const needed = 1 + (state.repair?.periods.filter((p) => p !== late && p !== period?.start).length ?? 0);
  const saved = state.streak > 0 || (state.repair?.previous ?? 0) > 0;
  const canFreeze = breaks && saved && state.freezesLeft >= needed;
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const which = when === "today" ? "Today" : formatDay(day, { weekday: "long" });
  const unit = weekly ? "This week" : which;

  async function go(freeze: boolean) {
    setBusy(true);
    const res = await callMiss(pact.id, { when, freeze });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    onClose();
    toast(res.data?.frozen ? "🧊 Streak saved" : breaks ? "Back at it tomorrow" : "Noted");
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title={over !== null ? "That's over your limit" : "Thanks for being honest"}>
      <p className="text-[16px] leading-snug text-ink-2">
        {over !== null && `${formatValue(pact, over)} is more than ${formatValue(pact, limitOn(pact, day) ?? 0)}. `}
        {!breaks
          ? `That uses one of your ${allowed} ${subjectOf(pact)} days this week. ${allowed - used - 1 > 0 ? `${allowed - used - 1} left.` : "That was the last one."}`
          : saved
            ? `${unit} won't count, and the streak breaks${b.members.length > 1 ? (b.members.length === 2 ? " for both of you" : " for everyone") : ""}.${canFreeze ? ` A freeze keeps it going. You have ${state.freezesLeft} left.` : ""}`
            : `${unit} won't count. ${weekly ? "Next week" : "Tomorrow"} is a fresh start.`}
      </p>
      {others.length > 0 && (
        <p className="mt-3 rounded-2xl bg-mist p-3 text-[14px] text-ink-2">
          {when === "today" ? `${listNames(others)} won't get a notification tonight. They'll hear tomorrow morning.` : `${listNames(others)} will see it next time they open the app.`}
        </p>
      )}
      <div className="mt-4 grid gap-2">
        {canFreeze ? (
          <>
            <button disabled={busy} onClick={() => go(true)} className="h-14 rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
              {busy ? "Saving…" : needed === 1 ? "🧊 Use a freeze" : `🧊 Use ${needed} freezes`}
            </button>
            <button disabled={busy} onClick={() => go(false)} className="h-14 rounded-2xl bg-mist text-[17px] font-bold disabled:opacity-50">
              Not this time
            </button>
          </>
        ) : (
          <button disabled={busy} onClick={() => go(false)} className="h-14 rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
            {busy ? "Saving…" : "OK"}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** "Having a craving?": your plan, and one tap to ask your partners for help. */
function CravingSheet({ b, me, open, onClose }: { b: PactBundle; me: Me; open: boolean; onClose: () => void }) {
  const others = b.members.filter((m) => m.user_id !== me.id).map((m) => firstName(m.name));
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);

  async function ask() {
    setBusy(true);
    const res = await askForHelp(b.pact.id);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setAsked(true);
    toast(res.data?.sent ? `Sent to ${listNames(others)}` : `Asked. ${listNames(others)} hasn't turned on notifications yet.`);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Having a craving?">
      {b.pact.craving_plan ? (
        <div className="rounded-2xl bg-[var(--pact-soft)] p-4">
          <p className="text-[13px] font-bold text-ink-2">Your plan</p>
          <p className="mt-1 text-[19px] leading-snug font-extrabold">{b.pact.craving_plan}</p>
        </div>
      ) : (
        <CravingPlanEditor b={b} me={me} compact />
      )}
      <p className="mt-4 text-[16px] leading-snug text-ink-2">Cravings come and go. Give it ten minutes before you decide anything.</p>
      {others.length > 0 && (
        <>
          <button
            disabled={busy || asked}
            onClick={ask}
            className="mt-4 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50"
          >
            {asked ? "Asked" : busy ? "Sending…" : `Ask ${listNames(others)} for help`}
          </button>
          <p className="mt-2 text-center text-[13px] text-ink-3">One notification. It won&apos;t say what it&apos;s about.</p>
        </>
      )}
      <button onClick={onClose} className="mt-2 mb-2 h-12 w-full text-[16px] font-bold text-ink-2">
        I&apos;m OK
      </button>
    </Sheet>
  );
}

/** The creator can write or change the plan for cravings; everyone else sees it. */
function CravingPlanEditor({ b, me, compact }: { b: PactBundle; me: Me; compact?: boolean }) {
  const owner = b.pact.created_by === me.id;
  const [plan, setPlan] = useState(b.pact.craving_plan ?? "");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const what = subjectOf(b.pact);

  if (!owner) {
    if (compact || !b.pact.craving_plan) return null;
    return <p className="mt-4 text-[15px] text-ink-2">Plan for cravings: {b.pact.craving_plan}</p>;
  }

  async function save() {
    setBusy(true);
    const res = await saveCravingPlan(b.pact.id, plan);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Plan saved");
    router.refresh();
  }

  return (
    <div className={compact ? "" : "mt-4"}>
      <p className="mb-2 text-[15px] font-bold text-ink-2">{compact ? "Make a plan for next time" : "Plan for cravings"}</p>
      <div className="flex gap-2">
        <input
          maxLength={140}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          placeholder={`When I want ${what}, I'll…`}
          aria-label="Plan for cravings"
          className="h-12 min-w-0 flex-1 rounded-2xl bg-mist px-4 text-[16px] font-semibold outline-none focus:ring-2 focus:ring-[var(--pact)]"
        />
        <button disabled={busy || plan.trim() === (b.pact.craving_plan ?? "")} onClick={save} className="h-12 shrink-0 rounded-2xl bg-ink px-4 text-[15px] font-extrabold text-white disabled:opacity-40">
          Save
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── solo invite ─────────────────────────

function SoloInvite({ b }: { b: PactBundle }) {
  return (
    <section className="rounded-[24px] bg-ink p-5 text-white">
      <p className="text-[20px] leading-tight font-extrabold">It&apos;s just you so far.</p>
      <p className="mt-1.5 text-[15px] leading-snug text-white/70">
        Send the link to a partner or your group. The chain only counts when everyone shows up.
      </p>
      <ShareInvite
        code={b.pact.invite_code}
        pact={b.pact}
        label="Send invite link"
        className="mt-4 h-12 rounded-full bg-sun px-5 text-[16px] font-extrabold text-ink"
      />
    </section>
  );
}

// ───────────────────────── activity ─────────────────────────

function Activity({ b, me }: { b: PactBundle; me: Me }) {
  const items = b.checkins.slice(0, 20);
  if (!items.length) return null;
  const name = (id: string) => b.allMembers.find((m) => m.user_id === id)?.name ?? "Former member";
  const when = (d: string) => (d === b.today ? "Today" : d === b.yesterday ? "Yesterday" : formatDay(d));

  return (
    <section className="rounded-[24px] bg-paper p-2">
      <h2 className="px-3 pt-3 pb-1 text-[17px] font-extrabold">Activity</h2>
      <ul>
        {items.map((c) => (
          <li key={c.id} className="flex gap-3 px-3 py-3">
            <Avatar
              id={c.user_id}
              name={name(c.user_id)}
              src={b.allMembers.find((m) => m.user_id === c.user_id)?.avatar_url}
              size={34}
              onTap={c.user_id === me.id ? undefined : () => logAvatarTap(b.pact.id, c.user_id)}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[15px]">
                <b>{firstName(name(c.user_id))}</b>{" "}
                <span className="text-ink-2">
                  {activityLine(c, b)}
                  {c.feel ? `, felt ${FEELS[c.feel - 1].label.toLowerCase()}` : ""}
                </span>
              </p>
              {c.note && <p className="mt-0.5 text-[15px] leading-snug break-words">{c.note}</p>}
            </div>
            <span className="shrink-0 pt-0.5 text-[13px] font-medium text-ink-3">{when(c.day)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "checked in", "did 5 km", plus how a check-in for an earlier day was logged */
function activityLine(c: Checkin, b: PactBundle) {
  const did = c.value !== null && b.pact.measure !== "none" ? formatValue(b.pact, c.value) : null;
  if (b.pact.kind === "break") {
    const next = todayIn(b.pact.timezone, new Date(c.created_at)) > c.day ? ", answered the next day" : "";
    return `${did ? `had ${did}` : "stayed off it"}${next}`;
  }
  if (c.made_up) return did ? `made it up, did ${did}` : "made it up";
  const late = todayIn(b.pact.timezone, new Date(c.created_at)) > c.day;
  if (late) return did ? `did ${did}, logged late` : "checked in late";
  return did ? `did ${did}` : "checked in";
}

// ───────────────────────── recap ─────────────────────────

/** The first time you open a pact after it ends (within a week), it lands with a moment. */
function useFinishMoment(b: PactBundle, show: (x: { title: string; subtitle?: string }) => void) {
  const { pact, state } = b;
  const recent = state.phase === "ended" && diffDays(state.endDate, b.today) <= 7;
  const kept = keptCount(state);
  const total = state.periods.length;
  const unit = pact.cadence === "daily" ? "days" : "weeks";
  useEffect(() => {
    if (!recent) return;
    const key = `doit:finished:${pact.id}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }
    // mark it seen only once it actually plays (effects can be set up and torn down before that)
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, "1");
      } catch {}
      show({ title: kept === total ? "Every one." : "Finished.", subtitle: `${pact.title}: ${kept} of ${total} ${unit} kept` });
    }, 350);
    return () => clearTimeout(t);
  }, [recent, pact.id, pact.title, kept, total, unit, show]);
}

function Recap({ b, me }: { b: PactBundle; me: Me }) {
  const { state, pact, members } = b;
  const kept = keptCount(state);
  const total = state.periods.length;
  const pct = Math.round((kept / total) * 100);
  const unit = pact.cadence === "daily" ? "days" : "weeks";
  const others = members.filter((m) => m.user_id !== me.id).map((m) => firstName(m.name));
  const mine = b.checkins.filter((c) => c.user_id === me.id && c.value !== null).map((c) => ({ day: c.day, value: c.value as number }));
  const stats = pact.measure !== "none" && mine.length ? progressStats(mine, pact.direction, pact.start_date) : null;
  const per = b.allMembers
    .filter((m) => members.some((x) => x.user_id === m.user_id) || b.checkins.some((c) => c.user_id === m.user_id))
    .map((m) => {
      const theirs = b.checkins.filter((c) => c.user_id === m.user_id);
      const vals = theirs.filter((c) => c.value !== null).map((c) => c.value as number);
      const best = vals.length ? vals.reduce((x, v) => (isBetter(pact.direction, v, x) ? v : x), vals[0]) : null;
      const sums = pact.measure === "count" || pact.measure === "distance" || (pact.measure === "time" && pact.direction === "up");
      const extra = !vals.length || pact.measure === "none" ? "" : sums ? `, ${formatValue(pact, vals.reduce((x, v) => x + v, 0))} total` : `, best ${formatValue(pact, best!)}`;
      return { m, count: theirs.length, extra };
    })
    .sort((a, z) => z.count - a.count);

  return (
    <section className="rounded-[24px] bg-paper p-5">
      <p className="display text-[48px] font-extrabold">
        {kept === total ? "Every single one." : pct >= 90 ? "You did it." : pct >= 60 ? "Solid run." : "That's a wrap."}
      </p>
      <p className="mt-3 text-[16px] text-ink-2">
        {kept} of {total} {unit} kept{others.length ? ` with ${listNames(others)}` : ""}. Best streak {state.best}.
      </p>

      {stats && stats.change !== null && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-mist p-4">
            <p className="text-[13px] font-semibold text-ink-2">Your first week</p>
            <p className="display tnum mt-1 text-[26px] font-extrabold">{formatAvg(pact, stats.firstWeekAvg!)}</p>
          </div>
          <div className="rounded-2xl bg-[var(--pact-soft)] p-4">
            <p className="text-[13px] font-semibold text-ink-2">Your last week</p>
            <p className="display tnum mt-1 text-[26px] font-extrabold">{formatAvg(pact, stats.lastWeekAvg!)}</p>
          </div>
          <p className="col-span-2 px-1 text-[14px] font-medium text-ink-2">
            {stats.change > 0
              ? `${pact.direction === "down" ? "Down" : "Up"} ${formatAvg(pact, Math.abs(stats.lastWeekAvg! - stats.firstWeekAvg!))} on average, per check-in.`
              : "Averages per check-in."}
            {stats.best !== null ? ` Best ${formatValue(pact, stats.best)}.` : ""}
          </p>
        </div>
      )}
      {stats && stats.change === null && stats.best !== null && (
        <p className="mt-3 text-[16px] text-ink-2">Your best: {formatValue(pact, stats.best)}.</p>
      )}

      <ul className="mt-5 space-y-3">
        {per.map(({ m, count, extra }) => (
          <li key={m.user_id} className="flex items-center gap-3">
            <Avatar id={m.user_id} name={m.name} src={m.avatar_url} size={36} onTap={m.user_id === me.id ? undefined : () => logAvatarTap(pact.id, m.user_id)} />
            <span className="flex-1 text-[16px] font-bold">{m.name}</span>
            <span className="tnum text-right text-[15px] text-ink-2">
              {pact.kind === "break" ? `${count} ${count === 1 ? "day" : "days"} kept` : `${count} check-ins${extra}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Go again: the next round with the same settings and the same people, or a way into it if it's already on. */
function GoAgain({ b, me, series }: { b: PactBundle; me: Me; series: Series | null }) {
  const { pact, members } = b;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const inIt = members.some((m) => m.user_id === me.id);
  const next = series?.next;

  if (next) {
    return (
      <section className="rounded-[24px] bg-[var(--pact)] p-5 text-[var(--pact-ink)]">
        <p className="display text-[32px] font-extrabold">Round {next.round} is on.</p>
        <Link href={`/p/${next.id}`} className="mt-4 flex h-14 items-center justify-center rounded-2xl bg-white text-[17px] font-extrabold text-ink active:scale-[0.98]">
          Open round {next.round}
        </Link>
      </section>
    );
  }
  if (!inIt) return null;

  const group = members.length > 1;
  async function go() {
    setBusy(true);
    const res = await startNextRound(pact.id);
    if (!res.ok) {
      setBusy(false);
      return toast(res.error, "error");
    }
    router.push(`/p/${res.data!.id}`);
  }

  return (
    <section className="rounded-[24px] bg-[var(--pact)] p-5 text-[var(--pact-ink)]">
      <p className="display text-[32px] font-extrabold">Go again?</p>
      <p className="mt-2 text-[16px] font-medium opacity-85">
        Round {pact.round + 1}: same pact{group ? ", same people" : ""}, starting today. {cadenceText(pact)}.
      </p>
      <button
        onClick={go}
        disabled={busy}
        className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-white text-[17px] font-extrabold text-ink transition-transform active:scale-[0.98] disabled:opacity-70"
      >
        {busy ? "Starting…" : "Go again"}
      </button>
      {group && <p className="mt-3 text-center text-[13px] font-medium opacity-75">Everyone still in it comes along and gets a heads-up.</p>}
      <Link href="/new" className="mt-2 flex h-11 items-center justify-center text-[15px] font-bold underline-offset-4 opacity-90 hover:underline">
        Start something new
      </Link>
    </section>
  );
}

/** Lifetime totals once a pact has more than one round. */
function AllRounds({ b, series }: { b: PactBundle; series: Series }) {
  const { pact } = b;
  const unit = pact.cadence === "daily" ? "days" : "weeks";
  const n = series.rounds.length;
  return (
    <section className="rounded-[24px] bg-paper p-5">
      <h2 className="text-[17px] font-extrabold">All rounds</h2>
      <p className="display tnum mt-3 text-[44px] font-extrabold">{series.kept}</p>
      <p className="text-[16px] font-semibold text-ink-2">
        {unit} kept across {n} rounds. Best streak {series.best}.
      </p>
      {series.mine && (
        <p className="mt-3 text-[15px] text-ink-2">
          You went from {formatAvg(pact, series.mine.from)} to {formatAvg(pact, series.mine.to)} on average since round {series.rounds[0].round}.
        </p>
      )}
      <ul className="mt-4 divide-y divide-line">
        {series.rounds.map((r) => {
          const here = r.id === pact.id;
          const row = (
            <>
              <span className={`text-[15px] font-bold ${here ? "" : "text-ink-2"}`}>Round {r.round}</span>
              <span className="flex-1 text-[14px] text-ink-3">{formatDay(r.start, { day: "numeric", month: "short" })}</span>
              <span className="tnum text-[15px] font-semibold">
                {r.kept} of {r.total}
              </span>
            </>
          );
          return (
            <li key={r.id}>
              {here ? (
                <div className="flex items-center gap-3 py-3">{row}</div>
              ) : (
                <Link href={`/p/${r.id}`} className="flex items-center gap-3 py-3">
                  {row}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}


// ───────────────────────── menu ─────────────────────────

function MenuSheet({ b, me, open, onClose }: { b: PactBundle; me: Me; open: boolean; onClose: () => void }) {
  const owner = b.pact.created_by === me.id;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function leave() {
    setBusy(true);
    const res = await leavePact(b.pact.id);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast(owner ? "Pact deleted" : "You left the pact");
    router.replace("/");
    router.refresh();
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        setConfirm(false);
        onClose();
      }}
      title={b.pact.title}
    >
      <dl className="space-y-3 rounded-2xl bg-mist p-4 text-[15px]">
        <Row k="Schedule" v={cadenceText(b.pact)} />
        {b.pact.kind === "break" ? (
          <Row k="Asks" v={b.pact.ask_next_morning ? "Each morning, about yesterday" : "From 6pm, or the next morning"} />
        ) : (
          <Row k="Tracking" v={b.pact.measure === "none" ? "Streak only" : targetText(b.pact) ?? (b.pact.measure === "time" ? "Time" : b.pact.unit ?? "")} />
        )}
        <Row k="Dates" v={`${formatDay(b.pact.start_date, { day: "numeric", month: "short" })} to ${formatDay(b.state.endDate, { day: "numeric", month: "short" })}`} />
        <Row k="Freezes" v={`${b.state.freezesLeft} of ${b.pact.freezes_allowed} left, shared`} />
        <Row k="Day ends" v={`Midnight, ${b.pact.timezone.replace(/_/g, " ")}`} />
        <Row k="People" v={`${b.members.length} of 10`} />
      </dl>
      {b.state.phase !== "ended" && (
        <ShareInvite
          code={b.pact.invite_code}
          pact={b.pact}
          label="Invite someone"
          className="mt-4 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white"
        />
      )}
      {b.pact.kind === "break" && <CravingPlanEditor b={b} me={me} />}
      <p className="mt-5 text-[14px] leading-snug text-ink-2">
        {b.pact.kind === "break"
          ? "Each day closes a link when everyone says they stayed off it. You can answer until midnight the next day. If anyone gives in, the chain breaks for the whole group, unless someone uses a freeze. Notifications only come in the morning, and never say what the pact is about."
          : "The chain closes a link when everyone checks in. Miss a day and you can still make it up the next day, until midnight, or anyone can use a freeze then. Otherwise the chain breaks for the whole group."}
      </p>
      <button
        disabled={busy}
        onClick={() => (confirm ? leave() : setConfirm(true))}
        className={`mt-5 h-14 w-full rounded-2xl text-[16px] font-bold ${confirm ? "bg-ember text-white" : "text-ember"}`}
      >
        {confirm ? (owner ? "Tap again to delete it for everyone" : "Tap again to leave") : owner ? "Delete pact" : "Leave pact"}
      </button>
    </Sheet>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-2">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}
