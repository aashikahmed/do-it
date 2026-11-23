"use client";

import { useId, useMemo } from "react";
import type { Lane, LaneMark, LanesModel } from "@/lib/lanes";
import { oval } from "@/lib/oval";
import { easeOut, useRun } from "./use-run";

/**
 * Your lanes: one lane per person on a running track, in the pact's own colors. Every time the pact opens, the runners
 * leave their (staggered) start lines and run to today, painting their lanes as they go. The finish line is the last day.
 */

const ICE = "#8FD3FF";
const EMBER = "#FF5B3A";
const r1 = (n: number) => Math.round(n * 10) / 10;
const font = (w: number, px: number) => ({ fontWeight: w, fontSize: `${px}px`, fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" as const });
const first = (name: string) => name.trim().split(/\s+/)[0] || "?";

function strokeFor(mark: LaneMark, lane: Lane): { stroke: string; opacity: number; dash?: string } {
  switch (mark) {
    case "did":
      return { stroke: lane.color, opacity: 1 };
    case "froze":
      return { stroke: ICE, opacity: 1 };
    case "late":
      return { stroke: EMBER, opacity: 1, dash: "3 3" };
    case "rest":
      return { stroke: "currentColor", opacity: 0.2 };
    default:
      return { stroke: "currentColor", opacity: 0.32 };
  }
}

function Runner({ lane, x, y, angle, speed, uid, k }: { lane: Lane; x: number; y: number; angle: number; speed: number; uid: string; k: number }) {
  const clip = `${uid}-av${k}`;
  return (
    <g transform={`translate(${r1(x)} ${r1(y)})`}>
      {speed > 0.05 &&
        [-2.6, 0, 2.6].map((off, q) => {
          const len = 7 + q * 4 + 10 * speed;
          const c = Math.cos(angle);
          const s = Math.sin(angle);
          return (
            <line
              key={q}
              x1={r1(-c * 8 - s * off)}
              y1={r1(-s * 8 + c * off)}
              x2={r1(-c * (8 + len) - s * off)}
              y2={r1(-s * (8 + len) + c * off)}
              stroke={lane.color}
              strokeOpacity={0.6 * speed}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          );
        })}
      <circle r={8.5} fill={lane.color} stroke="var(--pact-deep)" strokeWidth={1.5} />
      <text y={3} textAnchor="middle" fill={lane.ink} style={font(800, 8.5)}>
        {first(lane.name)[0]?.toUpperCase()}
      </text>
      {lane.avatar && (
        <>
          <clipPath id={clip}>
            <circle r={6.6} />
          </clipPath>
          <image href={lane.avatar} x={-6.6} y={-6.6} width={13.2} height={13.2} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
        </>
      )}
    </g>
  );
}

export function TrackLanes({ model, unit = "day" }: { model: LanesModel; unit?: "day" | "week" }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = Math.max(1, model.lanes.length);
  const lw = n <= 2 ? 14 : n === 3 ? 12.5 : Math.max(7, 40 / n);
  const RIN = 42;
  const ROUT = RIN + n * lw;
  const T = useMemo(() => oval(160, 100, 60), []);
  const L0 = T.length(RIN + lw / 2);
  const { total } = model;

  const geo = useMemo(
    () =>
      model.lanes.map((lane, k) => {
        const R = RIN + (k + 0.5) * lw;
        const st = T.length(R) - L0;
        return {
          R,
          st,
          lane: T.path(st, st + L0 + 18, R),
          segs: lane.segs.map((s) => ({ d: T.path(st + (L0 * s.from) / total, st + (L0 * s.to) / total, R), ...strokeFor(s.mark, lane) })),
          start: [T.pt(st, R - lw / 2), T.pt(st, R + lw / 2)] as const,
        };
      }),
    [model.lanes, T, L0, lw, total],
  );
  const track = useMemo(() => ({ out: T.full(ROUT), inner: T.full(RIN), lines: Array.from({ length: n + 1 }, (_, k) => T.full(RIN + k * lw)) }), [T, ROUT, n, lw]);

  const run = useRun(
    model.lanes.map((l) => l.pos),
    { delay: 350, ms: (d) => 650 + 1400 * Math.min(1, d / Math.max(1, total)) },
  );
  const finishing = model.finished ? easeOut(run.post) : 0;
  const [fx, fy1] = T.pt(0, RIN);
  const [, fy2] = T.pt(0, ROUT);
  const counts = model.lanes.map((l, k) => Math.round(l.kept * (l.pos ? Math.min(1, (run.values[k] ?? 0) / l.pos) : 1)));
  const legend = model.lanes.length > 4 ? model.lanes.slice(0, 3) : model.lanes;
  const more = model.lanes.length - legend.length + model.hidden;
  const label = `${model.lanes.map((l) => `${first(l.name)} ${l.kept} ${unit}${l.kept === 1 ? "" : "s"}`).join(", ")}. ${model.finished ? "Finished." : `${total - model.today} days to the finish.`}`;

  return (
    <svg viewBox="0 0 320 200" role="img" aria-label={label} onClick={run.tap} className="block w-full cursor-pointer select-none">
      <path d={track.out} fill="var(--pact-deep)" />
      <path d={track.inner} fill="var(--pact)" />
      <path d={track.inner} fill="#fff" fillOpacity={0.07} />
      {track.lines.map((d, k) => (
        <path key={k} d={d} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth={0.9} />
      ))}
      {Array.from({ length: 8 }, (_, k) => {
        const h = (fy2 - fy1) / 8;
        return (
          <g key={k}>
            <rect x={r1(fx - 2.5)} y={r1(fy1 + k * h)} width={2.5} height={r1(h)} fill={k % 2 ? "#10143A" : "#fff"} />
            <rect x={r1(fx)} y={r1(fy1 + k * h)} width={2.5} height={r1(h)} fill={k % 2 ? "#fff" : "#10143A"} />
          </g>
        );
      })}

      {geo.map((g, k) => {
        const lane = model.lanes[k];
        const v = run.values[k] ?? 0;
        const revealed = (L0 * v) / total + (model.finished ? 18 * finishing : 0);
        const doneToday = lane.pos > model.today;
        return (
          <g key={lane.userId}>
            <line x1={r1(g.start[0][0])} y1={r1(g.start[0][1])} x2={r1(g.start[1][0])} y2={r1(g.start[1][1])} stroke={lane.color} strokeWidth={run.pre ? 4 : 2.2} strokeLinecap="round" />
            <mask id={`${uid}-m${k}`} maskUnits="userSpaceOnUse" x={0} y={0} width={320} height={200}>
              <path d={g.lane} fill="none" stroke="#fff" strokeWidth={lw + 1} strokeDasharray={`${r1(Math.max(0.01, revealed))} 99999`} />
            </mask>
            <g mask={`url(#${uid}-m${k})`}>
              {g.segs.map((s, q) => (
                <path key={q} d={s.d} fill="none" stroke={s.stroke} strokeOpacity={s.opacity} strokeDasharray={s.dash} strokeWidth={Math.max(3, lw - 4.5)} />
              ))}
            </g>
            {!model.finished && !doneToday && run.post > 0 && (
              <path
                className="link-open"
                d={T.path(g.st + (L0 * model.today) / total, g.st + (L0 * Math.min(total, model.today + 1)) / total, g.R)}
                fill="none"
                stroke={lane.color}
                strokeOpacity={0.75 * run.post}
                strokeDasharray="3 3"
                strokeWidth={Math.max(2, lw - 7)}
              />
            )}
          </g>
        );
      })}

      {geo.map((g, k) => {
        const lane = model.lanes[k];
        const s = g.st + (L0 * (run.values[k] ?? 0)) / total + (model.finished ? 16 * finishing : 0);
        const [x, y] = T.pt(s, g.R);
        const [bx, by] = T.pt(s - 4, g.R);
        return <Runner key={lane.userId} lane={lane} x={x} y={y} angle={Math.atan2(y - by, x - bx)} speed={run.speed} uid={uid} k={k} />;
      })}

      {model.finished && finishing > 0.2 ? (
        <>
          <path d={`M${r1(fx + 8)} ${r1(fy1 - 3)}q12 6 7 ${r1((fy2 - fy1) * 0.38)}`} fill="none" stroke={EMBER} strokeWidth={2.6} strokeLinecap="round" />
          <path d={`M${r1(fx + 8)} ${r1(fy2 + 3)}q13 -5 9 ${r1(-(fy2 - fy1) * 0.38)}`} fill="none" stroke={EMBER} strokeWidth={2.6} strokeLinecap="round" />
          {Array.from({ length: 22 }, (_, q) => {
            const cx = 104 + ((q * 37) % 112);
            const cy = 70 + ((q * 53) % 60) * finishing;
            return <rect key={q} x={cx} y={r1(cy)} width={3} height={5} rx={1} fill={["#FFC23D", EMBER, "#7CF0C5", "#FF8FB1", "#fff"][q % 5]} transform={`rotate(${(q * 47) % 180} ${cx} ${r1(cy)})`} />;
          })}
          <text x={160} y={98} textAnchor="middle" fill="currentColor" style={font(800, 15)}>
            Over the line
          </text>
          <text x={160} y={115} textAnchor="middle" fill="currentColor" style={font(800, 15)}>
            together
          </text>
        </>
      ) : (
        <>
          {!model.finished && <line x1={r1(fx + 8)} y1={r1(fy1 - 3)} x2={r1(fx + 8)} y2={r1(fy2 + 3)} stroke={EMBER} strokeWidth={2} strokeDasharray="3 2" />}
          {legend.map((l, k) => {
            const y = 100 - ((legend.length + (more ? 1 : 0) - 1) * 17) / 2 + k * 17;
            return (
              <g key={l.userId}>
                <circle cx={121} cy={r1(y - 4)} r={4.5} fill={l.color} />
                <text x={130} y={r1(y)} fill="currentColor" style={font(700, 11.5)}>
                  {first(l.name).slice(0, 9)}
                </text>
                <text x={200} y={r1(y)} textAnchor="end" fill="currentColor" fillOpacity={0.85} style={font(800, 11.5)}>
                  {counts[model.lanes.indexOf(l)]}
                </text>
              </g>
            );
          })}
          {more > 0 && (
            <text x={130} y={r1(100 - ((legend.length + 1 - 1) * 17) / 2 + legend.length * 17)} fill="currentColor" fillOpacity={0.75} style={font(600, 10.5)}>
              and {more} more
            </text>
          )}
        </>
      )}
    </svg>
  );
}

/** The home card's version: the lanes straightened out, finish line on the right. Plays once per session. */
export function StraightLanes({ model, pactId }: { model: LanesModel; pactId: string }) {
  const x0 = 6;
  const x1 = 286;
  const W = x1 - x0;
  const h = 12;
  const gap = 4;
  const H = model.lanes.length * (h + gap) - gap + 4;
  const run = useRun(
    model.lanes.map((l) => l.pos),
    { delay: 150, ms: (d) => 500 + 900 * Math.min(1, d / Math.max(1, model.total)), once: `doit-lanes-${pactId}` },
  );
  const { total } = model;
  const label = `${model.lanes.map((l) => `${first(l.name)} ${l.kept}`).join(", ")}. ${model.finished ? "Finished." : `${total - model.today} days to go.`}`;
  return (
    <svg viewBox={`0 0 300 ${H}`} role="img" aria-label={label} className="block w-full">
      {model.lanes.map((lane, k) => {
        const y = 2 + k * (h + gap);
        const v = Math.min(total, run.values[k] ?? 0);
        const x = x0 + (W * v) / total;
        return (
          <g key={lane.userId}>
            <rect x={x0} y={y} width={W} height={h} rx={h / 2} fill="currentColor" fillOpacity={0.14} />
            {lane.segs.map((s, q) => {
              if (s.from >= v) return null;
              const st = strokeFor(s.mark, lane);
              return <rect key={q} x={r1(x0 + (W * s.from) / total)} y={y + 3} width={r1(Math.max(0.8, (W * (Math.min(s.to, v) - s.from)) / total))} height={h - 6} fill={st.stroke} fillOpacity={st.opacity} />;
            })}
            {run.speed > 0.05 && <line x1={r1(x - 9)} y1={y + h / 2} x2={r1(x - 9 - 14 * run.speed)} y2={y + h / 2} stroke={lane.color} strokeOpacity={0.6 * run.speed} strokeWidth={2} strokeLinecap="round" />}
            <circle cx={r1(x)} cy={y + h / 2} r={6.5} fill={lane.color} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.2} />
            <text x={r1(x)} y={y + h / 2 + 2.6} textAnchor="middle" fill={lane.ink} style={font(800, 7)}>
              {first(lane.name)[0]?.toUpperCase()}
            </text>
          </g>
        );
      })}
      {Array.from({ length: Math.ceil(H / 4) }, (_, q) => (
        <g key={q}>
          <rect x={x1 + 6} y={q * 4} width={3} height={4} fill={q % 2 ? "#10143A" : "#fff"} />
          <rect x={x1 + 9} y={q * 4} width={3} height={4} fill={q % 2 ? "#fff" : "#10143A"} />
        </g>
      ))}
    </svg>
  );
}
