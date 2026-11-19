"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { undoCheckIn, updateCheckIn } from "@/lib/client-actions";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { FeelPicker, ValueInput } from "@/components/measure-input";
import type { Checkin, PactBundle } from "@/lib/data";
import type { Feel, Tracking } from "@/lib/measure";

export function EntryFields({
  t,
  value,
  setValue,
  feel,
  setFeel,
  note,
  setNote,
}: {
  t: Tracking;
  value: number | null;
  setValue: (v: number | null) => void;
  feel: Feel | null;
  setFeel: (v: Feel | null) => void;
  note: string;
  setNote: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      {t.measure !== "none" && (
        <div className="rounded-2xl bg-mist/60 p-2">
          <ValueInput t={t} value={value} onChange={setValue} size="md" />
        </div>
      )}
      <FeelPicker value={feel} onChange={setFeel} />
      <textarea
        rows={3}
        maxLength={280}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything to remember? (optional)"
        aria-label="Note"
        className="w-full resize-none rounded-2xl bg-mist px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-[var(--pact)]"
      />
    </div>
  );
}

/** Today's own check-in: change the number, how it felt and the note, or take it back. */
export function EditSheet({ b, c, open, onClose }: { b: PactBundle; c: Checkin; open: boolean; onClose: () => void }) {
  const [value, setValue] = useState<number | null>(c.value);
  const [feel, setFeel] = useState<Feel | null>(c.feel);
  const [note, setNote] = useState(c.note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const router = useRouter();

  async function save() {
    setBusy(true);
    const res = await updateCheckIn({ pactId: b.pact.id, day: c.day, value: b.pact.measure !== "none" ? value : null, note: note.trim() || null, feel });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Saved");
    onClose();
    router.refresh();
  }

  async function undo() {
    setBusy(true);
    const res = await undoCheckIn({ pactId: b.pact.id, day: c.day });
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Check-in removed");
    onClose();
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Today's check-in">
      <EntryFields t={b.pact} value={value} setValue={setValue} feel={feel} setFeel={setFeel} note={note} setNote={setNote} />
      <button disabled={busy} onClick={save} className="mt-4 h-14 w-full rounded-2xl bg-ink text-[17px] font-extrabold text-white disabled:opacity-50">
        Save
      </button>
      <button
        disabled={busy}
        onClick={() => (confirmUndo ? undo() : setConfirmUndo(true))}
        className={`mt-2 h-14 w-full rounded-2xl text-[16px] font-bold ${confirmUndo ? "bg-ember text-white" : "text-ember"}`}
      >
        {confirmUndo ? "Tap again to remove it" : "Remove check-in"}
      </button>
    </Sheet>
  );
}
