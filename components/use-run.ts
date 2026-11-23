"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export interface RunFrame {
  /** where each value is right now */
  values: number[];
  /** the beat before the start */
  pre: boolean;
  /** 0..1, how fast things are moving (for speed lines) */
  speed: number;
  /** 0..1 after the first run lands (what's left fades in) */
  post: number;
  running: boolean;
}

/**
 * Runs a few numbers from 0 to their targets when the component mounts (after a short beat), and from where they were
 * to the new targets when they change (someone checks in). Tap: skip a run, or replay once it's done.
 * `once`: a sessionStorage key so only the first mount per session plays (home cards).
 * Reduced motion: no animation, everything starts where it ends.
 */
export function useRun(targets: number[], o: { delay?: number; ms: (distance: number) => number; once?: string; onSettled?: () => void }) {
  const reduce = useReducedMotion();
  const key = targets.join(",");
  const [frame, setFrame] = useState<RunFrame>(() => ({ values: targets.map(() => 0), pre: true, speed: 0, post: 0, running: true }));
  const shown = useRef<number[] | null>(null);
  const skip = useRef(false);
  const forced = useRef(false);
  const [nonce, setNonce] = useState(0);
  const opts = useRef(o);
  useEffect(() => {
    opts.current = o;
  });

  useEffect(() => {
    if (reduce) {
      opts.current.onSettled?.();
      return;
    }
    const to = key ? key.split(",").map(Number) : [];
    const first = shown.current === null;
    let instant = false;
    const once = opts.current.once;
    if (first && once && !forced.current) {
      try {
        instant = !!sessionStorage.getItem(once);
      } catch {}
    }
    forced.current = false;
    const from = first ? to.map(() => 0) : to.map((_, i) => shown.current?.[i] ?? 0);
    const delay = first && !instant ? (opts.current.delay ?? 300) : 0;
    const distance = Math.max(0, ...to.map((v, i) => Math.abs(v - from[i])));
    const dur = instant ? 0 : Math.max(1, opts.current.ms(distance));
    skip.current = false;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const tm = skip.current ? 1e9 : now - t0;
      const run = dur ? clamp((tm - delay) / dur) : 1;
      const e = easeOut(run);
      const values = to.map((v, i) => from[i] + (v - from[i]) * e);
      const post = first && !instant ? clamp((tm - delay - dur) / 650) : 1;
      const speed = tm > delay && run < 1 ? clamp(3 * (1 - run) ** 2) : 0;
      shown.current = values;
      setFrame({ values, pre: tm < delay, speed, post, running: run < 1 || post < 1 });
      if (run < 1 || post < 1) raf = requestAnimationFrame(tick);
      else {
        if (once) {
          try {
            sessionStorage.setItem(once, "1");
          } catch {}
        }
        opts.current.onSettled?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, reduce, nonce]);

  const running = frame.running;
  const tap = useCallback(() => {
    if (running) skip.current = true;
    else {
      shown.current = null;
      forced.current = true;
      setNonce((n) => n + 1);
    }
  }, [running]);

  if (reduce) return { values: targets, pre: false, speed: 0, post: 1, running: false, tap: () => {} };
  return { ...frame, tap };
}
