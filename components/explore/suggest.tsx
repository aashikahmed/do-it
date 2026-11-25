"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { suggestIdea } from "@/lib/client-actions";
import { getBrowserClient } from "@/lib/supabase/client";

/** "Missing something?" A line for us to read. It doesn't start anything. */
export function Suggest({ text = "" }: { text?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="mt-2 h-12 w-full text-center text-[15px] font-bold text-blue">
        Missing something? Suggest it
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Suggest an idea">
        <Form text={text} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function Form({ text, onDone }: { text: string; onDone: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState(text);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data } = await getBrowserClient().auth.getSession();
    if (!data.session) {
      setBusy(false);
      router.push(`/signin?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const res = await suggestIdea(value);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Sent. Thank you");
    onDone();
  }

  return (
    <form onSubmit={send} className="pb-2">
      <p className="mb-4 text-[16px] leading-snug text-ink-2">What should people be able to start? We read every one.</p>
      <input
        autoFocus
        maxLength={140}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. learn to juggle"
        aria-label="Your idea"
        className="h-14 w-full rounded-2xl bg-mist px-4 text-[17px] font-semibold outline-none focus:ring-2 focus:ring-blue"
      />
      <button disabled={busy || value.trim().length < 3} className="mt-4 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-40">
        {busy ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
