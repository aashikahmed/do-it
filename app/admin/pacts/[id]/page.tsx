import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { Chain } from "@/components/chain";
import { getPactDetail } from "@/lib/admin";
import { dateOnly, dateTime } from "@/lib/admin-format";
import { formatDay } from "@/lib/dates";
import { BackLink, Badge, Card, Fact, Skeleton, StatusBadge } from "../../ui";

export const metadata = { title: "Pact" };

export default function Page({ params }: PageProps<"/admin/pacts/[id]">) {
  return (
    <Suspense fallback={<Skeleton rows={2} />}>
      <Pact params={params} />
    </Suspense>
  );
}

async function Pact({ params }: { params: PageProps<"/admin/pacts/[id]">["params"] }) {
  const { id } = await params;
  const data = /^[0-9a-f-]{36}$/i.test(id) ? await getPactDetail(id) : null;
  if (!data) notFound();
  const { row, bundle: b, creator, roster, recent, rounds, tz } = data;
  const p = b.pact;
  const unit = p.cadence === "daily" ? "day" : "week";

  return (
    <>
      <BackLink href="/admin/pacts">Pacts</BackLink>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-[44px]">{p.emoji}</span>
          <div className="min-w-0">
            <h1 className="display text-[40px] font-extrabold sm:text-[48px]">{row.name}</h1>
            <p className="text-ink-2">
              {p.kind === "break" ? "Break a habit" : "Build a habit"} · {row.schedule} · {row.progress}
            </p>
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-0 flex-[2_1_420px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[18px] font-bold">The chain</h2>
            <span className="tnum text-[14px] text-ink-2">
              {b.state.streak} {b.state.streak === 1 ? unit : `${unit}s`} now · best {b.state.best} · {b.state.completion.done} of {b.state.completion.total} kept
            </span>
          </div>
          <div className="mt-4" data-color={p.color}>
            <Chain periods={b.state.periods} perRow={p.cadence === "daily" ? 10 : 8} tone="onLight" fluid />
          </div>
        </Card>

        <Card className="min-w-0 flex-[1_1_300px]">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Made by">
              <Link href={`/admin/people/${creator.id}`} className="text-blue hover:text-blue-deep">
                {creator.name}
              </Link>
            </Fact>
            <Fact label="Created">{dateOnly(p.created_at, tz)}</Fact>
            <Fact label="Runs">
              {formatDay(p.start_date)} to {formatDay(b.state.endDate)}
            </Fact>
            <Fact label="Timezone">{p.timezone}</Fact>
            <Fact label="Freezes used">{row.freezes}</Fact>
            <Fact label="Round">{p.round}</Fact>
            <Fact label="Invite code">
              <span className="tnum select-all font-mono text-[14px]">{p.invite_code}</span>
            </Fact>
            {p.target !== null && (
              <Fact label={p.kind === "break" ? "Limit" : "Target"}>
                {p.target} {p.unit ?? ""}
              </Fact>
            )}
          </dl>
        </Card>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-0 flex-[1_1_340px]">
          <h2 className="mb-2 text-[18px] font-bold">People</h2>
          {roster.map((m) => (
            <div key={m.user_id} className="flex min-h-12 items-center justify-between gap-3 border-b border-mist py-2">
              <Link href={`/admin/people/${m.user_id}`} className="flex min-w-0 items-center gap-2.5 font-semibold hover:text-blue">
                <Avatar id={m.user_id} name={m.name} src={m.avatar_url} size={32} />
                <span className="truncate">{m.name}</span>
                {!m.devices && <span className="shrink-0 text-[13px] font-medium text-ink-2">no push</span>}
              </Link>
              <Badge tone={m.today.tone}>{m.today.text}</Badge>
            </div>
          ))}
        </Card>

        <Card className="min-w-0 flex-[1_1_340px]">
          <h2 className="mb-2 text-[18px] font-bold">Recent check-ins</h2>
          {recent.length ? (
            <ul>
              {recent.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-mist py-2.5">
                  <span>
                    <span className="font-semibold">{c.who}</span>
                    <span className="text-ink-2">
                      {" "}
                      · for {formatDay(c.day)}
                      {c.value !== null && p.unit ? ` · ${c.value} ${p.unit}` : ""}
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
      </div>

      {rounds.length > 0 && (
        <Card>
          <h2 className="mb-2 text-[18px] font-bold">Other rounds</h2>
          {rounds.map((r) => (
            <Link key={r.id} href={`/admin/pacts/${r.id}`} className="flex min-h-11 items-center justify-between gap-3 border-b border-mist py-2 font-semibold hover:text-blue">
              <span>
                Round {r.round} · {r.progress}
              </span>
              <StatusBadge status={r.status} />
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
