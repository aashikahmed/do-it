import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { getPerson } from "@/lib/admin";
import { dateOnly, dateTime, recent } from "@/lib/admin-format";
import { formatDay } from "@/lib/dates";
import { BackLink, Badge, Card, Fact, Skeleton, StatusBadge } from "../../ui";

export const metadata = { title: "Person" };

export default function Page({ params }: PageProps<"/admin/people/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={2} />}>
      <Person params={params} />
    </Suspense>
  );
}

async function Person({ params }: { params: PageProps<"/admin/people/[id]">["params"] }) {
  const { id } = await params;
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await getPerson(id) : null;
  if (!data) notFound();
  const { person: p, tz, now, pacts, recent: checkins, provider } = data;

  return (
    <>
      <BackLink href="/admin/people">People</BackLink>
      <div className="flex items-center gap-4">
        <Avatar id={p.id} name={p.name} src={p.avatar} size={64} />
        <div className="min-w-0">
          <h1 className="display text-[40px] font-extrabold sm:text-[48px]">{p.name}</h1>
          <p className="text-ink-2 [overflow-wrap:anywhere]">{p.email}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-0 flex-[1_1_300px]">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Signed up">{dateOnly(p.joined, tz)}</Fact>
            <Fact label="Last signed in">{p.lastSignIn ? recent(p.lastSignIn, tz, now) : "Never"}</Fact>
            <Fact label="Timezone">{p.timezone}</Fact>
            <Fact label="Signs in with">{provider === "google" ? "Google" : provider || "Unknown"}</Fact>
            <Fact label="Check-ins, all time">{p.checkins}</Fact>
            <Fact label="Push">{p.devices ? (p.devices === 1 ? "1 device" : `${p.devices} devices`) : "Off"}</Fact>
          </dl>
          <p className="mt-4 text-[13px] text-ink-2">
            User ID <span className="tnum select-all font-mono text-[12px]">{p.id}</span>
          </p>
        </Card>

        <Card className="min-w-0 flex-[2_1_400px]">
          <h2 className="mb-2 text-[18px] font-bold">Pacts</h2>
          {pacts.length ? (
            pacts.map((k) => (
              <Link key={k.id} href={`/admin/pacts/${k.id}`} className="flex min-h-11 items-center justify-between gap-3 border-b border-mist py-2 hover:text-blue">
                <span className="flex min-w-0 items-center gap-2.5 font-semibold">
                  <span className="text-[20px]">{k.emoji}</span>
                  <span className="truncate">{k.name}</span>
                  <span className="hidden shrink-0 text-[13px] font-medium text-ink-2 sm:inline">{k.progress}</span>
                </span>
                {k.left ? <Badge tone="off">Left {formatDay(k.left)}</Badge> : <StatusBadge status={k.status} />}
              </Link>
            ))
          ) : (
            <p className="text-ink-2">Not in any pact yet.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-[18px] font-bold">Recent check-ins</h2>
        {checkins.length ? (
          <ul>
            {checkins.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-mist py-2.5">
                <span>
                  <span className="font-semibold">{c.pact}</span>
                  <span className="text-ink-2">
                    {" "}
                    · for {formatDay(c.day)}
                    {c.madeUp ? " · made up" : ""}
                  </span>
                </span>
                <span className="tnum text-[13px] text-ink-2">{dateTime(c.at, tz)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-2">No check-ins yet.</p>
        )}
      </Card>
    </>
  );
}
