import Link from "next/link";
import { Suspense } from "react";
import { IdeaRow } from "@/components/explore/idea-row";
import { optionalUser } from "@/lib/data";
import { cardOf, ideaById } from "@/lib/explore/catalog";

export const metadata = { title: "You choose", robots: { index: false } };

type Ask = { name: string; ideas: string[]; mine: boolean; open: boolean; pact: string | null };

export default function Page({ params }: PageProps<"/ask/[code]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-blue" />}>
      <Choose params={params} />
    </Suspense>
  );
}

async function Choose({ params }: { params: PageProps<"/ask/[code]">["params"] }) {
  const { code } = await params;
  const { supabase } = await optionalUser();
  const { data } = await supabase.rpc("ask_preview", { p_code: code });
  const ask = data as Ask | null;
  // an idea can leave the catalog after a link was sent
  const cards = (ask?.ideas ?? []).flatMap((id) => {
    const i = ideaById(id);
    return i ? [cardOf(i)] : [];
  });
  const name = ask?.name || "Someone";

  const title = !ask || (!cards.length && !ask.pact) ? "This link doesn't work." : ask.pact ? "It's on." : !ask.open ? "Already chosen." : ask.mine ? "Send this to a friend." : `${name} wants to start something. You choose.`;
  const body = !ask || (!cards.length && !ask.pact)
    ? "It may be mistyped. Ask for a fresh one."
    : ask.pact
      ? "You're both in."
      : !ask.open
        ? "Someone has picked from this link, or it's more than 30 days old."
        : ask.mine
          ? "The one they pick starts a pact with both of you in it."
          : `Pick one, choose how much is right for you, and ${name} is in it too.`;
  const choosing = !!ask?.open && !ask.mine && cards.length > 0;

  return (
    <main className="flex min-h-dvh flex-col bg-blue px-5 pt-safe pb-safe text-white">
      <p className="pt-4 text-[20px] font-extrabold tracking-tight">Do it.</p>
      <div className="flex flex-1 flex-col justify-center py-8">
        <h1 className="display text-[56px] font-extrabold break-words">{title}</h1>
        <p className="mt-4 max-w-[34ch] text-[17px] leading-snug opacity-90">{body}</p>
        {ask?.open && cards.length > 0 && (
          <div className="mt-7 space-y-2 text-ink">
            {cards.map((c) => (
              <IdeaRow key={c.id} card={c} query={choosing ? `?ask=${encodeURIComponent(code)}` : ""} />
            ))}
          </div>
        )}
      </div>
      {!choosing && (
        <Link href={ask?.pact ? `/p/${ask.pact}` : "/explore"} className="mb-2 flex h-16 items-center justify-center rounded-[22px] bg-white text-[18px] font-extrabold text-ink">
          {ask?.pact ? "Open the pact" : "Look through ideas"}
        </Link>
      )}
    </main>
  );
}
