"use client";

import { useRouter } from "next/navigation";

/** Back to wherever they came from, or to `fallback` when the page was opened straight from a link. */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => (window.history.length > 1 ? router.back() : router.replace(fallback))}
      className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full"
      aria-label="Back"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
        <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
