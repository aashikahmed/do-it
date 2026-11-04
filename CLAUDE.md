@AGENTS.md

# Do it. — project notes

- Shared-streak pacts PWA. Read README.md for the product rules (chain, freezes, grace day, timezones).
- Stack: Next.js 16 (Cache Components ON, Partial Prefetching ON), Supabase, web-push. Mobile-only UI (440px column).
- Every page = sync shell + `<Suspense>` around the data component. Anything reading cookies/auth goes behind Suspense; `lib/supabase/server.ts` calls `connection()` first.
- Streak logic lives only in `lib/streak.ts` (pure, tested). SQL mirrors the rules that must be enforced (check-in window trigger, freeze cap trigger, `create_pact` freeze allowance = `freezesFor`). Keep them in sync.
- New tables need explicit GRANTs (this Supabase version doesn't auto-grant) + RLS policies. Column-level UPDATE grants protect fields like `freezes_allowed`.
- Local Supabase: `supabase start -x vector,logflare,imgproxy,storage-api,studio,postgres-meta,edge-runtime,supavisor` (storage is flaky under Rosetta). OTP emails → Mailpit :54324.
- Design tokens in app/globals.css (ink #10143A, mist, ultramarine, sun, ember, ice; per-pact `data-color`). Font: Bricolage Grotesque. Signature element: the chain (components/chain.tsx).
- Copy voice: plain, sentence case, no "→", no all-caps labels.
- Prod: doit.launchit.ae → Vercel `do-it` (fra1) + Supabase `ubdkikowagrmghxsgssi` (eu-central-1). See README "Production". Never `supabase config push` from repo config (would disable Google auth).
- Auth = Google OAuth + iOS handoff (`app/auth/callback`, `app/api/auth/handoff`, `auth_handoffs`). Email OTP is dev-only.
