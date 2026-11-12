"use client";

import Link from "next/link";
import { useState } from "react";
import type { PactRow, PactStatus } from "@/lib/admin";
import { Card, Count, PageTitle, Pill, StatusBadge, td, th } from "../ui";

const FILTERS: { id: string; label: string; keep: (r: PactRow) => boolean }[] = [
  { id: "all", label: "All", keep: () => true },
  { id: "live", label: "Live", keep: (r) => !(["upcoming", "finished"] as PactStatus[]).includes(r.status) },
  { id: "late", label: "Yesterday open", keep: (r) => r.status === "late" },
  { id: "broken", label: "Chain broke", keep: (r) => r.status === "broken" },
  { id: "upcoming", label: "Starting soon", keep: (r) => r.status === "upcoming" },
  { id: "finished", label: "Finished", keep: (r) => r.status === "finished" },
  { id: "break", label: "Break a habit", keep: (r) => r.kind === "break" },
];

export function PactsTable({ rows }: { rows: PactRow[] }) {
  const [filter, setFilter] = useState("all");
  const shown = rows.filter(FILTERS.find((f) => f.id === filter)!.keep);

  return (
    <>
      <PageTitle>
        Pacts
        <Count n={rows.length} />
      </PageTitle>
      <div role="group" aria-label="Filter pacts" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Pill key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </Pill>
        ))}
      </div>
      <Card className="!p-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[14px]">
            <thead>
              <tr>
                <th className={th}>Pact</th>
                <th className={th}>Kind</th>
                <th className={th}>Schedule</th>
                <th className={th}>People</th>
                <th className={th}>Progress</th>
                <th className={th}>Chain</th>
                <th className={th}>Freezes used</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((k) => (
                <tr key={k.id} className="hover:bg-[#f6f7fd]">
                  <td className={td}>
                    <Link href={`/admin/pacts/${k.id}`} className="flex items-center gap-2.5 font-semibold hover:text-blue">
                      <span className="text-[20px]">{k.emoji}</span>
                      {k.name}
                    </Link>
                  </td>
                  <td className={td}>{k.kind === "break" ? "Break" : "Build"}</td>
                  <td className={`${td} text-ink-2`}>{k.schedule}</td>
                  <td className={`${td} tnum`}>{k.members}</td>
                  <td className={`${td} tnum`}>{k.progress}</td>
                  <td className={`${td} tnum font-bold`}>{k.status === "upcoming" ? "–" : `${k.streak} ${k.unit}`}</td>
                  <td className={`${td} tnum`}>{k.freezes}</td>
                  <td className={td}>
                    <StatusBadge status={k.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!shown.length && <p className="p-5 text-ink-2">{rows.length ? "No pacts like that right now." : "No pacts yet."}</p>}
      </Card>
    </>
  );
}
