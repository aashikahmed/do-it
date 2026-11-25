"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShareInvite } from "@/components/share-invite";
import type { PactColor } from "@/lib/data";

/** What you see right after making a pact: send the link, or go to it. */
export function PactCreated({
  id,
  code,
  color,
  emoji,
  pact,
  next,
}: {
  id: string;
  code: string;
  color: PactColor;
  emoji: string;
  /** what the invite message says */
  pact: Parameters<typeof ShareInvite>[0]["pact"];
  /** somewhere to go from here, under the buttons */
  next?: { href: string; label: string };
}) {
  const router = useRouter();
  return (
    <main data-color={color} className="flex min-h-dvh flex-col bg-[var(--pact)] px-6 pt-safe pb-safe text-[var(--pact-ink)]">
      <motion.div
        className="flex flex-1 flex-col justify-center"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <span className="text-[64px]" aria-hidden>
          {emoji}
        </span>
        <h1 className="display mt-4 text-[60px] font-extrabold">Now bring someone in.</h1>
        <p className="mt-5 max-w-[32ch] text-[18px] leading-snug opacity-85">
          Send the link to your partner, or to the whole group. Once they join, you share one chain.
        </p>
      </motion.div>
      <div className="space-y-3">
        <ShareInvite code={code} pact={pact} label="Send invite link" className="h-16 w-full rounded-[22px] bg-white text-[18px] font-extrabold text-ink" />
        <button onClick={() => router.replace(`/p/${id}`)} className="h-14 w-full rounded-[22px] text-[17px] font-bold opacity-90">
          Go to the pact
        </button>
        {next && (
          <Link href={next.href} className="flex h-11 items-center justify-center text-[15px] font-semibold underline-offset-4 opacity-80 hover:underline">
            {next.label}
          </Link>
        )}
      </div>
    </main>
  );
}
