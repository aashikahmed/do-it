"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { NumberPicker } from "@/components/number-picker";
import { joinPact } from "@/lib/client-actions";
import { toast } from "@/components/toast";
import type { NumberLevel } from "@/lib/explore/levels";
import type { Tracking } from "@/lib/measure";

/** Join, with a number of your own if the pact counts something. Signed out, the number waits until after sign-in. */
export function JoinForm({ code, signedIn, number }: { code: string; signedIn: boolean; number: { t: Tracking; levels: NumberLevel[] } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // undefined until they pick one: left alone, it follows the pact's number, also when a refresh brings a new one
  const [picked, setPicked] = useState<number | null>();
  const value = picked === undefined ? (number?.t.target ?? null) : picked;
  // this screen is kept after you leave it: don't come back to "Joining…"
  useLayoutEffect(() => () => setBusy(false), []);

  async function join() {
    if (!signedIn) {
      router.push(`/signin?next=${encodeURIComponent(`/j/${code}`)}`);
      return;
    }
    setBusy(true);
    // left alone, they follow the pact's number, even if the creator changes it before anyone starts
    const mine = number && value !== number.t.target ? value : undefined;
    const res = await joinPact(code, mine);
    if (!res.ok) {
      setBusy(false);
      return toast(res.error, "error");
    }
    navigator.vibrate?.(18);
    router.replace(`/p/${res.data!.id}`);
    // home may be kept from before, without this pact
    router.refresh();
  }

  return (
    <>
      {number &&
        (signedIn ? (
          <div className="-mx-2 rounded-[22px] bg-paper p-3 text-ink">
            <p className="mx-1 mb-3 text-[17px] font-extrabold">Your number</p>
            <NumberPicker t={number.t} levels={number.levels} value={value} onChange={setPicked} />
          </div>
        ) : (
          <p className="text-center text-[15px] font-semibold opacity-90">The days are shared. You pick your own number when you join.</p>
        ))}
      <button onClick={join} disabled={busy} className="h-16 w-full rounded-[22px] bg-white text-[18px] font-extrabold text-ink disabled:opacity-60">
        {busy ? "Joining…" : signedIn ? "Join the pact" : "Join with Google"}
      </button>
    </>
  );
}
