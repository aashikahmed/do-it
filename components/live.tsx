"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { todayIn } from "@/lib/dates";
import { refreshSoon } from "@/lib/refresh";

/**
 * Keeps the screen current without pull-to-refresh: realtime changes to these pacts, and the day rolling over, both
 * trigger a soft refresh. `me`: also listen for being added to a pact (made on another device, "Go again").
 * Coming back to the app is components/fresh.tsx.
 */
export function Live({ pactIds, days = [], me }: { pactIds: string[]; days?: { tz: string; today: string }[]; me?: string }) {
  const router = useRouter();
  const key = pactIds.slice().sort().join(",");
  const dayKey = days.map((d) => `${d.tz}|${d.today}`).join(",");

  // the app can sit open past midnight: refresh when any pact's day rolls over
  useEffect(() => {
    if (!dayKey) return;
    const pairs = dayKey.split(",").map((x) => x.split("|"));
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && pairs.some(([tz, d]) => todayIn(tz) !== d)) refreshSoon(router.refresh, 0);
    }, 30_000);
    return () => clearInterval(t);
  }, [dayKey, router]);

  useEffect(() => {
    const soon = () => refreshSoon(router.refresh);
    const ids = key ? key.split(",") : [];
    const supabase = getBrowserClient();
    const channel = supabase.channel(`live-${ids.length}-${Math.random().toString(36).slice(2, 8)}`);
    let cancelled = false;
    if (me) channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "pact_members", filter: `user_id=eq.${me}` }, soon);
    if (ids.length) {
      const filter = ids.length === 1 ? `pact_id=eq.${ids[0]}` : `pact_id=in.(${ids.join(",")})`;
      for (const table of ["checkins", "freezes", "nudges", "pact_members", "misses", "hearts"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, soon);
      }
      // the pact itself, when its creator edits it
      channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "pacts", filter: filter.replace(/^pact_id/, "id") }, soon);
    }
    if (ids.length || me) {
      // Realtime enforces RLS, so it must carry the user's token before subscribing.
      supabase.auth.getSession().then(async ({ data }) => {
        if (cancelled) return;
        if (data.session) await supabase.realtime.setAuth(data.session.access_token);
        if (!cancelled) channel.subscribe();
      });
    }

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [key, me, router]);

  return null;
}
