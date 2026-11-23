# Backlog

Ideas, deferred work and half-formed thoughts, kept for later. Nothing here is a plan or a promise until it's picked up.

## How this works

- Add an entry when we defer something mid-task, when a brainstorm produces something worth keeping, or when an idea comes up ("I was thinking about…").
- Each entry has a title, the date it was added, a status, the idea in a few lines, and open questions. Keep entries short; the design happens when one is picked up.
- Status: `idea` → `shaping` → `ready` → `in progress` → `shipped` (link the PR) or `dropped` (say why). Move shipped and dropped entries to the last section instead of deleting them.
- This repo is public, so keep anything sensitive (users, metrics, business plans) out of this file.

## Ideas

### I'm away
Added 2026-11-19 · `idea`

Someone going on holiday can mark themselves away for a stretch (say a week), so the pact doesn't expect them while they're gone, and they pick it back up when they're back. Planned absences shouldn't burn freezes or break the chain for everyone.

Open questions:
- Does the chain keep going for everyone else while one person is away (they just aren't required those days), or does the whole pact pause? Per person fits the current model: `period_required()` in SQL and `countsFrom` in `lib/streak.ts` already decide who's required each period.
- What happens when everyone is away, or it's a solo pact: pause the pact and push the end date out?
- Does the end date move for the person who was away, or do they just have fewer days in their recap?
- Limits: longest stretch, how many per pact or round, and how far ahead it has to be set. It can't be set after the fact, or it becomes an unlimited freeze.
- Weekly pacts: away for part of a week lowers that week's target, or covers only whole weeks?
- Break pacts already have `rest_days` (weekday days off). Is away a dated version of that, and does it even make sense for a break pact (a holiday is when people slip)?
- How it shows: roster "Away until Sat", a distinct link on the chain, no reminders or nudges while away, a "welcome back" when it ends.
- Rules go in `lib/streak.ts` and get mirrored in SQL (check-in window trigger, `period_required()`).

### Earn back a freeze
Added 2026-11-19 · `idea`

When someone runs out of freezes, give them a way to earn one back. First thought: watch a short motivational video (YouTube or similar). Just a thought for now; the mechanism is open.

Open questions:
- What earns it: a video, a bonus effort (e.g. an extra check-in or a double session), a milestone (every 7 days kept), a partner vouching for you? It should cost something, or freezes stop meaning anything.
- Caps: how many can be earned per pact or round, and does it go above `freezes_allowed`? The freeze cap trigger and the `create_pact` allowance in SQL would need to know about it.
- A watched video can't really be verified (player events are easy to fake). Is the honour system fine here?
- Can an earned freeze be given to a partner like any other?

### Explore
Added 2026-11-19 · `idea`

An explore section full of ideas for pacts to start with a friend, both building and breaking habits, mixing creative ones (sketch every day, write 100 words) with self-development ones (read 10 pages, no phone in bed). People browse it now and then, pick one, and lock in with someone.

Open questions:
- Where it lives: its own tab, or inside "new pact"? Tapping an idea should prefill the create form (kind, cadence, length, target).
- Start as a curated list in code (no table), grouped by theme (body, mind, creative, money, people, screens).
- Later: rotating picks ("this week's ideas"), what's popular in the app, seasonal sets (January, exam season).
- Could the signed-out landing page show a few as well?

### Log a day you forgot
Added 2026-11-19 · `in progress` (A + B, branch `earlier-days`)

A day you forgot completely often has no Activity row to hold, so it can't be changed: days while you were paused, days before your first check-in, and anything before yesterday in an open week (weekly pacts). `set_day()` already accepts any finished day of the round, so the gap is a way in. Proposal (round 2 is the current one): https://claude.ai/artifact/L6zjhYmSJJJFfMazhZxeGz

- Owner picked A + B (2026-11-23). A: the log sheet gets "Earlier" next to Today and Yesterday, showing your round as a calendar; tap a day for the Change a day form with its preview. Also reachable from "Fill in a day" at the top of Activity, for every pact. B: a catch-up card after 2+ empty days in a row, one day per screen, one preview for all, saved together (new `set_days()` and `previewDays()`).
- D (Activity rows for your empty days) is built and tested on branch `activity-empty-days` and parked. Its preview lines that warn about later days counting again, and the "Fri 13" date format, carry over.

Decided 2026-11-23: no link in Activity; A lives in the log sheet's Earlier tab and the Progress calendars. B after 3+ empty days, oldest first so it ends at yesterday's make-up. The "some days a week" line ships. A and B in one PR.

Open questions:
- Break pacts only reach Earlier from today's sheet after 6pm (and Progress any time). Enough?
- Should D's empty-day rows come back if people still miss days?

## Deferred

Things we decided not to do yet during other work. None yet.

## Shipped or dropped

### Log from a sheet instead of the dock
Added 2026-11-19 · `shipped` in [#21](https://github.com/aashikahmed/do-it/pull/21)

The check-in dock on the pact page covered the activity history. The bar is now one row ("Log today", plus "Yesterday" while it's still open), and the input lives in a sheet with a Today / Yesterday switch.

Decided:
- Pacts with nothing to measure keep hold to check in in the bar, with "Add details" to open the sheet.
- The make-up card opens the same sheet set to yesterday; `MakeUpSheet` is gone.
- Break pacts ask today's question in a sheet from a "How did today go?" button; `YesterdayCard` stays as the morning prompt.
