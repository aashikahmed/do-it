"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A bar pinned to the bottom of the screen that never hides content: it leaves an in-flow spacer
 * exactly as tall as itself (measured live, so it follows the bar as it grows: tracking input,
 * an open note, the safe area). Put it last in the page's flow.
 */
export function BottomDock({ children, className = "", estimate = 160 }: { children: React.ReactNode; className?: string; estimate?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(estimate);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // fires once on observe, then on every size change
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div aria-hidden style={{ height }} />
      <div ref={ref} className={`fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[440px] ${className}`}>
        {children}
      </div>
    </>
  );
}
