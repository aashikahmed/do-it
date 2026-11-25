import Link from "next/link";
import { Suspense } from "react";
import { getIdeas } from "@/lib/admin";
import { ago, dateTime } from "@/lib/admin-format";
import { Card, PageTitle, Row, Skeleton } from "../ui";

export const metadata = { title: "Ideas" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton rows={2} />}>
      <Ideas />
    </Suspense>
  );
}

async function Ideas() {
  const { tz, now, suggestions, started } = await getIdeas();
  return (
    <>
      <PageTitle>Ideas</PageTitle>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        <Card>
          <h2 className="mb-2 text-[18px] font-bold">Suggested</h2>
          {suggestions.length === 0 ? (
            <p className="text-ink-2">Nothing yet. It comes from &ldquo;Missing something?&rdquo; in Explore.</p>
          ) : (
            <ul className="space-y-3">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <p className="font-bold break-words">{s.text}</p>
                  <p className="text-[14px] text-ink-2">
                    {s.whoId ? <Link href={`/admin/people/${s.whoId}`}>{s.who}</Link> : s.who}, <span title={dateTime(s.at, tz)}>{ago(s.at, now) || dateTime(s.at, tz)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 text-[18px] font-bold">Pacts started from an idea</h2>
          {started.length === 0 ? <p className="text-ink-2">None yet.</p> : started.map((s) => <Row key={s.id} label={s.title}>{s.n}</Row>)}
        </Card>
      </div>
    </>
  );
}
