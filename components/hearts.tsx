"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useOptimistic, useRef, useState, useTransition, type PointerEvent, type ReactNode } from "react";
import type { Checkin, Me, PactBundle } from "@/lib/data";
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

/** two taps this close in time and space are a double-tap */
const DOUBLE_MS = 350;
const DOUBLE_PX = 30;

/**
 * A row for a check-in that someone else can double-tap to send a heart. Deliberately unannounced:
 * there's no button, and people find it when a heart shows up on their own check-in.
 * `children` gets the "♥ You and Priya" line to place under the note.
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
  const from = c ? b.hearts.filter((h) => h.checkin_id === c.id).map((h) => h.from_user) : [];
  const can = !!c && c.user_id !== me.id && b.members.some((m) => m.user_id === me.id);
  const [mine, setMine] = useOptimistic(from.includes(me.id));
  const [, start] = useTransition();
  const [bloom, setBloom] = useState(0);
  const last = useRef<{ t: number; x: number; y: number } | null>(null);
  const reduce = useReducedMotion();

  const nameOf = (id: string) => firstName(b.allMembers.find((m) => m.user_id === id)?.name ?? "Someone");
  const owner = c ? nameOf(c.user_id) : "";

  function send(on: boolean) {
    if (!c) return;
    start(async () => {
      setMine(on);
      const res = await setHeart({ pactId: b.pact.id, checkinId: c.id, on });
      if (!res.ok) toast(res.error, "error");
    });
  }

  // like Instagram: a double-tap only ever adds; taking it back is a tap on your name
  function love() {
    setBloom((n) => n + 1);
    navigator.vibrate?.(10);
    if (!mine) send(true);
  }

  function onPointerUp(e: PointerEvent<HTMLLIElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea")) return;
    const p = last.current;
    if (p && e.timeStamp - p.t < DOUBLE_MS && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DOUBLE_PX) {
      last.current = null;
      love();
    } else {
      last.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    }
  }

  const names = [...(mine ? ["You"] : []), ...from.filter((u) => u !== me.id).map(nameOf)];
  const text = listNames(names);
  const line = (
    <AnimatePresence initial={false}>
      {names.length > 0 && (
        <motion.span
          key="hearts"
          className="mt-1 flex"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          style={{ transformOrigin: "left center" }}
        >
          {mine ? (
            <button type="button" onClick={() => send(false)} className="flex items-center gap-1 text-[13px] font-semibold text-ink-2">
              <HeartIcon className="text-rose" />
              {text}
              <span className="sr-only">. Tap to take your heart back.</span>
            </button>
          ) : (
            <span className="flex items-center gap-1 text-[13px] font-semibold text-ink-2">
              <HeartIcon className="text-rose" />
              {text}
            </span>
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
          onClick={love}
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:right-2 focus-visible:z-10 focus-visible:rounded-full focus-visible:bg-ink focus-visible:px-3 focus-visible:py-1.5 focus-visible:text-[13px] focus-visible:font-bold focus-visible:text-white"
        >
          Send {owner} a heart
        </button>
      )}
      <AnimatePresence>
        {bloom > 0 && (
          <motion.span
            key={bloom}
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-rose"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.2 }}
            animate={reduce ? { opacity: [0, 1, 0] } : { opacity: [0, 1, 1, 0], scale: [0.2, 1.15, 1, 1.1], y: [0, 0, 0, -8] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, times: reduce ? [0, 0.4, 1] : [0, 0.25, 0.7, 1], ease: "easeOut" }}
          >
            <HeartIcon size={76} className="drop-shadow-[0_4px_12px_rgba(242,69,127,0.35)]" />
          </motion.span>
        )}
      </AnimatePresence>
    </li>
  );
}
