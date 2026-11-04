import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

const SIZES = { "192": 192, "512": 512, apple: 180, maskable: 512, badge: 96 } as const;
type Kind = keyof typeof SIZES;

export function generateStaticParams() {
  return Object.keys(SIZES).map((kind) => ({ kind }));
}

export async function GET(_req: Request, { params }: RouteContext<"/icons/[kind]">) {
  const { kind } = await params;
  if (!(kind in SIZES)) notFound();
  const k = kind as Kind;
  const size = SIZES[k];
  const badge = k === "badge";
  // maskable icons must keep content inside the middle 80%
  const scale = k === "maskable" ? 0.62 : badge ? 0.92 : 0.74;
  const w = size * scale;
  const h = w * 0.5;
  const sw = w * 0.11;
  const linkW = w * 0.62;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: badge ? "transparent" : "#2b3cf0",
          borderRadius: k === "192" || k === "512" ? size * 0.22 : 0,
        }}
      >
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <ellipse cx={linkW / 2} cy={h / 2} rx={linkW / 2 - sw / 2} ry={h / 2 - sw / 2} fill="none" stroke="#ffffff" strokeWidth={sw} />
          <ellipse cx={w - linkW / 2} cy={h / 2} rx={linkW / 2 - sw / 2} ry={h / 2 - sw / 2} fill="none" stroke={badge ? "#ffffff" : "#ffc23d"} strokeWidth={sw} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
