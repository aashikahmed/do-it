import { Suspense } from "react";
import { getHealth } from "@/lib/admin";
import { ago, dateTime } from "@/lib/admin-format";
import { Badge, Card, PageTitle, Row, Skeleton, td, th } from "../ui";
import { TestPush } from "./test-push";

export const metadata = { title: "Health" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton rows={2} />}>
      <Health />
    </Suspense>
  );
}

const KINDS: [string, string][] = [
  ["evening", "Evening reminders"],
  ["makeup", "Morning make-up reminders"],
  ["break_morning", "Break-pact mornings"],
  ["finished", "“You finished”"],
];

async function Health() {
  const h = await getHealth();
  const now = h.now;
  const last = h.cron?.last;
  // hourly: more than ~70 minutes since the last run means a run was skipped
  const stale = !!last && now - Date.parse(last.started_at) > 70 * 60_000;
  const pushPct = h.push.everyone ? Math.round((h.push.people / h.push.everyone) * 100) : 0;

  return (
    <>
      <PageTitle>Health</PageTitle>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <Card className="flex flex-col">
          <h2 className="mb-2 text-[18px] font-bold">Reminder cron</h2>
          {!h.cron ? (
            <p className="text-ink-2">Run the cron_runs migration to start recording runs.</p>
          ) : !last ? (
            <p className="text-ink-2">No runs recorded yet. It runs at the top of every hour.</p>
          ) : (
            <>
              <Row label="Last run">
                {last.error ? (
                  <Badge tone="broken">{ago(last.started_at, now) || dateTime(last.started_at, h.tz)} · failed</Badge>
                ) : stale ? (
                  <Badge tone="risk">{ago(last.started_at, now) || dateTime(last.started_at, h.tz)} · late</Badge>
                ) : (
                  <Badge tone="ok">{ago(last.started_at, now)} · ok</Badge>
                )}
              </Row>
              <Row label="Runs, last 24 hours">{h.cron.runsLastDay}</Row>
              {KINDS.map(([k, label]) => (
                <Row key={k} label={label}>
                  {h.cron!.sentByKind[k] ?? 0}
                </Row>
              ))}
              <Row label="Pushes that failed">{h.cron.failedLastDay ? <Badge tone="risk">{h.cron.failedLastDay}</Badge> : 0}</Row>
              <p className="mt-2 text-[13px] text-ink-2">Pushes delivered in the last 24 hours.</p>
            </>
          )}
        </Card>

        <Card className="flex flex-col">
          <h2 className="mb-2 text-[18px] font-bold">Push</h2>
          <Row label="Devices subscribed">{h.push.devices}</Row>
          <Row label="People with push on">
            {h.push.people} of {h.push.everyone}
          </Row>
          <div className="my-2 h-2.5 overflow-hidden rounded-full bg-mist">
            <span className="block h-full rounded-full bg-blue" style={{ width: `${pushPct}%` }} />
          </div>
          <Row label="In a pact, no push">{h.push.inPactWithout ? <Badge tone="risk">{h.push.inPactWithout}</Badge> : 0}</Row>
          <div className="mt-3">
            <TestPush devices={h.myDevices} />
          </div>
        </Card>

        <Card className="flex flex-col">
          <h2 className="mb-2 text-[18px] font-bold">iPhone sign-in handoffs</h2>
          {h.handoffs ? (
            <>
              <Row label="Waiting right now">{h.handoffs.parked}</Row>
              <Row label="Confirmed, not yet collected">{h.handoffs.confirmed}</Row>
              <Row label="Not confirmed yet">{h.handoffs.parked - h.handoffs.confirmed}</Row>
              <p className="mt-2 text-[13px] text-ink-2">Codes are deleted once collected and after 10 minutes, so this is only what&apos;s in flight.</p>
            </>
          ) : (
            <p className="text-ink-2">Couldn&apos;t read handoffs.</p>
          )}
        </Card>

        <Card className="flex flex-col">
          <h2 className="mb-2 text-[18px] font-bold">Product signals</h2>
          {h.taps ? (
            <>
              <Row label="Taps on a partner's photo, 30 days">{h.taps.n}</Row>
              <Row label="From how many people">{h.taps.people}</Row>
              <p className="mt-2 text-[13px] text-ink-2">Logged to see whether people want profile pages.</p>
            </>
          ) : (
            <p className="text-ink-2">Couldn&apos;t read events.</p>
          )}
        </Card>
      </div>

      {h.cron && h.cron.runs.length > 0 && (
        <Card className="!p-2">
          <h2 className="px-3 pb-1 pt-3 text-[18px] font-bold">Recent cron runs</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr>
                  <th className={th}>Started</th>
                  <th className={th}>Took</th>
                  <th className={th}>Pacts checked</th>
                  <th className={th}>Pushes sent</th>
                  <th className={th}>Failed</th>
                  <th className={th}>Result</th>
                </tr>
              </thead>
              <tbody>
                {h.cron.runs.slice(0, 24).map((r) => {
                  const sent = Object.values(r.sent ?? {}).reduce((a, b) => a + Number(b), 0);
                  const ms = Date.parse(r.finished_at) - Date.parse(r.started_at);
                  return (
                    <tr key={r.id}>
                      <td className={`${td} tnum`}>{dateTime(r.started_at, h.tz)}</td>
                      <td className={`${td} tnum`}>{ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}</td>
                      <td className={`${td} tnum`}>{r.checked}</td>
                      <td className={`${td} tnum`}>{sent}</td>
                      <td className={`${td} tnum`}>{r.failed}</td>
                      <td className={td}>{r.error ? <span className="whitespace-normal text-[#a52a10]">{r.error}</span> : <Badge tone="ok">ok</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
