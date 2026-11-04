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

export function Avatar({
  id,
  name,
  size = 36,
  ring,
  done,
}: {
  id: string;
  name: string;
  size?: number;
  /** color of the outline ring (for stacking on colored surfaces) */
  ring?: string;
  /** show a check badge */
  done?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        aria-hidden
        className="flex h-full w-full items-center justify-center rounded-full font-bold text-white"
        style={{
          background: colorFor(id),
          fontSize: size * 0.38,
          boxShadow: ring ? `0 0 0 2.5px ${ring}` : undefined,
        }}
      >
        {initials(name)}
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
