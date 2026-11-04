"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { joinPact } from "@/lib/client-actions";
import { toast } from "@/components/toast";

export function JoinButton({ code, signedIn }: { code: string; signedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function join() {
    if (!signedIn) {
      router.push(`/signin?next=${encodeURIComponent(`/j/${code}`)}`);
      return;
    }
    setBusy(true);
    const res = await joinPact(code);
    if (!res.ok) {
      setBusy(false);
      return toast(res.error, "error");
    }
    navigator.vibrate?.(18);
    router.replace(`/p/${res.data!.id}`);
  }

  return (
    <button
      onClick={join}
      disabled={busy}
      className="h-16 w-full rounded-[22px] bg-white text-[18px] font-extrabold text-ink disabled:opacity-60"
    >
      {busy ? "Joining…" : signedIn ? "Join the pact" : "Join with Google"}
    </button>
  );
}
