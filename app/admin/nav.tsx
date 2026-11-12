"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

const ITEMS = [
  { seg: null, href: "/admin", label: "Overview", icon: "M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z" },
  {
    seg: "people",
    href: "/admin/people",
    label: "People",
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  },
  {
    seg: "pacts",
    href: "/admin/pacts",
    label: "Pacts",
    icon: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  },
  { seg: "activity", href: "/admin/activity", label: "Activity", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  {
    seg: "health",
    href: "/admin/health",
    label: "Health",
    icon: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z",
  },
];

export function AdminNav() {
  return <NavLinks seg={useSelectedLayoutSegment()} />;
}

/** The links; `seg` undefined (the prerendered shell, before the route is known) highlights none. */
export function NavLinks({ seg }: { seg?: string | null }) {
  return (
    <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((it) => {
        const on = seg === it.seg;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-[14px] px-3.5 text-[15px] font-semibold transition-colors ${
              on ? "bg-ink text-white" : "text-ink-2 hover:bg-[#e3e6ff] hover:text-ink"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={it.icon} />
            </svg>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
