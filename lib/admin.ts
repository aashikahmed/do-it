import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { isAdminEmail } from "./admin-access";
import { fetchAll, loadBundles, type Member, type PactBundle, type PactColor } from "./data";
import { addDays, formatDay, todayIn } from "./dates";
import { cadenceText, pactName, progressText } from "./view";

/**
 * The admin pages' data. Everything here reads with the service role (every pact, every person), so every
 * exported loader checks the caller first. The proxy 404s /admin for anyone else too; this is the check that counts.
 */

/** The signed-in admin, or null. Verified claims only (getClaims checks the JWT), never request input. */
export const getAdmin = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !isAdminEmail(claims.email)) return null;
  return { userId: claims.sub as string, email: String(claims.email) };
});

/** For pages: anyone who isn't the admin gets the ordinary 404. */
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) notFound();
  return admin;
}

// ---------- shared load (once per request) ----------

type ProfileRow = { id: string; display_name: string; timezone: string; avatar_url: string | null; created_at: string };

async function listAllUsers(admin: SupabaseClient): Promise<User[]> {
  const out: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    out.push(...data.users);
    if (data.users.length < 1000) return out;
  }
}

export type PactStatus = "upcoming" | "in" | "waiting" | "late" | "broken" | "finished";

export const STATUS_TEXT: Record<PactStatus, string> = {
  upcoming: "Starting soon",
  in: "Everyone's in",
  waiting: "In progress",
  late: "Yesterday open",
  broken: "Chain broke",
  finished: "Finished",
};

/** Where a pact stands right now, from the streak engine's state. */
export function pactStatus(b: PactBundle): PactStatus {
  const s = b.state;
  if (s.phase === "upcoming") return "upcoming";
  if (s.late) return "late";
  if (s.phase === "ended") return "finished";
  const prev = s.current ? s.periods[s.current.index - 1] : undefined;
  if (s.current?.status === "done") return "in";
  if (prev?.status === "missed") return "broken";
  return "waiting";
}

const base = cache(async () => {
  const admin = createAdminClient();
  // Note: loadBundles reads pacts and pact_members in one request each (PostgREST caps those at 1000 rows).
  const [bundles, profiles, users, subs] = await Promise.all([
    loadBundles(admin),
    fetchAll<ProfileRow>(() => admin.from("profiles").select("id,display_name,timezone,avatar_url,created_at").order("id")),
    listAllUsers(admin),
    fetchAll<{ user_id: string; endpoint: string; created_at: string }>(() => admin.from("push_subscriptions").select("user_id,endpoint,created_at").order("endpoint")),
  ]);
  if (profiles.error) throw new Error(profiles.error.message);
  if (subs.error) throw new Error(subs.error.message);
  const userById = new Map(users.map((u) => [u.id, u]));
  const devices = new Map<string, number>();
  for (const s of subs.data) devices.set(s.user_id, (devices.get(s.user_id) ?? 0) + 1);
  const nameOf = new Map(profiles.data.map((p) => [p.id, p.display_name.trim() || "No name yet"]));
  return { admin, bundles, profiles: profiles.data, userById, devices, subs: subs.data, nameOf };
});

async function viewerTz(userId: string) {
  const { profiles } = await base();
  return profiles.find((p) => p.id === userId)?.timezone || "UTC";
}

// ---------- shapes the pages render ----------

export interface PactRow {
  id: string;
  emoji: string;
  name: string;
  color: PactColor;
  kind: "build" | "break";
  cadence: "daily" | "weekly";
  schedule: string;
  progress: string;
  members: number;
  streak: number;
  unit: string;
  freezes: string;
  status: PactStatus;
  round: number;
  createdAt: string;
}

function pactRow(b: PactBundle): PactRow {
  const p = b.pact;
  return {
    id: p.id,
    emoji: p.emoji,
    name: pactName(p) || "Untitled",
    color: p.color,
    kind: p.kind,
    cadence: p.cadence,
    schedule: cadenceText(p),
    progress: progressText(b),
    members: b.members.length,
    streak: b.state.streak,
    unit: p.cadence === "daily" ? (b.state.streak === 1 ? "day" : "days") : b.state.streak === 1 ? "week" : "weeks",
    freezes: `${b.state.freezesUsed} of ${p.freezes_allowed}`,
    status: pactStatus(b),
    round: p.round,
    createdAt: p.created_at,
  };
}

export interface PersonRow {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  timezone: string;
  joined: string;
  lastSignIn: string | null;
  pacts: number;
  livePacts: number;
  checkins: number;
  lastCheckin: string | null;
  devices: number;
}

function peopleRows(b: Awaited<ReturnType<typeof base>>): PersonRow[] {
  const pactsOf = new Map<string, PactBundle[]>();
  const checkinsOf = new Map<string, { n: number; last: string | null }>();
  for (const x of b.bundles) {
    for (const m of x.allMembers) pactsOf.set(m.user_id, [...(pactsOf.get(m.user_id) ?? []), x]);
    for (const c of x.checkins) {
      const cur = checkinsOf.get(c.user_id) ?? { n: 0, last: null };
      cur.n++;
      if (!cur.last || c.created_at > cur.last) cur.last = c.created_at;
      checkinsOf.set(c.user_id, cur);
    }
  }
  return b.profiles
    .map((p) => {
      const u = b.userById.get(p.id);
      const ps = pactsOf.get(p.id) ?? [];
      return {
        id: p.id,
        name: b.nameOf.get(p.id)!,
        email: u?.email ?? "",
        avatar: p.avatar_url,
        timezone: p.timezone,
        joined: p.created_at,
        lastSignIn: u?.last_sign_in_at ?? null,
        pacts: ps.length,
        livePacts: ps.filter((x) => x.state.phase === "active" && x.members.some((m) => m.user_id === p.id)).length,
        checkins: checkinsOf.get(p.id)?.n ?? 0,
        lastCheckin: checkinsOf.get(p.id)?.last ?? null,
        devices: b.devices.get(p.id) ?? 0,
      };
    })
    .sort((a, b) => b.joined.localeCompare(a.joined));
}

// ---------- overview ----------

export async function getOverview() {
  const me = await requireAdmin();
  const b = await base();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const utcToday = todayIn("UTC", now);
  const live = b.bundles.filter((x) => x.state.phase === "active");
  const checkins = b.bundles.flatMap((x) => x.checkins.map((c) => ({ ...c, today: x.today })));

  const days = Array.from({ length: 30 }, (_, i) => addDays(utcToday, i - 29));
  const perDay = new Map(days.map((d) => [d, 0]));
  for (const c of checkins) if (perDay.has(c.day)) perDay.set(c.day, perDay.get(c.day)! + 1);

  const today = checkins.filter((c) => c.day === c.today);
  const inAPact = new Set(b.bundles.flatMap((x) => x.allMembers.map((m) => m.user_id)));
  const everCheckedIn = new Set(checkins.map((c) => c.user_id));
  const activeWeek = new Set(checkins.filter((c) => c.created_at >= weekAgo).map((c) => c.user_id));
  const statuses = live.map(pactStatus);

  return {
    tz: await viewerTz(me.userId),
    now: Date.now(),
    people: b.profiles.length,
    newThisWeek: b.profiles.filter((p) => p.created_at >= weekAgo).length,
    live: live.length,
    liveBuild: live.filter((x) => x.pact.kind === "build").length,
    liveBreak: live.filter((x) => x.pact.kind === "break").length,
    liveDaily: live.filter((x) => x.pact.cadence === "daily").length,
    liveWeekly: live.filter((x) => x.pact.cadence === "weekly").length,
    checkinsToday: today.length,
    peopleToday: new Set(today.map((c) => c.user_id)).size,
    activeWeek: activeWeek.size,
    series: days.map((d) => ({ day: d, n: perDay.get(d)! })),
    funnel: [
      { label: "Signed up", n: b.profiles.length },
      { label: "In a pact", n: inAPact.size },
      { label: "Checked in at least once", n: everCheckedIn.size },
      { label: "Checked in this week", n: activeWeek.size },
    ],
    topChains: live
      .filter((x) => x.state.streak > 0)
      .sort((x, y) => y.state.streak - x.state.streak)
      .slice(0, 5)
      .map(pactRow),
    todayCounts: {
      in: statuses.filter((s) => s === "in").length,
      waiting: statuses.filter((s) => s === "waiting").length,
      late: statuses.filter((s) => s === "late").length,
      owingYesterday: live.reduce((n, x) => n + (x.state.late?.owing.length ?? 0), 0),
      broken: statuses.filter((s) => s === "broken").length,
      freezesWeek: b.bundles.reduce((n, x) => n + x.freezes.filter((f) => f.period_start >= addDays(x.today, -7)).length, 0),
    },
  };
}

// ---------- people ----------

export async function getPeople() {
  const me = await requireAdmin();
  const b = await base();
  return { tz: await viewerTz(me.userId), now: Date.now(), people: peopleRows(b) };
}

export async function getPerson(id: string) {
  const me = await requireAdmin();
  const b = await base();
  const person = peopleRows(b).find((p) => p.id === id);
  if (!person) return null;
  const user = b.userById.get(id);
  const theirs = b.bundles.filter((x) => x.allMembers.some((m) => m.user_id === id));
  const pactNames = new Map(theirs.map((x) => [x.pact.id, `${x.pact.emoji} ${pactName(x.pact) || "Untitled"}`]));
  const recent = theirs
    .flatMap((x) => x.checkins.filter((c) => c.user_id === id))
    .sort((a, c) => c.created_at.localeCompare(a.created_at))
    .slice(0, 15)
    .map((c) => ({ id: c.id, pact: pactNames.get(c.pact_id) ?? "", day: c.day, at: c.created_at, madeUp: c.made_up }));
  return {
    tz: await viewerTz(me.userId),
    now: Date.now(),
    person,
    provider: (user?.app_metadata?.provider as string | undefined) ?? "",
    pacts: theirs.map((x) => ({ ...pactRow(x), left: x.allMembers.find((m) => m.user_id === id)?.left_on ?? null })),
    recent,
  };
}

// ---------- pacts ----------

export async function getPacts() {
  await requireAdmin();
  const b = await base();
  const order: Record<PactStatus, number> = { late: 0, broken: 1, waiting: 2, in: 3, upcoming: 4, finished: 5 };
  return b.bundles.map(pactRow).sort((x, y) => order[x.status] - order[y.status] || y.createdAt.localeCompare(x.createdAt));
}

export async function getPactDetail(id: string) {
  const me = await requireAdmin();
  const b = await base();
  const x = b.bundles.find((y) => y.pact.id === id);
  if (!x) return null;
  const rounds = b.bundles.filter((y) => y.pact.previous_id === id || y.pact.id === x.pact.previous_id).map(pactRow);
  return {
    tz: await viewerTz(me.userId),
    now: Date.now(),
    row: pactRow(x),
    bundle: x,
    creator: { id: x.pact.created_by, name: b.nameOf.get(x.pact.created_by) ?? "Someone" },
    roster: x.allMembers.map((m) => ({ ...m, today: memberToday(x, m), devices: b.devices.get(m.user_id) ?? 0 })),
    recent: [...x.checkins]
      .sort((a, c) => c.created_at.localeCompare(a.created_at))
      .slice(0, 20)
      .map((c) => ({ id: c.id, who: b.nameOf.get(c.user_id) ?? "Someone", day: c.day, at: c.created_at, value: c.value, madeUp: c.made_up })),
    rounds,
  };
}

export type Tone = "ok" | "wait" | "risk" | "off" | "done";

/** One member's state today, worded for the admin roster. */
function memberToday(b: PactBundle, m: Member): { text: string; tone: Tone } {
  const s = b.state;
  const brk = b.pact.kind === "break";
  if (m.left_on) return { text: `Left ${formatDay(m.left_on)}`, tone: "off" };
  if (s.phase === "upcoming") return { text: "Not started", tone: "off" };
  if (s.late?.owing.includes(m.user_id)) return { text: brk ? "Hasn't answered for yesterday" : "Owes yesterday", tone: "risk" };
  if (s.phase === "ended") return { text: "Finished", tone: "done" };
  const cur = s.current;
  if (!cur) return { text: "", tone: "off" };
  if (!cur.required.includes(m.user_id)) return { text: b.pact.cadence === "daily" ? "Counts from tomorrow" : "Counts from next week", tone: "off" };
  if (brk && (cur.slips[m.user_id] ?? 0) > 0) return { text: "Gave in", tone: "risk" };
  if (b.pact.cadence === "weekly") {
    const n = cur.counts[m.user_id] ?? 0;
    return { text: `${n} of ${s.need} this week`, tone: n >= s.need ? "ok" : "wait" };
  }
  const done = b.checkins.some((c) => c.user_id === m.user_id && c.day === b.today);
  if (done) return { text: brk ? "Stayed off it" : "Checked in", tone: "ok" };
  return { text: brk ? "Not answered yet" : "Not yet", tone: "wait" };
}

// ---------- activity ----------

export type EventKind = "checkin" | "makeup" | "miss" | "freeze" | "nudge" | "join" | "leave" | "pact" | "round" | "signup";

export interface ActivityEvent {
  key: string;
  kind: EventKind;
  at: string;
  text: string;
  pactId: string | null;
  pact: string;
}

export async function getActivity() {
  const me = await requireAdmin();
  const b = await base();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [misses, freezes, nudges] = await Promise.all([
    fetchAll<{ pact_id: string; user_id: string; day: string; created_at: string }>(() =>
      b.admin.from("misses").select("pact_id,user_id,day,created_at").gte("created_at", since).order("created_at", { ascending: false }).order("user_id"),
    ),
    fetchAll<{ pact_id: string; period_start: string; used_by: string | null; created_at: string }>(() =>
      b.admin.from("freezes").select("pact_id,period_start,used_by,created_at").gte("created_at", since).order("created_at", { ascending: false }).order("pact_id"),
    ),
    fetchAll<{ id: string; pact_id: string; from_user: string; to_user: string; created_at: string }>(() =>
      b.admin.from("nudges").select("id,pact_id,from_user,to_user,created_at").gte("created_at", since).order("created_at", { ascending: false }).order("id"),
    ),
  ]);
  for (const r of [misses, freezes, nudges]) if (r.error) throw new Error(r.error.message);

  const pacts = new Map(b.bundles.map((x) => [x.pact.id, x]));
  const label = (id: string) => {
    const x = pacts.get(id);
    return x ? `${x.pact.emoji} ${pactName(x.pact) || "Untitled"}` : "A deleted pact";
  };
  const who = (id: string | null) => (id ? (b.nameOf.get(id) ?? "Someone") : "Someone");
  const unitOf = (id: string) => (pacts.get(id)?.pact.cadence === "weekly" ? "week" : "day");
  const ev: ActivityEvent[] = [];

  for (const x of b.bundles) {
    const brk = x.pact.kind === "break";
    for (const c of x.checkins) {
      if (c.created_at < since) continue;
      const what = c.made_up ? `made up ${formatDay(c.day)}` : brk ? "stayed off it" : "checked in";
      const value = c.value !== null && x.pact.unit ? ` · ${c.value} ${x.pact.unit}` : "";
      ev.push({ key: `c${c.id}`, kind: c.made_up ? "makeup" : "checkin", at: c.created_at, text: `${who(c.user_id)} ${what}${value}`, pactId: x.pact.id, pact: label(x.pact.id) });
    }
    if (x.pact.created_at >= since) {
      const round = x.pact.round > 1;
      ev.push({
        key: `p${x.pact.id}`,
        kind: round ? "round" : "pact",
        at: x.pact.created_at,
        text: round ? `${who(x.pact.created_by)} went again · round ${x.pact.round}` : `${who(x.pact.created_by)} started a pact`,
        pactId: x.pact.id,
        pact: label(x.pact.id),
      });
    }
    const createdMs = new Date(x.pact.created_at).getTime();
    for (const m of x.allMembers) {
      // members added with the pact itself (the creator, or everyone carried into a new round) didn't "join"
      if (m.joined_at >= since && new Date(m.joined_at).getTime() - createdMs > 60_000) {
        ev.push({ key: `j${x.pact.id}${m.user_id}`, kind: "join", at: m.joined_at, text: `${who(m.user_id)} joined`, pactId: x.pact.id, pact: label(x.pact.id) });
      }
      if (m.left_on && m.left_on >= addDays(x.today, -7)) {
        ev.push({ key: `l${x.pact.id}${m.user_id}`, kind: "leave", at: `${m.left_on}T12:00:00Z`, text: `${who(m.user_id)} left`, pactId: x.pact.id, pact: label(x.pact.id) });
      }
    }
  }
  for (const m of misses.data) {
    const brk = pacts.get(m.pact_id)?.pact.kind === "break";
    ev.push({
      key: `m${m.pact_id}${m.user_id}${m.day}`,
      kind: "miss",
      at: m.created_at,
      text: brk ? `${who(m.user_id)} gave in (${formatDay(m.day)})` : `${who(m.user_id)} called ${formatDay(m.day)} a miss`,
      pactId: m.pact_id,
      pact: label(m.pact_id),
    });
  }
  for (const f of freezes.data) {
    ev.push({ key: `f${f.pact_id}${f.period_start}`, kind: "freeze", at: f.created_at, text: `${who(f.used_by)} froze the ${unitOf(f.pact_id)} of ${formatDay(f.period_start)}`, pactId: f.pact_id, pact: label(f.pact_id) });
  }
  for (const n of nudges.data) {
    ev.push({ key: `n${n.id}`, kind: "nudge", at: n.created_at, text: `${who(n.from_user)} nudged ${who(n.to_user)}`, pactId: n.pact_id, pact: label(n.pact_id) });
  }
  for (const p of b.profiles) {
    if (p.created_at < since) continue;
    const u = b.userById.get(p.id);
    const via = u?.app_metadata?.provider === "google" ? " with Google" : "";
    ev.push({ key: `s${p.id}`, kind: "signup", at: p.created_at, text: `${who(p.id)} signed up${via}`, pactId: null, pact: "" });
  }

  ev.sort((x, y) => y.at.localeCompare(x.at));
  return { tz: await viewerTz(me.userId), now: Date.now(), events: ev.slice(0, 400), total: ev.length };
}

// ---------- health ----------

export interface CronRun {
  id: number;
  started_at: string;
  finished_at: string;
  checked: number;
  sent: Record<string, number>;
  failed: number;
  error: string | null;
}

export async function getHealth() {
  const me = await requireAdmin();
  const b = await base();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [runs, handoffs, taps] = await Promise.all([
    b.admin.from("cron_runs").select("id,started_at,finished_at,checked,sent,failed,error").eq("job", "reminders").order("started_at", { ascending: false }).limit(48),
    b.admin.from("auth_handoffs").select("created_at,confirmed_at"),
    fetchAll<{ user_id: string }>(() => b.admin.from("ui_events").select("user_id").eq("name", "avatar_tap").gte("created_at", monthAgo).order("id")),
  ]);
  // cron_runs is new: before its migration runs, show the page without it
  const cronRuns = runs.error ? null : ((runs.data ?? []) as CronRun[]);
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const lastDay = (cronRuns ?? []).filter((r) => r.started_at >= dayAgo);
  const sentByKind: Record<string, number> = {};
  for (const r of lastDay) for (const [k, v] of Object.entries(r.sent ?? {})) sentByKind[k] = (sentByKind[k] ?? 0) + Number(v);

  const pushUsers = new Set(b.subs.map((s) => s.user_id));
  const inLivePact = new Set(b.bundles.filter((x) => x.state.phase !== "ended").flatMap((x) => x.members.map((m) => m.user_id)));
  const hs = handoffs.data ?? [];

  return {
    tz: await viewerTz(me.userId),
    now: Date.now(),
    myDevices: b.devices.get(me.userId) ?? 0,
    cron: cronRuns && {
      runs: cronRuns,
      last: cronRuns[0] ?? null,
      runsLastDay: lastDay.length,
      errorsLastDay: lastDay.filter((r) => r.error).length,
      failedLastDay: lastDay.reduce((n, r) => n + r.failed, 0),
      sentByKind,
    },
    push: {
      devices: b.subs.length,
      people: pushUsers.size,
      everyone: b.profiles.length,
      inPactWithout: [...inLivePact].filter((u) => !pushUsers.has(u)).length,
    },
    handoffs: handoffs.error ? null : { parked: hs.length, confirmed: hs.filter((h) => h.confirmed_at).length },
    taps: taps.error ? null : { n: taps.data.length, people: new Set(taps.data.map((t) => t.user_id)).size },
  };
}
