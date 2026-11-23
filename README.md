# Do it.

Shared-streak accountability pacts. Pick a goal, pick your people, check in every day (or N times a week). The group shares one chain. If anyone misses, it breaks for everyone, and a limited number of freezes can patch it the next day.

Mobile-first PWA: Next.js 16 (App Router, Cache Components), Supabase (Postgres + auth + realtime), Web Push.

## How it works

- **Pact**: first, build a habit or break one. A build pact is what, how often (daily, or 1–6× a week), how long (7–90 days, or 4–12 weeks), and a start day (today or tomorrow, or next Monday for weekly pacts, so anyone who wants Monday-to-Sunday weeks gets them). Optionally track a number (e.g. 50 push-ups).
- **Break a habit** (`pacts.kind = 'break'`): what you're giving up (`subject`) and how much is OK. *None at all* is a daily pact; *some days a week* is a weekly pact needing 7 − allowed clean days; *a little each day* is a daily count with a ceiling (`target`, direction down). The one question is "did you stay off it?": a yes is a check-in, "I gave in" is a `misses` row and can be about today or yesterday (it replaces a yes). A day is lost as soon as someone gives in (a week, once the allowed days run out), and a freeze can save it straight away. Today's question opens at 6pm pact time; yesterday's stays open until midnight. More options: ask the next morning only (for night-time rules), days off (`rest_days` weekday bitmask, always kept), lower the limit each week (`limit_step`), and a plan for cravings, shown with a once-a-day "ask for help" push.
- **Break pacts and notifications**: evenings are when a habit is hardest to resist, so break pacts get no evening push and no real-time partner pushes, and no push ever names the habit. One morning push per person, from 9am their time: "How did yesterday go?" if you haven't answered, otherwise how yesterday went for the group. The only other push is "ask for help", which the person asks for.
- **Chain**: one link per day (daily) or per week (weekly). A link closes when every *required* member hits the target. Nobody is required until their first check-in: from then on they count from the next period start on or after it (a mid-week first check-in counts from next week), so someone who joins and never shows up can't break the chain. Before anyone has checked in, whoever checked in during the period counts, otherwise everyone does (`period_required()` in SQL). Members who join mid-pact count from the next day (or next week), so joining never reopens a period the group already closed. Weekly pacts make one exception: join on the first day of a week (including the pact's first day) and you count that week, like everyone else, unless the week is already done (a 1×-a-week pact everyone has already checked in for). They're in straight away: they can check in now, and the roster says when the chain starts counting them.
- **Freezes and pauses**: everyone has their own freezes: daily pacts 1 per 10 days, weekly pacts 1 per 4 weeks, each (`pacts.freezes_allowed` is per person). Once a miss is past the make-up window (or called, or a break pact lost early), the missing person's own freeze covers it automatically; nobody taps anything. Out of freezes, they're paused at once and the period counts without them, as long as someone else kept it. 3 quiet days in a row (1 silent week on weekly pacts) also pauses you from the next period; the quiet days use your freezes first. Days off don't count. A paused person counts again from their next check-in, like a first check-in. The chain only breaks when nobody kept a period and someone who missed has no freezes, and solo pacts never pause. Nothing is stored for a pause: `computePactState()` works it all out from history (`paused`, `autoFreezes`), and the hourly cron writes the automatic freezes down (`paid_by = covers`, `used_by` null) and sends one push to the paused person and one to the group. Manual freezes (yesterday before its window closes, or a gift) go through `use_freezes(pact, periods, covers)`. A late "log yesterday" refunds the freeze that covered that person. On the pact screen, paused people sit at the bottom of the roster under "Paused" (faded photo, ice pause badge, nudge to bring them back), and a paused viewer gets a "You're paused" card. While yesterday is still open, each person who owes it has an outcome (`ifMissed` on the late period: freeze, quiet, out, without, break): someone on their 3rd quiet day shows "Quiet for 3 days" with an ice ring, and "Waiting on" and "on the line" only show when a miss would really break the chain. The Today screen offers manual freezes for yesterday; changing an older day in Activity follows the same rules (see Change a day).
- **Make-up day**: a missed day stays open until midnight the next day (pact timezone). The chain shows it as on the line, not broken. Each person who owes it picks: make it up ("I did it, I forgot to log" or "I'm doing it today to make up", both count; made-up links get a small stitch), use a freeze, or "I missed it" (`misses`), which breaks the link right away and tells partners. Only yesterday can be made up. Reminders: a morning push about yesterday, and the evening push covers both days (each on the person's own clock, see Notifications). In the engine this is the `late` period status.
- **Finish and rounds**: when the last day closes, the pact page becomes a recap (days kept, best streak, first-week vs last-week average) with a one-time celebration and a "you finished" push the next morning. "Go again" starts round N+1 today with the same settings and everyone still in it (they get a push and can leave from the menu). Each round is its own pact linked by `previous_id`; a finished round can only be continued once, so two partners tapping at once land in the same round. Once there are two or more rounds, the recap adds lifetime totals across them.
- **Activity**: every day, not just check-ins. Once a day is over, everyone who counted that day and fell short gets a row: "missed it" / "gave in" when they said so, "didn't check in" / "didn't answer" when they never logged it, with a chip when a freeze covered it. Weekly pacts get one row for a week that ended short ("checked in 2 of 3 times"). Built by `activityDays()` in `lib/activity.ts`.
- **Earlier days**: any day you can change, including ones with no Activity row (while you were paused, before your first check-in, earlier in a weekly pact's open week), is on a calendar: the log sheet's Earlier tab (next to Today and Yesterday; break pacts link to it from today's sheet), and your own days in the Progress tab's calendars. Tap a day for the same sheet as Change a day. After 3 or more of your days in a row with nothing logged, reaching the day before yesterday, a catch-up card at the top of the Today tab asks about them one at a time, oldest first ("Not sure, skip it" leaves one empty), shows one preview for all of them, and saves them together (`set_days()`, mirrored by `previewDays()`). Yesterday stays with its make-up card. "Not now" hides the card until the run grows.
- **Change a day**: press and hold one of your own rows in Activity. The row lifts with a small menu ("Change Monday", what it says now, and "What it said before" if it was changed already); "Change" opens a sheet. Any day of the round that's over can be changed, until a week after the round ends (not days off, not before you joined). The sheet previews what happens to the chain before you save, including days after it that start counting for you again (a check-in ends a pause, or starts you earlier). A miss follows the usual rules: it uses one of your own freezes by itself, or pauses you if you're out, and the sheet says which. Trust-based, so the safeguard is visibility: `set_day()` keeps what the day said before in `day_changes`, and the row shows "changed on Tue". No push. Wording never says "back to 0": when a chain breaks, it says how many kept days still count. Today's own check-in opens the usual edit sheet.
- **Nudges**: one push nudge per person, per partner, per day, plus a WhatsApp button that opens WhatsApp with a ready-made message (you pick the contact). Someone who just joined a build pact can be nudged too, with a "get going" message. Break pacts only nudge about yesterday, so a new member isn't chased.
- **Sign-in**: Google only. On iPhone Home Screen apps, Google opens in a separate sheet; the callback parks the one-time code (`auth_handoffs`, keyed by a hashed nonce), the sheet asks "Finish signing in?", and only after a yes there does the app collect the code and finish the PKCE exchange itself. The yes needs a secret cookie only that sheet has, so a sign-in link someone else started can't be collected silently. No emails are ever sent.
- **Notifications**: a partner checked in (your turn), everyone's in, a partner made up yesterday or called it a miss, nudges, freezes, someone joined, a new round started, plus the cron pushes: the morning "yesterday is still open" make-up reminder, the evening "chain at risk" reminder (today and yesterday in one push), the weekly heads-up (below), and the "you finished" push the morning after a pact ends (held a day if the last day can still be made up). Cron pushes go out on each person's own clock (`profiles.timezone`, refreshed from the device whenever the app opens): the evening one at 8pm when that's 2 to 12 hours before the pact's midnight, otherwise 4 hours before it, and never between 10pm and 8am; morning ones once the day has closed, between 9am and 9pm. Deadlines in pushes and on the pact screen are in your time when it differs from the pact's ("before 4pm your time"). Rules and worked examples: `lib/reminders.ts`.
- **Weeks**: a weekly pact's weeks start on its start day (start on a Wednesday and weeks run Wednesday to Tuesday), so the app always names the day a week ends: "Week 2 of 4, ends Tuesday", "1 more by Tuesday", the dates next to "This week", and in nudges. On build pacts, `weekOutlook()` (`lib/week.ts`) compares what someone still needs with the days left: on track, tight (every day left is needed: "You need today and tomorrow"), or short (can't be done anymore), and then says what the week's end brings, the same way the engine settles it: a freeze covers it, nothing logged all week means a pause (one check-in avoids it), out of freezes means a pause, or the streak ends. Pushes, build pacts only: a morning heads-up the first day a week turns tight ("2 to go, 2 days left"), and on the last day of a week with nothing logged ("Check in once today to stay in"), at most one of each per person per week; the evening push goes out on those days too if today isn't logged, worded the same, and never for a week that can't be kept anymore. Break pacts are never chased: they only get the end day in their wording. The weeks are named up front too: "Weeks will run Wednesday to Tuesday" on the create flow's start step, "Weeks run…" on the invite page and in the pact's details, and on Go again (a new round starts today, so its weeks can shift; the card and the new-round push say so). On screen the week is drawn too: the home card shows your 7 days as squares under the lanes (letters from the pact's own weekday, "ends" under the last one; break pacts' token strip has the same letters), the "This week" list has a row of 7 dots per person under the letters, and the lanes get a tick where each week ends (solid for this one) with this week's check-ins painted faintly until the target's hit (`part` in `lib/lanes.ts`).
- **Timezone**: every pact runs on its creator's timezone so the whole group shares one calendar: each day ends at midnight there, for everyone. Only when reminders arrive and how deadlines are worded follow each person's own timezone.

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
- Hourly reminder cron is in `vercel.json` (Vercel sends `CRON_SECRET` automatically). Each run writes a row to `cron_runs` (pushes by kind, failures, errors), shown on the admin Health page.
- Admin: `/admin` (overview, people, pacts, activity, health), view-only plus a test push to yourself. Only the emails in the `ADMIN_EMAILS` env var (Vercel) can open it; everyone else, signed in or not, gets a 404.
- Deploy: every push or merge to `main` deploys to production through Vercel's Git integration, and other branches get preview deployments (which have no env vars, so they don't work). `vercel deploy --prod` also works.
- Schema: `supabase db push` (with `SUPABASE_DB_PASSWORD` from `.env.production.local`). Apply a pull request's migration *before* merging it, because the merge goes live straight away. Keep migrations backward compatible with the code that's already live.
- **Auth config is managed in the dashboard** (site URL `https://doit.launchit.ae`, redirect allowlist, Google provider). Don't run `supabase config push` from this repo's config.toml: it targets local dev and would switch the Google provider off.

## Project map

```
supabase/migrations/   schema, RLS, triggers (check-in window, freeze cap), RPCs, grants
lib/streak.ts          pure streak/freeze engine (+ tests)
lib/rounds.ts          rounds of a pact ("Go again") and lifetime totals (+ tests)
lib/reminders.ts       when each person gets a scheduled push, and deadlines in their time (+ tests)
lib/data.ts            loads a user's pacts in one parallel round-trip
lib/notify.ts, push.ts push fan-out (web-push, dead subscriptions pruned)
app/actions.ts         server actions: create/join/check-in/nudge/freeze/push
app/p/[id]/            pact screen (chain, roster, hold-to-check-in, freeze, recap)
app/new/               4-step create flow + invite
app/j/[code]/          invite landing (works signed out)
app/admin/             owner-only admin pages (ADMIN_EMAILS); data in lib/admin.ts
app/api/cron/reminders morning make-up reminder, evening at-risk reminder, "you finished" push
public/sw.js           push + notification click handling
```
