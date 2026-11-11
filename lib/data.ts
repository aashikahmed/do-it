import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { addDays, hourIn, todayIn, type Day } from "./dates";
import { computePactState, type Cadence, type Kind, type PactState } from "./streak";
import type { Direction, Measure } from "./measure";
import { buildSeries, seriesIds, type RoundLink, type Series } from "./rounds";

export type PactColor = "blue" | "sun" | "ember" | "mint" | "violet" | "rose";

export interface Pact {
  id: string;
  title: string;
  emoji: string;
  color: PactColor;
  cadence: Cadence;
  times_per_week: number;
  duration_days: number;
  start_date: Day;
  timezone: string;
  measure: Measure;
  direction: Direction;
  unit: string | null;
  target: number | null;
  freezes_allowed: number;
  invite_code: string;
  created_by: string;
  created_at: string;
  /** the round this one follows ("Go again"); null for a first round */
  previous_id: string | null;
  round: number;
  /** build (do something) or break (stop or cut down) */
  kind: Kind;
  /** break pacts: what's being given up, as typed ("soda") */
  subject: string | null;
  /** days off, as a weekday bitmask (bit 0 = Sunday) */
  rest_days: number;
  /** "a little each day": lower the limit by this much each week */
  limit_step: number | null;
  /** break pacts: today can only be answered the next morning */
  ask_next_morning: boolean;
  craving_plan: string | null;
}

/** Break pacts open today's question at 6pm (pact time), or not at all when they ask the next morning. */
export const ANSWER_FROM_HOUR = 18;

export function canAnswerToday(p: Pick<Pact, "kind" | "ask_next_morning" | "timezone">, now: Date = new Date()) {
  if (p.kind !== "break") return true;
  return !p.ask_next_morning && hourIn(p.timezone, now) >= ANSWER_FROM_HOUR;
}

export interface Member {
  user_id: string;
  joined_on: Day;
  joined_at: string;
  left_on: Day | null;
  name: string;
  avatar_url: string | null;
  /** their profile's timezone: their reminders and deadlines are worded on it */
  timezone?: string | null;
}

export interface Checkin {
  id: string;
  pact_id: string;
  user_id: string;
  day: Day;
  value: number | null;
  note: string | null;
  feel: 1 | 2 | 3 | null;
  /** logged the next day as a make-up, as opposed to just logged late */
  made_up: boolean;
  created_at: string;
}

export interface PactBundle {
  pact: Pact;
  /** current members */
  members: Member[];
  /** everyone who was ever in it (history + streak math) */
  allMembers: Member[];
  checkins: Checkin[];
  freezes: { period_start: Day; used_by: string | null }[];
  /** nudges sent today (pact timezone) */
  nudges: { from_user: string; to_user: string }[];
  /** "I missed it" calls (build pacts) and every "I gave in" (break pacts) */
  misses: { user_id: string; day: Day }[];
  /** whether today can be answered yet (break pacts open at 6pm) */
  canAnswerToday: boolean;
  state: PactState;
  today: Day;
  yesterday: Day;
}

export interface Me {
  id: string;
  name: string;
  timezone: string;
  avatar_url: string | null;
}

export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/signin");
  return { supabase, userId: userId as string, email: (data?.claims?.email as string | undefined) ?? "" };
}

export async function optionalUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: (data?.claims?.sub as string | undefined) ?? null };
}

type Row = Record<string, unknown>;

const PAGE = 1000;
/** PostgREST caps responses (max_rows), so page through anything that grows with time. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any query builder
export async function fetchAll<T>(build: () => any): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return { data: out, error: null };
  }
}

/** Load pacts plus everything needed to render them in one parallel round-trip (RLS scopes to the caller's pacts). */
async function loadBundles(supabase: SupabaseClient, pactIds?: string | string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrows any query builder to the given pacts
  const scope = (q: any, col: string) => (pactIds === undefined ? q : typeof pactIds === "string" ? q.eq(col, pactIds) : q.in(col, pactIds));
  const [pacts, members, checkins, freezes, nudges, misses] = await Promise.all([
    scope(supabase.from("pacts").select("*"), "id"),
    scope(supabase.from("pact_members").select("pact_id,user_id,joined_on,joined_at,left_on,profile:profiles(display_name,avatar_url,timezone)"), "pact_id"),
    fetchAll<Checkin>(() =>
      scope(supabase.from("checkins").select("id,pact_id,user_id,day,value,note,feel,made_up,created_at"), "pact_id")
        // newest day first (a late "log yesterday" must not count as the latest), then entry time
        .order("day", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id"),
    ),
    scope(supabase.from("freezes").select("pact_id,period_start,used_by"), "pact_id"),
    scope(supabase.from("nudges").select("pact_id,from_user,to_user,day").gte("day", addDays(todayIn("UTC"), -2)), "pact_id"),
    // build pacts only need yesterday's calls; break pacts show every "I gave in" in their history
    fetchAll<Row>(() => scope(supabase.from("misses").select("pact_id,user_id,day"), "pact_id").order("day").order("user_id")),
  ]);
  for (const r of [pacts, members, checkins, freezes, nudges, misses]) if (r.error) throw new Error(r.error.message);

  return ((pacts.data ?? []) as Pact[]).map((pact): PactBundle => {
    const today = todayIn(pact.timezone);
    const ms: Member[] = ((members.data ?? []) as Row[])
      .filter((m) => m.pact_id === pact.id)
      .map((m) => ({
        user_id: m.user_id as string,
        joined_on: m.joined_on as Day,
        joined_at: m.joined_at as string,
        left_on: (m.left_on as Day | null) ?? null,
        name: ((m.profile as { display_name?: string } | null)?.display_name || "Someone").trim(),
        avatar_url: (m.profile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
        timezone: (m.profile as { timezone?: string | null } | null)?.timezone ?? null,
      }))
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    const cs = ((checkins.data ?? []) as Checkin[]).filter((c) => c.pact_id === pact.id).map((c) => ({ ...c, value: c.value === null ? null : Number(c.value) }));
    const fz = ((freezes.data ?? []) as (Row & { period_start: Day; used_by: string | null })[]).filter((f) => f.pact_id === pact.id);
    const nd = ((nudges.data ?? []) as Row[])
      .filter((n) => n.pact_id === pact.id && n.day === today)
      .map((n) => ({ from_user: n.from_user as string, to_user: n.to_user as string }));
    const calls = ((misses.data ?? []) as Row[]).filter((x) => x.pact_id === pact.id).map((x) => ({ user_id: x.user_id as string, day: x.day as Day }));
    return {
      pact: { ...pact, target: pact.target === null ? null : Number(pact.target), limit_step: pact.limit_step === null ? null : Number(pact.limit_step) },
      members: ms.filter((m) => !m.left_on),
      allMembers: ms,
      checkins: cs,
      freezes: fz.map((f) => ({ period_start: f.period_start, used_by: f.used_by })),
      nudges: nd,
      misses: calls,
      canAnswerToday: canAnswerToday(pact),
      state: computePactState(pact, ms, cs, fz.map((f) => f.period_start), today, calls),
      today,
      yesterday: addDays(today, -1),
    };
  });
}

export async function getMe(supabase: SupabaseClient, userId: string): Promise<Me> {
  const { data, error } = await supabase.from("profiles").select("id,display_name,timezone,avatar_url").eq("id", userId).maybeSingle();
  // a valid token for an account that no longer exists: start over instead of looping on /welcome
  if (!error && !data) redirect("/signin");
  return { id: userId, name: (data?.display_name ?? "").trim(), timezone: data?.timezone ?? "UTC", avatar_url: data?.avatar_url ?? null };
}

export async function getHome() {
  const { supabase, userId } = await requireUser();
  const [me, bundles] = await Promise.all([getMe(supabase, userId), loadBundles(supabase)]);
  return { me, bundles };
}

export async function getPact(id: string): Promise<{ me: Me; bundle: PactBundle | null; series: Series | null }> {
  const { supabase, userId } = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { me: await getMe(supabase, userId), bundle: null, series: null };
  const [me, bundles, links] = await Promise.all([
    getMe(supabase, userId),
    loadBundles(supabase, id),
    supabase.from("pacts").select("id,previous_id,round").returns<RoundLink[]>(),
  ]);
  const bundle = bundles[0] ?? null;
  if (!bundle) return { me, bundle, series: null };
  // other rounds of the same pact (Go again): one more round-trip, only when there are any
  const ids = seriesIds(links.data ?? [], id);
  if (ids.length < 2) return { me, bundle, series: null };
  const others = await loadBundles(supabase, ids.filter((x) => x !== id));
  return { me, bundle, series: buildSeries([bundle, ...others], ids, id, userId) };
}

export async function getPactForUser(supabase: SupabaseClient, id: string) {
  const bundles = await loadBundles(supabase, id);
  return bundles[0] ?? null;
}

/** what the viewer still has to do in the current period */
export function myProgress(b: PactBundle, userId: string) {
  const cur = b.state.current;
  const mine = b.checkins.filter((c) => c.user_id === userId);
  const doneToday = mine.some((c) => c.day === b.today);
  const doneYesterday = mine.some((c) => c.day === b.yesterday);
  const count = cur ? cur.counts[userId] ?? 0 : 0;
  const required = cur ? cur.required.includes(userId) : false;
  const metPeriod = count >= b.state.need;
  return { doneToday, doneYesterday, count, required, metPeriod };
}
