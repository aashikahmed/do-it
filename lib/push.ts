import "server-only";
import webpush from "web-push";
import { createAdminClient } from "./supabase/admin";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** notifications with the same tag replace each other on the device */
  tag?: string;
}

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:push@example.com", pub, priv);
  configured = true;
  return true;
}

export async function sendPush(userIds: string[], payload: PushPayload) {
  if (!userIds.length || !configure()) return { sent: 0 };
  const admin = createAdminClient();
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth,user_id").in("user_id", userIds);
  if (!subs?.length) return { sent: 0 };

  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12, urgency: "high", topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.endpoint);
        else console.error("push failed", code, (err as Error).message);
      }
    }),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead);
  return { sent };
}
