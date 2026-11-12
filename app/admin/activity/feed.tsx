"use client";

import Link from "next/link";
import { useState } from "react";
import type { ActivityEvent, EventKind } from "@/lib/admin";
import { Card, PageTitle, Pill } from "../ui";

export type EventView = ActivityEvent & { when: string; exact: string };

const FILTERS: { id: string; label: string; kinds: EventKind[] | null }[] = [
  { id: "all", label: "Everything", kinds: null },
  { id: "checkin", label: "Check-ins", kinds: ["checkin", "makeup"] },
  { id: "miss", label: "Misses", kinds: ["miss"] },
  { id: "freeze", label: "Freezes", kinds: ["freeze"] },
  { id: "nudge", label: "Nudges", kinds: ["nudge"] },
  { id: "people", label: "Sign-ups and joins", kinds: ["signup", "join", "leave"] },
  { id: "pacts", label: "New pacts and rounds", kinds: ["pact", "round"] },
];

const DOT: Record<EventKind, string> = {
  checkin: "bg-sun",
  makeup: "bg-sun ring-2 ring-[#e09a00] ring-inset",
  miss: "border-2 border-ember bg-paper",
  freeze: "bg-ice",
  nudge: "bg-ember",
  join: "bg-blue",
  leave: "border-2 border-ink-3 bg-paper",
  pact: "bg-violet",
  round: "bg-violet",
  signup: "bg-ink",
};

export function ActivityFeed({ events, total }: { events: EventView[]; total: number }) {
  const [filter, setFilter] = useState("all");
  const kinds = FILTERS.find((f) => f.id === filter)!.kinds;
  const shown = kinds ? events.filter((e) => kinds.includes(e.kind)) : events;

  return (
    <>
      <PageTitle aside={<span className="text-[13px] font-medium text-ink-2">Last 7 days{total > events.length ? `, newest ${events.length} of ${total}` : ""}</span>}>
        Activity
      </PageTitle>
      <div role="group" aria-label="Filter activity" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Pill key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Pill>
        ))}
      </div>
      <Card className="!py-2">
        {shown.length ? (
          <ul>
            {shown.map((e) => (
              <li key={e.key} className="flex items-start gap-3.5 border-b border-mist py-3 last:border-0">
                <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[e.kind]}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{e.text}</div>
                  {e.pactId && (
                    <Link href={`/admin/pacts/${e.pactId}`} className="text-[13px] font-medium text-ink-2 hover:text-blue">
                      {e.pact}
                    </Link>
                  )}
                </div>
                <time dateTime={e.at} title={e.exact} className="tnum shrink-0 whitespace-nowrap text-[13px] font-medium text-ink-2">
                  {e.when}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-ink-2">Nothing like that in the last 7 days.</p>
        )}
      </Card>
    </>
  );
}
