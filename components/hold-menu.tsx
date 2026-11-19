"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** how long to hold a row before its menu opens: shorter than the check-in button, it only opens a menu */
export const HOLD_MS = 450;
/** a finger that moves this far is scrolling, not holding */
const MOVE_PX = 10;

/**
 * Press and hold a row to open its menu. Tapping does nothing, so a stray tap (or a double-tap meant as a reaction)
 * never opens it. Phones can cancel a still touch on their own, so only a real move or a scroll stops the hold.
 * Enter or Space opens it straight away for keyboard users.
 */
export function useHold(onHold: (el: HTMLElement) => void, enabled: boolean) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  }, []);

  useEffect(() => {
    if (!holding) return;
    window.addEventListener("scroll", cancel, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", cancel, { capture: true });
  }, [holding, cancel]);
  useEffect(() => cancel, [cancel]);

  if (!enabled) return { holding: false, props: {} };
  return {
    holding,
    props: {
      tabIndex: 0,
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if ((e.target as HTMLElement).closest("button, a, input, textarea")) return;
        const el = e.currentTarget;
        origin.current = { x: e.clientX, y: e.clientY };
        setHolding(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          setHolding(false);
          navigator.vibrate?.(12);
          onHold(el);
        }, HOLD_MS);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const o = origin.current;
        if (timer.current && o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerLeave: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse") cancel();
      },
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !e.repeat) {
          e.preventDefault();
          onHold(e.currentTarget);
        }
      },
    },
  };
}

/** the fill that grows across a row while it's held */
export function HoldFill({ holding }: { holding: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 origin-left rounded-2xl bg-ink/[0.06] transition-transform ease-linear ${
        holding ? "scale-x-100 duration-[450ms]" : "scale-x-0 duration-150"
      }`}
    />
  );
}

const noop = () => () => {};

/**
 * The held row, lifted above everything else (dimmed), with a small menu under it, or above it near the bottom
 * of the screen. Tap outside or press Escape to back out.
 */
export function LiftMenu({
  anchor,
  onClose,
  preview,
  children,
}: {
  /** where the held row is on screen; null when closed */
  anchor: DOMRect | null;
  onClose: () => void;
  /** the row, drawn again on top of the dimmed page */
  preview: ReactNode;
  children: ReactNode;
}) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const reduce = useReducedMotion();
  const openedAt = useRef(0);
  const menu = useRef<HTMLDivElement>(null);
  const [menuHeight, setMenuHeight] = useState(140);

  useEffect(() => {
    if (!anchor) return;
    openedAt.current = performance.now();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true }), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [anchor, onClose]);

  if (!mounted) return null;
  const below = anchor ? anchor.bottom + 10 + menuHeight < window.innerHeight - 16 : true;
  const left = anchor ? Math.max(16, Math.min(anchor.left + 12, window.innerWidth - 16 - 250)) : 0;

  return createPortal(
    <AnimatePresence>
      {anchor && (
        <div key="lift" className="fixed inset-0 z-50">
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            // the finger that opened it lifts right after: don't let that count as a tap outside
            onClick={() => performance.now() - openedAt.current > 350 && onClose()}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute rounded-2xl bg-paper shadow-[0_14px_34px_-6px_rgba(16,20,58,0.35)]"
            style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
            initial={{ scale: 1 }}
            animate={{ scale: reduce ? 1 : 1.03 }}
            exit={{ scale: 1, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 26 }}
          >
            {preview}
          </motion.div>
          <motion.div
            ref={(el) => {
              menu.current = el;
              if (el && Math.abs(el.offsetHeight - menuHeight) > 4) setMenuHeight(el.offsetHeight);
            }}
            role="menu"
            className="absolute w-[250px] max-w-[calc(100vw-32px)] rounded-[18px] bg-paper p-1.5 shadow-[0_16px_44px_-8px_rgba(16,20,58,0.4)]"
            style={
              below
                ? { top: anchor.bottom + 10, left, transformOrigin: "top left" }
                : { bottom: window.innerHeight - anchor.top + 10, left, transformOrigin: "bottom left" }
            }
            initial={{ opacity: 0, scale: reduce ? 1 : 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.94, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 520, damping: 30 }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function MenuItem({ title, sub, onClick }: { title: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="grid w-full gap-px rounded-xl px-3 py-2.5 text-left outline-none hover:bg-mist focus-visible:bg-mist"
    >
      <span className="text-[16px] font-extrabold">{title}</span>
      {sub && <span className="text-[13px] leading-snug text-ink-3">{sub}</span>}
    </button>
  );
}
