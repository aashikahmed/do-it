"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/client-actions";
import { Sheet } from "./sheet";
import { toast } from "./toast";

// ───────────────────────── platform ─────────────────────────

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredPrompt: BIPEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BIPEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installListeners.forEach((l) => l());
  });
}

export function getPlatform() {
  if (typeof window === "undefined") return { ios: false, android: false, standalone: false, pushCapable: false };
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const pushCapable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { ios, android, standalone, pushCapable };
}

function useCanPromptInstall() {
  return useSyncExternalStore(
    (l) => {
      installListeners.add(l);
      return () => installListeners.delete(l);
    },
    () => !!deferredPrompt,
    () => false,
  );
}

// ───────────────────────── push state ─────────────────────────

export type PushState = "loading" | "unsupported" | "needs-install" | "off" | "denied" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function swRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const evaluate = useCallback(async () => {
    const p = getPlatform();
    if (!p.pushCapable) {
      setState(p.ios && !p.standalone ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") return setState("denied");
    try {
      const reg = await swRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        setState("on");
        // keep the server copy in sync (covers switching accounts on the same phone)
        savePushSubscription(sub.toJSON()).catch(() => {});
      } else setState("off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only APIs after mount
    evaluate();
  }, [evaluate]);

  const enable = useCallback(async () => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return toast("Alerts aren't set up on this server yet", "error");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        if (permission === "denied") toast("Alerts are blocked. Allow them in your phone settings.", "error");
        return;
      }
      const reg = await swRegistration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      const res = await savePushSubscription(sub.toJSON());
      if (!res.ok) throw new Error(res.error);
      setState("on");
      toast("Alerts are on");
    } catch (e) {
      toast((e as Error).message || "Couldn't turn on alerts", "error");
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await swRegistration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      toast("Alerts are off");
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    const res = await sendTestPush();
    if (!res.ok) toast(res.error, "error");
    else toast("Sent. Check your notifications.");
  }, []);

  return { state, busy, enable, disable, test };
}

// ───────────────────────── UI ─────────────────────────

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="inline -mt-1">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const canPrompt = useCanPromptInstall();
  const [p, setP] = useState(() => getPlatform());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform is only known in the browser
    if (open) setP(getPlatform());
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Put Do it. on your Home Screen">
      <p className="mb-5 text-[16px] leading-snug text-ink-2">
        It opens like an app, and it&apos;s the only way your phone lets partners nudge you.
      </p>
      {canPrompt ? (
        <button
          className="h-14 w-full rounded-2xl bg-blue text-[17px] font-bold text-white"
          onClick={async () => {
            await deferredPrompt?.prompt();
            onClose();
          }}
        >
          Install Do it.
        </button>
      ) : p.ios ? (
        <ol className="space-y-4 text-[16px]">
          <Step n={1}>
            Open this page in <b>Safari</b>, then tap <b>Share</b> <ShareIcon /> in the toolbar.
          </Step>
          <Step n={2}>
            Scroll down and tap <b>Add to Home Screen</b>.
          </Step>
          <Step n={3}>
            Open <b>Do it.</b> from your Home Screen and turn on alerts.
          </Step>
        </ol>
      ) : (
        <ol className="space-y-4 text-[16px]">
          <Step n={1}>
            Open your browser menu <b>⋮</b>.
          </Step>
          <Step n={2}>
            Tap <b>Install app</b> or <b>Add to Home screen</b>.
          </Step>
          <Step n={3}>
            Open <b>Do it.</b> from your Home Screen.
          </Step>
        </ol>
      )}
      <button className="mt-6 h-12 w-full rounded-2xl text-[16px] font-semibold text-ink-2" onClick={onClose}>
        Not now
      </button>
    </Sheet>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-[14px] font-extrabold">{n}</span>
      <span className="pt-0.5 leading-snug">{children}</span>
    </li>
  );
}

const DISMISS_KEY = "doit.pushcard.dismissed";

/** Home-screen prompt: shows only when alerts aren't on yet. */
export function PushCard({ partner }: { partner?: string }) {
  const { state, busy, enable } = usePush();
  const [installOpen, setInstallOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    let d = false;
    try {
      d = Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is browser-only
    setDismissed(d);
  }, []);

  if (dismissed || state === "loading" || state === "on" || state === "unsupported" || state === "denied") return null;
  const who = partner ?? "your partners";
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 3 * 86_400_000));
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="relative rounded-[24px] bg-ink p-5 text-white">
      <button onClick={dismiss} aria-label="Dismiss" className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-white/60">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
      <p className="pr-8 text-[19px] leading-tight font-extrabold">
        {state === "needs-install" ? `Add Do it. to your Home Screen so ${who} can nudge you` : `Let ${who} nudge you`}
      </p>
      <p className="mt-1.5 text-[15px] text-white/70">You&apos;ll hear when someone checks in, and when the chain is at risk.</p>
      <button
        disabled={busy}
        onClick={() => (state === "needs-install" ? setInstallOpen(true) : enable())}
        className="mt-4 h-12 rounded-full bg-sun px-5 text-[16px] font-extrabold text-ink disabled:opacity-60"
      >
        {state === "needs-install" ? "Show me how" : busy ? "Turning on…" : "Turn on alerts"}
      </button>
      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  );
}
