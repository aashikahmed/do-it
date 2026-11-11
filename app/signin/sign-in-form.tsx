"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";

export function EmailCodeForm({ nextPromise }: { nextPromise: Promise<string> }) {
  const next = safeNext(use(nextPromise));
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return setError("Enter a valid email address");
    setBusy(true);
    setError(null);
    const { error } = await getBrowserClient().auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? "Too many codes requested. Wait a minute and try again." : error.message);
      return;
    }
    setEmail(clean);
    setCode("");
    setStep("code");
    setCooldown(30);
  }

  async function verify(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await getBrowserClient().auth.verifyOtp({ email, token: value, type: "email" });
    if (error) {
      setBusy(false);
      setCode("");
      setError(error.message.toLowerCase().includes("expired") ? "That code expired or is wrong. Try again or get a new one." : error.message);
      return;
    }
    router.replace(`/welcome?next=${encodeURIComponent(next)}`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => (step === "code" ? setStep("email") : router.push("/"))}
        className="-ml-2 mt-3 flex h-11 w-11 items-center justify-center rounded-full text-ink"
        aria-label="Back"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
          <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence mode="wait" initial={false}>
        {step === "email" ? (
          <motion.form
            key="email"
            onSubmit={sendCode}
            className="flex flex-1 flex-col pt-8"
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <h1 className="display text-[54px] font-extrabold">What&apos;s your email?</h1>
            <p className="mt-4 text-[17px] text-ink-2">We&apos;ll send a 6-digit code. No password needed.</p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-8 h-16 w-full rounded-[20px] border-2 border-line bg-paper px-5 text-[19px] font-semibold outline-none placeholder:text-ink-3 focus:border-blue"
              aria-label="Email"
            />
            {error && <p className="mt-3 text-[15px] font-semibold text-ember">{error}</p>}
            <div className="flex-1" />
            <button
              disabled={busy || !email}
              className="mb-2 h-16 w-full rounded-[22px] bg-blue text-[18px] font-extrabold text-white disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          </motion.form>
        ) : (
          <motion.div
            key="code"
            className="flex flex-1 flex-col pt-8"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <h1 className="display text-[54px] font-extrabold">Check your email.</h1>
            <p className="mt-4 text-[17px] text-ink-2">
              Enter the code we sent to <b className="text-ink">{email}</b>.
            </p>
            <label className="relative mt-8 block">
              <span className="sr-only">6-digit code</span>
              <input
                ref={codeRef}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                  if (v.length === 6) verify(v);
                }}
                className="absolute inset-0 h-full w-full opacity-0"
                aria-describedby="code-help"
              />
              <span aria-hidden className="grid grid-cols-6 gap-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    className={`flex h-[68px] items-center justify-center rounded-[18px] border-2 bg-paper text-[30px] font-extrabold tnum ${
                      i === code.length && !busy ? "border-blue" : "border-line"
                    }`}
                  >
                    {code[i] ?? ""}
                  </span>
                ))}
              </span>
            </label>
            <p id="code-help" className="mt-3 min-h-[22px] text-[15px] font-semibold text-ember">
              {busy ? <span className="text-ink-2">Checking…</span> : error}
            </p>
            <div className="flex-1" />
            <button
              disabled={cooldown > 0 || busy}
              onClick={() => sendCode()}
              className="mb-2 h-14 w-full rounded-[22px] text-[16px] font-bold text-blue disabled:text-ink-3"
            >
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
