"use client";

import { getBrowserClient } from "./supabase/client";

const seen = new Set<string>();

/** Someone tapped a partner's avatar (no profile view exists yet; this measures whether people want one). */
export function logAvatarTap(pactId: string, targetUser: string) {
  // once per person per page visit; repeated taps on the same face aren't extra signal
  const key = `${pactId}:${targetUser}`;
  if (seen.has(key)) return;
  seen.add(key);
  void getBrowserClient()
    .from("ui_events")
    .insert({ name: "avatar_tap", pact_id: pactId, target_user: targetUser })
    .then(({ error }) => {
      if (error) seen.delete(key);
    });
}
