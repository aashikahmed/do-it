"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useOptimistic, useRef, useState, useTransition, type PointerEvent, type ReactNode } from "react";
import type { Checkin, Me, PactBundle, Reaction } from "@/lib/data";
import { setHeart } from "@/lib/client-actions";
import { firstName, listNames } from "@/lib/view";
import { toast } from "./toast";

const PATH = "M12 21.2s-7.6-4.7-10.1-9.4C.3 8.5 2.1 4.4 5.9 4c2.2-.2 4.2.9 6.1 3 1.9-2.1 3.9-3.2 6.1-3 3.8.4 5.6 4.5 4 7.8C19.6 16.5 12 21.2 12 21.2z";

export function HeartIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path d={PATH} fill="currentColor" />
    </svg>
  );
}

/** taps this close in time and space belong to the same double- or triple-tap */
const TAP_MS = 350;
const TAP_PX = 30;

/**
 * A row for a check-in that someone else can react to. Deliberately unannounced, with no buttons:
 * a double-tap sends a heart, a triple-tap a fire. People find them when one shows up on their own check-in.
 * One reaction per person: fire replaces a heart, a heart never replaces a fire.
 * `children` gets the "♥ You and Priya  🔥 Sam" line to place under the note.
 */
export function HeartRow({
  b,
  me,
  c,
  className,
  children,
}: {
  b: PactBundle;
  me: Me;
  /** the check-in this row shows, if any */
  c: Checkin | undefined;
  className: string;
  children: (hearts: ReactNode) => ReactNode;
}) {
  const reactions = c ? b.hearts.filter((h) => h.checkin_id === c.id) : [];
  const can = !!c && c.user_id !== me.id && b.members.some((m) => m.user_id === me.id);
  const [mine, setMine] = useOptimistic<Reaction | null>(reactions.find((h) => h.from_user === me.id)?.kind ?? null);
  const [, start] = useTransition();
  const [bloom, setBloom] = useState<{ n: number; kind: Reaction }>({ n: 0, kind: "heart" });
  const taps = useRef<{ t: number; x: number; y: number; count: number } | null>(null);
  /** set by a triple-tap so the double-tap that came first doesn't also save a heart */
  const fired = useRef(false);
  const reduce = useReducedMotion();

  const nameOf = (id: string) => firstName(b.allMembers.find((m) => m.user_id === id)?.name ?? "Someone");
  const owner = c ? nameOf(c.user_id) : "";

  function save(on: boolean, kind: Reaction = "heart") {
    if (!c) return Promise.resolve();
    return setHeart({ pactId: b.pact.id, checkinId: c.id, on, kind }).then((res) => {
      if (!res.ok) toast(res.error, "error");
    });
  }

  function takeBack() {
    start(async () => {
      setMine(null);
      await save(false);
    });
  }

  // a heart waits out the triple-tap window before saving, so a fire never sends a heart first
  function heart() {
    setBloom((x) => ({ n: x.n + 1, kind: "heart" }));
    navigator.vibrate?.(10);
    if (mine) return;
    fired.current = false;
    start(async () => {
      setMine("heart");
      await new Promise((r) => setTimeout(r, TAP_MS));
      if (!fired.current) await save(true, "heart");
    });
  }

  function fire() {
    fired.current = true;
    setBloom((x) => ({ n: x.n + 1, kind: "fire" }));
    navigator.vibrate?.([10, 40, 20]);
    if (mine === "fire") return;
    start(async () => {
      setMine("fire");
      await save(true, "fire");
    });
  }

  function onPointerUp(e: PointerEvent<HTMLLIElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea")) return;
    const p = taps.current;
    const chained = p && p.count < 3 && e.timeStamp - p.t < TAP_MS && Math.hypot(e.clientX - p.x, e.clientY - p.y) < TAP_PX;
    const count = chained ? p.count + 1 : 1;
    taps.current = { t: e.timeStamp, x: e.clientX, y: e.clientY, count };
    if (count === 2) heart();
    if (count === 3) fire();
  }

  // everyone's reaction, with the viewer's (possibly still saving) one in place of what the server has
  const others = reactions.filter((h) => h.from_user !== me.id);
  const groups = (["heart", "fire"] as const)
    .map((kind) => {
      const names = [...(mine === kind ? ["You"] : []), ...others.filter((h) => h.kind === kind).map((h) => nameOf(h.from_user))];
      return { kind, names, isMine: mine === kind };
    })
    .filter((g) => g.names.length > 0);

  const icon = (kind: Reaction) =>
    kind === "fire" ? (
      <span aria-hidden className="text-[13px] leading-none">
        🔥
      </span>
    ) : (
      <HeartIcon className="text-rose" />
    );

  const line = (
    <AnimatePresence initial={false}>
      {groups.length > 0 && (
        <motion.span
          key="hearts"
          className="mt-1 flex flex-wrap gap-x-3 gap-y-1"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          style={{ transformOrigin: "left center" }}
        >
          {groups.map((g) =>
            g.isMine ? (
              <button key={g.kind} type="button" onClick={takeBack} className="flex items-center gap-1 text-[13px] font-semibold text-ink-2">
                {icon(g.kind)}
                {listNames(g.names)}
                <span className="sr-only">{g.kind === "fire" ? " sent fire" : " sent a heart"}. Tap to take yours back.</span>
              </button>
            ) : (
              <span key={g.kind} className="flex items-center gap-1 text-[13px] font-semibold text-ink-2">
                {icon(g.kind)}
                {listNames(g.names)}
                <span className="sr-only">{g.kind === "fire" ? " sent fire" : " sent a heart"}</span>
              </span>
            ),
          )}
        </motion.span>
      )}
    </AnimatePresence>
  );

  return (
    <li
      className={`relative ${can ? "select-none" : ""} ${className}`}
      onPointerUp={can ? onPointerUp : undefined}
      style={can ? { touchAction: "manipulation" } : undefined}
    >
      {children(line)}
      {can && !mine && (
        <button
          type="button"
          onClick={heart}
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:right-2 focus-visible:z-10 focus-visible:rounded-full focus-visible:bg-ink focus-visible:px-3 focus-visible:py-1.5 focus-visible:text-[13px] focus-visible:font-bold focus-visible:text-white"
        >
          Send {owner} a heart
        </button>
      )}
      <AnimatePresence>
        {bloom.n > 0 && (
          <motion.span
            key={bloom.n}
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-rose"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.2 }}
            animate={
              reduce
                ? { opacity: [0, 1, 0] }
                : bloom.kind === "fire"
                  ? { opacity: [1, 1, 1, 0], scale: [0.8, 1.45, 1.15, 1.3], rotate: [0, -8, 6, 0], y: [0, 0, 0, -14] }
                  : { opacity: [0, 1, 1, 0], scale: [0.2, 1.15, 1, 1.1], y: [0, 0, 0, -8] }
            }
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: bloom.kind === "fire" ? 1 : 0.9, times: reduce ? [0, 0.4, 1] : [0, 0.25, 0.7, 1], ease: "easeOut" }}
          >
            {bloom.kind === "fire" ? (
              <span className="text-[76px] leading-none drop-shadow-[0_6px_16px_rgba(255,91,58,0.45)]">🔥</span>
            ) : (
              <HeartIcon size={76} className="drop-shadow-[0_4px_12px_rgba(242,69,127,0.35)]" />
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </li>
  );
}
