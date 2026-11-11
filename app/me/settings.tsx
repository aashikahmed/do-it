"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveProfile } from "@/lib/client-actions";
import { Toggle } from "@/components/toggle";
import { AvatarEditor } from "@/components/avatar-editor";
import { InstallSheet, getPlatform, usePush } from "@/components/push";
import { toast } from "@/components/toast";
import type { Me } from "@/lib/data";
import { deviceTimeZone } from "@/lib/dates";
import { getBrowserClient } from "@/lib/supabase/client";

export function Settings({ me, email, googlePhoto }: { me: Me; email: string; googlePhoto: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [saving, setSaving] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const push = usePush();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- display mode is browser-only
    setStandalone(getPlatform().standalone);
  }, []);

  async function saveName() {
    if (name.trim() === me.name) return;
    setSaving(true);
    const res = await saveProfile({ name, timezone: deviceTimeZone() });
    setSaving(false);
    if (!res.ok) return toast(res.error, "error");
    toast("Name saved");
  }

  async function signOut() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await push.disable();
    } catch {}
    await getBrowserClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const pushText: Record<string, string> = {
    loading: "Checking…",
    on: "On for this phone",
    off: "Off",
    denied: "Blocked in your phone settings",
    unsupported: "This browser can't receive alerts",
    "needs-install": "Add to Home Screen first",
  };

  return (
    <main className="min-h-dvh px-4 pt-safe pb-safe">
      <div className="flex items-center pt-3">
        <Link href="/" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full" aria-label="Back to today">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      <div className="flex items-center gap-4 px-1 pt-4 pb-8">
        <AvatarEditor id={me.id} name={name || me.name} src={me.avatar_url} googlePhoto={googlePhoto} />
        <div className="min-w-0">
          <h1 className="display truncate text-[40px] font-extrabold">{name || "You"}</h1>
          <p className="truncate text-[15px] text-ink-2">{email}</p>
        </div>
      </div>

      <section className="rounded-[24px] bg-paper p-4">
        <label className="block text-[15px] font-bold text-ink-2" htmlFor="name">
          Your name
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="name"
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            className="h-14 min-w-0 flex-1 rounded-2xl bg-mist px-4 text-[17px] font-semibold outline-none focus:ring-2 focus:ring-blue"
          />
          <button
            onClick={saveName}
            disabled={saving || !name.trim() || name.trim() === me.name}
            className="h-14 rounded-2xl bg-ink px-5 text-[16px] font-bold text-white disabled:opacity-30"
          >
            Save
          </button>
        </div>
      </section>

      <section className="mt-3 rounded-[24px] bg-paper p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[17px] font-bold">Alerts</p>
            <p className="text-[14px] text-ink-2">{pushText[push.state]}</p>
          </div>
          {push.state === "needs-install" ? (
            <button onClick={() => setInstallOpen(true)} className="h-11 rounded-full bg-blue px-4 text-[15px] font-bold text-white">
              Show me how
            </button>
          ) : (
            <Toggle
              label="Alerts"
              checked={push.state === "on"}
              onChange={(v) => (v ? push.enable() : push.disable())}
            />
          )}
        </div>
        {push.state === "on" && (
          <button onClick={push.test} className="mt-3 h-11 rounded-full bg-mist px-4 text-[15px] font-bold">
            Send a test alert
          </button>
        )}
        <p className="mt-3 text-[14px] leading-snug text-ink-3">
          You&apos;ll hear when a partner checks in or nudges you, and in your evening if the chain is at risk.
        </p>
      </section>

      {!standalone && (
        <button onClick={() => setInstallOpen(true)} className="mt-3 flex w-full items-center justify-between rounded-[24px] bg-paper p-4 text-left">
          <span>
            <span className="block text-[17px] font-bold">Add to Home Screen</span>
            <span className="block text-[14px] text-ink-2">Opens like an app, full screen.</span>
          </span>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="text-ink-3">
            <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <section className="mt-3 rounded-[24px] bg-paper p-4 text-[15px] leading-snug text-ink-2">
        <p className="text-[17px] font-bold text-ink">How the chain works</p>
        <p className="mt-2">Each day (or week) is one link. It closes when everyone in the pact checks in.</p>
        <p className="mt-2">Missed a day, or forgot to log it? You can make it up the next day, until midnight. Only yesterday, never older days.</p>
        <p className="mt-2">If it really was a miss, anyone can spend a freeze that day to patch it. Otherwise the chain breaks for the whole group. You get one freeze for every 10 days of a pact.</p>
      </section>

      <button onClick={signOut} className="mt-6 h-14 w-full rounded-2xl text-[16px] font-bold text-ember">
        Sign out
      </button>

      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />
    </main>
  );
}
