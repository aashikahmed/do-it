-- Explore: which idea a pact came from, a number of your own, levelling up on "Go again", and suggested ideas.
-- Everything here is additive: the code that's live keeps working.

-- ───────────────────────── where a pact came from ─────────────────────────
-- the catalog lives in the app (lib/explore/ideas.ts), so these are its ids, not foreign keys
alter table public.pacts
  add column idea_id text check (idea_id is null or char_length(idea_id) between 1 and 60),
  add column idea_level text check (idea_level is null or idea_level in ('starting', 'regular', 'further'));

-- Same as the 18-argument create_pact(), plus the idea. The old one stays for the code that's live during the deploy.
create function public.create_pact(
  p_title text, p_emoji text, p_color text, p_cadence text, p_times_per_week int,
  p_duration_days int, p_start_date date, p_timezone text,
  p_measure text, p_direction text, p_unit text, p_target numeric,
  p_kind text, p_subject text, p_rest_days int, p_limit_step numeric, p_ask_next_morning boolean, p_craving_plan text,
  p_idea text, p_level text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  pid := public.create_pact(p_title, p_emoji, p_color, p_cadence, p_times_per_week, p_duration_days, p_start_date, p_timezone,
    p_measure, p_direction, p_unit, p_target, p_kind, p_subject, p_rest_days, p_limit_step, p_ask_next_morning, p_craving_plan);
  if nullif(trim(p_idea), '') is not null then
    update pacts set idea_id = trim(p_idea), idea_level = p_level where id = pid;
  end if;
  return pid;
end $$;
revoke execute on function public.create_pact(text, text, text, text, int, int, date, text, text, text, text, numeric, text, text, int, numeric, boolean, text, text, text) from public, anon;
grant execute on function public.create_pact(text, text, text, text, int, int, date, text, text, text, text, numeric, text, text, int, numeric, boolean, text, text, text) to authenticated;

-- ───────────────────────── same days, your own number ─────────────────────────
-- Build pacts only. Null: the pact's number. 0: any amount. The number is a promise, not a gate: any check-in counts
-- whatever it says, so nothing about streaks reads this.
alter table public.pact_members add column target numeric check (target is null or (target >= 0 and target <= 999999));

-- Yours to set until your own first check-in, like the pact's rules until anyone's.
create function public.set_my_number(p_pact uuid, p_target numeric) returns void
language plpgsql security definer set search_path = public as $$
declare p pacts;
begin
  -- the row lock the check-in guard takes, so a number and a first check-in can't cross
  select * into p from pacts where id = p_pact for update;
  if auth.uid() is null or p.id is null or not public.is_member(p_pact) then raise exception 'Pact not found'; end if;
  if p.kind <> 'build' or p.measure = 'none' then raise exception 'This pact has no number to set'; end if;
  if (now() at time zone p.timezone)::date > p.start_date + p.duration_days - 1 then raise exception 'This pact has already finished'; end if;
  if exists (select 1 from checkins where pact_id = p_pact and user_id = auth.uid())
     or exists (select 1 from day_changes where pact_id = p_pact and user_id = auth.uid()) then
    raise exception 'You''ve checked in, so your number stays for this round';
  end if;
  update pact_members set target = p_target where pact_id = p_pact and user_id = auth.uid() and left_on is null;
end $$;
revoke execute on function public.set_my_number(uuid, numeric) from public, anon;
grant execute on function public.set_my_number(uuid, numeric) to authenticated;

-- A number means nothing once something else is counted: back to the pact's.
create function public.pacts_reset_numbers() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update pact_members set target = null where pact_id = new.id and target is not null;
  return null;
end $$;
revoke execute on function public.pacts_reset_numbers() from public, anon, authenticated;
create trigger pacts_reset_numbers after update of measure, unit, direction on public.pacts
  for each row when (new.measure is distinct from old.measure or new.unit is distinct from old.unit or new.direction is distinct from old.direction)
  execute function public.pacts_reset_numbers();

-- ───────────────────────── rounds ─────────────────────────
-- Same as 20261114000000_break_a_habit.sql, plus: the idea and everyone's own number come along.
create or replace function public.start_next_round(p_prev uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p pacts; nid uuid; today date;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  -- lock the finished round so concurrent taps serialize on it
  select * into p from pacts where id = p_prev for update;
  if p.id is null or not public.is_member(p_prev) then raise exception 'Pact not found'; end if;
  select id into nid from pacts where previous_id = p_prev;
  if nid is not null then return nid; end if;
  today := (now() at time zone p.timezone)::date;
  if today <= p.start_date + p.duration_days - 1 then raise exception 'This pact is still going'; end if;

  insert into pacts (title, emoji, color, cadence, times_per_week, duration_days, start_date, timezone,
                     measure, direction, unit, target, freezes_allowed, created_by, previous_id, round,
                     kind, subject, rest_days, limit_step, ask_next_morning, craving_plan, idea_id, idea_level)
  values (p.title, p.emoji, p.color, p.cadence, p.times_per_week, p.duration_days, today, p.timezone,
          p.measure, p.direction, p.unit, p.target, p.freezes_allowed, auth.uid(), p.id, p.round + 1,
          p.kind, p.subject, p.rest_days, p.limit_step, p.ask_next_morning, p.craving_plan, p.idea_id, p.idea_level)
  returning id into nid;

  -- everyone still in the pact comes along; anyone can leave the new round from its menu
  insert into pact_members (pact_id, user_id, joined_on, target)
    select nid, user_id, today, target from pact_members
    where pact_id = p.id and left_on is null
    order by joined_at;
  return nid;
end $$;

-- "One level up": the next round with the idea's next level. update_pact() cleans up and checks the rules, so there's
-- one set of them. If someone already started the next round, that's the round, unchanged.
create function public.start_next_level(
  p_prev uuid, p_level text, p_title text, p_cadence text, p_times_per_week int, p_duration_days int,
  p_measure text, p_direction text, p_unit text, p_target numeric,
  p_rest_days int, p_limit_step numeric, p_ask_next_morning boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare p pacts; nid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into p from pacts where id = p_prev for update;
  if p.id is null or not public.is_member(p_prev) then raise exception 'Pact not found'; end if;
  select id into nid from pacts where previous_id = p_prev;
  if nid is not null then return nid; end if;
  if p.idea_id is null then raise exception 'This pact has no next level'; end if;
  nid := public.start_next_round(p_prev);
  perform public.update_pact(nid, p_cadence, p_times_per_week, p_duration_days, (select start_date from pacts where id = nid),
    p_measure, p_direction, p_unit, p_target, p_rest_days, p_limit_step, p_ask_next_morning);
  -- a new round isn't an edit: the push says what it is
  update pacts set idea_level = p_level, title = coalesce(nullif(trim(p_title), ''), title), edits = '[]'::jsonb where id = nid;
  -- anyone whose own number the new level has passed goes up with it; "any amount" goes too
  if p.kind = 'build' and p_target is not null then
    update pact_members m set target = null from pacts n
      where n.id = nid and m.pact_id = nid and m.target is not null
        and (m.target = 0 or (n.direction = 'up' and m.target < p_target) or (n.direction = 'down' and m.target > p_target));
  end if;
  return nid;
end $$;
revoke execute on function public.start_next_level(uuid, text, text, text, int, int, text, text, text, numeric, int, numeric, boolean) from public, anon;
grant execute on function public.start_next_level(uuid, text, text, text, int, int, text, text, text, numeric, int, numeric, boolean) to authenticated;

-- the invite page offers the idea's levels
create or replace function public.invite_preview(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'emoji', p.emoji, 'color', p.color,
    'cadence', p.cadence, 'times_per_week', p.times_per_week,
    'duration_days', p.duration_days, 'start_date', p.start_date,
    'timezone', p.timezone, 'measure', p.measure, 'direction', p.direction, 'unit', p.unit, 'target', p.target,
    'kind', p.kind, 'subject', p.subject, 'rest_days', p.rest_days, 'limit_step', p.limit_step, 'idea_id', p.idea_id,
    'ended', (now() at time zone p.timezone)::date > p.start_date + p.duration_days - 1,
    'members', coalesce((
      select json_agg(json_build_object('id', pr.id, 'name', pr.display_name) order by m.joined_at)
      from pact_members m join profiles pr on pr.id = m.user_id where m.pact_id = p.id and m.left_on is null
    ), '[]'::json)
  )
  from pacts p where p.invite_code = lower(trim(p_code));
$$;

-- ───────────────────────── suggested ideas ─────────────────────────
-- Written through suggest_idea() only, read with the service role (admin).
create table public.idea_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 3 and 140),
  created_at timestamptz not null default now()
);
create index idea_suggestions_user on public.idea_suggestions (user_id, created_at);
alter table public.idea_suggestions enable row level security;
revoke all on public.idea_suggestions from anon, authenticated;
grant select, insert, delete on public.idea_suggestions to service_role;

create function public.suggest_idea(p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := trim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if char_length(t) < 3 then raise exception 'Say a little more'; end if;
  if char_length(t) > 140 then raise exception 'Keep it under 140 characters'; end if;
  -- one at a time per person, so two taps can't slip past the limit
  perform pg_advisory_xact_lock(hashtext('suggest_idea:' || auth.uid()::text));
  if (select count(*) from idea_suggestions where user_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'That''s plenty for today. Thank you';
  end if;
  insert into idea_suggestions (user_id, text) values (auth.uid(), t);
end $$;
revoke execute on function public.suggest_idea(text) from public, anon;
grant execute on function public.suggest_idea(text) to authenticated;
