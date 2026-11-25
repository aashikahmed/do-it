"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NumberPicker } from "@/components/number-picker";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { setMyNumber } from "@/lib/client-actions";
import type { PactBundle } from "@/lib/data";
import type { NumberLevel } from "@/lib/explore/levels";

/** Change your own number, until your first check-in. `b` is the pact as you see it. */
export function NumberSheet({ b, levels, open, onClose }: { b: PactBundle; levels: NumberLevel[]; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Your number">
      <Form b={b} levels={levels} onDone={onClose} />
    </Sheet>
  );
}

function Form({ b, levels, onDone }: { b: PactBundle; levels: NumberLevel[]; onDone: () => void }) {
  const { pact } = b;
  const router = useRouter();
  const [value, setValue] = useState(pact.target);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await setMyNumber({ pactId: pact.id, target: value });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Saved");
    onDone();
    router.refresh();
  }

  return (
    <div className="pb-2">
      <p className="mb-4 text-[16px] leading-snug text-ink-2">The days are shared, the number is yours. You can change it until your first check-in.</p>
      <NumberPicker t={pact} levels={levels} value={value} onChange={setValue} />
      <button disabled={busy || value === pact.target} onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-40">
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
