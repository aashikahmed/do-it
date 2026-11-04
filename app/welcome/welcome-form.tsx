"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveProfile } from "@/lib/client-actions";
import { deviceTimeZone } from "@/lib/dates";

export function WelcomeForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveProfile({ name, timezone: deviceTimeZone() });
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    router.replace(next);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col pt-20">
      <h1 className="display text-[54px] font-extrabold">What should your partners call you?</h1>
      <p className="mt-4 text-[17px] text-ink-2">This is the name they&apos;ll see when you check in or nudge them.</p>
      <input
        autoFocus
        autoComplete="given-name"
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="mt-8 h-16 w-full rounded-[20px] border-2 border-line bg-paper px-5 text-[19px] font-semibold outline-none placeholder:text-ink-3 focus:border-blue"
        aria-label="Your name"
      />
      {error && <p className="mt-3 text-[15px] font-semibold text-ember">{error}</p>}
      <div className="flex-1" />
      <button disabled={busy || !name.trim()} className="mb-2 h-16 w-full rounded-[22px] bg-blue text-[18px] font-extrabold text-white disabled:opacity-40">
        {busy ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
