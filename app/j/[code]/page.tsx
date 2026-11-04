import { Suspense } from "react";
import { optionalUser } from "@/lib/data";
import { cadenceText, listNames, startsText } from "@/lib/view";
import { todayIn, diffDays } from "@/lib/dates";
import { JoinButton } from "./join-button";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "You're invited" };

type Preview = {
  id: string;
  title: string;
  emoji: string;
  color: string;
  cadence: "daily" | "weekly";
  times_per_week: number;
  duration_days: number;
  start_date: string;
  timezone: string;
  unit: string | null;
  target: number | null;
  ended: boolean;
  members: { id: string; name: string }[];
};

export default function Page({ params }: PageProps<"/j/[code]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-blue" />}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: { params: PageProps<"/j/[code]">["params"] }) {
  const { code } = await params;
  const { supabase, userId } = await optionalUser();
  const { data } = await supabase.rpc("invite_preview", { p_code: code });
  const p = data as Preview | null;

  if (!p) {
    return (
      <main className="flex min-h-dvh flex-col justify-center px-6 pt-safe pb-safe">
        <h1 className="display text-[56px] font-extrabold">This invite doesn&apos;t work.</h1>
        <p className="mt-4 text-[17px] text-ink-2">The link may be mistyped, or the pact was deleted. Ask for a fresh link.</p>
        <Link href="/" className="mt-8 flex h-16 items-center justify-center rounded-[22px] bg-blue text-[18px] font-extrabold text-white">
          Go to Do it.
        </Link>
      </main>
    );
  }

  if (userId && p.members.some((m) => m.id === userId)) redirect(`/p/${p.id}`);

  const names = p.members.map((m) => (m.name || "Someone").split(" ")[0]);
  const today = todayIn(p.timezone);
  const started = diffDays(p.start_date, today) >= 0;
  const host = names[0] ?? "Someone";

  return (
    <main data-color={p.color} className="flex min-h-dvh flex-col bg-[var(--pact)] px-6 pt-safe pb-safe text-[var(--pact-ink)]">
      <p className="pt-4 text-[20px] font-extrabold tracking-tight">Do it.</p>
      <div className="flex flex-1 flex-col justify-center py-8">
        <span className="text-[72px] leading-none" aria-hidden>
          {p.emoji}
        </span>
        <p className="mt-6 text-[18px] font-semibold opacity-85">{host} wants you in on</p>
        <h1 className="display mt-2 text-[64px] font-extrabold break-words">{p.title}</h1>
        <ul className="mt-6 space-y-1.5 text-[17px] font-medium opacity-90">
          <li>{cadenceText(p)}</li>
          <li>{started ? `Day ${Math.min(diffDays(p.start_date, today) + 1, p.duration_days)} of ${p.duration_days}` : startsText(p.start_date, today)}</li>
          {p.unit && p.target && (
            <li>
              Goal: {p.target} {p.unit} each time
            </li>
          )}
          <li>{listNames(names, 3)} {names.length === 1 ? "is" : "are"} in</li>
        </ul>
      </div>
      {p.ended ? (
        <p className="mb-2 rounded-[22px] bg-white/20 p-5 text-center text-[17px] font-bold">This pact has already finished.</p>
      ) : (
        <div className="space-y-3">
          <JoinButton code={code} signedIn={!!userId} />
          <p className="text-center text-[14px] opacity-75">
            Check in each day. If anyone misses, the streak breaks for everyone.
          </p>
        </div>
      )}
    </main>
  );
}
