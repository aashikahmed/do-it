"use client";

import { animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useRef, useState } from "react";

const HOLD_MS = 650;

/**
 * Press and hold to commit. Holding (instead of tapping) makes checking in feel deliberate
 * and stops accidental check-ins from a stray tap. Enter/Space commits instantly for keyboard users.
 */
export function HoldButton({
  label,
  holdingLabel = "Keep holding",
  busy,
  onComplete,
}: {
  label: string;
  holdingLabel?: string;
  busy?: boolean;
  onComplete: () => void;
}) {
  const progress = useMotionValue(0);
  const width = useTransform(progress, (v) => `${v * 100}%`);
  const scale = useTransform(progress, [0, 1], [1, 0.97]);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const [holding, setHolding] = useState(false);
  const fired = useRef(false);

  function start(e: React.PointerEvent) {
    if (busy || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    fired.current = false;
    setHolding(true);
    anim.current?.stop();
    anim.current = animate(progress, 1, {
      duration: (HOLD_MS / 1000) * (1 - progress.get()),
      ease: "linear",
      onComplete: () => {
        if (fired.current) return;
        fired.current = true;
        setHolding(false);
        navigator.vibrate?.(18);
        onComplete();
        animate(progress, 0, { duration: 0.35, delay: 0.25 });
      },
    });
  }

  function cancel() {
    if (fired.current) return;
    setHolding(false);
    anim.current?.stop();
    animate(progress, 0, { type: "spring", stiffness: 400, damping: 30 });
  }

  return (
    <motion.button
      type="button"
      disabled={busy}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !busy && !e.repeat) {
          e.preventDefault();
          onComplete();
        }
      }}
      style={{ scale }}
      className="relative h-[68px] w-full overflow-hidden rounded-[22px] bg-[var(--pact)] text-[19px] font-extrabold text-[var(--pact-ink)] shadow-[0_14px_30px_-12px_var(--pact)] disabled:opacity-70"
      aria-label={`${label}. Press and hold.`}
    >
      <motion.span aria-hidden className="absolute inset-y-0 left-0 bg-[var(--pact-deep)]" style={{ width }} />
      <span className="relative flex items-center justify-center gap-2">
        {busy ? (
          <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-current border-t-transparent" />
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path d="M5 12.5 10 17.5 19.5 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {holding ? holdingLabel : label}
          </>
        )}
      </span>
    </motion.button>
  );
}
