import Link from "next/link";
import type { PactStatus, Tone } from "@/lib/admin";

/** Shared pieces for the admin pages. No hooks, so both server and client components can use them. */

export const STATUS: Record<PactStatus, { text: string; tone: Tone | "broken" }> = {
  upcoming: { text: "Starting soon", tone: "off" },
  in: { text: "Everyone's in", tone: "ok" },
  waiting: { text: "In progress", tone: "wait" },
  late: { text: "Yesterday open", tone: "risk" },
  broken: { text: "Chain broke", tone: "broken" },
  finished: { text: "Finished", tone: "done" },
};

const TONES: Record<Tone | "broken", string> = {
  ok: "bg-[#d3f5e9] text-[#075c44]",
  wait: "bg-mist text-ink-2",
  risk: "bg-[#fff1cc] text-[#6b4a00]",
  broken: "bg-[#ffe2db] text-[#a52a10]",
  done: "bg-[#e3e6ff] text-blue-deep",
  off: "bg-mist text-ink-2",
};

export function Badge({ tone, children }: { tone: Tone | "broken"; children: React.ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: PactStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.text}</Badge>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-line bg-paper p-5 ${className}`}>{children}</section>;
}

export function PageTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="display text-[48px] font-extrabold sm:text-[56px]">{children}</h1>
      {aside}
    </div>
  );
}

export function Count({ n }: { n: number }) {
  return <span className="tnum text-ink-3"> {n}</span>;
}

export function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span>{label}</span>
      <span className="tnum font-bold">{children}</span>
    </div>
  );
}

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] font-medium text-ink-2">{label}</dt>
      <dd className="mt-0.5 font-semibold [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-blue hover:text-blue-deep">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m15 18-6-6 6-6" />
      </svg>
      {children}
    </Link>
  );
}

/** A filter chip row (client pages pass onClick) */
export function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-3.5 text-[14px] font-semibold transition-colors ${
        on ? "border-blue bg-blue text-white" : "border-line bg-paper text-ink hover:border-blue"
      }`}
    >
      {children}
    </button>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="skeleton h-14 w-56 !rounded-2xl" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-40 !rounded-[20px]" />
      ))}
    </div>
  );
}

export const th = "whitespace-nowrap border-b border-line px-3 py-2.5 text-left text-[13px] font-semibold text-ink-2";
export const td = "whitespace-nowrap border-b border-mist px-3 py-3";
