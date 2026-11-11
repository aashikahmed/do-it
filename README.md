# Do it.

Shared-streak accountability pacts. Pick a goal, pick your people, check in every day (or N times a week). The group shares one chain. If anyone misses, it breaks for everyone, and a limited number of freezes can patch it the next day.

Mobile-first PWA: Next.js 16 (App Router, Cache Components), Supabase (Postgres + auth + realtime), Web Push.

## How it works

- **Pact**: first, build a habit or break one. A build pact is what, how often (daily, or 1–6× a week), how long (7–90 days, or 4–12 weeks), and a start day (today or tomorrow). Optionally track a number (e.g. 50 push-ups).
- **Break a habit** (`pacts.kind = 'break'`): what you're giving up (`subject`) and how much is OK. *None at all* is a daily pact; *some days a week* is a weekly pact needing 7 − allowed clean days; *a little each day* is a daily count with a ceiling (`target`, direction down). The one question is "did you stay off it?": a yes is a check-in, "I gave in" is a `misses` row and can be about today or yesterday (it replaces a yes). A day is lost as soon as someone gives in (a week, once the allowed days run out), and a freeze can save it straight away. Today's question opens at 6pm pact time; yesterday's stays open until midnight. More options: ask the next morning only (for night-time rules), days off (`rest_days` weekday bitmask, always kept), lower the limit each week (`limit_step`), and a plan for cravings, shown with a once-a-day "ask for help" push.
- **Break pacts and notifications**: evenings are when a habit is hardest to resist, so break pacts get no evening push and no real-time partner pushes, and no push ever names the habit. One 9am push per person: "How did yesterday go?" if you haven't answered, otherwise how yesterday went for the group. The only other push is "ask for help", which the person asks for.
- **Chain**: one link per day (daily) or per week (weekly). A link closes when every *required* member hits the target. Members who join mid-pact count from the next day (or next week), so joining never reopens a period the group already closed. Weekly pacts make one exception: join on the first day of a week (including the pact's first day) and you count that week, like everyone else, unless the week is already done (a 1×-a-week pact everyone has already checked in for). They're in straight away: they can check in now, and the roster says when the chain starts counting them.
- **Freezes**: daily pacts get 1 per 10 days, weekly pacts 1 per 4 weeks, shared by the group. They can only patch the missed run *right before the current period*, so once a later day closes, the old streak is gone for good.
- **Make-up day**: a missed day stays open until midnight the next day (pact timezone). The chain shows it as on the line, not broken. Each person who owes it picks: make it up ("I did it, I forgot to log" or "I'm doing it today to make up", both count; made-up links get a small stitch), use a freeze, or "I missed it" (`misses`), which breaks the link right away and tells partners. Only yesterday can be made up. Reminders: a 9am push about yesterday, and the 8pm push covers both days. In the engine this is the `late` period status.
- **Finish and rounds**: when the last day closes, the pact page becomes a recap (days kept, best streak, first-week vs last-week average) with a one-time celebration and a "you finished" push the next morning. "Go again" starts round N+1 today with the same settings and everyone still in it (they get a push and can leave from the menu). Each round is its own pact linked by `previous_id`; a finished round can only be continued once, so two partners tapping at once land in the same round. Once there are two or more rounds, the recap adds lifetime totals across them.
- **Nudges**: one push nudge per person, per partner, per day, plus a WhatsApp button that opens WhatsApp with a ready-made message (you pick the contact). Someone who just joined a build pact can be nudged too, with a "get going" message. Break pacts only nudge about yesterday, so a new member isn't chased.
- **Sign-in**: Google only. On iPhone Home Screen apps, Google opens in a separate sheet; the callback parks the one-time code (`auth_handoffs`, keyed by a hashed nonce), the sheet asks "Finish signing in?", and only after a yes there does the app collect the code and finish the PKCE exchange itself. The yes needs a secret cookie only that sheet has, so a sign-in link someone else started can't be collected silently. No emails are ever sent.
- **Notifications**: a partner checked in (your turn), everyone's in, a partner made up yesterday or called it a miss, nudges, freezes, someone joined, a new round started, plus three cron pushes: the 9am "yesterday is still open" make-up reminder, the evening "chain at risk" reminder (today and yesterday in one push), and the "you finished" push the morning after a pact ends (held a day if the last day can still be made up).
- **Timezone**: every pact runs on its creator's timezone so the whole group shares one calendar.

## Local development

Requirements: Node 22, Docker, Supabase CLI.

```bash
npm install
# skips heavier services you don't need; storage is needed for profile photos
supabase start -x vector,logflare,imgproxy,studio,postgres-meta,edge-runtime,supavisor
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

## Contributing

Help is welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Report security problems privately: see [SECURITY.md](SECURITY.md).

## Licence

[GNU AGPL v3](LICENSE). If you run a modified copy as a service, you need to publish your changes under the same licence.

## Production

Maintainer notes. Contributors don't need any of this.

- App: https://doit.launchit.ae (Vercel project `do-it`, functions pinned to `fra1`), fallback https://do-it-omega-puce.vercel.app
- Supabase project `do-it` (`ubdkikowagrmghxsgssi`, eu-central-1). DB password in `.env.production.local` (gitignored).
- Hourly reminder cron is in `vercel.json` (Vercel sends `CRON_SECRET` automatically).
- Deploy: every push or merge to `main` deploys to production through Vercel's Git integration, and other branches get preview deployments (which have no env vars, so they don't work). `vercel deploy --prod` also works.
- Schema: `supabase db push` (with `SUPABASE_DB_PASSWORD` from `.env.production.local`). Apply a pull request's migration *before* merging it, because the merge goes live straight away. Keep migrations backward compatible with the code that's already live.
- **Auth config is managed in the dashboard** (site URL `https://doit.launchit.ae`, redirect allowlist, Google provider). Don't run `supabase config push` from this repo's config.toml: it targets local dev and would switch the Google provider off.

## Project map

```
supabase/migrations/   schema, RLS, triggers (check-in window, freeze cap), RPCs, grants
lib/streak.ts          pure streak/freeze engine (+ tests)
lib/rounds.ts          rounds of a pact ("Go again") and lifetime totals (+ tests)
lib/data.ts            loads a user's pacts in one parallel round-trip
lib/notify.ts, push.ts push fan-out (web-push, dead subscriptions pruned)
app/actions.ts         server actions: create/join/check-in/nudge/freeze/push
app/p/[id]/            pact screen (chain, roster, hold-to-check-in, freeze, recap)
app/new/               4-step create flow + invite
app/j/[code]/          invite landing (works signed out)
app/api/cron/reminders morning make-up reminder, evening at-risk reminder, "you finished" push
public/sw.js           push + notification click handling
```
