import { ImageResponse } from "next/og";
import { ideaBySlug } from "@/lib/explore/catalog";
import { fromText } from "@/lib/explore/words";

export const alt = "An idea for a pact, from Do it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = { blue: ["#2b3cf0", "#ffffff"], sun: ["#ffb81f", "#10143a"], ember: ["#ff5b3a", "#ffffff"], mint: ["#12b886", "#ffffff"], violet: ["#7b4dff", "#ffffff"], rose: ["#f2457f", "#ffffff"] } as const;

/** What a chat shows when the link is pasted. A break idea gets the same plain picture whatever it is. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const idea = ideaBySlug(slug);
  const shown = idea?.kind === "build" ? idea : null;
  const [bg, ink] = COLORS[shown?.color ?? "blue"];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: bg, color: ink }}>
        <svg width="150" height="72" viewBox="0 0 150 72">
          <ellipse cx="46" cy="36" rx="39" ry="29" fill="none" stroke={ink} strokeWidth="13" />
          <ellipse cx="104" cy="36" rx="39" ry="29" fill="none" stroke={ink === "#ffffff" ? "#ffc23d" : ink} strokeWidth="13" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: -4, lineHeight: 1.02 }}>{shown?.title ?? "An idea for a pact"}</div>
          <div style={{ fontSize: 40, marginTop: 24, opacity: 0.9 }}>{shown ? fromText(shown) : "Open it to see"}</div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 800 }}>Do it.</div>
      </div>
    ),
    size,
  );
}
