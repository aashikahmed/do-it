"use client";

import type { ReactNode } from "react";
import type { TokensModel } from "@/lib/tokens";
import { useRun } from "./use-run";

/**
 * Calendar and tokens (break pacts): your clean days on a calendar, with a token on the day you reached each milestone.
 * Every time the pact opens, the calendar fills in day by day, the tokens pop out, then the days still to go fade in.
 */

const INK = "#10143A";
const SUN = "#FFC23D";
const MINT = "#7CF0C5";
/** bronze, silver, gold, jade, ruby, sapphire */
const TIER: Record<number, string> = { 1: "#E59A66", 3: "#E59A66", 7: "#DDE0EE", 10: "#DDE0EE", 14: "#DDE0EE", 21: SUN, 30: SUN, 40: MINT, 50: MINT, 60: "#FF8FB1", 75: "#FF8FB1", 90: "#B9C4FF" };
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const backOut = (t: number) => 1 + 2.9 * Math.pow(t - 1, 3) + 1.9 * Math.pow(t - 1, 2);
const font = (w: number, px: number) => ({ fontWeight: w, fontSize: `${r1(px)}px`, fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" as const });

export function Coin({ x, y, r, m, earned, scale = 1, light = false }: { x: number; y: number; r: number; m: number | "finish"; earned: boolean; scale?: number; light?: boolean }) {
  if (scale <= 0.01) return null;
  const fin = m === "finish";
  const lock = light ? INK : "#fff";
  const digits = String(m).length;
  const star = (c: string) => <path d={`M0 ${-r * 0.45}Q0 0 ${r * 0.45} 0Q0 0 0 ${r * 0.45}Q0 0 ${-r * 0.45} 0Q0 0 0 ${-r * 0.45}Z`} fill={c} />;
  return (
    <g transform={`translate(${r1(x)} ${r1(y)}) scale(${r1(scale * 100) / 100})`}>
      {earned ? (
        <>
          <circle cy={Math.max(1, r * 0.1)} r={r} fill="#000" fillOpacity={0.25} />
          <circle r={r} fill={fin ? SUN : TIER[m as number] ?? SUN} stroke={light ? INK : undefined} strokeWidth={light ? 1.2 : undefined} />
          {r >= 9 && <circle r={r - 1.5} fill="none" stroke={INK} strokeOpacity={0.22} strokeWidth={2} strokeDasharray="1 1.8" />}
          {fin ? star(INK) : r >= 7 && <text y={r * 0.27} textAnchor="middle" fill={INK} style={font(800, r * (digits > 1 ? 0.72 : 0.8))}>{m}</text>}
          <path d={`M${r1(-r * 0.55)} ${r1(-r * 0.5)}A${r1(r * 0.78)} ${r1(r * 0.78)} 0 0 1 ${r1(r * 0.1)} ${r1(-r * 0.76)}`} fill="none" stroke="#fff" strokeOpacity={0.6} strokeWidth={Math.max(1, r * 0.09)} strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle r={r} fill={lock} fillOpacity={0.05} stroke={lock} strokeOpacity={0.38} strokeDasharray="2.5 2.5" />
          {fin ? star(light ? "rgba(16,20,58,.35)" : "rgba(255,255,255,.4)") : <text y={r * 0.27} textAnchor="middle" fill={lock} fillOpacity={0.5} style={font(800, r * (digits > 1 ? 0.66 : 0.74))}>{m}</text>}
        </>
      )}
    </g>
  );
}

function Ring({ x, y, R, p, color, w }: { x: number; y: number; R: number; p: number; color: string; w: number }) {
  p = clamp(p);
  if (p <= 0) return null;
  if (p >= 0.999) return <circle cx={x} cy={y} r={R} fill="none" stroke={color} strokeWidth={w} />;
  const a = -Math.PI / 2 + p * 2 * Math.PI;
  return <path d={`M${r1(x)} ${r1(y - R)}A${R} ${R} 0 ${p > 0.5 ? 1 : 0} 1 ${r1(x + R * Math.cos(a))} ${r1(y + R * Math.sin(a))}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />;
}

/** how many days the calendar should end up showing: through today once it's answered */
function reach(t: TokensModel) {
  if (t.finished) return t.total;
  const d = t.days[t.todayAt];
  return Math.min(t.total, t.todayAt + (d === "clean" || d === "had" ? 1 : 0));
}

const keptBy = (t: TokensModel, a: number) => {
  let c = 0;
  for (let i = 0; i < Math.min(t.total, Math.floor(a + 1e-6)); i++) if (t.days[i] === "clean") c++;
  return c;
};

/** The pact screen's version: an ink panel inside the hero. */
export function TokenCalendar({ model: t, onSettled }: { model: TokensModel; onSettled?: () => void }) {
  const run = useRun([reach(t)], { delay: 350, ms: (d) => 650 + 1300 * Math.min(1, d / Math.max(1, t.total)), onSettled });
  const a = run.values[0] ?? 0;
  const post = run.post;
  const rows = Math.ceil(t.total / 7);
  const cs = rows <= 2 ? 30 : rows <= 5 ? 26 : 17;
  const gridH = rows * cs;
  const bx = 7 * cs + 6;
  const bw = 32;
  const px = bx + bw + 8;
  const pw = 320 - px;
  const mid = px + pw / 2;
  const cr = Math.min(30, pw / 2 - 9);
  const cy0 = cr + 12;
  const topH = Math.max(gridH, cy0 + cr + 44);
  const kA = keptBy(t, a);
  const earned = t.tokens.filter((x) => x.earnedOn !== null && a > x.earnedOn + 0.6);
  const prev = earned.length ? earned[earned.length - 1].m : 0;
  const next = t.tokens.find((x) => !earned.includes(x));
  const done = t.finished && a >= t.total - 1e-6;
  const all: (number | "finish")[] = [...t.tokens.map((x) => x.m), "finish"];
  const per = all.length > 7 ? Math.ceil(all.length / 2) : all.length;
  const sp = 300 / per;
  const sy = topH + 26;
  const shelfRows = Math.ceil(all.length / per);
  const py = sy + shelfRows * 34 + 2;
  const H = py + 26;
  const fa = Math.min(t.total, Math.floor(a + 1e-6));
  const cells: ReactNode[] = [];
  for (let i = 0; i < t.total; i++) {
    const x = (i % 7) * cs;
    const y = Math.floor(i / 7) * cs;
    const full = cs * 0.8;
    const cx = x + cs / 2;
    const cy = y + cs / 2;
    const d = t.days[i];
    if (i < a && d !== "future") {
      const s = full * backOut(clamp((a - i) / 1.6));
      const fill = d === "clean" ? MINT : d === "had" ? "#3A4070" : "transparent";
      cells.push(
        d === "rest" || d === "blank" || d === "today" ? (
          <rect key={i} x={r1(cx - s / 2)} y={r1(cy - s / 2)} width={r1(s)} height={r1(s)} rx={r1(s * 0.26)} fill="none" stroke="#fff" strokeOpacity={d === "rest" ? 0.18 : 0.3} strokeDasharray={d === "rest" ? "2 2" : undefined} />
        ) : (
          <rect key={i} x={r1(cx - s / 2)} y={r1(cy - s / 2)} width={r1(s)} height={r1(s)} rx={r1(s * 0.26)} fill={fill} />
        ),
      );
    } else if (!t.finished && i === t.todayAt && post > 0) {
      cells.push(<rect key={i} className="link-open" x={r1(cx - full / 2)} y={r1(cy - full / 2)} width={r1(full)} height={r1(full)} rx={r1(full * 0.26)} fill="none" stroke={SUN} strokeWidth={2} />);
    } else if (post > 0 && (i - t.todayAt) / Math.max(1, t.total - t.todayAt) < post) {
      cells.push(<rect key={i} x={r1(cx - full / 2)} y={r1(cy - full / 2)} width={r1(full)} height={r1(full)} rx={r1(full * 0.26)} fill="none" stroke="#fff" strokeOpacity={0.16} />);
    }
  }
  const label = `${t.clean} clean days. ${t.tokens.filter((x) => x.earnedOn !== null).length} of ${t.tokens.length} tokens.${t.next ? ` ${t.next.need} to the ${t.next.m}-day token.` : ""}`;

  return (
    <div className="rounded-[24px] bg-ink p-3.5 text-white">
      <svg viewBox={`0 0 320 ${r1(H)}`} role="img" aria-label={label} onClick={run.tap} className="block w-full cursor-pointer select-none">
        {cells}
        {t.tokens.map((x) => {
          if (x.earnedOn === null) return null;
          const k = clamp((a - x.earnedOn - 0.6) / 2.2);
          if (k <= 0) return null;
          return <Coin key={x.m} x={(x.earnedOn % 7) * cs + cs / 2} y={Math.floor(x.earnedOn / 7) * cs + cs / 2} r={cs * 0.48} m={x.m} earned scale={backOut(k)} />;
        })}
        {t.weeks.map((w, k) => {
          let clean = 0;
          let seen = 0;
          for (let i = w.from; i < w.to && i < fa; i++) {
            seen++;
            if (t.days[i] === "clean") clean++;
          }
          const y = k * cs + cs * 0.2;
          const h = cs * 0.6;
          if (!seen) return post > 0 && w.from >= t.todayAt ? <rect key={k} x={bx} y={r1(y)} width={bw} height={r1(h)} rx={r1(h / 2)} fill="none" stroke="#fff" strokeOpacity={0.16 * post} /> : null;
          const fr = Math.min(1, clean / Math.max(1, w.target));
          const met = clean >= w.target;
          return (
            <g key={k}>
              <rect x={bx} y={r1(y)} width={bw} height={r1(h)} rx={r1(h / 2)} fill="#262C5A" />
              {fr > 0 && <rect x={bx} y={r1(y)} width={r1(Math.max(h, bw * fr))} height={r1(h)} rx={r1(h / 2)} fill={met ? SUN : MINT} />}
              <text x={bx + bw / 2} y={r1(y + h * 0.74)} textAnchor="middle" fill={fr > 0.5 ? INK : "#fff"} style={font(800, Math.min(10, h * 0.78))}>
                {clean}/{w.target}
              </text>
            </g>
          );
        })}
        {done ? (
          <>
            <circle cx={mid} cy={cy0} r={cr + 10} fill={SUN} fillOpacity={0.25 * post} />
            <Coin x={mid} y={cy0} r={cr} m="finish" earned scale={backOut(clamp(post * 1.4))} />
            <text x={mid} y={cy0 + cr + 22} textAnchor="middle" fill="#fff" style={font(800, 12)}>
              Finished
            </text>
          </>
        ) : next ? (
          <>
            <circle cx={mid} cy={cy0} r={cr + 6} fill="none" stroke="#fff" strokeOpacity={0.14} strokeWidth={5} />
            <Ring x={mid} y={cy0} R={cr + 6} p={(kA - prev) / (next.m - prev)} color={SUN} w={5} />
            <Coin x={mid} y={cy0} r={cr} m={next.m} earned={false} />
            <text x={mid} y={cy0 + cr + 24} textAnchor="middle" fill="#fff" style={font(800, 13)}>
              {next.m - kA} to go
            </text>
            <text x={mid} y={cy0 + cr + 38} textAnchor="middle" fill="#fff" fillOpacity={0.7} style={font(600, 9)}>
              {next.bonus ? "a bonus token" : "to the next token"}
            </text>
          </>
        ) : (
          <>
            <Coin x={mid} y={cy0} r={cr} m="finish" earned={false} />
            <text x={mid} y={cy0 + cr + 24} textAnchor="middle" fill="#fff" fillOpacity={0.8} style={font(700, 10)}>
              The last one comes
            </text>
            <text x={mid} y={cy0 + cr + 37} textAnchor="middle" fill="#fff" fillOpacity={0.8} style={font(700, 10)}>
              at the finish
            </text>
          </>
        )}
        {topH - (cy0 + cr + 44) > 60 && (
          <>
            <text x={mid} y={topH - 20} textAnchor="middle" fill={MINT} style={font(800, 32)}>
              {kA}
            </text>
            <text x={mid} y={topH - 4} textAnchor="middle" fill="#fff" fillOpacity={0.75} style={font(700, 10)}>
              clean {kA === 1 ? "day" : "days"}, all yours
            </text>
          </>
        )}
        {all.map((m, k) => {
          const x = 14 + (k % per) * sp + (Math.floor(k / per) ? sp / 2 : 0);
          const y = sy + Math.floor(k / per) * 34;
          const tok = m === "finish" ? null : t.tokens.find((q) => q.m === m)!;
          const on = m === "finish" ? (t.finished ? t.total - 1 : null) : tok!.earnedOn;
          const got = on !== null && a > on + 0.6;
          const sc = got ? Math.max(0.2, backOut(clamp((a - on! - 0.6) / 2.2 + (m === "finish" ? post : 0)))) : 1;
          return (
            <g key={String(m)}>
              <Coin x={x} y={y} r={13} m={m} earned={got} scale={sc} />
              {!got && tok?.bonus && (
                <text x={x} y={y + 23} textAnchor="middle" fill="#fff" fillOpacity={0.5} style={font(700, 7.5)}>
                  bonus
                </text>
              )}
              {!got && next && m === next.m && !t.finished && <Ring x={x} y={y} R={16.5} p={(kA - prev) / (next.m - prev)} color={SUN} w={2.4} />}
            </g>
          );
        })}
        <rect x={0} y={py} width={320} height={7} rx={3.5} fill="#262C5A" />
        <rect x={0} y={py} width={r1(Math.max(7, (320 * Math.min(a, t.total)) / t.total))} height={7} rx={3.5} fill={MINT} />
        <text x={0} y={py + 22} fill="#fff" style={font(800, 11)}>
          {done ? `All ${t.total} days` : `${fa} ${fa === 1 ? "day" : "days"} in`}
        </text>
        {!t.finished && post > 0 && (
          <text x={320} y={py + 22} textAnchor="end" fill="#fff" fillOpacity={post} style={font(800, 11)}>
            {t.total - t.todayAt} to go
          </text>
        )}
      </svg>
    </div>
  );
}

/** The home card's version: this week's days and the next token. Plays once per session. */
export function TokenStrip({ model: t, pactId, light = false }: { model: TokensModel; pactId: string; light?: boolean }) {
  const run = useRun([reach(t)], { delay: 150, ms: (d) => 500 + 800 * Math.min(1, d / Math.max(1, t.total)), once: `doit-tokens-${pactId}` });
  const a = run.values[0] ?? 0;
  const wk = t.weeks.find((w) => w.from <= Math.min(t.todayAt, t.total - 1) && Math.min(t.todayAt, t.total - 1) < w.to) ?? t.weeks[t.weeks.length - 1];
  const cs = 26;
  const kA = keptBy(t, a);
  const earned = t.tokens.filter((x) => x.earnedOn !== null && a > x.earnedOn + 0.6);
  const prev = earned.length ? earned[earned.length - 1].m : 0;
  const next = t.tokens.find((x) => !earned.includes(x));
  let clean = 0;
  const cells: ReactNode[] = [];
  for (let i = wk.from; i < wk.to; i++) {
    const x = (i - wk.from) * cs;
    const full = cs * 0.78;
    const cx = x + cs / 2;
    const d = t.days[i];
    if (i < a && d !== "future") {
      const s = full * backOut(clamp((a - i) / 1.6));
      if (d === "clean") clean++;
      cells.push(
        d === "clean" || d === "had" ? (
          <rect key={i} x={r1(cx - s / 2)} y={r1(16 - s / 2)} width={r1(s)} height={r1(s)} rx={r1(s * 0.26)} fill="currentColor" fillOpacity={d === "clean" ? 1 : 0.25} />
        ) : (
          <rect key={i} x={r1(cx - s / 2)} y={r1(16 - s / 2)} width={r1(s)} height={r1(s)} rx={r1(s * 0.26)} fill="none" stroke="currentColor" strokeOpacity={0.35} />
        ),
      );
    } else if (!t.finished && i === t.todayAt && run.post > 0) {
      cells.push(<rect key={i} className="link-open" x={r1(cx - full / 2)} y={r1(16 - full / 2)} width={r1(full)} height={r1(full)} rx={r1(full * 0.26)} fill="none" stroke="currentColor" strokeWidth={2} />);
    } else {
      cells.push(<rect key={i} x={r1(cx - full / 2)} y={r1(16 - full / 2)} width={r1(full)} height={r1(full)} rx={r1(full * 0.26)} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeDasharray="2 2" />);
    }
  }
  const label = `This week ${clean} of ${wk.target} clean. ${t.next ? `${t.next.need} to the ${t.next.m}-day token.` : ""}`;
  return (
    <svg viewBox="0 0 300 56" role="img" aria-label={label} className="block w-full">
      {cells}
      <text x={0} y={48} fill="currentColor" style={font(800, 11)}>
        This week {clean} of {wk.target}
      </text>
      {earned.slice(-2).map((x, k, arr) => (
        <Coin key={x.m} x={268 - 30 - (arr.length - 1 - k) * 26} y={18} r={11} m={x.m} earned light={light} scale={backOut(clamp((a - (x.earnedOn ?? 0) - 0.6) / 2))} />
      ))}
      {next ? (
        <>
          <Coin x={278} y={18} r={13} m={next.m} earned={false} light={light} />
          <Ring x={278} y={18} R={16.5} p={(kA - prev) / (next.m - prev)} color={light ? "#FF5B3A" : SUN} w={3} />
          <text x={278} y={50} textAnchor="middle" fill="currentColor" style={font(800, 10)}>
            {next.m - kA} to go
          </text>
        </>
      ) : (
        t.finished && <Coin x={278} y={18} r={13} m="finish" earned light={light} />
      )}
    </svg>
  );
}
