import { Suspense } from "react";
import { getActivity } from "@/lib/admin";
import { ago, dateTime } from "@/lib/admin-format";
import { Skeleton } from "../ui";
import { ActivityFeed, type EventView } from "./feed";

export const metadata = { title: "Activity" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton rows={1} />}>
      <Activity />
    </Suspense>
  );
}

async function Activity() {
  const { tz, now, events, total } = await getActivity();
  const rows: EventView[] = events.map((e) => ({ ...e, when: ago(e.at, now) || dateTime(e.at, tz), exact: dateTime(e.at, tz) }));
  return <ActivityFeed events={rows} total={total} />;
}
