import type { Period, PeriodStatus } from "@/lib/streak";

/**
 * The chain: one link per period. Links overlap like a real chain.
 * done = closed link · frozen = ice link · missed = broken link · open = breathing dashed link · upcoming = faint.
 */
const W = 40;
const H = 26;
const STEP = 29;
const SW = 5.5;
const ROW = 34;

export function Chain({
  periods,
  perRow = 7,
  tone = "onColor",
  size = 1,
  label,
  fluid,
}: {
  periods: Pick<Period, "status" | "start" | "index">[];
  perRow?: number;
  tone?: "onColor" | "onLight";
  size?: number;
  label?: string;
  /** stretch to the container width */
  fluid?: boolean;
}) {
  const rows: (typeof periods)[] = [];
  for (let i = 0; i < periods.length; i += perRow) rows.push(periods.slice(i, i + perRow));
  const width = W + (perRow - 1) * STEP + SW;
  const height = rows.length * ROW + (H - ROW) + SW;
  const counts = periods.reduce<Record<string, number>>((a, p) => ((a[p.status] = (a[p.status] ?? 0) + 1), a), {});
  const summary =
    label ??
    `${counts.done ?? 0} closed, ${counts.frozen ?? 0} frozen, ${counts.missed ?? 0} missed, ${counts.upcoming ?? 0} to go`;

  return (
    <svg
      viewBox={`${-SW / 2} ${-SW / 2} ${width} ${height}`}
      width={fluid ? "100%" : width * size}
      height={fluid ? undefined : height * size}
      style={fluid ? { maxWidth: width * 1.6 } : undefined}
      role="img"
      aria-label={summary}
      className="block max-w-full"
    >
      {rows.map((row, r) =>
        row.map((p, i) => (
          <Link key={p.index} x={i * STEP} y={r * ROW} status={p.status} tone={tone} />
        )),
      )}
    </svg>
  );
}

function colors(status: PeriodStatus, tone: "onColor" | "onLight") {
  if (tone === "onColor") {
    switch (status) {
      case "done":
        return { stroke: "#ffffff", opacity: 1 };
      case "frozen":
        return { stroke: "var(--color-ice)", opacity: 1 };
      case "missed":
        return { stroke: "#ffffff", opacity: 0.4 };
      case "open":
        return { stroke: "#ffffff", opacity: 0.95 };
      default:
        return { stroke: "#ffffff", opacity: 0.2 };
    }
  }
  switch (status) {
    case "done":
      return { stroke: "var(--pact)", opacity: 1 };
    case "frozen":
      return { stroke: "#58b9f5", opacity: 1 };
    case "missed":
      return { stroke: "var(--color-ink-3)", opacity: 0.55 };
    case "open":
      return { stroke: "var(--pact)", opacity: 0.9 };
    default:
      return { stroke: "var(--color-line)", opacity: 1 };
  }
}

function Link({ x, y, status, tone }: { x: number; y: number; status: PeriodStatus; tone: "onColor" | "onLight" }) {
  const { stroke, opacity } = colors(status, tone);
  const rx = W / 2 - SW / 2;
  const ry = H / 2 - SW / 2;
  // ellipse perimeter (Ramanujan) — used to place gaps for broken / open links
  const c = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  let dash: string | undefined;
  let offset: number | undefined;
  if (status === "missed") {
    // two clean breaks, top-right and bottom-left
    dash = `${c * 0.4} ${c * 0.1}`;
    offset = c * 0.2;
  } else if (status === "open") {
    dash = `${c / 14} ${c / 28}`;
  }
  return (
    <g transform={`translate(${x + W / 2} ${y + H / 2})`} opacity={opacity} className={status === "open" ? "link-open" : undefined}>
      <ellipse rx={rx} ry={ry} fill="none" stroke={stroke} strokeWidth={SW} strokeDasharray={dash} strokeDashoffset={offset} strokeLinecap="round" />
      {status === "frozen" && <path d="M0 -4.5 V4.5 M-3.9 -2.25 L3.9 2.25 M-3.9 2.25 L3.9 -2.25" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />}
    </g>
  );
}

/** A window of periods to show on a compact card: the last `n` up to and including the current one. */
export function recentWindow<T extends { status: PeriodStatus; index: number }>(periods: T[], currentIndex: number | null, n = 7): T[] {
  if (periods.length <= n) return periods;
  const anchor = currentIndex ?? periods.findLastIndex((p) => p.status !== "upcoming");
  const end = Math.min(periods.length, Math.max(anchor + 1, n));
  return periods.slice(Math.max(0, end - n), end);
}
