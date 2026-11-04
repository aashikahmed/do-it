"use client";

import { useState } from "react";
import { toast } from "./toast";

export function inviteUrl(code: string) {
  return `${window.location.origin}/j/${code}`;
}

/** Native share sheet when available (WhatsApp, Messages…), clipboard otherwise. */
export function ShareInvite({
  code,
  title,
  emoji,
  className,
  label = "Invite your partner",
}: {
  code: string;
  title: string;
  emoji: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = inviteUrl(code);
    const text = `${emoji} Do "${title}" with me. Let's not break the chain.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Do it.", text, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      toast("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(url);
    }
  }

  return (
    <button onClick={share} className={className}>
      {copied ? "Link copied" : label}
    </button>
  );
}
