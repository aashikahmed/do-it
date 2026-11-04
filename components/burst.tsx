"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

/** A one-shot celebration: links fly out from the center, then a big message lands. */
export function Burst({ show, title, subtitle, onDone }: { show: boolean; title: string; subtitle?: string; onDone: () => void }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => done.current(), 1900);
    return () => clearTimeout(t);
  }, [show]);
  const bits = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2 + (i % 2) * 0.17;
    const dist = 120 + (i % 3) * 46;
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, r: (i * 47) % 180, color: ["#ffc23d", "#ffffff", "#8fd3ff", "#ff5b3a"][i % 4] };
  });
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="burst"
          className="fixed inset-0 z-[90] mx-auto flex max-w-[440px] items-center justify-center text-[var(--pact-ink)]"
          style={{ background: "color-mix(in srgb, var(--pact) 94%, transparent)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          onClick={onDone}
          role="status"
        >
          {bits.map((b, i) => (
            <motion.svg
              key={i}
              viewBox="0 0 40 26"
              width="30"
              height="20"
              className="absolute"
              initial={{ x: 0, y: 0, scale: 0.2, rotate: 0, opacity: 1 }}
              animate={{ x: b.x, y: b.y, scale: 1, rotate: b.r, opacity: 0 }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <ellipse cx="20" cy="13" rx="17" ry="10" fill="none" stroke={b.color} strokeWidth="5" />
            </motion.svg>
          ))}
          <motion.div
            className="relative px-8 text-center"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.08 }}
          >
            <p className="display text-[64px] font-extrabold">{title}</p>
            {subtitle && <p className="mt-3 text-[18px] font-semibold opacity-85">{subtitle}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
