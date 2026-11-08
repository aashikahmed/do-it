"use client";

import { ChevronsLeftRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FEELS,
  MAX_VALUE,
  countJumps,
  heldStep,
  jumpLabel,
  plateStep,
  tapeFor,
  timeJumps,
  timeWheels,
  type Feel,
  type Tracking,
} from "@/lib/measure";

const clampTo = (v: number, max = MAX_VALUE) => Math.max(0, Math.min(max, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const roundTo = (v: number, s: number) => Math.round(v / s) * s;
const nf = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

type Size = "lg" | "md";
/** Controls sit on the check-in card (paper) at lg, and on a mist panel at md. */
const well = (size: Size) => (size === "lg" ? "bg-mist" : "bg-paper");
type Change = (v: number | null) => void;

function useLatest<T>(v: T) {
  const r = useRef(v);
  useLayoutEffect(() => {
    r.current = v;
  });
  return r;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The right picker for the pact's measure. `value` is in the stored unit (seconds for time).
 * Count: ± (held speeds up), elastic scrub and jump chips. Time: wheels and chips.
 * Distance and weight: a tape at 0.1 per tick (10 m for metres). The number can always be typed.
 */
export function ValueInput({ t, value, onChange, size = "lg", id }: { t: Tracking; value: number | null; onChange: Change; size?: Size; id?: string }) {
  // What the input opened with (the last logged value, or the target), for the "Back to" chip.
  const [start] = useState(value);
  if (t.measure === "time") return <TimeInput t={t} value={value} onChange={onChange} start={start} size={size} id={id} />;
  if (t.measure === "count") return <CountInput t={t} value={value} onChange={onChange} start={start} size={size} id={id} />;
  return <TapeInput t={t} value={value} onChange={onChange} start={start} size={size} id={id} />;
}

/* ---------- Count ---------- */

function CountInput({ t, value, onChange, start, size, id }: { t: Tracking; value: number | null; onChange: Change; start: number | null; size: Size; id?: string }) {
  // Sized once: chips that resize under your finger are hard to hit twice.
  const [jumps] = useState(() => countJumps(t.target ?? start));
  const fmt = (n: number) => nf.format(n);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <HoldStep dir={-1} value={value} onChange={onChange} size={size} />
        <NumberField t={t} value={value} onChange={onChange} size={size} id={id} />
        <HoldStep dir={1} value={value} onChange={onChange} size={size} />
      </div>
      <TypeHint />
      <Scrub value={value} onChange={onChange} unit={t.unit} size={size} />
      <Chips
        size={size}
        value={value}
        onChange={onChange}
        start={start}
        jumps={[-jumps[0], ...jumps].map((j) => ({ label: `${j < 0 ? "−" : "+"}${fmt(Math.abs(j))}`, apply: (v) => clampTo(v + j) }))}
      />
    </div>
  );
}

/** ± that steps by one on a tap and speeds up while held (see heldStep). */
function HoldStep({ dir, value, onChange, size }: { dir: 1 | -1; value: number | null; onChange: Change; size: Size }) {
  // Written ahead of the parent's re-render, so fast repeats build on the last step.
  const cur = useRef(value);
  useLayoutEffect(() => {
    cur.current = value;
  });
  const emit = useLatest(onChange);
  const timers = useRef<{ delay?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval>; t0: number }>({ t0: 0 });
  const [holding, setHolding] = useState(false);

  function bump(heldMs: number) {
    const v = cur.current ?? 0;
    const s = heldStep(v, heldMs);
    const next = clampTo(heldMs < 900 ? v + dir * s : roundTo(v + dir * s, s));
    cur.current = next;
    emit.current(next);
  }
  function stop() {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.repeat);
    setHolding(false);
  }
  useEffect(() => {
    const tm = timers.current;
    return () => {
      clearTimeout(tm.delay);
      clearInterval(tm.repeat);
    };
  }, []);

  return (
    <button
      type="button"
      aria-label={dir < 0 ? "One less" : "One more"}
      className={`flex shrink-0 touch-none items-center justify-center rounded-full font-bold select-none transition-colors ${
        holding ? "bg-[var(--pact)] text-[var(--pact-ink)]" : well(size)
      } ${size === "lg" ? "h-12 w-12 text-[24px]" : "h-11 w-11 text-[22px]"}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        timers.current.t0 = performance.now();
        bump(0);
        timers.current.delay = setTimeout(() => {
          setHolding(true);
          timers.current.repeat = setInterval(() => bump(performance.now() - timers.current.t0), 80);
        }, 380);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          bump(0);
        }
      }}
    >
      {dir < 0 ? "−" : "+"}
    </button>
  );
}

/**
 * Pull the handle and hold: the further from the middle, the faster the number runs, scaled to where
 * you started. Let go and it springs back. The number snaps coarser while it moves fast.
 */
function Scrub({ value, onChange, unit, size }: { value: number | null; onChange: Change; unit: string | null; size: Size }) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const ticks = useRef<HTMLDivElement>(null);
  const cur = useRef(value);
  useLayoutEffect(() => {
    cur.current = value;
  });
  const emit = useLatest(onChange);
  const s = useRef({ on: false, x0: 0, dx: 0, anchor: 0, acc: 0, last: 0, raf: 0, offset: 0, maxRate: 0 });
  const [on, setOn] = useState(false);

  useEffect(() => () => cancelAnimationFrame(s.current.raf), []);

  const limit = () => Math.max(1, (track.current?.clientWidth ?? 300) / 2 - 40);
  const gran = (rate: number) => (rate > 250 ? 50 : rate > 60 ? 10 : rate > 15 ? 5 : 1);

  function frame(now: number) {
    const st = s.current;
    const dt = Math.min(0.05, (now - st.last) / 1000);
    st.last = now;
    const n = Math.max(-1, Math.min(1, st.dx / limit()));
    const rate = Math.sign(n) * Math.abs(n) ** 2.2 * st.maxRate;
    st.acc += rate * dt;
    const raw = clampTo(st.anchor + st.acc);
    st.acc = raw - st.anchor;
    const next = clampTo(roundTo(raw, gran(Math.abs(rate))));
    if (next !== cur.current) {
      cur.current = next;
      emit.current(next);
    }
    st.offset -= rate * dt * (400 / st.maxRate);
    if (ticks.current) ticks.current.style.backgroundPositionX = `${st.offset % 12}px`;
    st.raf = requestAnimationFrame(frame);
  }

  function end() {
    const st = s.current;
    if (!st.on) return;
    st.on = false;
    setOn(false);
    cancelAnimationFrame(st.raf);
    st.dx = 0;
    if (thumb.current) thumb.current.style.transform = "translateX(0)";
  }

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={`Drag to change ${unit ?? "the number"}. Further from the middle is faster.`}
      aria-valuenow={value ?? 0}
      aria-valuemin={0}
      aria-valuemax={MAX_VALUE}
      className={`relative h-12 touch-none overflow-hidden rounded-full select-none ${well(size)} ${on ? "cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const st = s.current;
        st.on = true;
        setOn(true);
        st.x0 = e.clientX;
        st.dx = 0;
        st.anchor = cur.current ?? 0;
        st.acc = 0;
        st.maxRate = Math.max(40, st.anchor * 0.9);
        st.last = performance.now();
        st.raf = requestAnimationFrame(frame);
      }}
      onPointerMove={(e) => {
        const st = s.current;
        if (!st.on) return;
        st.dx = Math.max(-limit(), Math.min(limit(), e.clientX - st.x0));
        if (thumb.current) thumb.current.style.transform = `translateX(${st.dx}px)`;
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        emit.current(clampTo((cur.current ?? 0) + d * (e.shiftKey ? 10 : 1)));
      }}
    >
      <div
        ref={ticks}
        aria-hidden
        className="absolute inset-x-0 inset-y-3.5 bg-[repeating-linear-gradient(90deg,var(--color-line)_0_2px,transparent_2px_12px)]"
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[13px] font-extrabold text-ink-3">
        Less
      </span>
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-[13px] font-extrabold text-ink-3">
        More
      </span>
      <div
        ref={thumb}
        aria-hidden
        className={`absolute top-1 left-1/2 -ml-9 grid h-10 w-18 place-items-center rounded-full bg-[var(--pact)] text-[var(--pact-ink)] shadow-[0_6px_16px_-6px_rgba(16,20,58,0.5)] ${
          on ? "" : "transition-transform duration-[450ms] ease-spring motion-reduce:transition-none"
        }`}
      >
        <ChevronsLeftRight size={20} strokeWidth={2.5} />
      </div>
    </div>
  );
}

/* ---------- Distance and weight ---------- */

function TapeInput({ t, value, onChange, start, size, id }: { t: Tracking; value: number | null; onChange: Change; start: number | null; size: Size; id?: string }) {
  const plate = t.measure === "weight" ? plateStep(t.unit) : null;
  return (
    <div className="space-y-2.5">
      <NumberField t={t} value={value} onChange={onChange} size={size} id={id} />
      <TypeHint />
      <Tape t={t} value={value} onChange={onChange} size={size} />
      <Chips
        size={size}
        value={value}
        onChange={onChange}
        start={start}
        jumps={plate ? [-plate, plate].map((j) => ({ label: `${j < 0 ? "−" : "+"}${Math.abs(j)}`, apply: (v) => clampTo(round2(v + j)) })) : []}
      />
    </div>
  );
}

/** A measuring tape you drag or flick. It coasts, then snaps to the nearest tick. */
function Tape({ t, value, onChange, size }: { t: Tracking; value: number | null; onChange: Change; size: Size }) {
  const { tick, majorEvery, labelEvery, px } = tapeFor(t);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const emit = useLatest(onChange);
  const s = useRef({ v: value ?? 0, vel: 0, drag: false, lastX: 0, lastT: 0, raf: 0, emitted: value as number | null });

  const snap = (v: number) => round2(clampTo(roundTo(v, tick)));

  function draw() {
    const cv = canvas.current;
    const el = box.current;
    if (!cv || !el) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const css = getComputedStyle(el);
    const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const v = s.current.v;
    const cx = w / 2;
    const span = Math.ceil(cx / px) + 2;
    const k0 = Math.round(v / tick);
    g.font = `700 13px ${css.fontFamily}`;
    g.textAlign = "center";
    const ink2 = color("--color-ink-2", "#4a5078");
    const ink3 = color("--color-ink-3", "#8a8fb0");
    const line = color("--color-line", "#dde0ee");
    for (let k = Math.max(0, k0 - span); k <= k0 + span; k++) {
      const val = k * tick;
      if (val > MAX_VALUE) break;
      const x = Math.round(cx + ((val - v) / tick) * px);
      const labelled = k % labelEvery === 0;
      const major = k % majorEvery === 0;
      g.fillStyle = labelled ? ink2 : major ? ink3 : line;
      g.fillRect(x - 1, 8, 2, labelled ? 24 : major ? 16 : 10);
      if (labelled) {
        g.fillStyle = ink2;
        g.fillText(nf.format(round2(val)), x, 52);
      }
    }
    g.fillStyle = color("--pact", color("--color-blue", "#2b3cf0"));
    g.fillRect(cx - 2, 0, 4, 38);
  }

  function publish() {
    const next = snap(s.current.v);
    draw();
    if (next !== s.current.emitted) {
      s.current.emitted = next;
      emit.current(next);
    }
  }

  function settle() {
    const st = s.current;
    cancelAnimationFrame(st.raf);
    const target = snap(st.v);
    const step = () => {
      st.v += (target - st.v) * 0.3;
      if (Math.abs(target - st.v) < tick / 200 || prefersReducedMotion()) {
        st.v = target;
        publish();
        return;
      }
      draw();
      st.raf = requestAnimationFrame(step);
    };
    step();
  }

  function coast() {
    const st = s.current;
    st.vel *= 0.94;
    st.v = clampTo(st.v + st.vel * 16);
    publish();
    if (Math.abs(st.vel) * 16 < tick / 20 || st.v === 0 || st.v === MAX_VALUE) return settle();
    st.raf = requestAnimationFrame(coast);
  }

  // Follow outside changes (typing, chips) unless the tape itself made them.
  useEffect(() => {
    const st = s.current;
    if (st.drag || value === st.emitted) return;
    cancelAnimationFrame(st.raf);
    st.v = value ?? 0;
    st.emitted = value;
    draw();
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    document.fonts?.ready.then(() => draw());
    const st = s.current;
    // Wheel and trackpad scrolling; needs a non-passive listener to keep the page still.
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(st.raf);
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      st.v = clampTo(st.v + (d / px) * tick * 0.5);
      publish();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 140);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
      clearTimeout(settleTimer);
      cancelAnimationFrame(st.raf);
    };
    // draw/publish/settle read refs only; bind once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, px]);

  function up() {
    const st = s.current;
    if (!st.drag) return;
    st.drag = false;
    if (performance.now() - st.lastT > 80 || prefersReducedMotion()) st.vel = 0;
    st.raf = requestAnimationFrame(coast);
  }

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label={`Drag the tape to set ${t.unit ?? "the value"}`}
      aria-valuenow={value ?? 0}
      aria-valuemin={0}
      aria-valuemax={MAX_VALUE}
      className={`relative h-16 cursor-grab touch-none overflow-hidden rounded-2xl select-none active:cursor-grabbing ${well(size)}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const st = s.current;
        cancelAnimationFrame(st.raf);
        st.drag = true;
        st.vel = 0;
        st.lastX = e.clientX;
        st.lastT = performance.now();
      }}
      onPointerMove={(e) => {
        const st = s.current;
        if (!st.drag) return;
        const now = performance.now();
        const dv = (-(e.clientX - st.lastX) / px) * tick;
        st.v = clampTo(st.v + dv);
        st.vel = 0.8 * (dv / Math.max(1, now - st.lastT)) + 0.2 * st.vel;
        st.lastX = e.clientX;
        st.lastT = now;
        publish();
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const st = s.current;
        cancelAnimationFrame(st.raf);
        st.v = clampTo(snap(st.v) + d * tick * (e.shiftKey ? majorEvery : 1));
        publish();
      }}
    >
      <canvas ref={canvas} aria-hidden className="block h-full w-full" />
      <div aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-linear-to-r to-transparent ${size === "lg" ? "from-mist" : "from-paper"}`} />
      <div aria-hidden className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l to-transparent ${size === "lg" ? "from-mist" : "from-paper"}`} />
    </div>
  );
}

/* ---------- Time ---------- */

const ROW = 36;
type Col = "h" | "m" | "s";

function TimeInput({ t, value, onChange, start, size, id }: { t: Tracking; value: number | null; onChange: Change; start: number | null; size: Size; id?: string }) {
  // Decided once, so the columns don't change under your finger.
  const [shows] = useState(() => timeWheels(t, value));
  const cols: Col[] = [...(shows.hours ? (["h"] as const) : []), "m", ...(shows.seconds ? (["s"] as const) : [])];
  const max = (shows.hours ? 23 * 3600 + 59 * 60 : 59 * 60) + (shows.seconds ? 59 : 0);
  const total = value ?? 0;
  const parts = { h: shows.hours ? Math.floor(total / 3600) : 0, m: 0, s: 0 };
  const afterH = total - parts.h * 3600;
  parts.m = Math.min(59, Math.floor(afterH / 60));
  parts.s = shows.seconds ? Math.min(59, Math.round(afterH - parts.m * 60)) : 0;
  const setPart = (c: Col, n: number) => {
    const next = { ...parts, [c]: n };
    onChange(clampTo(next.h * 3600 + next.m * 60 + next.s, max));
  };

  return (
    <div className="space-y-2.5">
      <div className={`relative flex justify-center gap-1 rounded-2xl px-2 ${well(size)}`} role="group" aria-label="Time">
        <div aria-hidden className={`pointer-events-none absolute inset-x-2 top-1/2 -mt-[18px] h-9 rounded-xl ${size === "lg" ? "bg-paper" : "bg-mist"}`} />
        {cols.map((c, i) => (
          <Wheel
            key={c}
            id={i === 0 ? id : undefined}
            count={c === "h" ? 24 : 60}
            pad={c !== "h"}
            index={parts[c]}
            label={c === "h" ? "h" : c === "m" ? "min" : "s"}
            aria={c === "h" ? "Hours" : c === "m" ? "Minutes" : "Seconds"}
            onPick={(n) => setPart(c, n)}
          />
        ))}
      </div>
      <Chips
        size={size}
        value={value}
        onChange={onChange}
        start={start}
        jumps={timeJumps(shows.hours).map((j) => ({ label: jumpLabel(j), apply: (v) => clampTo(v + j, max) }))}
      />
    </div>
  );
}

/** A scroll-snap column, like the iOS timer. Native momentum on touch; drag with a flick for mouse. */
function Wheel({ count, pad, index, label, aria, onPick, id }: { count: number; pad: boolean; index: number; label: string; aria: string; onPick: (n: number) => void; id?: string }) {
  const list = useRef<HTMLDivElement>(null);
  const pick = useLatest(onPick);
  const shown = useRef(index);
  const drag = useRef({ on: false, y0: 0, top0: 0, vy: 0, ly: 0, lt: 0 });

  // Follow outside changes (chips); a scroll we caused reads back the same index and stops here.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el || drag.current.on) return;
    if (Math.round(el.scrollTop / ROW) !== index) el.scrollTop = index * ROW;
    shown.current = index;
  }, [index]);

  const at = (n: number) => Math.max(0, Math.min(count - 1, n));

  return (
    <div className="relative flex items-center gap-1">
      <div
        ref={list}
        id={id}
        tabIndex={0}
        role="spinbutton"
        aria-label={aria}
        aria-valuenow={index}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        className="relative h-[180px] w-14 cursor-grab snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [-webkit-mask-image:linear-gradient(180deg,transparent,#000_30%,#000_70%,transparent)] [mask-image:linear-gradient(180deg,transparent,#000_30%,#000_70%,transparent)] [&::-webkit-scrollbar]:hidden"
        style={{ paddingBlock: ROW * 2 }}
        onScroll={(e) => {
          const n = at(Math.round(e.currentTarget.scrollTop / ROW));
          if (n !== shown.current) {
            shown.current = n;
            pick.current(n);
          }
        }}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          const d = drag.current;
          Object.assign(d, { on: true, y0: e.clientY, ly: e.clientY, top0: e.currentTarget.scrollTop, vy: 0, lt: performance.now() });
          e.currentTarget.style.scrollSnapType = "none";
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d.on) return;
          const now = performance.now();
          d.vy = (e.clientY - d.ly) / Math.max(1, now - d.lt);
          d.ly = e.clientY;
          d.lt = now;
          e.currentTarget.scrollTop = d.top0 - (e.clientY - d.y0);
        }}
        onLostPointerCapture={(e) => {
          const d = drag.current;
          if (!d.on) return;
          d.on = false;
          const el = e.currentTarget;
          const fling = performance.now() - d.lt > 80 ? 0 : -d.vy * 260;
          el.scrollTo({ top: at(Math.round((el.scrollTop + fling) / ROW)) * ROW, behavior: prefersReducedMotion() ? "auto" : "smooth" });
          setTimeout(() => (el.style.scrollSnapType = ""), 450);
        }}
        onKeyDown={(e) => {
          const d = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
          if (!d) return;
          e.preventDefault();
          e.currentTarget.scrollTop = at(index + d) * ROW;
        }}
      >
        {Array.from({ length: count }, (_, n) => (
          <div
            key={n}
            className={`tnum grid h-9 snap-center place-items-center text-[24px] font-extrabold ${n === index ? "text-ink" : "text-ink-3"}`}
          >
            {pad ? String(n).padStart(2, "0") : n}
          </div>
        ))}
      </div>
      <span className="relative w-7 text-[15px] font-bold text-ink-2">{label}</span>
    </div>
  );
}

/* ---------- Shared ---------- */

function TypeHint() {
  return <p className="-mt-1.5 text-center text-[12px] text-ink-3">Tap the number to type</p>;
}

function Chips({
  size,
  value,
  onChange,
  start,
  jumps,
}: {
  size: Size;
  value: number | null;
  onChange: Change;
  start: number | null;
  jumps: { label: string; apply: (v: number) => number }[];
}) {
  if (start === null && !jumps.length) return null;
  const chip =
    "tnum h-9 max-w-32 min-w-0 flex-1 truncate rounded-full px-2 text-[14px] font-extrabold transition-transform active:scale-95 motion-reduce:active:scale-100 disabled:opacity-40";
  return (
    <div className="flex justify-center gap-1.5">
      {start !== null && (
        <button
          type="button"
          disabled={value === start}
          onClick={() => onChange(start)}
          aria-label="Reset to where you started"
          className={`${chip} bg-[var(--pact-soft,var(--color-mist))]`}
        >
          Reset
        </button>
      )}
      {jumps.map((j) => (
        <button key={j.label} type="button" onClick={() => onChange(j.apply(value ?? 0))} className={`${chip} ${well(size)}`}>
          {j.label}
        </button>
      ))}
    </div>
  );
}

/** The number itself, always typeable. */
function NumberField({ t, value, onChange, size, id }: { t: Tracking; value: number | null; onChange: Change; size: Size; id?: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1">
      <input
        id={id}
        inputMode={t.measure === "count" || t.unit === "m" ? "numeric" : "decimal"}
        value={value === null ? "" : String(value)}
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "").slice(0, 8);
          if (raw === "") return onChange(null);
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(clampTo(n));
        }}
        className={`display tnum w-[4.2ch] min-w-0 bg-transparent text-right font-extrabold outline-none placeholder:text-ink-3/50 ${
          size === "lg" ? "text-[40px]" : "text-[30px]"
        }`}
        aria-label={`How many ${t.unit ?? ""}`.trim()}
      />
      <span className="truncate pl-1 text-[16px] font-bold text-ink-2">{t.unit}</span>
    </div>
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
