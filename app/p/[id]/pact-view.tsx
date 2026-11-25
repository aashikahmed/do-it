"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { applyFreeze, askForHelp, callMiss, checkIn, leavePact, nudge, saveCravingPlan, startNextRound, undoCheckIn } from "@/lib/client-actions";
import { Avatar } from "@/components/avatar";
import { HeartRow } from "@/components/hearts";
import { Burst } from "@/components/burst";
import { BottomDock } from "@/components/bottom-dock";
import { TrackLanes } from "@/components/lanes";
import { TokenCalendar } from "@/components/tokens";
import { HoldButton } from "@/components/hold-button";
import { Live } from "@/components/live";
import { PushCard } from "@/components/push";
import { Sheet } from "@/components/sheet";
import { ShareInvite } from "@/components/share-invite";
import { toast } from "@/components/toast";
import type { Checkin, Me, PactBundle } from "@/lib/data";
import { addDays, diffDays, formatDay } from "@/lib/dates";
import {
  allowedDays,
  answerOn,
  cadenceText,
  capitalize,
  chainCountsText,
  freezeOffer,
  myFreezes,
  firstName,
  isPaused,
  lateOutcome,
  quietSpan,
  isStarting,
  missOutcome,
  listNames,
  makeUpLabel,
  othersRiskingChain,
  owesMakeUp,
  owesYesterdayAnswer,
  progressText,
  startsText,
  subjectOf,
} from "@/lib/view";
import { limitOn, type Period } from "@/lib/streak";
import { dayName, daysNeeded, weekAtRisk, weekDays, weekNote, weekOutlook, weekRange, weeksRun } from "@/lib/week";
import { WeekDots, WeekLetters } from "@/components/week-strip";
import { deadlineText, pactDeadline, tzFor } from "@/lib/reminders";
import { useViewerTimeZone } from "@/components/time-zone";
import { FEELS, formatAvg, formatValue, isBetter, progressStats, targetText, type Feel, type Tracking } from "@/lib/measure";
import { keptCount, type Series } from "@/lib/rounds";
import { buildLanes } from "@/lib/lanes";
import { buildTokens, topToken } from "@/lib/tokens";
import { logAvatarTap } from "@/lib/track";
import { ValueInput } from "@/components/measure-input";
import { Activity } from "./activity";
import { CatchUpCard, EarlierPanel, EarlierSheet, hasEarlierDays } from "./earlier";
import { ChangedCard, EditPact } from "./edit-pact";
import { EditSheet, EntryFields } from "./entry";
import { ProgressView } from "@/components/progress-view";

export function PactView({ b, me, series }: { b: PactBundle; me: Me; series: Series | null }) {
  const { pact, state, members } = b;
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [burst, setBurst] = useState<{ title: string; subtitle?: string } | null>(null);
  useFinishMoment(b, setBurst);
  const [tab, setTab] = useState<"today" | "progress">("today");
  const isSolo = members.length === 1;

  return (
    <main data-color={pact.color} className="min-h-dvh pb-6">
      <Live pactIds={[pact.id]} days={[{ tz: pact.timezone, today: b.today }]} />
      <Hero b={b} me={me} onMenu={() => setMenuOpen(true)} onCelebrate={setBurst} />

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
          owesYesterdayAnswer(b, me.id) || state.late ? <YesterdayCard b={b} me={me.id} onCelebrate={setBurst} /> : state.repair && <RepairCard b={b} me={me.id} />
        ) : state.late ? (
          <MakeUpCard b={b} me={me.id} onCelebrate={setBurst} />
        ) : (
          state.repair && <RepairCard b={b} me={me.id} />
        )}
        <CatchUpCard b={b} me={me.id} />
        <ChangedCard b={b} me={me.id} />
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
            {state.phase === "active" && isPaused(b, me.id) && <PausedCard b={b} me={me.id} />}
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

      <MenuSheet
        b={b}
        me={me}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onEdit={() => {
          setMenuOpen(false);
          setEditing(true);
        }}
      />
      <EditPact b={b} me={me.id} open={editing && state.phase !== "ended"} onClose={() => setEditing(false)} />
      <Burst show={!!burst} title={burst?.title ?? ""} subtitle={burst?.subtitle} onDone={() => setBurst(null)} />
    </main>
  );
}

// ───────────────────────── hero ─────────────────────────

function Hero({ b, me, onMenu, onCelebrate }: { b: PactBundle; me: Me; onMenu: () => void; onCelebrate: (c: { title: string; subtitle?: string }) => void }) {
  const { pact, state } = b;
  const ended = state.phase === "ended";
  const big = ended ? keptCount(state) : state.streak;
  const unit = pact.cadence === "daily" ? "day" : "week";
  const isBreak = pact.kind === "break";
  const lanes = useMemo(
    () => (isBreak ? null : buildLanes({ pact, state, members: b.members, me: me.id, today: b.today, checkins: b.checkins })),
    [isBreak, pact, state, b.members, me.id, b.today, b.checkins],
  );
  const tokens = useMemo(
    () => (isBreak ? buildTokens({ pact, phase: state.phase, userId: me.id, checkins: b.checkins, misses: b.misses, today: b.today }) : null),
    [isBreak, pact, state.phase, me.id, b.checkins, b.misses, b.today],
  );
  // a token you haven't seen yet lands once the calendar has filled in (the finish has its own moment)
  const tokenLanded = () => {
    if (!tokens || ended) return;
    const top = topToken(tokens);
    const key = `doit-token-${pact.id}-${me.id}`;
    try {
      if (top > Number(localStorage.getItem(key) ?? 0)) {
        localStorage.setItem(key, String(top));
        onCelebrate({ title: `${top}-day token`, subtitle: `${top} clean ${top === 1 ? "day" : "days"}. It's yours to keep.` });
      }
    } catch {}
  };
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
            {state.late && !isBreak && (owesMakeUp(b, me.id) || othersRiskingChain(b, me.id).length > 0) && <span className="ml-2 rounded-full bg-white/20 px-2.5 py-0.5 text-[14px] font-extrabold">on the line</span>}
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
                🧊 {myFreezes(b, me.id)} {myFreezes(b, me.id) === 1 ? "freeze" : "freezes"} left
              </dd>
            </div>
          )}
        </dl>
      </div>

      {state.phase !== "upcoming" && (
        <div className="mt-6">
          {tokens ? <TokenCalendar model={tokens} onSettled={tokenLanded} /> : lanes && <TrackLanes model={lanes} unit={pact.cadence === "daily" ? "day" : "week"} />}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── roster ─────────────────────────

function Roster({ b, me }: { b: PactBundle; me: Me }) {
  const { pact, state, members } = b;
  const cur = state.current;
  const title = state.phase === "upcoming" ? "Who's in" : pact.cadence === "daily" ? "Today" : "This week";
  const until = useUntil(b, me.id);
  const todaysOf = (id: string) => b.checkins.find((c) => c.user_id === id && c.day === b.today);
  // paused people sit at the bottom under their own heading; a check-in brings them straight back
  const pausedNow = (id: string) => state.phase === "active" && isPaused(b, id) && !todaysOf(id);
  const active = members.filter((m) => !pausedNow(m.user_id));
  const letters = pact.kind !== "break" ? weekDays(b, me.id) : null;
  const paused = members.filter((m) => pausedNow(m.user_id));

  function row(m: (typeof members)[number]) {
    const isMe = m.user_id === me.id;
    const first = firstName(m.name);
    const todays = todaysOf(m.user_id);
    const count = cur?.counts[m.user_id] ?? 0;
    // joined mid-pact: already in and can check in now, but the chain counts them from the next period
    const starting = isStarting(b, m.user_id);
    const done = pact.cadence === "daily" ? !!todays : count >= state.need;
    const nudged = b.nudges.some((n) => n.from_user === me.id && n.to_user === m.user_id);
    const isBreak = pact.kind === "break";
    const owesLate = isBreak ? owesYesterdayAnswer(b, m.user_id) : owesMakeUp(b, m.user_id);
    // break pacts only nudge about yesterday; build pacts nudge anyone who hasn't done their part, new joiners too
    const canNudge = !isMe && (state.phase === "active" || owesLate) && (isBreak ? owesLate : !done || owesLate);
    const isPausedNow = pausedNow(m.user_id);
    const why = isPausedNow ? state.paused[m.user_id].why : null;
    // what yesterday's deadline does to them if they let it pass (a freeze covers it, unless they're paused or it breaks)
    const outcome = isMe ? null : lateOutcome(b, m.user_id);
    const pausing = outcome === "quiet" || outcome === "out";
    const about = owesLate ? "yesterday" : isPausedNow ? "back" : starting ? "start" : "today";
    const late = state.late ? makeUpLabel(pact.cadence, state.late) : "yesterday";

    let status: string;
    let sub: string | null = null;
    // weekly build pacts: where they stand in the week (what's left, and what the week's end brings)
    const week = !isBreak && !starting && !isPausedNow ? weekOutlook(b, m.user_id) : null;
    // their days this week as dots, under the letters at the top of the list
    const days = !isBreak && !isPausedNow ? weekDays(b, m.user_id) : null;
    if (state.phase === "upcoming") status = isMe ? "Ready" : `Joined ${formatDay(m.joined_at.slice(0, 10), { day: "numeric", month: "short" })}`;
    else if (isPausedNow) {
      status = why === "out" ? "Out of freezes" : `After ${quietSpan(pact.cadence)}`;
      sub = isMe
        ? isBreak
          ? "Answer to come back."
          : "Check in to come back."
        : `Back in with their next ${isBreak ? "answer" : "check-in"}.${canNudge ? " Bring them back." : ""}`;
    } else if (outcome === "quiet") {
      status = pact.cadence === "daily" ? "Quiet for 3 days" : "Quiet all last week";
      sub = `Paused at ${until} if ${first} stays quiet.`;
    } else if (outcome === "out") {
      status = "Out of freezes";
      sub = `Paused at ${until} unless ${first} ${isBreak ? "answers for" : "makes up"} ${late}.`;
    } else if (starting && (isBreak ? answerOn(b, m.user_id, b.today) === null : !todays && count === 0))
      status = m.joined_at.slice(0, 10) < addDays(b.today, -1) ? "Hasn't started yet" : "Just joined";
    else if (isBreak) status = breakStatus(b, m.user_id, todays);
    else if (pact.cadence === "daily") status = todays ? describe(todays, pact) : "Not yet";
    else if (starting) status = `${count} this week${todays ? ", done today" : ""}`;
    else if (week?.pace === "done") status = `${count} of ${state.need}, done for the week`;
    else {
      status = `${count} of ${state.need}${todays ? ", done today" : ""}`;
      sub = week && weekNote(week, b.today, isMe ? undefined : first);
    }

    return (
      <HeartRow key={m.user_id} b={b} me={me} c={todays} className="flex items-center gap-3 rounded-[18px] px-3 py-3">
        {(hearts) => (
          <>
            <Avatar
              id={m.user_id}
              name={m.name}
              src={m.avatar_url}
              size={44}
              done={state.phase === "active" && (isBreak ? answerOn(b, m.user_id, b.today) === "yes" : done)}
              paused={isPausedNow ? "now" : pausing ? "soon" : undefined}
              onTap={isMe ? undefined : () => logAvatarTap(pact.id, m.user_id)}
            />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[17px] font-bold ${isPausedNow ? "text-ink-2" : ""}`}>
                {m.name}
                {isMe && <span className="font-medium text-ink-3"> (you)</span>}
              </p>
              <p className={`truncate text-[15px] ${done ? "font-semibold text-ink" : "text-ink-2"}`}>{status}</p>
              {days && <WeekDots week={days} />}
              {sub && <p className={`text-[14px] leading-snug font-semibold ${weekAtRisk(week) ? "text-[#c4381b]" : "text-ink-2"}`}>{sub}</p>}
              {!sub && starting && (
                <p className="text-[14px] font-semibold text-ink-2">
                  {canNudge ? "Get them going. " : ""}
                  {chainCountsText(b, m.user_id, isMe ? "you" : "them")}
                </p>
              )}
              {todays?.note && <p className="mt-0.5 line-clamp-2 text-[15px] text-ink-2">“{todays.note}”</p>}
              {hearts}
              {!pausing && owesLate && isBreak && <p className="truncate text-[14px] font-semibold text-ink-2">Hasn&apos;t answered for yesterday</p>}
              {!pausing && owesLate && !isBreak && state.late &&
                (isMe || outcome === "break" ? (
                  <p className="truncate text-[14px] font-bold text-[#c4381b]">Still owes {late}</p>
                ) : (
                  // their own freeze covers it if they don't: nothing at stake for anyone else
                  <p className="text-[14px] leading-snug font-semibold text-ink-2">Has until {until} to make up {late}</p>
                ))}
            </div>
            {canNudge && (
              <div className="flex shrink-0 items-center gap-1.5">
                <WhatsAppNudge b={b} me={me} toUser={m.user_id} name={first} about={about} />
                <NudgeButton pactId={pact.id} toUser={m.user_id} name={first} nudged={nudged} about={about} />
              </div>
            )}
          </>
        )}
      </HeartRow>
    );
  }

  return (
    <section className="rounded-[24px] bg-paper p-2">
      <h2 className="flex items-baseline justify-between gap-2 px-3 pt-3 pb-1 text-[17px] font-extrabold">
        {title}
        {/* weeks start on the pact's own start day, so show which days this one covers */}
        {pact.cadence === "weekly" && cur && state.phase === "active" && <span className="text-[14px] font-semibold text-ink-2">{weekRange(cur.start, cur.end)}</span>}
      </h2>
      {/* the weekday letters, lined up over everyone's dots (avatar + gap + row padding) */}
      {letters && (
        <div className="mt-1 -mb-1 pl-[68px]">
          <WeekLetters week={letters} />
        </div>
      )}
      <ul>{active.map(row)}</ul>
      {paused.length > 0 && (
        <>
          <div className="mx-3 mt-1 border-t border-line" />
          <h3 className="px-3 pt-3 text-[14px] font-bold text-ink-2">Paused</h3>
          <ul>{paused.map(row)}</ul>
        </>
      )}
    </section>
  );
}

/** You're paused: why, and that one check-in brings you back. */
function PausedCard({ b, me }: { b: PactBundle; me: string }) {
  const { pact, state } = b;
  const p = state.paused[me];
  const daily = pact.cadence === "daily";
  const isBreak = pact.kind === "break";
  const why =
    p.why === "quiet"
      ? daily
        ? "You were quiet for 3 days. Your freezes covered them, and the chain kept going without you."
        : "You were quiet for a week. Your freeze covered it, and the chain kept going without you."
      : `You missed ${daily ? (p.since === b.yesterday ? "yesterday" : formatDay(p.since, { weekday: "long" })) : "a week"} with no freezes left, so the chain kept going without you.`;
  const back = isBreak ? "Answer and you're back in." : daily ? "Check in today and you're back in." : "Check in and you're back in.";
  return (
    <section className="rounded-[24px] bg-ice/25 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ice text-ink" aria-hidden>
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path d="M4 2.5v7M8 2.5v7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </span>
        <p className="text-[19px] leading-tight font-extrabold">You&apos;re paused</p>
      </div>
      <p className="mt-2 text-[15px] leading-snug text-ink-2">
        {why} {back}
      </p>
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

/** what a nudge is about: today, making up (or answering for) yesterday, or getting someone who just joined going */
type NudgeAbout = "today" | "yesterday" | "start" | "back";

/**
 * Opens WhatsApp with a ready-made nudge; the sender picks the contact there.
 * Works for partners who haven't turned on alerts, and needs no WhatsApp integration.
 */
/** a weekly build pact's nudge: when the week ends and what they still need, or null to use the daily wording */
function weekLine(b: PactBundle, toUser: string, name: string) {
  const o = weekOutlook(b, toUser);
  if (!o || o.pace === "done") return null;
  const ends = dayName(o.end, b.today);
  if (o.pace === "ok") return `Our week ends ${ends}, ${name}, and you've got ${o.togo} more to go.`;
  if (o.pace === "tight") return o.lastDay ? `Last day of our week, ${name}. You need ${o.togo} more today.` : `Our week ends ${ends}, ${name}. You need ${daysNeeded(o, b.today)}.`;
  if (o.ifShort === "quiet") return `Nothing logged this week yet, ${name}. One check-in by ${ends === "today" ? "tonight" : ends} and you won't be paused.`;
  return null;
}

function WhatsAppNudge({ b, me, toUser, name, about }: { b: PactBundle; me: Me; toUser: string; name: string; about: NudgeAbout }) {
  const iDidIt = b.checkins.some((c) => c.user_id === me.id && c.day === b.today);
  function open() {
    const url = `${window.location.origin}/p/${b.pact.id}`;
    const day = b.state.late ? makeUpLabel(b.pact.cadence, b.state.late) : "yesterday";
    // they read it, so the deadline goes on their clock
    const them = b.allMembers.find((m) => m.user_id === toUser)?.timezone;
    const until = deadlineText(pactDeadline(b.pact.timezone, b.today), tzFor(them, b.pact.timezone));
    const line = b.pact.kind === "break"
      ? `How did yesterday go, ${name}? You can answer until ${until}.`
      : about === "yesterday"
      ? `There's still time to make up ${day}, ${name}. The chain breaks at ${until}.`
      : about === "back"
      ? `We miss you in the chain, ${name}. Check in today and you're back in.`
      : about === "start"
      ? `Glad you're in, ${name}. Check in today to get going. ${chainCountsText(b, toUser, "you")}.`
      : weekLine(b, toUser, name) ??
        (iDidIt ? `I've done mine today. Your turn, ${name} 👀` : `Still on for today, ${name}? Let's not break the chain.`);
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

function NudgeButton({ pactId, toUser, name, nudged, about }: { pactId: string; toUser: string; name: string; nudged: boolean; about: NudgeAbout }) {
  const [sent, setSent] = useState(nudged);
  const [pending, start] = useTransition();
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      disabled={sent || pending}
      onClick={() =>
        start(async () => {
          const res = await nudge({ pactId, toUser, about });
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

function ActionBar({ b, me, onCelebrate }: { b: PactBundle; me: Me; onCelebrate: Celebrate }) {
  const { pact, state } = b;
  const mineToday = b.checkins.find((c) => c.user_id === me.id && c.day === b.today);
  const yesterdayOpen = canLogYesterday(b, me.id);
  const tracked = pact.measure !== "none";
  const weekly = pact.cadence === "weekly";
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const log = useLogSheet();
  const until = useUntil(b, me.id);
  const router = useRouter();
  const myCount = state.current?.counts[me.id] ?? 0;
  const last = b.checkins.find((c) => c.user_id === me.id && c.value !== null)?.value ?? null;
  const hint = weekly ? `${myCount} of ${state.need} this week` : tracked ? (last !== null ? `Last: ${formatValue(pact, last)}` : targetText(pact)) : null;

  // nothing to measure: the hold button stays in the bar, so checking in is still one gesture
  async function quick() {
    if (busy) return;
    setBusy(true);
    const moment = await saveToday(b, me.id, { value: null, note: null, feel: null });
    setBusy(false);
    if (moment === false) return;
    if (moment) onCelebrate(moment);
    router.refresh();
  }

  const yesterdayLink = (text: string) =>
    yesterdayOpen && (
      <button onClick={() => log.show("yesterday")} className="h-9 text-[15px] font-bold text-ink-2">
        {text}
      </button>
    );

  return (
    <BottomDock className="bg-gradient-to-t from-mist via-mist/95 to-transparent px-4 pt-10 pb-safe" estimate={tracked || mineToday ? 100 : 130}>
      <AnimatePresence mode="wait" initial={false}>
        {mineToday ? (
          <motion.div key="done" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="space-y-1">
            <div className="flex items-center gap-3 rounded-[22px] bg-paper p-3 pl-4 shadow-[0_10px_30px_-16px_rgba(16,20,58,0.35)]">
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
            </div>
            {yesterdayOpen && <div className="flex justify-center">{yesterdayLink("Log yesterday too")}</div>}
          </motion.div>
        ) : tracked ? (
          <motion.div key="log" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="flex gap-2">
            <button
              onClick={() => log.show("today")}
              className="flex h-[68px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-[22px] bg-[var(--pact)] px-4 text-[var(--pact-ink)] shadow-[0_14px_30px_-12px_var(--pact)]"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className="shrink-0">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="min-w-0 text-left leading-tight">
                <span className="block text-[19px] font-extrabold">Log today</span>
                {hint && <span className="block truncate text-[13px] font-semibold opacity-85">{hint}</span>}
              </span>
            </button>
            {yesterdayOpen && (
              <button
                onClick={() => log.show("yesterday")}
                className="h-[68px] max-w-[42%] shrink-0 rounded-[22px] bg-paper px-4 text-left leading-tight shadow-[0_10px_30px_-16px_rgba(16,20,58,0.35)]"
              >
                <span className="block text-[16px] font-extrabold">Yesterday</span>
                <span className="block truncate text-[13px] font-semibold text-ink-2">Until {until}</span>
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div key="hold" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="space-y-1">
            <HoldButton label={weekly ? `Hold to log today (${myCount}/${state.need})` : "Hold to check in"} busy={busy} onComplete={quick} />
            <div className="flex justify-center gap-5">
              <button onClick={() => log.show("today")} className="h-9 text-[15px] font-bold text-ink-2">
                Add details
              </button>
              {yesterdayLink("Log yesterday")}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {mineToday && <EditSheet b={b} c={mineToday} open={editOpen} onClose={() => setEditOpen(false)} />}
      <LogSheet b={b} me={me.id} ctl={log} onCelebrate={onCelebrate} />
    </BottomDock>
  );
}

/** Yesterday can still be logged: it's inside the pact, and I haven't logged it. The server has the final say. */
function canLogYesterday(b: PactBundle, me: string) {
  const { pact } = b;
  return (
    !b.checkins.some((c) => c.user_id === me && c.day === b.yesterday) &&
    b.yesterday >= pact.start_date &&
    diffDays(pact.start_date, b.yesterday) < pact.duration_days
  );
}

type LogDay = "today" | "yesterday" | "earlier";
type Moment = { title: string; subtitle?: string };
type Entry = { value: number | null; note: string | null; feel: Feel | null };

/** Log today. Returns the moment to celebrate, or false if it failed (already toasted). */
async function saveToday(b: PactBundle, me: string, e: Entry): Promise<Moment | false> {
  const { pact, state } = b;
  const tracked = pact.measure !== "none";
  const prevBest = b.checkins.filter((c) => c.user_id === me && c.value !== null).reduce<number | null>((best, c) => (best === null || isBetter(pact.direction, c.value!, best) ? c.value! : best), null);
  const res = await checkIn({ pactId: pact.id, when: "today", value: tracked ? e.value : null, note: e.note, feel: e.feel });
  if (!res.ok) {
    toast(res.error, "error");
    return false;
  }

  // predict the moment: did this close the link for everyone?
  const myCount = state.current?.counts[me] ?? 0;
  const others = b.members.filter((m) => m.user_id !== me && state.current?.required.includes(m.user_id));
  const owing =
    pact.cadence === "daily"
      ? others.filter((m) => !b.checkins.some((c) => c.user_id === m.user_id && c.day === b.today))
      : others.filter((m) => (state.current?.counts[m.user_id] ?? 0) < state.need);
  const iClose = pact.cadence === "daily" || myCount + 1 >= state.need;
  const unit = pact.cadence === "daily" ? "day" : "week";
  if (owing.length === 0 && iClose && state.current?.status !== "done") {
    const n = state.streak + 1;
    return { title: `${n} ${n === 1 ? unit : unit + "s"}`, subtitle: b.members.length > 1 ? "Everyone's in. The chain holds." : "Link closed." };
  }
  if (tracked && e.value !== null && prevBest !== null && isBetter(pact.direction, e.value, prevBest)) {
    return { title: "New best.", subtitle: `${formatValue(pact, e.value)}${owing.length ? `. ${listNames(owing.map((m) => firstName(m.name)))}'s turn now.` : ""}` };
  }
  if (owing.length > 0) return { title: "Done.", subtitle: `${listNames(owing.map((m) => firstName(m.name)))}'s turn now.` };
  return { title: "Done.", subtitle: pact.cadence === "weekly" ? `${myCount + 1} of ${state.need} this week` : undefined };
}

/** Log yesterday: did it and forgot to log, or making it up today. Both count. Returns a moment, null (toasted), or false. */
async function saveYesterday(b: PactBundle, me: string, e: Entry & { madeUp: boolean }): Promise<Moment | null | false> {
  const { pact, state } = b;
  const res = await checkIn({ pactId: pact.id, when: "yesterday", madeUp: e.madeUp, value: pact.measure !== "none" ? e.value : null, note: e.note, feel: e.feel });
  if (!res.ok) {
    toast(res.error, "error");
    return false;
  }
  // did this close yesterday's link? (I was the last one it was waiting on)
  const closes = !!state.late && state.late.owing.length === 1 && state.late.owing[0] === me;
  if (closes) {
    const n = state.streak + 1;
    const unit = pact.cadence === "daily" ? "day" : "week";
    return { title: `${capitalize(makeUpLabel(pact.cadence, state.late!))}'s back.`, subtitle: `${n} ${n === 1 ? unit : unit + "s"}. The chain holds.` };
  }
  toast(`Logged for ${formatDay(b.yesterday, { weekday: "long" })}`);
  return null;
}

/** Open state for the log sheet. Each opening starts a fresh form (new key), on the day it was opened for. */
function useLogSheet() {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<LogDay>("today");
  const [session, setSession] = useState(0);
  return {
    open,
    day,
    session,
    setDay,
    show(d: LogDay) {
      setDay(d);
      setSession((n) => n + 1);
      setOpen(true);
    },
    close: () => setOpen(false),
  };
}

/** The check-in sheet for build pacts: today or yesterday, with the input for the pact's measure. */
function LogSheet({ b, me, ctl, onCelebrate }: { b: PactBundle; me: string; ctl: ReturnType<typeof useLogSheet>; onCelebrate: Celebrate }) {
  const title = ctl.day === "today" ? "Log today" : ctl.day === "earlier" ? "Your days" : `Log ${formatDay(b.yesterday, { weekday: "long" })}`;
  return (
    <Sheet open={ctl.open} onClose={ctl.close} title={title}>
      <LogForm key={ctl.session} b={b} me={me} day={ctl.day} setDay={ctl.setDay} onDone={ctl.close} onCelebrate={onCelebrate} />
    </Sheet>
  );
}

function LogForm({
  b,
  me,
  day,
  setDay,
  onDone,
  onCelebrate,
}: {
  b: PactBundle;
  me: string;
  day: LogDay;
  setDay: (d: LogDay) => void;
  onDone: () => void;
  onCelebrate: Celebrate;
}) {
  const { pact, state } = b;
  const canToday = !b.checkins.some((c) => c.user_id === me && c.day === b.today);
  const canYesterday = canLogYesterday(b, me);
  const tabs = ([canToday && "today", canYesterday && "yesterday", hasEarlierDays(b, me) && "earlier"] as const).filter((x): x is LogDay => !!x);
  const [value, setValue] = useState<number | null>(() => startValue(b, me));
  const [feel, setFeel] = useState<Feel | null>(null);
  const [note, setNote] = useState("");
  const [how, setHow] = useState<"forgot" | "made" | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const until = useUntil(b, me);
  const dayName = formatDay(b.yesterday, { weekday: "long" });
  const others = b.members.filter((m) => m.user_id !== me).map((m) => firstName(m.name));
  const myCount = state.current?.counts[me] ?? 0;
  const weekly = pact.cadence === "weekly";

  async function save() {
    if (busy || (day === "yesterday" && !how)) return;
    setBusy(true);
    const entry = { value: pact.measure !== "none" ? value : null, note: note.trim() || null, feel };
    const moment = day === "today" ? await saveToday(b, me, entry) : await saveYesterday(b, me, { ...entry, madeUp: how === "made" });
    setBusy(false);
    if (moment === false) return;
    onDone();
    if (moment) onCelebrate(moment);
    router.refresh();
  }

  const lead =
    day === "yesterday"
      ? `It counts for ${dayName} either way${others.length ? `. ${listNames(others)} will see which one you picked` : ""}. You have until ${until}`
      : [targetText(pact), weekly ? `${myCount} of ${state.need} logged this week` : null].filter(Boolean).join(". ");

  const options = [
    { k: "forgot" as const, title: "I did it, I forgot to log", sub: "Shows as logged late" },
    { k: "made" as const, title: "I'm doing it today to make up", sub: "Shows as made up" },
  ];

  return (
    <>
      {tabs.length > 1 && (
        <div role="radiogroup" aria-label="Which day" className={`mb-4 grid gap-1 rounded-full bg-mist p-1 ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {tabs.map((d) => (
            <button
              key={d}
              role="radio"
              aria-checked={day === d}
              onClick={() => setDay(d)}
              className={`h-10 rounded-full text-[15px] font-extrabold transition-colors ${day === d ? "bg-ink text-white" : "text-ink-2"}`}
            >
              {d === "today" ? "Today" : d === "yesterday" ? "Yesterday" : "Earlier"}
            </button>
          ))}
        </div>
      )}
      {day === "earlier" ? (
        <EarlierPanel b={b} me={me} onYesterday={canYesterday ? () => setDay("yesterday") : undefined} onDone={onDone} />
      ) : (
        <>
      {lead && <p className="mb-4 text-[16px] text-ink-2">{lead}.</p>}
      {day === "yesterday" && (
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
      )}
      <EntryFields t={pact} value={value} setValue={setValue} feel={feel} setFeel={setFeel} note={note} setNote={setNote} />
      <div className="mt-4 pb-1">
        <HoldButton
          label={day === "yesterday" ? (how ? `Hold to log ${dayName}` : "Pick one first") : weekly ? `Hold to log today (${myCount}/${state.need})` : "Hold to check in"}
          busy={busy}
          disabled={day === "yesterday" && !how}
          onComplete={save}
        />
      </div>
        </>
      )}
    </>
  );
}

type Celebrate = (x: { title: string; subtitle?: string }) => void;

/**
 * When today's pact day ends, and yesterday's make-up with it, on the viewer's clock: "midnight", or "4pm your time"
 * when they're somewhere else. Goes after "until", "before" or "at".
 */
function useUntil(b: PactBundle, me: string) {
  const saved = b.allMembers.find((m) => m.user_id === me)?.timezone;
  const tz = useViewerTimeZone(tzFor(saved, b.pact.timezone));
  return deadlineText(pactDeadline(b.pact.timezone, b.today), tzFor(tz, b.pact.timezone));
}

// ───────────────────────── make-up day ─────────────────────────

/** Yesterday's link is still open until midnight: make it up, freeze it, or call it a miss. */
function MakeUpCard({ b, me, onCelebrate }: { b: PactBundle; me: string; onCelebrate: Celebrate }) {
  const { pact, state } = b;
  const late = state.late!;
  const label = makeUpLabel(pact.cadence, late);
  const iOwe = owesMakeUp(b, me);
  // anyone else is covered either way (their own freeze, or a pause), so only a miss that breaks the chain is waited on
  const others = othersRiskingChain(b, me);
  const [missOpen, setMissOpen] = useState(false);
  const log = useLogSheet();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const until = useUntil(b, me);

  // older misses in the same run: only a freeze saves those, and it has to happen before the make-up
  const older = state.repair ? state.repair.periods.filter((p) => p !== late.start) : [];
  const olderLabel =
    pact.cadence === "weekly" ? (older.length === 1 ? "The week before" : `${older.length} weeks before that`) : older.length === 1 ? formatDay(older[0], { weekday: "long" }) : `${older.length} days before that`;
  const all = state.repair ? freezeOffer(b, me, state.repair.periods) : null;
  const olderOffer = freezeOffer(b, me, older);
  const n = b.members.length;
  const breaks =
    myFreezes(b, me) > 0
      ? "After that it uses one of your freezes."
      : n > 1
        ? "After that you're paused until you check in again."
        : "After that the chain breaks.";

  async function freeze(which: "all" | "older") {
    setBusy(true);
    const res = await applyFreeze(pact.id, which);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    const gift = (which === "older" ? olderOffer : all)?.gifts.length;
    toast(which === "older" ? `🧊 Frozen. Now make up ${label}.` : gift ? "🎁 Freeze given. Streak saved" : "🧊 Streak saved");
    router.refresh();
  }

  if (!iOwe && !others.length && older.length === 0) return null;

  return (
    <motion.section initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[24px] bg-[#ffe2db] p-5 text-ink">
      <p className="text-[20px] leading-tight font-extrabold">{iOwe ? `${capitalize(label)} is still open` : others.length ? `Waiting on ${listNames(others)} for ${label}` : `${capitalize(olderLabel)} ${older.length === 1 ? "was" : "were"} missed`}</p>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-2">
        {iOwe
          ? pact.cadence === "daily"
            ? `You have until ${until} to make it up. ${breaks}`
            : `One more check-in, logged for yesterday, closes it. You have until ${until}.`
          : others.length
            ? `${others.length === 1 ? `${others[0]} has` : "They have"} until ${until} to make it up. A nudge might help.`
            : `Only a freeze can save ${older.length === 1 ? "it" : "them"}.`}
      </p>
      {older.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white/70 p-3">
          <p className="text-[15px] leading-snug font-semibold">
            {olderLabel} {older.length === 1 ? "was" : "were"} missed too, and only a freeze can save {older.length === 1 ? "it" : "them"}. Freeze first, then make up {label}.
          </p>
          {olderOffer.note && <p className="mt-1 text-[14px] leading-snug text-ink-2">{olderOffer.note}</p>}
          {olderOffer.ok && (
            <button disabled={busy} onClick={() => freeze("older")} className="mt-2 h-11 rounded-full bg-ink px-4 text-[15px] font-extrabold text-white disabled:opacity-50">
              {busy ? "Freezing…" : olderOffer.button}
            </button>
          )}
        </div>
      )}
      {iOwe ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => log.show("yesterday")} className="h-12 rounded-full bg-ink px-5 text-[16px] font-extrabold text-white">
            Make it up
          </button>
          <button onClick={() => setMissOpen(true)} className="h-12 rounded-full bg-ink/[0.07] px-5 text-[16px] font-bold text-ink">
            I missed it
          </button>
        </div>
      ) : null}
      <LogSheet b={b} me={me} ctl={log} onCelebrate={onCelebrate} />
      <MissSheet b={b} me={me} open={missOpen} onClose={() => setMissOpen(false)} />
    </motion.section>
  );
}

/** "I missed it": settles it now. Your own freeze covers it, or you're paused (see missOutcome). */
function MissSheet({ b, me, open, onClose }: { b: PactBundle; me: string; open: boolean; onClose: () => void }) {
  const { pact, state } = b;
  const late = state.late;
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const label = late ? makeUpLabel(pact.cadence, late) : "yesterday";
  const others = b.members.filter((m) => m.user_id !== me).map((m) => firstName(m.name));
  const left = myFreezes(b, me);

  async function go() {
    setBusy(true);
    const res = await callMiss(pact.id);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    onClose();
    toast(left > 0 ? "🧊 Covered with a freeze" : others.length ? "You're paused for now" : "Starting again today");
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title={`${capitalize(label)} was a miss`}>
      <p className="text-[16px] leading-snug text-ink-2">{missOutcome(b, me)}</p>
      {others.length > 0 && <p className="mt-3 text-[14px] text-ink-2">{listNames(others)} will know you called it.</p>}
      <button disabled={busy} onClick={go} className="mt-4 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
        {busy ? "Saving…" : "OK, it was a miss"}
      </button>
    </Sheet>
  );
}

// ───────────────────────── freeze ─────────────────────────

function RepairCard({ b, me }: { b: PactBundle; me: string }) {
  const repair = b.state.repair!;
  const offer = freezeOffer(b, me, repair.periods);
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
    toast(offer.gifts.length ? "🎁 Freeze given. Streak saved" : "🧊 Streak saved");
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
        {offer.ok ? `A freeze brings back your ${repair.previous}-${unit} streak. ${offer.note}` : `A freeze could bring back your ${repair.previous}-${unit} streak. ${offer.note}`}
      </p>
      {offer.ok && (
        <button disabled={busy} onClick={use} className="mt-4 h-12 rounded-full bg-ink px-5 text-[16px] font-extrabold text-white disabled:opacity-50">
          {busy ? "Freezing…" : offer.button}
        </button>
      )}
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
  const [sheet, setSheet] = useState<"ask" | "gave-in" | "over" | "craving" | "earlier" | null>(null);
  const router = useRouter();

  async function yes() {
    if (busy) return;
    if (amount && limit !== null && (value ?? 0) > limit) return setSheet("over");
    setBusy(true);
    const res = await checkIn({ pactId: pact.id, when: "today", value: amount ? (value ?? 0) : null });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    setSheet(null);
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
  const until = !cur || cur.end === b.today ? "today" : `until ${formatDay(cur.end, { weekday: "long" })}`;
  const weekLine = weekly ? (left === 0 ? `No ${what} days left ${until}.` : `${left} of ${allowed} ${what} ${allowed === 1 ? "day" : "days"} left ${until}.`) : null;
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

  const askHint = amount && limit !== null ? `Your limit today is ${formatValue(pact, limit)}` : weekLine ?? "Answer now or tomorrow morning";

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
      <button
        onClick={() => {
          setValue(0); // each opening starts fresh, so Reset goes back to 0
          setSheet("ask");
        }}
        className="flex h-[68px] w-full items-center justify-center rounded-[22px] bg-[var(--pact)] px-4 text-[var(--pact-ink)] shadow-[0_14px_30px_-12px_var(--pact)]"
      >
        <span className="min-w-0 text-center leading-tight">
          <span className="block text-[19px] font-extrabold">How did today go?</span>
          <span className="block truncate text-[13px] font-semibold opacity-85">{askHint}</span>
        </span>
      </button>
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
    <BottomDock className="bg-gradient-to-t from-mist via-mist/95 to-transparent px-4 pt-10 pb-safe" estimate={!content ? 60 : asking ? 120 : 170}>
      <div className="space-y-2">
        {content}
        {links}
      </div>
      <Sheet open={sheet === "ask"} onClose={() => setSheet(null)} title={amount ? `How many ${pact.unit} today?` : `Did you stay off ${what} today?`}>
        <p className="mb-4 text-[16px] text-ink-2">{amount && limit !== null ? `Your limit today is ${formatValue(pact, limit)}.` : weekLine ?? "You can also answer tomorrow morning."}</p>
        {amount && (
          <div className="mb-4 rounded-2xl bg-mist/60 p-2">
            <ValueInput t={pact} value={value} onChange={setValue} size="md" />
          </div>
        )}
        <div className="grid gap-2 pb-1">
          <button disabled={busy} onClick={yes} className="h-14 rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
            {busy ? "Saving…" : amount ? "Save" : "Yes, I did"}
          </button>
          {!amount && (
            <button onClick={() => setSheet("gave-in")} className="h-14 rounded-2xl bg-mist text-[17px] font-bold">
              {weekly ? "No, I had some" : "No, I gave in"}
            </button>
          )}
          {hasEarlierDays(b, me.id) && (
            <button onClick={() => setSheet("earlier")} className="h-11 text-[15px] font-bold text-ink-2">
              Answer for an earlier day
            </button>
          )}
        </div>
      </Sheet>
      <EarlierSheet b={b} me={me.id} open={sheet === "earlier"} onClose={() => setSheet(null)} />
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
  const until = useUntil(b, me);

  // older misses in the same run can only be saved by a freeze, before yesterday closes
  const late = state.late;
  const older = state.repair && late ? state.repair.periods.filter((p) => p !== late.start) : [];
  const olderOffer = freezeOffer(b, me, older);

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
    const others = othersRiskingChain(b, me);
    if (!others.length) return null;
    return (
      <section className="rounded-[24px] bg-paper p-5">
        <p className="text-[18px] leading-tight font-extrabold">Waiting on {listNames(others)} to answer for {day}</p>
        <p className="mt-1.5 text-[15px] leading-snug text-ink-2">They have until {until}. A nudge might help.</p>
      </section>
    );
  }

  return (
    <motion.section initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[24px] bg-[var(--pact-soft)] p-5 text-ink">
      <p className="text-[20px] leading-tight font-extrabold">How did {day} go?</p>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-2">
        {amount ? `How many ${pact.unit} did you have? Your limit was ${formatValue(pact, limit ?? 0)}.` : `Did you stay off ${what}?`} You can answer until {until}.
      </p>
      {older.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white/70 p-3">
          <p className="text-[15px] leading-snug font-semibold">
            The {older.length === 1 ? "day" : `${older.length} days`} before {older.length === 1 ? "was" : "were"} lost too, and only a freeze can save {older.length === 1 ? "it" : "them"}. Freeze first, then answer.
          </p>
          {olderOffer.note && <p className="mt-1 text-[14px] leading-snug text-ink-2">{olderOffer.note}</p>}
          {olderOffer.ok && (
            <button disabled={busy} onClick={freezeOlder} className="mt-2 h-11 rounded-full bg-ink px-4 text-[15px] font-extrabold text-white disabled:opacity-50">
              {busy ? "Freezing…" : olderOffer.button}
            </button>
          )}
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
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const which = when === "today" ? "Today" : formatDay(day, { weekday: "long" });
  const unit = weekly ? "This week" : which;

  async function go() {
    setBusy(true);
    const res = await callMiss(pact.id, { when });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    onClose();
    toast(!breaks ? "Noted" : myFreezes(b, me) > 0 ? "🧊 Covered with a freeze" : "Back at it tomorrow");
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title={over !== null ? "That's over your limit" : "Thanks for being honest"}>
      <p className="text-[16px] leading-snug text-ink-2">
        {over !== null && `${formatValue(pact, over)} is more than ${formatValue(pact, limitOn(pact, day) ?? 0)}. `}
        {!breaks
          ? `That uses one of your ${allowed} ${subjectOf(pact)} days this week. ${allowed - used - 1 > 0 ? `${allowed - used - 1} left.` : "That was the last one."}`
          : `${unit} won't count for you. ${missOutcome(b, me)}`}
      </p>
      {others.length > 0 && (
        <p className="mt-3 rounded-2xl bg-mist p-3 text-[14px] text-ink-2">
          {when === "today" ? `${listNames(others)} won't get a notification tonight. They'll hear tomorrow morning.` : `${listNames(others)} will see it next time they open the app.`}
        </p>
      )}
      <div className="mt-4 grid gap-2">
        <button disabled={busy} onClick={go} className="h-14 rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
          {busy ? "Saving…" : "OK"}
        </button>
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
        {/* a new round's weeks start on the day it starts, which may not be this round's weekday */}
        {pact.cadence === "weekly" && ` Weeks will run ${weeksRun(b.today)}.`}
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

function MenuSheet({ b, me, open, onClose, onEdit }: { b: PactBundle; me: Me; open: boolean; onClose: () => void; onEdit: () => void }) {
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
        <Row k="Freezes" v={`${myFreezes(b, me.id)} of ${b.pact.freezes_allowed} left, your own`} />
        {b.pact.cadence === "weekly" && <Row k="Weeks run" v={weeksRun(b.pact.start_date)} />}
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
          ? "Each day closes a link when everyone says they stayed off it. You can answer until midnight the next day. If you give in, one of your own freezes covers it automatically. Out of freezes, or quiet for 3 days, and you're paused: the chain carries on without you until your next yes. You only count once you've said yes for a day. Notifications only come in the morning, and never say what the pact is about."
          : "The chain closes a link when everyone checks in. Miss a day and you can make it up the next day, until midnight. After that one of your own freezes covers it, automatically. Out of freezes, or quiet for 3 days, and you're paused: the chain carries on without you until your next check-in. Nobody counts until their first check-in, so someone who never starts can't break it."}
      </p>
      {owner && b.state.phase !== "ended" && (
        <button onClick={onEdit} className="mt-5 h-14 w-full rounded-2xl bg-mist text-[16px] font-bold">
          Edit pact
        </button>
      )}
      <button
        disabled={busy}
        onClick={() => (confirm ? leave() : setConfirm(true))}
        className={`${owner && b.state.phase !== "ended" ? "mt-2" : "mt-5"} h-14 w-full rounded-2xl text-[16px] font-bold ${confirm ? "bg-ember text-white" : "text-ember"}`}
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
