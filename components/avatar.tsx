"use client";

import { useState } from "react";

const PALETTE = ["#2b3cf0", "#ff5b3a", "#12b886", "#7b4dff", "#f2457f", "#e09a00", "#0d8bd9", "#10143a"];

export function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Google photos come at 96px; ask for a size that stays sharp on retina screens. */
function sized(src: string, px: number) {
  if (/googleusercontent\.com\//.test(src)) return src.replace(/=s\d+(-c)?$/, "") + `=s${Math.min(512, Math.round(px * 2))}-c`;
  return src;
}

export function Avatar({
  id,
  name,
  src,
  size = 36,
  ring,
  done,
}: {
  id: string;
  name: string;
  /** photo URL; falls back to initials when missing or broken */
  src?: string | null;
  size?: number;
  /** color of the outline ring (for stacking on colored surfaces) */
  ring?: string;
  /** show a check badge */
  done?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = !!src && failed !== src;

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        aria-hidden
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full font-bold text-white"
        style={{
          background: colorFor(id),
          fontSize: size * 0.38,
          boxShadow: ring ? `0 0 0 2.5px ${ring}` : undefined,
        }}
      >
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny external avatars; no optimizer round-trip
          <img
            src={sized(src, size)}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setFailed(src)}
            className="h-full w-full object-cover"
          />
        ) : (
          initials(name)
        )}
      </span>
      {done && (
        <span
          aria-hidden
          className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-sun text-ink"
          style={{ width: size * 0.46, height: size * 0.46, boxShadow: `0 0 0 2px ${ring ?? "#fff"}` }}
        >
          <svg viewBox="0 0 12 12" width={size * 0.3} height={size * 0.3}>
            <path d="M2.5 6.3 5 8.6 9.6 3.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </span>
  );
}
