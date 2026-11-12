import Link from "next/link";
import { Suspense } from "react";
import { getOverview } from "@/lib/admin";
import { clock } from "@/lib/admin-format";
import { formatDay } from "@/lib/dates";
import { Card, PageTitle, Row, Skeleton, StatusBadge } from "./ui";

export const metadata = { title: "Overview" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const o = await getOverview();
  const pct = (n: number) => (o.people ? Math.round((n / o.people) * 100) : 0);
  const max = Math.max(1, ...o.series.map((d) => d.n));
  const tiles = [
    { label: "People", value: o.people, sub: `${o.newThisWeek} new this week` },
    { label: "Live pacts", value: o.live, sub: `${o.liveBuild} build · ${o.liveBreak} break` },
    { label: "Check-ins today", value: o.checkinsToday, sub: `from ${o.peopleToday} ${o.peopleToday === 1 ? "person" : "people"}` },
    { label: "Active this week", value: o.activeWeek, sub: `${pct(o.activeWeek)}% of everyone` },
  ];
  const mix = [
    { label: "Build a habit", n: o.liveBuild },
    { label: "Break a habit", n: o.liveBreak },
    { label: "Daily", n: o.liveDaily },
    { label: "Some days a week", n: o.liveWeekly },
  ];

  return (
    <>
      <PageTitle aside={<span className="text-[13px] font-medium text-ink-2">As of {clock(new Date(o.now).toISOString(), o.tz)} your time</span>}>Overview</PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">{t.label}</span>
            <span className="display tnum text-[44px] font-extrabold sm:text-[52px]">{t.value}</span>
            <span className="text-[14px] text-ink-2">{t.sub}</span>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[2_1_460px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[18px] font-bold">Check-ins per day, last 30 days</h2>
            <span className="text-[13px] font-medium text-ink-2">Today so far in yellow</span>
          </div>
          <div
            role="img"
            aria-label={`Check-ins per day over the last 30 days, from ${o.series[0].n} to ${o.series[o.series.length - 1].n}`}
            className="mt-5 flex h-44 items-end gap-[3px] border-b border-line"
          >
            {o.series.map((d, i) => {
              const today = i === o.series.length - 1;
              return (
                <div key={d.day} title={`${formatDay(d.day)}: ${d.n} check-ins`} className="group flex h-full min-w-0 flex-1 items-end">
                  <span
                    className={`block w-full rounded-t-[4px] ${today ? "bg-sun" : "bg-blue group-hover:bg-blue-deep"}`}
                    style={{ height: `${d.n ? Math.max(2, (d.n / max) * 100) : 0}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="tnum mt-2 flex justify-between text-[13px] font-medium text-ink-2">
            <span>{formatDay(o.series[0].day, { day: "numeric", month: "short" })}</span>
            <span>{formatDay(o.series[15].day, { day: "numeric", month: "short" })}</span>
            <span>Today</span>
          </div>
        </Card>

        <Card className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          <h2 className="text-[18px] font-bold">From sign-up to habit</h2>
          {o.funnel.map((f) => (
            <div key={f.label} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[14px]">
                <span>{f.label}</span>
                <span className="tnum font-bold">
                  {f.n} <span className="font-medium text-ink-2">{pct(f.n)}%</span>
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-mist">
                <span className="block h-full rounded-full bg-blue" style={{ width: `${pct(f.n)}%` }} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[1_1_340px]">
          <h2 className="mb-2 text-[18px] font-bold">Longest live chains</h2>
          {o.topChains.length ? (
            o.topChains.map((c) => (
              <Link key={c.id} href={`/admin/pacts/${c.id}`} className="flex min-h-11 items-center justify-between gap-3 border-b border-mist py-2 font-semibold hover:text-blue">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="text-[20px]">{c.emoji}</span>
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="tnum shrink-0">
                  {c.streak} {c.unit}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-ink-2">No live chains yet.</p>
          )}
        </Card>
        <Card className="flex min-w-0 flex-[1_1_280px] flex-col">
          <h2 className="mb-2 text-[18px] font-bold">Live pacts right now</h2>
          <Row label={<StatusBadge status="in" />}>{o.todayCounts.in}</Row>
          <Row label={<StatusBadge status="waiting" />}>{o.todayCounts.waiting}</Row>
          <Row label={<StatusBadge status="late" />}>{o.todayCounts.late}</Row>
          <Row label={<StatusBadge status="broken" />}>{o.todayCounts.broken}</Row>
          <Row label="People who owe yesterday">{o.todayCounts.owingYesterday}</Row>
          <Row label="Freezes used, last 7 days">{o.todayCounts.freezesWeek}</Row>
        </Card>
        <Card className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5">
          <h2 className="text-[18px] font-bold">Live pact mix</h2>
          {mix.map((m) => (
            <div key={m.label} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[14px]">
                <span>{m.label}</span>
                <span className="tnum font-bold">{m.n}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-mist">
                <span className="block h-full rounded-full bg-blue" style={{ width: `${o.live ? (m.n / o.live) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
