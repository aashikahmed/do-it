"use server";

import { getAdmin } from "@/lib/admin";
import { sendPush } from "@/lib/push";

export type TestPushResult = { ok: true; sent: number; failed: number } | { ok: false; error: string };

/** Sends a push to the admin's own devices. Checks the caller itself: a server action is a public endpoint. */
export async function sendAdminTestPush(): Promise<TestPushResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, error: "Not found" };
  const res = await sendPush([admin.userId], {
    title: "Test from admin",
    body: "Push works on this device.",
    url: "/admin/health",
    tag: "admin-test",
  });
  return { ok: true, ...res };
}
