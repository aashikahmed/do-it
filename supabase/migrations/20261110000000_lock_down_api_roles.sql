-- Make the grants in this repo the whole truth, on every project.
-- Local stacks start with no table access for API roles, but a hosted project can carry default grants
-- that local doesn't. Those defaults made checkin_notify_log (no RLS) reachable with the public anon key,
-- and a table-wide UPDATE grant would also quietly override the column-level grants below.

-- Written only by the service role, so it needs no policies.
alter table public.checkin_notify_log enable row level security;

-- Start from nothing. This clears column-level grants too, so all of them are restated here.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
grant select, delete on public.pacts to authenticated;
grant update (title, emoji, color) on public.pacts to authenticated;
grant select on public.pact_members to authenticated;
grant select, insert, delete on public.checkins to authenticated;
grant update (value, note, feel) on public.checkins to authenticated;
grant select on public.freezes to authenticated;
grant select, insert on public.nudges to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant insert (name, pact_id, target_user) on public.ui_events to authenticated;

-- New tables start closed, so each one has to grant what it needs.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
