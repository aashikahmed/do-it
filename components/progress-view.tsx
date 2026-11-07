"use client";

import { useMemo, useState } from "react";
import type { Checkin, Me, PactBundle } from "@/lib/data";
import { diffDays, formatDay } from "@/lib/dates";
import { FEELS, formatDuration, formatShort, formatValue, pactDays, progressStats, type Tracking } from "@/lib/measure";
import { firstName } from "@/lib/view";
import { Avatar } from "./avatar";

/** Distinct, high-contrast line colors for comparing people (avatar colors can collide). */
const SERIES = ["#10143a", "#2b3cf0", "#12b886", "#e08a00", "#7b4dff", "#ff5b3a", "#0d8bd9", "#f2457f", "#6b7280", "#a16207"];

type Who = string | "all";

export function ProgressView({ b, me }: { b: PactBundle; me: Me }) {
  const { pact } = b;
  const t: Tracking = pact;
  const people = b.allMembers.filter((m) => b.members.some((x) => x.user_id === m.user_id) || b.checkins.some((c) => c.user_id === m.user_id));
  const [who, setWho] = useState<Who>(people.some((p) => p.user_id === me.id) ? me.id : people[0]?.user_id ?? "all");
  const tracked = pact.measure !== "none";
  const mine = (id: string) => b.checkins.filter((c) => c.user_id === id);

  if (b.state.phase === "upcoming") {
    return <Empty text="Progress shows up here once the pact starts and people check in." />;
  }

  return (
    <div className="space-y-3">
      {people.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Whose progress">
          {people.map((p) => (
            <Pill key={p.user_id} on={who === p.user_id} onClick={() => setWho(p.user_id)}>
              <Avatar id={p.user_id} name={p.name} src={p.avatar_url} size={24} />
              {p.user_id === me.id ? "You" : firstName(p.name)}
            </Pill>
          ))}
          {tracked && (
            <Pill on={who === "all"} onClick={() => setWho("all")}>
              Everyone
            </Pill>
          )}
        </div>
      )}

      {tracked && who === "all" && <Compare b={b} people={people} me={me.id} />}
      {tracked && who !== "all" && <Personal b={b} t={t} checkins={mine(who)} color="var(--pact-deep)" />}
      {who !== "all" && <FeelCalendar b={b} checkins={mine(who)} />}
      {who !== "all" && <Notes b={b} t={t} checkins={mine(who)} />}
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center gap-2 rounded-full pr-4 pl-1.5 text-[15px] font-bold ${on ? "bg-ink text-white" : "bg-paper text-ink"}`}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-[24px] bg-paper p-6 text-center text-[16px] text-ink-2">{text}</p>;
}

// ───────────────────────── one person ─────────────────────────

function Personal({ b, t, checkins, color }: { b: PactBundle; t: Tracking; checkins: Checkin[]; color: string }) {
  const points = useMemo(
    () => checkins.filter((c) => c.value !== null).map((c) => ({ day: c.day, value: c.value as number })).sort((a, z) => a.day.localeCompare(z.day)),
    [checkins],
  );
  const s = progressStats(points, t.direction, b.pact.start_date);
  const title = t.measure === "time" ? "Time" : t.measure === "count" ? cap(t.unit ?? "Count") : t.measure === "distance" ? `Distance (${t.unit})` : `Weight (${t.unit})`;
  const sub = t.measure === "time" ? (t.direction === "down" ? "Faster is better" : "Longer is better") : t.measure === "weight" && t.direction === "down" ? "Lighter is better" : null;

  return (
    <section className="rounded-[24px] bg-paper p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-extrabold">{title}</h3>
        {sub && <span className="text-[13px] font-semibold text-ink-3">{sub}</span>}
      </div>
      {points.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-ink-2">Log a number with your next check-in to start the chart.</p>
      ) : (
        <>
          <Chart b={b} t={t} series={[{ id: "me", color, points }]} />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Best" value={s.best !== null ? formatShort(t, s.best) : "–"} />
            <Stat label="Week avg" value={s.lastWeekAvg !== null ? formatShort(t, s.lastWeekAvg) : "–"} />
            <Stat label="Since week 1" value={changeText(t, s.change, s.changePct)} good={s.change !== null && s.change > 0} />
          </div>
        </>
      )}
    </section>
  );
}

function changeText(t: Tracking, change: number | null, pct: number | null) {
  if (change === null) return "–";
  if (t.measure === "time") {
    const word = t.direction === "down" ? (change >= 0 ? "faster" : "slower") : change >= 0 ? "longer" : "shorter";
    return `${formatDuration(Math.abs(change))} ${word}`;
  }
  if (pct !== null && Math.abs(pct) >= 1) return `${pct > 0 ? "+" : "−"}${Math.round(Math.abs(pct))}%`;
  return `${change >= 0 ? "+" : "−"}${formatShort(t, Math.abs(change))}`;
}

function Stat({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl bg-mist px-3 py-2.5">
      <p className={`display tnum truncate text-[24px] font-extrabold ${good ? "text-mint" : ""}`}>{value}</p>
      <p className="truncate text-[12px] font-bold text-ink-3">
        {label}
        {hint ? ` (${hint})` : ""}
      </p>
    </div>
  );
}

// ───────────────────────── everyone ─────────────────────────

function Compare({ b, people, me }: { b: PactBundle; people: PactBundle["allMembers"]; me: string }) {
  const t: Tracking = b.pact;
  const series = people
    .map((p, i) => ({
      id: p.user_id,
      name: p.user_id === me ? "You" : firstName(p.name),
      avatar: p.avatar_url,
      fullName: p.name,
      color: SERIES[i % SERIES.length],
      points: b.checkins
        .filter((c) => c.user_id === p.user_id && c.value !== null)
        .map((c) => ({ day: c.day, value: c.value as number }))
        .sort((a, z) => a.day.localeCompare(z.day)),
    }))
    .filter((s) => s.points.length);
  if (!series.length) return <Empty text="Nobody has logged a number yet." />;

  return (
    <section className="rounded-[24px] bg-paper p-4">
      <h3 className="text-[17px] font-extrabold">Everyone</h3>
      <Chart b={b} t={t} series={series} />
      <ul className="mt-3 space-y-2">
        {series.map((s) => {
          const st = progressStats(s.points, t.direction, b.pact.start_date);
          return (
            <li key={s.id} className="flex items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <Avatar id={s.id} name={s.fullName} src={s.avatar} size={28} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{s.name}</span>
              <span className="tnum text-[14px] text-ink-2">
                Best {st.best !== null ? formatShort(t, st.best) : "–"}
                {st.change !== null && <>, {changeText(t, st.change, st.changePct)}</>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ───────────────────────── chart ─────────────────────────

const W = 320;
const H = 176;
const PAD = { l: 40, r: 10, t: 12, b: 24 };

function niceTicks(lo: number, hi: number, isTime: boolean) {
  const span = Math.max(hi - lo, isTime ? 30 : 1);
  const steps = isTime ? [15, 30, 60, 120, 300, 600, 900, 1800, 3600] : [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => span / s <= 4) ?? steps[steps.length - 1];
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, min: start, max: end };
}

function Chart({ b, t, series }: { b: PactBundle; t: Tracking; series: { id: string; color: string; points: { day: string; value: number }[] }[] }) {
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  if (t.target !== null) values.push(t.target);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || Math.max(1, hi * 0.1);
  const { ticks, min, max } = niceTicks(Math.max(0, lo - pad), hi + pad, t.measure === "time");
  const down = t.direction === "down";

  const lastDay = Math.min(b.pact.duration_days - 1, Math.max(6, diffDays(b.pact.start_date, b.today)));
  const x = (day: string) => PAD.l + (diffDays(b.pact.start_date, day) / lastDay) * (W - PAD.l - PAD.r);
  // better is always up: for faster/lighter-is-better, low values plot high
  const y = (v: number) => {
    const f = (v - min) / (max - min || 1);
    return down ? PAD.t + f * (H - PAD.t - PAD.b) : H - PAD.b - f * (H - PAD.t - PAD.b);
  };
  const weekTicks = Array.from({ length: Math.floor(lastDay / 7) + 1 }, (_, i) => i * 7).filter((d) => d <= lastDay);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full" role="img" aria-label={`${t.measure} over the pact`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
          <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fontWeight={700} fill="var(--color-ink-3)">
            {formatShort(t, v)}
          </text>
        </g>
      ))}
      {weekTicks.map((d) => (
        <text key={d} x={PAD.l + (d / lastDay) * (W - PAD.l - PAD.r)} y={H - 6} textAnchor={d === 0 ? "start" : "middle"} fontSize={10} fontWeight={700} fill="var(--color-ink-3)">
          {d === 0 ? "Start" : `Wk ${d / 7 + 1}`}
        </text>
      ))}
      {t.target !== null && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t.target)} y2={y(t.target)} stroke="var(--pact)" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={W - PAD.r} y={y(t.target) - 5} textAnchor="end" fontSize={10} fontWeight={800} fill="var(--pact-deep)">
            {down ? "goal" : "minimum"} {formatShort(t, t.target)}
          </text>
        </g>
      )}
      {series.map((s) => {
        const pts = s.points.map((p) => [x(p.day), y(p.value)] as const);
        const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
        const single = series.length === 1;
        const last = pts[pts.length - 1];
        return (
          <g key={s.id}>
            {single && pts.length > 1 && (
              <path d={`${d} L${last[0].toFixed(1)} ${H - PAD.b} L${pts[0][0].toFixed(1)} ${H - PAD.b} Z`} fill={s.color} fillOpacity={0.12} />
            )}
            {pts.length > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />}
            {pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4.2 : 2.2} fill={s.color} stroke="var(--color-paper)" strokeWidth={i === pts.length - 1 ? 2 : 0} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ───────────────────────── feel calendar ─────────────────────────

// tints of the pact color as a mist wash over it (works on every iOS, unlike color-mix)
const wash = (a: number) => `linear-gradient(rgba(238, 240, 248, ${a}), rgba(238, 240, 248, ${a}))`;
const FEEL_BG: Record<number, React.CSSProperties> = {
  1: { backgroundColor: "var(--pact)", backgroundImage: wash(0.72) },
  2: { backgroundColor: "var(--pact)", backgroundImage: wash(0.4) },
  3: { backgroundColor: "var(--pact)" },
};

function FeelCalendar({ b, checkins }: { b: PactBundle; checkins: Checkin[] }) {
  const days = pactDays(b.pact.start_date, b.pact.duration_days, b.today);
  const byDay = new Map(checkins.map((c) => [c.day, c]));
  const rated = checkins.filter((c) => c.feel !== null);
  const strongByWeek = (w: number) => checkins.filter((c) => c.feel === 3 && Math.floor(diffDays(b.pact.start_date, c.day) / 7) === w).length;
  const thisWeek = Math.floor(diffDays(b.pact.start_date, b.today) / 7);

  return (
    <section className="rounded-[24px] bg-paper p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-extrabold">How it felt</h3>
        {rated.length > 0 && thisWeek > 0 && (
          <span className="text-[13px] font-semibold text-ink-3">
            Strong days: {strongByWeek(0)} in week 1, {strongByWeek(thisWeek)} this week
          </span>
        )}
      </div>
      {days.length === 0 ? null : (
        <div className="mt-3 grid grid-cols-7 gap-1.5" role="img" aria-label={`${rated.length} rated check-ins over ${days.length} days`}>
          {days.map((d) => {
            const c = byDay.get(d);
            const label = c ? (c.feel ? FEELS[c.feel - 1].label : "Checked in") : "No check-in";
            return (
              <span
                key={d}
                title={`${formatDay(d)}: ${label}`}
                className="flex aspect-square items-center justify-center rounded-[9px] text-[11px] font-bold"
                style={{
                  ...(c ? (c.feel ? FEEL_BG[c.feel] : { backgroundColor: "var(--pact-soft)" }) : { backgroundColor: "transparent" }),
                  boxShadow: c ? undefined : "inset 0 0 0 1.5px var(--color-line)",
                  color: c?.feel === 3 ? "var(--pact-ink)" : "var(--color-ink-3)",
                }}
              >
                {Number(d.slice(8))}
              </span>
            );
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-bold text-ink-3">
        {FEELS.map((f) => (
          <span key={f.value} className="flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-[4px]" style={FEEL_BG[f.value]} />
            {f.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-3 w-3 rounded-[4px] bg-[var(--pact-soft)]" />
          No rating
        </span>
      </div>
    </section>
  );
}

// ───────────────────────── notes ─────────────────────────

function Notes({ b, t, checkins }: { b: PactBundle; t: Tracking; checkins: Checkin[] }) {
  const notes = checkins.filter((c) => c.note).sort((a, z) => z.day.localeCompare(a.day));
  if (!notes.length) return null;
  return (
    <section className="rounded-[24px] bg-paper p-4">
      <h3 className="text-[17px] font-extrabold">Notes</h3>
      <ul className="mt-2 divide-y divide-line">
        {notes.map((c) => (
          <li key={c.id} className="py-3">
            <p className="text-[13px] font-bold text-ink-3">
              {c.day === b.today ? "Today" : c.day === b.yesterday ? "Yesterday" : formatDay(c.day)}
              {c.value !== null && t.measure !== "none" && `, ${formatValue(t, c.value)}`}
              {c.feel && `, ${FEELS[c.feel - 1].label.toLowerCase()}`}
            </p>
            <p className="mt-0.5 text-[15px] leading-snug break-words">{c.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
