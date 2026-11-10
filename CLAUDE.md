@AGENTS.md

# Do it. — project notes

- Shared-streak pacts PWA. Read README.md for the product rules (chain, freezes, grace day, timezones).
- Stack: Next.js 16 (Cache Components ON, Partial Prefetching ON), Supabase, web-push. Mobile-only UI (440px column).
- Every page = sync shell + `<Suspense>` around the data component. Anything reading cookies/auth goes behind Suspense; `lib/supabase/server.ts` calls `connection()` first.
- Rounds: "Go again" = `start_next_round()` RPC → new pact with `previous_id`/`round`; lifetime totals in `lib/rounds.ts`. Home hides a finished round once it has a next round.
- Build vs break pacts: `pacts.kind`. Break pacts reuse check-ins (yes) and `misses` (I gave in), ask from 6pm or the next morning, and never send evening pushes or name the habit in a notification (cron `breakMorning`). README "Break a habit" has the rules.
- Streak logic lives only in `lib/streak.ts` (pure, tested). SQL mirrors the rules that must be enforced (check-in window trigger, freeze cap trigger, `create_pact` freeze allowance = `freezesFor`). Keep them in sync.
- New functions start with no EXECUTE for anyone (default privileges, `20261113000000_lock_down_functions.sql`): grant each RPC to `authenticated` (and `anon` only if signed-out pages call it). `drop` + `create` loses grants; `create or replace` keeps them.
- New tables need explicit GRANTs + RLS, even service-role-only ones (enable RLS, add no policies). Local doesn't auto-grant, but hosted prod has: don't treat a missing grant as protection. Column-level UPDATE grants protect fields like `freezes_allowed`, and only work with no table-wide UPDATE grant.
- Local Supabase: `supabase start -x vector,logflare,imgproxy,studio,postgres-meta,edge-runtime,supavisor` (storage IS needed: avatars bucket). OTP emails → Mailpit :54324.
- Profile photos: `profiles.avatar_url` is set only by server actions (Google photo or `avatars/<uid>/…` in our public bucket); client resizes to a 400px JPEG before upload.
- Design tokens in app/globals.css (ink #10143A, mist, ultramarine, sun, ember, ice; per-pact `data-color`). Font: Bricolage Grotesque. Signature element: the chain (components/chain.tsx).
- Copy voice: plain, sentence case, no "→", no all-caps labels.
- Prod: doit.launchit.ae → Vercel `do-it` (fra1) + Supabase `ubdkikowagrmghxsgssi` (eu-central-1). See README "Production". Never `supabase config push` from repo config (would disable Google auth).
- Auth = Google OAuth + iOS handoff (`app/auth/callback`, `app/auth/handoff` confirm step, `app/api/auth/handoff`, `auth_handoffs`). A parked code is only released after "Yes, that was me" in the receiving browser (httpOnly `doit-handoff` cookie). Post-sign-in redirects go through `lib/safe-next.ts`. Email OTP is dev-only.
- Merging to `main` deploys to prod immediately (Vercel Git). Apply migrations before merging; keep them compatible with the live code.
- Contributions: see CONTRIBUTING.md and SECURITY.md. Contributors work from forks and never get production access. Keep CI free of real secrets and on `pull_request`, never `pull_request_target`.
