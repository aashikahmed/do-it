# Do it.

Shared-streak accountability pacts. Pick a goal, pick your people, check in every day (or N times a week). The group shares one chain. If anyone misses, it breaks for everyone, and a limited number of freezes can patch it the next day.

Mobile-first PWA: Next.js 16 (App Router, Cache Components), Supabase (Postgres + auth + realtime), Web Push.

## How it works

- **Pact**: what, how often (daily, or 1–6× a week), how long (7–90 days, or 4–12 weeks), and a start day (today or tomorrow). Optionally track a number (e.g. 50 push-ups).
- **Chain**: one link per day (daily) or per week (weekly). A link closes when every *required* member hits the target. Members who join mid-pact count from the next day (or next week), so joining never reopens a period the group already closed.
- **Freezes**: daily pacts get 1 per 10 days, weekly pacts 1 per 4 weeks, shared by the group. They can only patch the missed run *right before the current period*, so once a later day closes, the old streak is gone for good.
- **Grace**: you can log yesterday until midnight (pact timezone).
- **Nudges**: one push nudge per person, per partner, per day, plus a WhatsApp button that opens WhatsApp with a ready-made message (you pick the contact).
- **Sign-in**: Google only. On iPhone Home Screen apps, Google opens in a separate sheet; the callback parks the one-time code (`auth_handoffs`, keyed by a hashed nonce) and the app collects it and finishes the PKCE exchange itself. No emails are ever sent.
- **Notifications**: a partner checked in (your turn), everyone's in, nudges, freezes, someone joined, plus an evening "chain at risk" reminder (cron).
- **Timezone**: every pact runs on its creator's timezone so the whole group shares one calendar.

## Local development

Requirements: Node 22, Docker, Supabase CLI.

```bash
npm install
# storage/studio etc. are disabled in supabase/config.toml (flaky under Rosetta on this Mac)
supabase start -x vector,logflare,imgproxy,storage-api,studio,postgres-meta,edge-runtime,supavisor
supabase db reset            # applies supabase/migrations
cp .env.example .env.local   # fill from `supabase status -o env` + `npx web-push generate-vapid-keys`
npm run dev
```

Locally, the sign-in screen offers an email-code fallback (dev builds only); codes land in Mailpit at http://127.0.0.1:54324.

```bash
npm test          # streak engine unit tests (vitest)
npm run lint
npm run build
```

## Production

- App: https://doit.launchit.ae (Vercel project `do-it`, functions pinned to `fra1`), fallback https://do-it-omega-puce.vercel.app
- Supabase project `do-it` (`ubdkikowagrmghxsgssi`, eu-central-1). DB password in `.env.production.local` (gitignored).
- Hourly reminder cron is in `vercel.json` (Vercel sends `CRON_SECRET` automatically).
- Deploy: `vercel deploy --prod`. Schema: `supabase db push` (with `SUPABASE_DB_PASSWORD` from `.env.production.local`).
- **Auth config is managed in the dashboard** (site URL `https://doit.launchit.ae`, redirect allowlist, Google provider). Don't run `supabase config push` from this repo's config.toml: it targets local dev and would switch the Google provider off.

## Project map

```
supabase/migrations/   schema, RLS, triggers (check-in window, freeze cap), RPCs, grants
lib/streak.ts          pure streak/freeze engine (+ tests)
lib/data.ts            loads a user's pacts in one parallel round-trip
lib/notify.ts, push.ts push fan-out (web-push, dead subscriptions pruned)
app/actions.ts         server actions: create/join/check-in/nudge/freeze/push
app/p/[id]/            pact screen (chain, roster, hold-to-check-in, freeze, recap)
app/new/               4-step create flow + invite
app/j/[code]/          invite landing (works signed out)
app/api/cron/reminders evening at-risk reminder
public/sw.js           push + notification click handling
```
