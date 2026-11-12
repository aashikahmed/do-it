"use client";

import { useState, useTransition } from "react";
import { sendAdminTestPush } from "../actions";

export function TestPush({ devices }: { devices: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (!devices) {
    return <p className="text-[14px] text-ink-2">Turn on alerts in the app (You, then Alerts) on a device to test push here.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null);
            const r = await sendAdminTestPush().catch(() => ({ ok: false as const, error: "Couldn't reach the server" }));
            if (!r.ok) setResult(r.error);
            else if (r.sent) setResult(`Sent to ${r.sent === 1 ? "1 device" : `${r.sent} devices`}${r.failed ? `, ${r.failed} failed` : ""}`);
            else setResult(r.failed ? "Every device failed. Check the server logs." : "No device took it. Turn alerts off and on again.");
          })
        }
        className="min-h-11 rounded-[14px] bg-blue px-[18px] text-[15px] font-bold text-white hover:bg-blue-deep disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send me a test push"}
      </button>
      <span role="status" className="text-[14px] font-medium text-ink-2">
        {result}
      </span>
    </div>
  );
}
