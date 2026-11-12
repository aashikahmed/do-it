import { Suspense } from "react";
import { getPeople } from "@/lib/admin";
import { dateOnly, recent } from "@/lib/admin-format";
import { Skeleton } from "../ui";
import { PeopleTable, type PersonView } from "./people-table";

export const metadata = { title: "People" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton rows={1} />}>
      <People />
    </Suspense>
  );
}

async function People() {
  const { tz, now, people } = await getPeople();
  const rows: PersonView[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    avatar: p.avatar,
    timezone: p.timezone,
    joined: dateOnly(p.joined, tz),
    pacts: p.livePacts === p.pacts ? `${p.pacts}` : `${p.livePacts} live · ${p.pacts}`,
    checkins: p.checkins,
    lastCheckin: p.lastCheckin ? recent(p.lastCheckin, tz, now) : "Not yet",
    devices: p.devices,
  }));
  return <PeopleTable rows={rows} />;
}
