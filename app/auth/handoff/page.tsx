import { Suspense } from "react";

export const metadata = { title: "Finish signing in" };

export default function Page({ searchParams }: PageProps<"/auth/handoff">) {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-blue px-6 pt-safe pb-safe text-white">
      <Suspense fallback={null}>
        <Handoff searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const DONE = {
  done: {
    title: "You're in.",
    body: "Close this page and go back to the Do it. app. It will finish signing you in.",
    hint: "On iPhone, tap Done in the top corner.",
  },
  cancelled: {
    title: "Cancelled.",
    body: "Nobody was signed in. You can close this page.",
    hint: null,
  },
  expired: {
    title: "This has expired.",
    body: "Go back to the Do it. app and tap Continue with Google again.",
    hint: null,
  },
} as const;

async function Handoff({ searchParams }: { searchParams: PageProps<"/auth/handoff">["searchParams"] }) {
  const s = (await searchParams).s;
  const end = typeof s === "string" && s in DONE ? DONE[s as keyof typeof DONE] : null;

  if (end) {
    return (
      <>
        <h1 className="display text-[60px] font-extrabold">{end.title}</h1>
        <p className="mt-5 max-w-[30ch] text-[18px] leading-snug text-white/85">{end.body}</p>
        {end.hint && <p className="mt-6 text-[15px] text-white/60">{end.hint}</p>}
      </>
    );
  }

  return (
    <form method="post" action="/auth/handoff/confirm" className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="display text-[60px] font-extrabold">Finish signing in?</h1>
        <p className="mt-5 max-w-[30ch] text-[18px] leading-snug text-white/85">
          Only continue if you just tapped Continue with Google in the Do it. app on this phone.
        </p>
        <p className="mt-4 max-w-[32ch] text-[16px] leading-snug text-white/70">
          If someone sent you a link and asked you to sign in, stop here. They could get into your account.
        </p>
      </div>
      <button
        name="choice"
        value="confirm"
        className="mb-2 flex h-16 w-full items-center justify-center rounded-[22px] bg-white text-[18px] font-extrabold text-ink"
      >
        Yes, that was me
      </button>
      <button name="choice" value="cancel" className="mb-2 h-12 text-[16px] font-bold text-white/80">
        No, cancel
      </button>
    </form>
  );
}
