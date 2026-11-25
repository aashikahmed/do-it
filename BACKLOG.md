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
Added 2026-11-19, reworked 2026-11-25 · `in progress`

Ideas for pacts to start with a friend, to build and to break. People choose a domain they're excited about, find an idea, pick a level with a suggested number, and start. Proposal with a working prototype: https://claude.ai/artifact/HMu8s2PqXymMkWNztN1T5g

Decided:
- Eight domains as lanes ("Pick a lane") with three picks underneath, search, filter chips. Entry is a button next to New pact. All 115 ideas, in code, checked by a test.
- The level picker is made of inputs the app already had. A level only fills in the number. Levels: Starting out, Getting regular, Going further.
- Sources nobody could confirm aren't shown (18 at first: `checked: false` in `lib/explore/ideas.ts`).
- Seasonal sets and popular ideas are left out for now.

Next, in this order:
- Same days, your own number. A build pact's target isn't enforced by `lib/streak.ts`, so it needs a nullable target on `pact_members`, not an engine change. Break pacts keep one limit. Until then the idea page says "set it for whoever finds it hardest". Mind that Edit a pact locks the minimum with the rest.
- "Go again" offers one level up (needs the idea and level on `pacts`, and `start_next_round()` taking new numbers).
- Suggest an idea: a box in the app, read in admin.
- A link and image per idea (break ideas get a plain image), and ask a friend to choose.

Open questions:
- Who opens the 18 unchecked sources?
- A time target of seven hours reads "At least 7:00:00" on the pact. Fine on an input, odd in a sentence.

### Slack and coming back
Added 2026-11-25 · `idea`

Two findings from the Explore research that are about pacts in general. The field trial where "emergency reserves" worked gave about 29% slack (2 skips a week) and people chose when to spend it; ours gives about 10% and spends itself. And the best programme in a 61,000-person gym megastudy rewarded coming back after a miss.

Open questions:
- Celebrate the first check-in after a miss or a pause?
- Are freezes too tight, or too automatic to feel worth protecting?

## Deferred

Things we decided not to do yet during other work.

### Make a new pact from this one
Added 2026-11-25 · `idea`

For a running pact whose rules are wrong on day five, where Edit only covers the name and look: open the create flow filled in with its settings. Members would have to join again.

Open question: is it needed now that rules can change until the first check-in, and between rounds?

### Read a new pact back before inviting
Added 2026-11-25 · `idea`

A one-line summary with Edit on "Now bring someone in", since the create flow never reads the choices back. Left out of Edit a pact: the owner wants Edit in the pact's menu only.

## Shipped or dropped

### Edit a pact
Added 2026-11-25 · `in progress`

Fix a mistake without deleting the pact and resending the link. Proposal: https://claude.ai/artifact/2YErZ2rJBzonFZkdhkQLmY. Built A (rename and restyle any time) and B (every rule until anyone logs anything), from the pact's menu only. The other two parts are under Deferred.

Decided:
- Rules can change after others join, as long as nothing's logged and they're told. A rename tells nobody.
- The minimum each time locks with the rest, though the app doesn't enforce it. The easiest one to open up later.

### Show where the week ends
Added 2026-11-19, reworked 2026-11-23 · `shipped` in [#29](https://github.com/aashikahmed/do-it/pull/29) (A + C), [#30](https://github.com/aashikahmed/do-it/pull/30) (B) and [#31](https://github.com/aashikahmed/do-it/pull/31) (D)

People in weekly pacts can't tell when their week starts or ends. A pact's week starts on its start day (start on a Wednesday and weeks run Wednesday to Tuesday), and nothing on screen says so; most people assume Monday to Sunday. Since #20 the week's end decides whether you lose your own freeze or get paused (one silent week), and #25's "paused at midnight" warning only shows after a week ends, so on 2+ a week pacts it never shows for a quiet week. Proposal with mockups (v2): https://claude.ai/artifact/AQk7KPY3yJbuJgyYJPK1dD

- A: the end day on every weekly line ("Week 2 of 4, ends Tuesday", "1 more by Tuesday"), pushes and nudges included; drop "to keep the chain" now that the chain is gone.
- B: build pacts get the home-card week strip break pacts already have (7 squares from the pact's weekday, day letters, "ends"); week ticks and faint partial paint on the lanes; 7 dots per person in the roster; day letters on the break-pact strip.
- C: outcomes for the week in progress (next to `ifMissed`): tight, short (a freeze will cover it), heading for a pause ("One check-in by Tuesday and Jon isn't paused"); a morning push the first day a week turns tight and on the last day of a silent week, and the 8pm push reworded and skipped for weeks that can't be kept (build pacts only).
- D: "Weeks will run Wednesday to Tuesday" on the create start step, a "Next Monday" option, the same line on the invite page.
- Still parked: Monday-to-Sunday weeks for every pact. Lanes, tokens, the Earlier calendar and the quiet-week pause all count from the start day now.

Decided: Go again starts today and says what the weeks will be (keeping the old weekday would need a SQL change and could delay a round by up to 6 days).

Still open:
- Is the 8pm push on top of the morning heads-up too much on tight days? Watch the `week` count on the admin Health page.
- Other copy still mentions the chain (create flow "One link per week", the alerts card "when the chain is at risk").

### Log a day you forgot
Added 2026-11-19 · `shipped` in [#26](https://github.com/aashikahmed/do-it/pull/26)

A day you forgot completely often had no Activity row to hold, so it couldn't be changed. Proposal: https://claude.ai/artifact/L6zjhYmSJJJFfMazhZxeGz. Shipped A + B: the log sheet's Earlier tab and tappable days in your own Progress calendar open the Change a day form; a catch-up card after 3+ empty days in a row (reaching the day before yesterday) asks oldest first, previews all answers together and saves them in one go (`set_days()`). D (Activity rows for empty days) is parked on local branch `activity-empty-days`.

Still open:
- Break pacts only reach Earlier from today's sheet after 6pm (and Progress any time). Enough?
- Should D's empty-day rows come back if people still miss days?

### A fresher look for the chain
Added 2026-11-19 · `shipped` in [#27](https://github.com/aashikahmed/do-it/pull/27)

The chain felt plain. After five rounds of mockups (https://claude.ai/artifact/E1jpxSHvFCt6XNoAmgmZ19) the owner picked "Your lanes" for build pacts (a running track, a lane per person, animated from the start line to today on every open) and "Calendar and tokens" for break pacts (clean-day tokens that are never taken back, weekly bars against the goal).

Still open:
- The hero's big number is still the streak. Should break pacts show clean days there instead, to match the tokens?
- Other styles from the mockups (night, line, paper, sun) as a per-pact choice?
- A share image of a finished lap or a full token set.

### Log from a sheet instead of the dock
Added 2026-11-19 · `shipped` in [#21](https://github.com/aashikahmed/do-it/pull/21)

The check-in dock on the pact page covered the activity history. The bar is now one row ("Log today", plus "Yesterday" while it's still open), and the input lives in a sheet with a Today / Yesterday switch.

Decided:
- Pacts with nothing to measure keep hold to check in in the bar, with "Add details" to open the sheet.
- The make-up card opens the same sheet set to yesterday; `MakeUpSheet` is gone.
- Break pacts ask today's question in a sheet from a "How did today go?" button; `YesterdayCard` stays as the morning prompt.
