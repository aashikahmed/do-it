"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { z } from "zod";
import { getPactForUser, requireUser } from "@/lib/data";
import { notifyCheckin } from "@/lib/notify";
import { sendPush } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, isValidTimeZone, todayIn } from "@/lib/dates";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(message: string): ActionResult<never> {
  return { ok: false, error: message };
}

/** Turn database errors into something a person can act on. */
function friendly(msg: string | undefined) {
  if (!msg) return "Something went wrong. Try again.";
  const known = [
    "You can only check in for today or yesterday",
    "That day is outside this pact",
    "No freezes left",
    "Only missed days can be frozen",
    "This invite link is not valid",
    "This pact has already finished",
    "This pact is full (10 people max)",
    "Start date must be within the next two weeks",
    "Unknown timezone",
    "You left this pact, so you can't rejoin it",
    "There's nothing to freeze right now",
    "Pact not found",
  ];
  const hit = known.find((k) => msg.includes(k));
  if (hit) return hit;
  if (msg.includes("duplicate key")) return "Already done.";
  console.error(msg);
  return "Something went wrong. Try again.";
}

async function displayName(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return (data?.display_name || "Your partner").trim();
}

// ───────────────────────── profile ─────────────────────────

export async function saveProfile(input: { name: string; timezone: string }): Promise<ActionResult> {
  const parsed = z.object({ name: z.string().trim().min(1, "Add your name").max(40), timezone: z.string().max(64) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check your name");
  const { supabase, userId } = await requireUser();
  const tz = isValidTimeZone(parsed.data.timezone) ? parsed.data.timezone : "UTC";
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data.name, timezone: tz }).eq("id", userId);
  if (error) return fail(friendly(error.message));
  refresh();
  return { ok: true };
}

// ───────────────────────── pacts ─────────────────────────

const createSchema = z.object({
  title: z.string().trim().min(1, "Name your pact").max(60),
  emoji: z.string().min(1).max(16),
  color: z.enum(["blue", "sun", "ember", "mint", "violet", "rose"]),
  cadence: z.enum(["daily", "weekly"]),
  timesPerWeek: z.number().int().min(1).max(7),
  durationDays: z.number().int().min(7).max(365),
  startDate: day,
  timezone: z.string().max(64),
  unit: z.string().trim().max(24).optional(),
  target: z.number().positive().max(999999).nullable().optional(),
});

export async function createPact(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string; code: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the details");
  const v = parsed.data;
  const { supabase } = await requireUser();
  const tz = isValidTimeZone(v.timezone) ? v.timezone : "UTC";
  const { data: id, error } = await supabase.rpc("create_pact", {
    p_title: v.title,
    p_emoji: v.emoji,
    p_color: v.color,
    p_cadence: v.cadence,
    p_times_per_week: v.cadence === "daily" ? 7 : v.timesPerWeek,
    p_duration_days: v.durationDays,
    p_start_date: v.startDate,
    p_timezone: tz,
    p_unit: v.unit || null,
    p_target: v.unit && v.target ? v.target : null,
  });
  if (error || !id) return fail(friendly(error?.message));
  const { data: pact } = await supabase.from("pacts").select("invite_code").eq("id", id).single();
  return { ok: true, data: { id: id as string, code: pact?.invite_code ?? "" } };
}

export async function joinPact(code: string): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().trim().min(4).max(32).safeParse(code);
  if (!parsed.success) return fail("This invite link is not valid");
  const { supabase, userId } = await requireUser();
  const { data: before } = await supabase.from("pacts").select("id").eq("invite_code", parsed.data.toLowerCase()).maybeSingle();
  const { data: id, error } = await supabase.rpc("join_pact", { p_code: parsed.data });
  if (error || !id) return fail(friendly(error?.message));
  if (!before) {
    // first time joining — let the others know
    after(async () => {
      const admin = createAdminClient();
      const [{ data: pact }, { data: members }, name] = await Promise.all([
        admin.from("pacts").select("title,emoji").eq("id", id).single(),
        admin.from("pact_members").select("user_id").eq("pact_id", id).is("left_on", null),
        displayName(userId),
      ]);
      if (!pact) return;
      await sendPush(
        (members ?? []).map((m) => m.user_id).filter((u) => u !== userId),
        { title: `${pact.emoji} ${name} is in`, body: `${name} joined ${pact.title}. The chain is shared now.`, url: `/p/${id}`, tag: `pact-${id}` },
      );
    });
  }
  return { ok: true, data: { id: id as string } };
}

export async function leavePact(pactId: string): Promise<ActionResult> {
  if (!uuid.safeParse(pactId).success) return fail("Pact not found");
  const { supabase, userId } = await requireUser();
  const { data: pact } = await supabase.from("pacts").select("created_by").eq("id", pactId).maybeSingle();
  if (!pact) return fail("Pact not found");
  if (pact.created_by === userId) {
    const { error } = await supabase.from("pacts").delete().eq("id", pactId);
    if (error) return fail(friendly(error.message));
  } else {
    // keeps their past check-ins so the group's history doesn't change
    const { error } = await supabase.rpc("leave_pact", { p_pact: pactId });
    if (error) return fail(friendly(error.message));
  }
  return { ok: true };
}

// ───────────────────────── check-ins ─────────────────────────

const checkinSchema = z.object({
  pactId: uuid,
  /** resolved on the server in the pact's timezone, so a page left open past midnight can't log the wrong day */
  when: z.enum(["today", "yesterday"]),
  value: z.number().min(0).max(999999).nullable().optional(),
  note: z.string().trim().max(280).nullable().optional(),
});

export async function checkIn(input: z.input<typeof checkinSchema>): Promise<ActionResult<{ created: boolean }>> {
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return fail("Check the details and try again");
  const { supabase, userId } = await requireUser();
  const { data: pact } = await supabase.from("pacts").select("timezone").eq("id", parsed.data.pactId).maybeSingle();
  if (!pact) return fail("Pact not found");
  const today = todayIn(pact.timezone);
  const v = { ...parsed.data, day: parsed.data.when === "today" ? today : addDays(today, -1) };
  const row = { value: v.value ?? null, note: v.note || null };

  const { data: existing } = await supabase
    .from("checkins")
    .select("id")
    .eq("pact_id", v.pactId)
    .eq("user_id", userId)
    .eq("day", v.day)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("checkins").update(row).eq("id", existing.id);
    if (error) return fail(friendly(error.message));
    refresh();
    return { ok: true, data: { created: false } };
  }

  const { error } = await supabase.from("checkins").insert({ pact_id: v.pactId, user_id: userId, day: v.day, ...row });
  if (error) {
    if (error.message.includes("duplicate key")) return { ok: true, data: { created: false } };
    return fail(friendly(error.message));
  }
  after(() => notifyCheckin(v.pactId, userId, v.day).catch((e) => console.error("notifyCheckin", e)));
  refresh();
  return { ok: true, data: { created: true } };
}

/** Edit the value/note of an existing check-in. */
export async function updateCheckIn(input: { pactId: string; day: string; value?: number | null; note?: string | null }): Promise<ActionResult> {
  const parsed = z
    .object({ pactId: uuid, day, value: z.number().min(0).max(999999).nullable().optional(), note: z.string().trim().max(280).nullable().optional() })
    .safeParse(input);
  if (!parsed.success) return fail("Check the details and try again");
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("checkins")
    .update({ value: parsed.data.value ?? null, note: parsed.data.note || null })
    .eq("pact_id", parsed.data.pactId)
    .eq("user_id", userId)
    .eq("day", parsed.data.day)
    .select("id");
  if (error) return fail(friendly(error.message));
  if (!data?.length) return fail("That check-in is gone. Refresh and try again.");
  refresh();
  return { ok: true };
}

export async function undoCheckIn(input: { pactId: string; day: string }): Promise<ActionResult> {
  if (!uuid.safeParse(input.pactId).success || !day.safeParse(input.day).success) return fail("Nothing to undo");
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("checkins").delete().eq("pact_id", input.pactId).eq("user_id", userId).eq("day", input.day);
  if (error) return fail(friendly(error.message));
  refresh();
  return { ok: true };
}

// ───────────────────────── nudges & freezes ─────────────────────────

export async function nudge(input: { pactId: string; toUser: string }): Promise<ActionResult> {
  if (!uuid.safeParse(input.pactId).success || !uuid.safeParse(input.toUser).success) return fail("Can't nudge right now");
  const { supabase, userId } = await requireUser();
  if (input.toUser === userId) return fail("You can't nudge yourself");
  const { data: pact } = await supabase.from("pacts").select("id,title,emoji,timezone").eq("id", input.pactId).maybeSingle();
  if (!pact) return fail("Pact not found");
  const today = todayIn(pact.timezone);
  const { error } = await supabase.from("nudges").insert({ pact_id: pact.id, from_user: userId, to_user: input.toUser, day: today });
  if (error) {
    if (error.message.includes("duplicate key")) return fail("Already nudged today");
    return fail(friendly(error.message));
  }
  after(async () => {
    const name = await displayName(userId);
    await sendPush([input.toUser], {
      title: `👋 ${name} nudged you`,
      body: `${pact.emoji} ${pact.title}. Still on for today?`,
      url: `/p/${pact.id}`,
      tag: `nudge-${pact.id}`,
    });
  });
  refresh();
  return { ok: true };
}

export async function applyFreeze(pactId: string): Promise<ActionResult<{ restored: number }>> {
  if (!uuid.safeParse(pactId).success) return fail("Pact not found");
  const { supabase, userId } = await requireUser();
  const bundle = await getPactForUser(supabase, pactId);
  if (!bundle) return fail("Pact not found");
  const repair = bundle.state.repair;
  if (!repair) return fail("There's nothing to freeze right now");
  // one transaction in SQL: validates every period really was missed, all or nothing
  const { error } = await supabase.rpc("use_freezes", { p_pact: pactId, p_periods: repair.periods });
  if (error) return fail(friendly(error.message));
  after(async () => {
    const name = await displayName(userId);
    await sendPush(
      bundle.members.map((m) => m.user_id).filter((u) => u !== userId),
      {
        title: `🧊 ${name} used a freeze`,
        body: `${bundle.pact.title} streak is safe. Don't make it a habit.`,
        url: `/p/${pactId}`,
        tag: `pact-${pactId}`,
      },
    );
  });
  refresh();
  return { ok: true, data: { restored: repair.previous } };
}

// ───────────────────────── push subscriptions ─────────────────────────

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }),
});

export async function savePushSubscription(sub: unknown): Promise<ActionResult> {
  const parsed = subSchema.safeParse(sub);
  if (!parsed.success) return fail("This browser returned an invalid subscription");
  const { userId } = await requireUser();
  // admin upsert: the same device may have belonged to a different account before
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({ endpoint: parsed.data.endpoint, user_id: userId, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth }, { onConflict: "endpoint" });
  if (error) return fail(friendly(error.message));
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

export async function sendTestPush(): Promise<ActionResult<{ sent: number }>> {
  const { userId } = await requireUser();
  const res = await sendPush([userId], { title: "🔔 Alerts are on", body: "This is how a nudge will look.", url: "/me", tag: "test" });
  if (!res.sent) return fail("No device is subscribed yet");
  return { ok: true, data: res };
}
