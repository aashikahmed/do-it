"use client";

import { motion } from "motion/react";

/** Seven links close one after another, then the last one pulses: the whole idea in two seconds. */
export function LandingChain() {
  const W = 40, H = 26, STEP = 29, SW = 5.5;
  const rx = W / 2 - SW / 2, ry = H / 2 - SW / 2;
  return (
    <svg viewBox={`${-SW} ${-SW} ${W + 6 * STEP + SW * 2} ${H + SW * 2}`} className="w-full max-w-[340px]" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <motion.ellipse
          key={i}
          cx={i * STEP + W / 2}
          cy={H / 2}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={i === 6 ? "#ffc23d" : "#ffffff"}
          strokeWidth={SW}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0.25 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ delay: 0.25 + i * 0.16, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </svg>
  );
}
