"use client";

import { Share } from "lucide-react";
import { toast } from "@/components/toast";

/** Share sheet when there is one, clipboard otherwise. Break ideas are shared without saying what they are. */
export async function shareLink(url: string, text: string) {
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
    toast("Link copied");
  } catch {
    toast(url);
  }
}

export function ShareIdea({ slug, title }: { slug: string; title: string | null }) {
  return (
    <button
      onClick={() => shareLink(`${window.location.origin}/explore/${slug}`, title ? `${title}. Want to do it with me?` : "An idea for a pact. Want to do it with me?")}
      aria-label="Share this idea"
      className="ml-auto flex h-11 w-11 items-center justify-center"
    >
      <Share size={23} strokeWidth={2.4} aria-hidden />
    </button>
  );
}
