import Link from "next/link";
import { Suspense } from "react";
import { getHome, optionalUser } from "@/lib/data";
import { needsMe } from "@/lib/view";
import { formatDay, todayIn } from "@/lib/dates";
import { Avatar } from "@/components/avatar";
import { PactCard } from "@/components/pact-card";
import { PushCard } from "@/components/push";
import { Live } from "@/components/live";
import { LandingChain } from "@/components/landing-chain";
import { redirect } from "next/navigation";

export default function Page() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Root />
    </Suspense>
  );
}

async function Root() {
  const { userId } = await optionalUser();
  if (!userId) return <Landing />;
  return <Home />;
}

function Landing() {
  return (
    <main className="flex min-h-dvh flex-col bg-blue px-6 pt-safe pb-safe text-white">
      <p className="pt-4 text-[22px] font-extrabold tracking-tight">Do it.</p>
      <div className="flex flex-1 flex-col justify-center py-10">
        <LandingChain />
        <h1 className="display mt-10 text-[76px] font-extrabold">Don&apos;t break the chain.</h1>
        <p className="mt-6 max-w-[34ch] text-[18px] leading-snug text-white/80">
          Pick a goal and a partner. Check in each day. If either of you slips, the streak breaks for both.
        </p>
      </div>
      <div className="space-y-3">
        <Link href="/signin?next=/new" className="flex h-16 items-center justify-center rounded-[22px] bg-white text-[18px] font-extrabold text-blue">
          Start a pact
        </Link>
        <Link href="/signin" className="flex h-14 items-center justify-center rounded-[22px] text-[17px] font-bold text-white/85">
          Sign in
        </Link>
        <p className="pt-1 text-center text-[14px] text-white/60">Got an invite? Open the link on this phone.</p>
      </div>
    </main>
  );
}

async function Home() {
  const { me, bundles } = await getHome();
  if (!me.name) redirect("/welcome");

  const active = bundles.filter((b) => b.state.phase !== "ended");
  const ended = bundles.filter((b) => b.state.phase === "ended");
  const rank = (b: (typeof bundles)[number]) =>
    b.state.repair ? 0 : needsMe(b, me.id) ? 1 : b.state.phase === "active" ? 2 : 3;
  active.sort((a, b) => rank(a) - rank(b) || a.pact.created_at.localeCompare(b.pact.created_at));

  const todo = active.filter((b) => needsMe(b, me.id) || !!b.state.repair).length;
  const live = active.filter((b) => b.state.phase === "active").length;
  const partner = active.flatMap((b) => b.members).find((m) => m.user_id !== me.id)?.name.split(" ")[0];
  const today = todayIn(me.timezone);
  const hour = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: me.timezone }).format(new Date());
  const h = Number(hour);
  const greeting = h < 5 ? "Up late" : h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";

  return (
    <main className="min-h-dvh px-4 pt-safe pb-[120px]">
      <Live pactIds={bundles.map((b) => b.pact.id)} days={bundles.map((b) => ({ tz: b.pact.timezone, today: b.today }))} />
      <header className="flex items-center justify-between px-1 pt-3 pb-5">
        <div>
          <p className="text-[15px] font-semibold text-ink-2">
            {greeting}, {me.name.split(" ")[0]}
          </p>
          <p className="text-[15px] font-medium text-ink-3">{formatDay(today, { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <Link href="/me" aria-label="Your profile and settings">
          <Avatar id={me.id} name={me.name} size={42} />
        </Link>
      </header>

      {bundles.length === 0 ? (
        <Empty />
      ) : (
        <>
          <h1 className="display px-1 pb-6 text-[56px] font-extrabold">
            {live === 0 ? "Get ready." : todo === 0 ? "All done today." : todo === 1 ? "1 thing to do." : `${todo} things to do.`}
          </h1>
          <div className="space-y-3">
            <PushCard partner={partner} />
            {active.map((b) => (
              <PactCard key={b.pact.id} b={b} me={me.id} />
            ))}
          </div>
          {ended.length > 0 && (
            <section className="mt-10">
              <h2 className="px-1 pb-3 text-[17px] font-extrabold text-ink-2">Finished</h2>
              <div className="space-y-3">
                {ended.map((b) => (
                  <PactCard key={b.pact.id} b={b} me={me.id} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {bundles.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[440px] justify-center px-4 pb-safe">
          <Link
            href="/new"
            className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-ink px-6 text-[17px] font-extrabold text-white shadow-[0_16px_36px_-12px_rgba(16,20,58,0.6)] active:scale-95"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            New pact
          </Link>
        </div>
      )}
    </main>
  );
}

function Empty() {
  return (
    <div className="flex min-h-[70dvh] flex-col justify-center px-1">
      <h1 className="display text-[64px] font-extrabold">Start your first pact.</h1>
      <p className="mt-5 max-w-[32ch] text-[18px] leading-snug text-ink-2">
        Choose something to do, how often, and for how long. Then send the link to the person who&apos;ll keep you honest.
      </p>
      <Link href="/new" className="mt-8 flex h-16 items-center justify-center rounded-[22px] bg-blue text-[18px] font-extrabold text-white">
        Start a pact
      </Link>
      <p className="mt-4 text-center text-[15px] text-ink-3">Got an invite? Open the link on this phone.</p>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <main className="min-h-dvh px-4 pt-safe" aria-busy="true">
      <div className="flex items-center justify-between px-1 pt-3 pb-5">
        <div className="space-y-2">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-4 w-44" />
        </div>
        <div className="skeleton h-[42px] w-[42px] !rounded-full" />
      </div>
      <div className="skeleton mb-6 h-[104px] w-4/5" />
      <div className="space-y-3">
        <div className="skeleton h-[188px] !rounded-[28px]" />
        <div className="skeleton h-[188px] !rounded-[28px]" />
      </div>
    </main>
  );
}
