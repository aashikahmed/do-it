-- Make function access in this repo the whole truth, like 20261110000000_lock_down_api_roles.sql did for tables.
-- Postgres lets everyone (PUBLIC) execute a new function, and Supabase also grants anon by default, so every
-- function here was callable with the public anon key, and re-creating one (as the tracking migration did with
-- create_pact) quietly brought PUBLIC back. Nothing was exploitable: the RPCs all reject a missing auth.uid().
-- But pact_today and period_complete answered for any pact id without a membership check.

-- RPCs the app calls when signed in.
revoke execute on function
  public.create_pact(text, text, text, text, int, int, date, text, text, text, text, numeric),
  public.join_pact(text),
  public.leave_pact(uuid),
  public.start_next_round(uuid),
  public.use_freezes(uuid, date[])
from public, anon;
grant execute on function
  public.create_pact(text, text, text, text, int, int, date, text, text, text, text, numeric),
  public.join_pact(text),
  public.leave_pact(uuid),
  public.start_next_round(uuid),
  public.use_freezes(uuid, date[])
to authenticated;

-- RLS policies call these as the signed-in user.
revoke execute on function public.is_member(uuid), public.shares_pact(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.shares_pact(uuid) to authenticated;

-- Internal: only called from security definer functions, which run as the owner.
revoke execute on function public.pact_today(uuid), public.period_complete(uuid, date) from public, anon, authenticated;

-- The invite page shows the pact before you sign in.
revoke execute on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- Trigger functions (handle_new_user, checkins_guard, refund_freeze, misses_guard) are left alone:
-- they can't be called over the API, and triggers don't check EXECUTE when they fire.

-- New functions start closed, so each one has to grant what it needs.
-- PUBLIC's default is global in Postgres, so it can only be revoked without "in schema".
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
