"use client";

import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";
import { EmailCodeForm } from "./sign-in-form";

const KEY = "doit.handoff";
type Pending = { nonce: string; next: string; at: number };

function readPending(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null") as Pending | null;
    return p && Date.now() - p.at < 10 * 60 * 1000 ? p : null;
  } catch {
    return null;
  }
}

function savePending(nonce: string, next: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ nonce, next, at: Date.now() } satisfies Pending));
  } catch {}
}

function newNonce() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Try again when you're ready.",
  failed: "Couldn't finish signing in. Try again.",
};

export function SignIn({ paramsPromise }: { paramsPromise: Promise<{ next: string; error: string | null }> }) {
  const params = use(paramsPromise);
  const next = safeNext(params.next);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(params.error ? ERRORS[params.error] ?? ERRORS.failed : null);
  const [emailMode, setEmailMode] = useState(false);
  const finishing = useRef(false);

  // iOS Home Screen app: Google sign-in finished in a separate browser sheet. Collect it here.
  const collect = useCallback(async () => {
    const p = readPending();
    if (!p || finishing.current) return;
    try {
      const res = await fetch("/api/auth/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: p.nonce }),
        cache: "no-store",
      });
      const { code } = (await res.json()) as { code: string | null };
      if (!code) return;
      finishing.current = true;
      setWaiting(true);
      const { error } = await getBrowserClient().auth.exchangeCodeForSession(code);
      try {
        localStorage.removeItem(KEY);
      } catch {}
      if (error) {
        finishing.current = false;
        setWaiting(false);
        setError(ERRORS.failed);
        return;
      }
      router.replace(`/welcome?next=${encodeURIComponent(p.next)}`);
      router.refresh();
    } catch {
      // offline or server hiccup: the next poll retries
    }
  }, [router]);

  useEffect(() => {
    if (!readPending()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resuming a sign-in started earlier
    setWaiting(true);
    collect();
    const onVisible = () => document.visibilityState === "visible" && collect();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const t = setInterval(() => document.visibilityState === "visible" && collect(), 2000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(t);
    };
  }, [collect]);

  async function google() {
    setBusy(true);
    setError(null);
    const nonce = newNonce();
    savePending(nonce, next);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}&h=${nonce}`;
    const { error } = await getBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, queryParams: { prompt: "select_account" } },
    });
    if (error) {
      setBusy(false);
      setError(ERRORS.failed);
      return;
    }
    // the page navigates to Google; if this is a Home Screen app it opens in a sheet and we wait here
    setWaiting(true);
    setBusy(false);
  }

  if (emailMode) return <EmailCodeForm nextPromise={Promise.resolve(next)} />;

  return (
    <div className="flex flex-1 flex-col">
      <button onClick={() => router.push("/")} className="-ml-2 mt-3 flex h-11 w-11 items-center justify-center rounded-full" aria-label="Back">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
          <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="flex flex-1 flex-col justify-center pb-16">
        <h1 className="display text-[60px] font-extrabold">{waiting ? "Finishing sign-in…" : "Let's get you in."}</h1>
        <p className="mt-4 max-w-[32ch] text-[17px] leading-snug text-ink-2">
          {waiting
            ? "Finish with Google and tap Yes, that was me. Then come back here. This screen picks it up on its own."
            : "Your partners see your name and your check-ins. Nothing else."}
        </p>
        {error && <p className="mt-4 text-[15px] font-semibold text-ember">{error}</p>}
      </div>
      <button
        onClick={google}
        disabled={busy}
        className="mb-2 flex h-16 w-full items-center justify-center gap-3 rounded-[22px] bg-ink text-[18px] font-extrabold text-white disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81Z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1Z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z" />
        </svg>
        {busy ? "Opening Google…" : waiting ? "Open Google again" : "Continue with Google"}
      </button>
      {process.env.NODE_ENV !== "production" && (
        <button onClick={() => setEmailMode(true)} className="mb-2 h-12 text-[15px] font-bold text-ink-3">
          Use an email code (local dev only)
        </button>
      )}
    </div>
  );
}
