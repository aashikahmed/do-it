"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { setDay, takeBackMiss } from "@/lib/client-actions";
import { Avatar } from "@/components/avatar";
import { HeartRow } from "@/components/hearts";
import { HoldFill, LiftMenu, MenuItem, useHold } from "@/components/hold-menu";
import { ValueInput } from "@/components/measure-input";
import { Sheet } from "@/components/sheet";
import { Toggle } from "@/components/toggle";
import { toast } from "@/components/toast";
import { activityDays, canChangeDay, changeText, previewDay, type ActivityRow, type Cover, type DayChange, type DayInputs } from "@/lib/activity";
import type { Checkin, Me, PactBundle } from "@/lib/data";
import { addDays, diffDays, formatDay, todayIn, type Day } from "@/lib/dates";
import { FEELS, formatValue, type Feel } from "@/lib/measure";
import { limitOn } from "@/lib/streak";
import { logAvatarTap } from "@/lib/track";
import { firstName } from "@/lib/view";
import { EditSheet, EntryFields } from "./entry";

/** day groups shown at first, and how many more "Show earlier days" adds */
const FIRST_DAYS = 7;
const MORE_DAYS = 14;
const HINT_KEY = "doit:hold-hint";

type Open = { row: ActivityRow; rect: DOMRect };
type SheetFor = { kind: "today"; c: Checkin } | { kind: "day"; row: ActivityRow };

/**
 * Everything that happened, day by day: check-ins, and every day someone who counted let slip, said or not.
 * Hold one of your own rows to change it (a menu first, so a stray hold never lands in a form).
 */
export function Activity({ b, me }: { b: PactBundle; me: Me }) {
  const days = useMemo(
    () => activityDays({ pact: b.pact, state: b.state, checkins: b.checkins, misses: b.misses, freezes: b.freezes, changes: b.changes, today: b.today }),
    [b.pact, b.state, b.checkins, b.misses, b.freezes, b.changes, b.today],
  );
  const [count, setCount] = useState(FIRST_DAYS);
  const [open, setOpen] = useState<Open | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [sheet, setSheet] = useState<SheetFor | null>(null);
  const router = useRouter();
  const hintSeen = useSyncExternalStore(
    subscribeHint,
    () => readHint(),
    () => true,
  );

  const canHold = (row: ActivityRow) => holdable(b, me.id, row);
  const shown = days.slice(0, count);
  const anyMine = shown.some((d) => d.rows.some(canHold));
  if (!days.length) return null;

  function hold(row: ActivityRow, el: HTMLElement) {
    setShowBefore(false);
    setOpen({ row, rect: el.getBoundingClientRect() });
    if (!hintSeen) writeHint();
  }
  const close = () => setOpen(null);

  function change() {
    if (!open) return;
    const { row } = open;
    setOpen(null);
    if (row.type === "checkin" && row.day === b.today) setSheet({ kind: "today", c: row.checkin as Checkin });
    else setSheet({ kind: "day", row });
  }

  // today's "I gave in" isn't over yet: it can only be taken back, like Undo on a yes
  async function takeBack() {
    setOpen(null);
    const res = await takeBackMiss(b.pact.id);
    if (!res.ok) return toast(res.error, "error");
    toast(res.data?.refunded ? "Taken back. Your freeze is back too." : "Taken back");
    router.refresh();
  }

  return (
    <section className="rounded-[24px] bg-paper p-2">
      <h2 className="px-3 pt-3 pb-1 text-[17px] font-extrabold">Activity</h2>
      {anyMine && !hintSeen && <p className="px-3 text-[13px] text-ink-3">Hold any of your days to change it.</p>}
      {shown.map((d) => (
        <div key={d.day}>
          <h3 className="px-3 pt-3 pb-0.5 text-[13px] font-semibold text-ink-3">{dayHeading(d.day, b)}</h3>
          <ul>
            {d.rows.map((row) => (
              <Row key={row.key} b={b} me={me} row={row} holdable={canHold(row)} onHold={(el) => hold(row, el)} />
            ))}
          </ul>
        </div>
      ))}
      {days.length > count && (
        <button onClick={() => setCount((n) => n + MORE_DAYS)} className="mt-1 h-12 w-full rounded-2xl text-[15px] font-extrabold text-[var(--pact-deep)]">
          Show earlier days
        </button>
      )}

      <LiftMenu anchor={open?.rect ?? null} onClose={close} preview={open && <RowBody b={b} me={me} row={open.row} />}>
        {open && (
          <>
            {isTodaysMiss(b, open.row) ? (
              <MenuItem title="Take it back" sub="Today goes back to unanswered." onClick={takeBack} />
            ) : (
              <MenuItem title={menuTitle(b, open.row)} sub={`Now: ${nowText(b, me.id, open.row)}`} onClick={change} />
            )}
            {"change" in open.row &&
              open.row.change &&
              (showBefore ? (
                <p className="border-t border-line px-3 py-2.5 text-[14px] leading-snug text-ink-2">
                  Before: <b className="text-ink">{beforeText(b, open.row.change)}</b>. You changed it {changedOn(b, open.row.change)}.
                </p>
              ) : (
                <div className="border-t border-line pt-1">
                  <MenuItem title="What it said before" onClick={() => setShowBefore(true)} />
                </div>
              ))}
          </>
        )}
      </LiftMenu>

      {sheet?.kind === "today" && <EditSheet b={b} c={sheet.c} open onClose={() => setSheet(null)} />}
      {sheet?.kind === "day" && <DaySheet b={b} me={me.id} row={sheet.row} onClose={() => setSheet(null)} />}
    </section>
  );
}

// ───────────────────────── rows ─────────────────────────

function Row({ b, me, row, holdable, onHold }: { b: PactBundle; me: Me; row: ActivityRow; holdable: boolean; onHold: (el: HTMLElement) => void }) {
  const { holding, props } = useHold(onHold, holdable);
  const body = (extra?: ReactNode) => (
    <div
      {...props}
      aria-label={holdable ? `${rowLabel(b, me.id, row)}. Hold to change.` : undefined}
      className={`relative rounded-2xl ${holdable ? "cursor-pointer select-none outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-[var(--pact)]" : ""}`}
    >
      {holdable && <HoldFill holding={holding} />}
      <RowBody b={b} me={me} row={row} extra={extra} />
    </div>
  );
  if (row.type === "checkin") {
    return (
      <HeartRow b={b} me={me} c={row.checkin as Checkin} className="">
        {(hearts) => body(hearts)}
      </HeartRow>
    );
  }
  return <li>{body()}</li>;
}

/** avatar, what happened, and the small print: a freeze that covered it, or that it was changed */
function RowBody({ b, me, row, extra }: { b: PactBundle; me: Me; row: ActivityRow; extra?: ReactNode }) {
  const member = b.allMembers.find((m) => m.user_id === row.user);
  const name = member?.name ?? "Former member";
  const silent = row.type === "short" || (row.type === "miss" && !row.said);
  const c = row.type === "checkin" ? (row.checkin as Checkin) : null;
  const [before, setBefore] = useState(false);
  const change = row.type !== "short" ? row.change : null;
  const cover = row.type !== "checkin" ? row.cover : null;

  return (
    <div className="relative flex gap-3 px-3 py-3">
      <span className={silent ? "rounded-full opacity-60 grayscale" : ""}>
        <Avatar id={row.user} name={name} src={member?.avatar_url} size={34} onTap={row.user === me.id ? undefined : () => logAvatarTap(b.pact.id, row.user)} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px]">
          <b>{row.user === me.id ? "You" : firstName(name)}</b> <RowText b={b} row={row} />
        </p>
        {c?.note && <p className="mt-0.5 text-[15px] leading-snug break-words">{c.note}</p>}
        {(cover || change) && (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {cover && <span className="rounded-full bg-ice/30 px-2 py-0.5 text-[12px] font-semibold text-ink-2">{coverText(b, me.id, row.user, cover)}</span>}
            {change && (
              <button
                type="button"
                onClick={() => setBefore((x) => !x)}
                className="rounded-full bg-mist px-2 py-0.5 text-[12px] font-semibold text-ink-2"
                aria-expanded={before}
              >
                changed {changedOn(b, change)}
              </button>
            )}
          </span>
        )}
        {change && before && <p className="mt-1 text-[13px] text-ink-2">Before: {beforeText(b, change)}</p>}
        {extra}
      </div>
    </div>
  );
}

function RowText({ b, row }: { b: PactBundle; row: ActivityRow }) {
  const isBreak = b.pact.kind === "break";
  if (row.type === "checkin") {
    const c = row.checkin as Checkin;
    return (
      <span className="text-ink-2">
        {activityLine(c, b)}
        {c.feel ? `, felt ${FEELS[c.feel - 1].label.toLowerCase()}` : ""}
      </span>
    );
  }
  if (row.type === "short") {
    return (
      <span className="font-semibold text-ember">
        {isBreak ? `stayed off it ${row.count} of ${row.need} days` : `checked in ${row.count} of ${row.need} ${row.need === 1 ? "time" : "times"}`}
      </span>
    );
  }
  if (row.said) return <span className="font-semibold text-ember">{isBreak ? "gave in" : "missed it"}</span>;
  return isBreak ? <span className="text-ink-3">didn&apos;t answer</span> : <span className="font-semibold text-ember">didn&apos;t check in</span>;
}

/** "checked in", "did 5 km", plus how a check-in for an earlier day was logged */
export function activityLine(c: Pick<Checkin, "value" | "made_up" | "created_at" | "day">, b: PactBundle) {
  const did = c.value !== null && b.pact.measure !== "none" ? formatValue(b.pact, c.value) : null;
  const late = todayIn(b.pact.timezone, new Date(c.created_at)) > c.day;
  if (b.pact.kind === "break") {
    const limit = limitOn(b.pact, c.day);
    const over = limit !== null && c.value !== null && c.value > limit ? ", over the limit" : "";
    const answered = todayIn(b.pact.timezone, new Date(c.created_at));
    const when = answered === addDays(c.day, 1) ? ", answered the next day" : late ? ", answered later" : "";
    return `${did ? `had ${did}` : "stayed off it"}${over}${when}`;
  }
  if (c.made_up) return did ? `made it up, did ${did}` : "made it up";
  if (late) return did ? `did ${did}, logged late` : "checked in late";
  return did ? `did ${did}` : "checked in";
}

function coverText(b: PactBundle, me: string, user: string, cover: Cover) {
  if (!cover.by) return "covered by a freeze";
  if (cover.by === me) return "covered by your freeze";
  if (cover.by === user) return "covered by their freeze";
  return `covered by ${firstName(b.allMembers.find((m) => m.user_id === cover.by)?.name ?? "a partner")}'s freeze`;
}

function beforeText(b: PactBundle, ch: DayChange) {
  const isBreak = b.pact.kind === "break";
  if (ch.before === "did") {
    const v = ch.before_value !== null && b.pact.measure !== "none" ? formatValue(b.pact, ch.before_value) : null;
    return isBreak ? (v ? `had ${v}` : "stayed off it") : v ? `did ${v}` : "checked in";
  }
  if (ch.before === "missed") return isBreak ? "gave in" : "missed it";
  return isBreak ? "no answer" : "not logged";
}

/** when a change was made, on the pact's calendar: "today", "yesterday", "on Tue", or "on 3 Nov" further back */
function changedOn(b: PactBundle, ch: DayChange) {
  const d = todayIn(b.pact.timezone, new Date(ch.created_at));
  if (d === b.today) return "today";
  if (d === b.yesterday) return "yesterday";
  return `on ${diffDays(d, b.today) < 7 ? formatDay(d, { weekday: "short" }) : formatDay(d, { day: "numeric", month: "short" })}`;
}

function dayHeading(d: Day, b: PactBundle) {
  return d === b.today ? "Today" : d === b.yesterday ? "Yesterday" : formatDay(d);
}

/** "yesterday", "Monday" this past week, "Mon 3 Nov" before that */
function dayWord(d: Day, b: PactBundle) {
  if (d === b.today) return "today";
  if (d === b.yesterday) return "yesterday";
  return diffDays(d, b.today) < 7 ? formatDay(d, { weekday: "long" }) : formatDay(d);
}

function menuTitle(b: PactBundle, row: ActivityRow) {
  if (row.type === "short") return "Add a day to this week";
  const verb = row.type === "miss" && !row.said && b.pact.kind === "break" ? "Answer for" : "Change";
  return `${verb} ${dayWord(row.day, b)}`;
}

function nowText(b: PactBundle, me: string, row: ActivityRow) {
  const text = rowLabel(b, me, row, true);
  const cover = row.type !== "checkin" ? row.cover : null;
  return cover ? `${text}, ${coverText(b, me, row.user, cover)}` : text;
}

/** the row as plain words, for the menu and screen readers */
function rowLabel(b: PactBundle, me: string, row: ActivityRow, bare = false) {
  const isBreak = b.pact.kind === "break";
  const who = bare ? "" : `${row.user === me ? "You" : firstName(b.allMembers.find((m) => m.user_id === row.user)?.name ?? "Someone")} `;
  if (row.type === "checkin") return `${who}${activityLine(row.checkin as Checkin, b)}`;
  if (row.type === "short") return `${who}${isBreak ? `stayed off it ${row.count} of ${row.need} days` : `checked in ${row.count} of ${row.need} times`}`;
  if (row.said) return `${who}${isBreak ? "gave in" : "missed it"}`;
  return `${who}${isBreak ? "didn't answer" : "didn't check in"}`;
}

/** your own rows you can change: today's answer, and any day of the round that's over */
function holdable(b: PactBundle, me: string, row: ActivityRow) {
  if (row.user !== me) return false;
  if (row.type === "checkin" && row.day === b.today) return true;
  if (isTodaysMiss(b, row)) return true;
  const member = b.members.find((m) => m.user_id === me);
  if (row.type === "short") return weekDays(b, me, row).length > 0;
  return canChangeDay(b.pact, member, row.day, b.today);
}

/** break pacts: "I gave in" about today (build pacts only ever call a miss about yesterday) */
function isTodaysMiss(b: PactBundle, row: ActivityRow) {
  return b.pact.kind === "break" && row.type === "miss" && row.said && row.day === b.today;
}

/** days of a short week you could add a check-in for */
function weekDays(b: PactBundle, me: string, row: Extract<ActivityRow, { type: "short" }>) {
  const member = b.members.find((m) => m.user_id === me);
  const out: Day[] = [];
  for (let d = row.start; d <= row.day; d = addDays(d, 1)) {
    if (canChangeDay(b.pact, member, d, b.today) && !b.checkins.some((c) => c.user_id === me && c.day === d)) out.push(d);
  }
  return out;
}

// ───────────────────────── change a day ─────────────────────────

/**
 * Change (or fill in) one of your days. In its own sheet, or inside another one (the log sheet's Earlier tab), where
 * `onBack` returns to the calendar.
 */
export function DaySheet({ b, me, row, onClose, onBack }: { b: PactBundle; me: string; row: ActivityRow; onClose: () => void; onBack?: () => void }) {
  const { pact } = b;
  const isBreak = pact.kind === "break";
  const amount = isBreak && pact.measure === "count";
  const week = row.type === "short" ? weekDays(b, me, row) : null;
  const existing = row.type === "checkin" ? (row.checkin as Checkin) : null;
  const startDid = row.type === "checkin" ? true : row.type === "miss" && row.said ? false : week || amount ? true : null;

  const [day, setDayPicked] = useState<Day | null>(week ? (week.length === 1 ? week[0] : null) : row.day);
  const [did, setDid] = useState<boolean | null>(startDid);
  // a new "I did it" starts from your last number, like checking in does
  const lastValue = b.checkins.find((c) => c.user_id === me && c.value !== null)?.value ?? pact.target ?? null;
  const startValue = existing ? existing.value : amount ? 0 : pact.measure !== "none" ? lastValue : null;
  const [value, setValue] = useState<number | null>(startValue);
  const [feel, setFeel] = useState<Feel | null>(existing?.feel ?? null);
  const [note, setNote] = useState(existing?.note ?? "");
  const [freeze, setFreeze] = useState(true);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const inputs: DayInputs = { pact, members: b.allMembers, checkins: b.checkins, misses: b.misses, freezes: b.freezes, today: b.today };
  const plain = day !== null && did !== null ? previewDay(inputs, me, day, did, did ? value : null, false) : null;
  const preview = plain && freeze && plain.canFreeze && day !== null && did !== null ? previewDay(inputs, me, day, did, did ? value : null, true) : plain;
  const label = pact.cadence === "weekly" ? "That week" : day ? capital(dayWord(day, b)) : "";
  const effect = preview && day ? changeText(b.state, preview, me, day, label, pact.cadence === "weekly" ? "week" : "day", pact.kind ?? "build") : null;
  const reactions = existing && did === false ? b.hearts.filter((h) => h.checkin_id === existing.id).length : 0;
  const limit = day ? limitOn(pact, day) : null;

  const changed =
    day !== null &&
    did !== null &&
    (did !== startDid ||
      (did && (value !== startValue || feel !== (existing?.feel ?? null) || note.trim() !== (existing?.note ?? ""))) ||
      (!!plain?.canFreeze && freeze));

  async function save() {
    if (day === null || did === null || busy) return;
    setBusy(true);
    const res = await setDay({
      pactId: pact.id,
      day,
      did,
      value: did ? value : null,
      note: did ? note.trim() || null : null,
      feel: did ? feel : null,
      freeze: !!plain?.canFreeze && freeze,
    });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast(res.data?.frozen ? "Saved. Your freeze covers it." : "Saved");
    onClose();
    router.refresh();
  }

  const title = day ? (day === b.yesterday ? `Yesterday, ${formatDay(day)}` : formatDay(day, { weekday: "long", day: "numeric", month: "short" })) : "Add a day";
  const yes = isBreak ? "I stayed off it" : "I did it";
  const no = isBreak ? "I gave in" : "I missed it";
  const tone = effect?.tone === "good" ? "bg-mint/15" : effect?.tone === "warn" ? "bg-ember/10" : "bg-mist";

  const body = (
    <>
      <p className={`${onBack ? "" : "-mt-3 "}mb-4 text-[15px] text-ink-3`}>
        {amount ? `How many ${pact.unit ?? ""} did you have?${limit !== null ? ` Your limit was ${formatValue(pact, limit)}.` : ""}` : isBreak ? "Did you stay off it?" : pact.title}
      </p>

      {week && week.length > 1 && (
        <div className="mb-4">
          <p className="mb-2 text-[13px] font-semibold text-ink-3">Which day?</p>
          <div className="flex flex-wrap gap-2">
            {week.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={day === d}
                onClick={() => setDayPicked(d)}
                className={`h-10 rounded-full px-4 text-[15px] font-bold ${day === d ? "bg-ink text-white" : "bg-mist text-ink-2"}`}
              >
                {shortDay(d)}
              </button>
            ))}
          </div>
        </div>
      )}

      {amount ? (
        <div className="rounded-2xl bg-mist/60 p-2">
          <ValueInput t={pact} value={value} onChange={setValue} size="md" />
        </div>
      ) : (
        !week && (
          <div className="grid grid-cols-2 gap-1 rounded-full bg-mist p-1" role="group" aria-label="Your answer">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={did === v}
                onClick={() => setDid(v)}
                className={`h-11 rounded-full text-[15px] font-extrabold transition-colors ${
                  did === v ? (v ? "bg-ink text-white" : "bg-ember text-white") : "text-ink-2"
                }`}
              >
                {v ? yes : no}
              </button>
            ))}
          </div>
        )
      )}

      {did && !isBreak && (
        <div className="mt-4">
          <EntryFields t={pact} value={value} setValue={setValue} feel={feel} setFeel={setFeel} note={note} setNote={setNote} />
        </div>
      )}

      {plain?.needsFreeze && (
        <div className="mt-4 rounded-2xl bg-ice/25 px-4 py-3">
          {plain.canFreeze ? (
            <label className="flex items-center gap-3">
              <span className="flex-1">
                <span className="block text-[15px] font-bold">Cover it with a freeze</span>
                <span className="block text-[13px] text-ink-2">You have {plain.freezesLeft}.</span>
              </span>
              <Toggle checked={freeze} onChange={setFreeze} label="Cover it with a freeze" />
            </label>
          ) : (
            <p className="text-[14px] leading-snug text-ink-2">
              {plain.othersUncovered
                ? `Someone else missed ${pact.cadence === "weekly" ? "that week" : "this day"} too, so a freeze from you alone won't keep it.`
                : "You're out of freezes, so a freeze can't cover it."}
            </p>
          )}
        </div>
      )}

      {effect?.text && <p className={`mt-4 rounded-2xl px-4 py-3 text-[15px] leading-snug ${tone}`}>{effect.text}</p>}
      {reactions > 0 && <p className="mt-2 text-[14px] text-ink-3">The reactions on this check-in go with it.</p>}

      <button
        disabled={!changed || busy}
        onClick={save}
        className="mt-5 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      {!(startDid === null && day === b.yesterday) && <p className="mt-2 mb-2 text-center text-[13px] text-ink-3">Your partners see it as changed.</p>}
    </>
  );
  if (onBack) {
    return (
      <div>
        <div className="mb-2 flex items-center gap-1">
          <button type="button" onClick={onBack} aria-label="Back to your days" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-2">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h3 className="text-[20px] font-extrabold">{title}</h3>
        </div>
        {body}
      </div>
    );
  }
  return (
    <Sheet open onClose={onClose} title={title}>
      {body}
    </Sheet>
  );
}

/** "Fri 13" (Intl puts the day number first) */
export function shortDay(d: Day) {
  return `${formatDay(d, { weekday: "short" })} ${formatDay(d, { day: "numeric" })}`;
}

/** your row for a day, as Activity would show it, so a calendar can open the same form */
export function rowForDay(b: PactBundle, me: string, day: Day): ActivityRow {
  const c = b.checkins.find((x) => x.user_id === me && x.day === day);
  if (c) return { type: "checkin", key: `c:${c.id}`, user: me, day, checkin: c, change: null };
  const said = b.misses.some((m) => m.user_id === me && m.day === day);
  return { type: "miss", key: `d:${day}`, user: me, day, said, cover: null, change: null };
}

function capital(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// the hold hint shows until you've opened a row's menu once
const hintListeners = new Set<() => void>();
function subscribeHint(fn: () => void) {
  hintListeners.add(fn);
  return () => hintListeners.delete(fn);
}
function readHint() {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
}
function writeHint() {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {}
  hintListeners.forEach((fn) => fn());
}
