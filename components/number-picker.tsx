"use client";

import { useState } from "react";
import { ValueInput } from "@/components/measure-input";
import { Segmented } from "@/components/pact-fields";
import type { NumberLevel } from "@/lib/explore/levels";
import type { Tracking } from "@/lib/measure";

/** Your own number for a pact: the idea's levels if it came from one, and the input it's logged with. Null is any amount. */
export function NumberPicker({ t, levels, value, onChange }: { t: Tracking; levels: NumberLevel[]; value: number | null; onChange: (v: number | null) => void }) {
  // the hardest level they reach, to start with; after that, the one they tapped
  const [level, setLevel] = useState(() => [...levels].reverse().find((l) => (t.direction === "down" ? (value ?? Infinity) <= l.target : (value ?? 0) >= l.target))?.id ?? levels[0]?.id ?? null);
  const at = levels.find((l) => l.id === level);
  return (
    <div>
      {at && (
        <>
          <Segmented
            label="Level"
            options={levels.map((l) => [l.id, l.name])}
            value={at.id}
            onChange={(v) => {
              const l = levels.find((x) => x.id === v)!;
              setLevel(l.id);
              onChange(l.target);
            }}
          />
          <p className="mx-1 mt-3 mb-3 text-[15px] leading-snug text-ink-2">{at.pickIf}.</p>
        </>
      )}
      <div key={level} className="rounded-2xl bg-mist/60 p-2">
        <ValueInput t={{ ...t, target: at?.target ?? t.target }} value={value} onChange={(v) => onChange(v || null)} size="md" />
      </div>
      <p className="mx-1 mt-2.5 text-[14px] leading-snug text-ink-2" aria-live="polite">
        {value ? "Any check-in counts for the streak. This is what you aim for." : "Any amount. Any check-in counts for the streak."}
      </p>
    </div>
  );
}
