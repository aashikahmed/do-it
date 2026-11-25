"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/toast";
import { createAsk } from "@/lib/client-actions";
import { getBrowserClient } from "@/lib/supabase/client";
import { shareLink } from "./share-idea";

/** Send a few ideas to a friend. The one they pick starts a pact with both of you in it. */
export function AskFriend({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // made once per set of ideas, so opening the share sheet again doesn't make another link
  const [made, setMade] = useState<{ key: string; code: string } | null>(null);
  const key = ids.join(",");

  async function ask() {
    setBusy(true);
    let code = made?.key === key ? made.code : null;
    if (!code) {
      const { data } = await getBrowserClient().auth.getSession();
      if (!data.session) {
        setBusy(false);
        router.push("/signin?next=%2Fexplore%2Fsaved");
        return;
      }
      const res = await createAsk(ids);
      if (!res.ok) {
        setBusy(false);
        return toast(res.error, "error");
      }
      code = res.data!.code;
      setMade({ key, code });
    }
    setBusy(false);
    await shareLink(`${window.location.origin}/ask/${code}`, "I want to start something with you. You choose.");
  }

  return (
    <div className="mt-5">
      <button onClick={ask} disabled={busy} className="h-16 w-full rounded-[22px] bg-ink text-[18px] font-extrabold text-white disabled:opacity-60">
        {busy ? "Making the link…" : "Ask a friend to choose"}
      </button>
      <p className="mt-3 text-center text-[14px] leading-snug text-ink-2">They get a link with {ids.length === 2 ? "these two" : `your latest ${ids.length}`}. The one they pick starts a pact with both of you in it.</p>
    </div>
  );
}
