"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Badge, Card, Count, PageTitle, td, th } from "../ui";

export interface PersonView {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  timezone: string;
  joined: string;
  pacts: string;
  checkins: number;
  lastCheckin: string;
  devices: number;
}

export function PeopleTable({ rows }: { rows: PersonView[] }) {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q).trim().toLowerCase();
  const shown = query ? rows.filter((r) => r.name.toLowerCase().includes(query) || r.email.toLowerCase().includes(query)) : rows;

  return (
    <>
      <PageTitle
        aside={
          <label className="flex w-full max-w-[360px] flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">Search by name or email</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="min-h-11 rounded-[14px] border border-line bg-paper px-3.5 text-ink focus:outline-[3px] focus:outline-offset-1 focus:outline-blue"
            />
          </label>
        }
      >
        People
        <Count n={rows.length} />
      </PageTitle>
      <Card className="!p-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[14px]">
            <thead>
              <tr>
                <th className={th}>Person</th>
                <th className={th}>Email</th>
                <th className={th}>Timezone</th>
                <th className={th}>Signed up</th>
                <th className={th}>Pacts</th>
                <th className={th}>Check-ins</th>
                <th className={th}>Last check-in</th>
                <th className={th}>Push</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="hover:bg-[#f6f7fd]">
                  <td className={td}>
                    <Link href={`/admin/people/${p.id}`} className="flex items-center gap-2.5 font-semibold hover:text-blue">
                      <Avatar id={p.id} name={p.name} src={p.avatar} size={32} />
                      {p.name}
                    </Link>
                  </td>
                  <td className={`${td} text-ink-2`}>{p.email}</td>
                  <td className={td}>{p.timezone}</td>
                  <td className={`${td} tnum`}>{p.joined}</td>
                  <td className={`${td} tnum`}>{p.pacts}</td>
                  <td className={`${td} tnum`}>{p.checkins}</td>
                  <td className={`${td} tnum`}>{p.lastCheckin}</td>
                  <td className={td}>
                    {p.devices ? <Badge tone="ok">On · {p.devices === 1 ? "1 device" : `${p.devices} devices`}</Badge> : <Badge tone="off">Off</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!shown.length && <p className="p-5 text-ink-2">{rows.length ? "Nobody matches that." : "Nobody has signed up yet."}</p>}
      </Card>
    </>
  );
}
