"use client";

import { FEELS, stepFor, type Feel, type Tracking } from "@/lib/measure";

const clampTo = (v: number) => Math.max(0, Math.min(999999, v));
const round = (v: number) => Math.round(v * 100) / 100;

/** The right input for the pact's measure, with ± steppers. `value` is in the stored unit (seconds for time). */
export function ValueInput({
  t,
  value,
  onChange,
  size = "lg",
  id,
}: {
  t: Tracking;
  value: number | null;
  onChange: (v: number | null) => void;
  size?: "lg" | "md";
  id?: string;
}) {
  const step = stepFor(t, value);
  const big = size === "lg";
  const btn = `flex shrink-0 items-center justify-center rounded-full bg-mist font-bold ${big ? "h-12 w-12 text-[24px]" : "h-11 w-11 text-[22px]"}`;
  const field = `display tnum bg-transparent text-center font-extrabold outline-none ${big ? "text-[40px]" : "text-[30px]"}`;

  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Less" className={btn} onClick={() => onChange(clampTo(round((value ?? t.target ?? 0) - step)))}>
        −
      </button>
      <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
        {t.measure === "time" ? (
          <TimeFields value={value} onChange={onChange} className={field} id={id} />
        ) : (
          <>
            <input
              id={id}
              inputMode="decimal"
              value={value === null ? "" : String(value)}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9.]/g, "").slice(0, 8);
                if (raw === "") return onChange(null);
                const n = Number(raw);
                if (Number.isFinite(n)) onChange(clampTo(n));
              }}
              className={`${field} w-[4.2ch] min-w-0 text-right placeholder:text-ink-3/50`}
              aria-label={`How many ${t.unit ?? ""}`.trim()}
            />
            <span className="truncate pl-1 text-[16px] font-bold text-ink-2">{t.unit}</span>
          </>
        )}
      </div>
      <button type="button" aria-label="More" className={btn} onClick={() => onChange(clampTo(round((value ?? t.target ?? 0) + step)))}>
        +
      </button>
    </div>
  );
}

/** Minutes and seconds as two numeric fields (phone keyboards have no colon on the number pad). */
function TimeFields({ value, onChange, className, id }: { value: number | null; onChange: (v: number | null) => void; className: string; id?: string }) {
  const total = value ?? 0;
  const mins = Math.floor(total / 60);
  const secs = Math.round(total % 60);
  const set = (m: number, s: number) => onChange(m === 0 && s === 0 && value === null ? null : clampTo(m * 60 + s));
  return (
    <>
      <input
        id={id}
        inputMode="numeric"
        value={value === null ? "" : String(mins)}
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 3);
          set(raw === "" ? 0 : Number(raw), secs);
        }}
        className={`${className} w-[2.6ch] text-right placeholder:text-ink-3/50`}
        aria-label="Minutes"
      />
      <span className={`${className} -mx-0.5`}>:</span>
      <input
        inputMode="numeric"
        value={value === null ? "" : String(secs).padStart(2, "0")}
        placeholder="00"
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(-2);
          set(mins, Math.min(59, raw === "" ? 0 : Number(raw)));
        }}
        className={`${className} w-[2.1ch] text-left placeholder:text-ink-3/50`}
        aria-label="Seconds"
      />
      <span className="pl-1 text-[16px] font-bold text-ink-2">min</span>
    </>
  );
}

/** Optional one-tap "how did it go". Tapping the selected chip clears it. */
export function FeelPicker({ value, onChange }: { value: Feel | null; onChange: (v: Feel | null) => void }) {
  return (
    <div role="radiogroup" aria-label="How did it go?" className="grid grid-cols-3 gap-2">
      {FEELS.map((f) => {
        const on = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on ? null : f.value)}
            className={`h-11 rounded-2xl border-2 text-[15px] font-extrabold transition-colors ${
              on ? "border-[var(--pact)] bg-[var(--pact-soft)] text-ink" : "border-line bg-paper text-ink-2"
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
