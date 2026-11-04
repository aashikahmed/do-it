"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { todayIn } from "@/lib/dates";

/**
 * Keeps the screen current without pull-to-refresh:
 * realtime changes from partners + coming back to the app both trigger a soft refresh.
 */
export function Live({ pactIds, days = [] }: { pactIds: string[]; days?: { tz: string; today: string }[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = pactIds.slice().sort().join(",");
  const dayKey = days.map((d) => `${d.tz}|${d.today}`).join(",");

  // the app can sit open past midnight: refresh when any pact's day rolls over
  useEffect(() => {
    if (!dayKey) return;
    const pairs = dayKey.split(",").map((x) => x.split("|"));
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && pairs.some(([tz, d]) => todayIn(tz) !== d)) router.refresh();
    }, 30_000);
    return () => clearInterval(t);
  }, [dayKey, router]);

  useEffect(() => {
    const soon = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    const onVisible = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    const ids = key ? key.split(",") : [];
    const supabase = getBrowserClient();
    const channel = supabase.channel(`live-${ids.length}-${Math.random().toString(36).slice(2, 8)}`);
    let cancelled = false;
    if (ids.length) {
      const filter = ids.length === 1 ? `pact_id=eq.${ids[0]}` : `pact_id=in.(${ids.join(",")})`;
      for (const table of ["checkins", "freezes", "nudges", "pact_members"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, soon);
      }
      // Realtime enforces RLS, so it must carry the user's token before subscribing.
      supabase.auth.getSession().then(async ({ data }) => {
        if (cancelled) return;
        if (data.session) await supabase.realtime.setAuth(data.session.access_token);
        if (!cancelled) channel.subscribe();
      });
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [key, router]);

  return null;
}
