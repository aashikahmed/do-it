# Contributing to Do it.

Thanks for helping out. Fixes, ideas and bug reports are all welcome, from friends and strangers alike.

## How it works

1. **Talk first.** For anything bigger than a small fix, open an issue and wait for a thumbs up, so you don't build something that can't be merged.
2. **Fork the repo** and work on a branch in your fork.
3. **Open a pull request** against `main` and fill in the template.
4. **Checks run.** A first-time contributor's checks wait until the owner starts them.
5. **The owner reviews.** Only [@aashikahmed](https://github.com/aashikahmed) can approve and merge. Pushing new commits clears an earlier approval, so the final version is always the one reviewed.
6. **Merged.** Pull requests are squashed into a single commit on `main`.

This is a side project, so reviews can take a few days. The owner decides what goes in and may say no to good work that doesn't fit the product. Open an issue first and that's unlikely.

## Good places to start

Look for issues labelled [`good first issue`](https://github.com/aashikahmed/do-it/labels/good%20first%20issue). Small and focused pull requests get reviewed fastest: one change each, with no drive-by refactors.

## Set up

You need Node 22, Docker and the Supabase CLI. You don't need any keys from us: everything runs on your machine against a local database. Follow [Local development](README.md#local-development).

Sign in with the email-code option on the sign-in screen. It only appears in dev builds, and codes land in Mailpit at http://127.0.0.1:54324. Google sign-in and live data aren't available locally, and contributors never get production access.

Before you push:

```bash
npm run lint
npm test
npm run build
```

## Project rules

**This isn't the Next.js you may know.** It's version 16 with Cache Components on, and APIs differ from older versions. Check `node_modules/next/dist/docs/` before writing Next.js code.

**Pages.** Every page is a sync shell plus `<Suspense>` around its data component. Anything that reads cookies or auth goes behind Suspense.

**Streak rules.** The logic lives only in `lib/streak.ts`, which is pure and tested. Some rules are enforced in SQL too (the check-in window, the freeze cap and the freeze allowance). If you change a rule, change both and add tests. [README.md](README.md) explains the product rules.

**UI.** The app is mobile only, in a 440px column. Use the tokens in `app/globals.css`. Copy is plain and in sentence case, with no arrows and no all-caps labels.

**Dependencies.** Ask in an issue before adding one.

## Database changes

- Add a new file in `supabase/migrations/`. Never edit one that's already merged.
- Timestamp it later than the newest file in that folder, even if that date is in the future.
- Every new table needs RLS enabled and explicit grants, even if only the service role uses it. Grant the smallest set of columns that works.
- Use `supabase db reset` to check that your migration applies cleanly from scratch.
- Say in your pull request that it includes a migration. Only the owner applies migrations to production, before merging, because merging to `main` deploys straight away. Write migrations that the code already live can run against: add things first, remove them later.

## Using AI tools

Fine by us. You're still responsible for the result, so read and understand every line before you open a pull request, and test it yourself. Pull requests that look unread will be closed.

## What not to include

- Secrets, `.env` files or real keys. If you commit one by accident, tell us and don't try to hide it with a force push.
- Real user data, including in screenshots and test fixtures.
- Changes to `.github/`, `vercel.json` or `CODEOWNERS`, unless we've agreed them in an issue first.

Found a security problem? Follow [SECURITY.md](SECURITY.md) and keep it out of public issues.

## Be kind

Be respectful and assume good intent. Harassment, personal attacks and discrimination aren't welcome here. The owner may remove comments and block anyone who ignores this. If someone is making you uncomfortable, use GitHub's [report content](https://docs.github.com/en/communities/maintaining-your-safety-on-github/reporting-abuse-or-spam) option.

## Licence

Do it. is licensed under the [GNU AGPL v3](LICENSE). By opening a pull request, you agree that your contribution is shared under the same licence. You keep your copyright.
