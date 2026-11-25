-- Edit a pact. The name, icon and colour (and what a break pact gives up) can change any time, through the creator's
-- column grants. Everything that decides what counts can only change until anyone logs anything: nobody counts until
-- their first check-in, so up to then there's no history to rewrite. update_pact() is the only way to write those.
-- Never editable: build or break, the timezone, the invite link.

-- What the rules were before each change, so members see what changed since they joined:
-- [{ "at": timestamptz, "was": { the rule columns } }]. Not in anyone's UPDATE grant.
alter table public.pacts add column edits jsonb not null default '[]'::jsonb;

-- the creator can rename what a break pact gives up
grant update (title, emoji, color, craving_plan, subject) on public.pacts to authenticated;

-- partners with the pact open see the change straight away
alter publication supabase_realtime add table public.pacts;

-- ───────────────────────── guards ─────────────────────────
-- Same as 20261123000000_change_a_day.sql, plus: hold the pact row, so a check-in and an edit can't cross. Whichever
-- comes second waits for the first. "for key share" doesn't make check-ins wait for each other.
create or replace function public.checkins_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pacts; t date;
begin
  if current_setting('doit.set_day', true) = 'on' then return new; end if;
  select * into p from pacts where id = new.pact_id for key share;
  t := (now() at time zone p.timezone)::date;
  if new.day > t or new.day < t - 1 then
    raise exception 'You can only check in for today or yesterday';
  end if;
  if new.day < p.start_date or new.day > p.start_date + p.duration_days - 1 then
    raise exception 'That day is outside this pact';
  end if;
  if new.made_up and new.day <> t - 1 then
    raise exception 'Only yesterday can be made up';
  end if;
  if p.kind = 'break' then
    new.made_up := false;
    if exists (select 1 from misses where pact_id = new.pact_id and user_id = new.user_id and day = new.day) then
      raise exception 'You said you gave in that day';
    end if;
    if new.day = t and p.ask_next_morning then
      raise exception 'This pact asks about each day the next morning';
    end if;
    if new.day = t and extract(hour from now() at time zone p.timezone) < 18 then
      raise exception 'You can answer for today from 6pm';
    end if;
  end if;
  return new;
end $$;

create or replace function public.misses_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pacts; t date;
begin
  if current_setting('doit.set_day', true) = 'on' then return new; end if;
  select * into p from pacts where id = new.pact_id for key share;
  t := (now() at time zone p.timezone)::date;
  if new.day < p.start_date or new.day > p.start_date + p.duration_days - 1 then
    raise exception 'That day is outside this pact';
  end if;
  if p.kind = 'break' then
    if new.day <> t and new.day <> t - 1 then raise exception 'You can only say so about today or yesterday'; end if;
    delete from checkins where pact_id = new.pact_id and user_id = new.user_id and day = new.day;
  elsif new.day <> t - 1 then
    raise exception 'Only yesterday can be called a miss';
  end if;
  return new;
end $$;

-- ───────────────────────── update_pact ─────────────────────────
-- Change the rules of a pact nobody has logged anything in. Returns 'changed', 'same' (nothing to do), or 'locked'
-- (someone has logged something, so nothing was written). The settings are cleaned up the same way create_pact() does;
-- keep the two in sync. The start can stay where it is or move to today or later, never into the past.
create function public.update_pact(
  p_pact uuid, p_cadence text, p_times_per_week int, p_duration_days int, p_start_date date,
  p_measure text, p_direction text, p_unit text, p_target numeric,
  p_rest_days int, p_limit_step numeric, p_ask_next_morning boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  p pacts; n pacts; me uuid := auth.uid(); today date; was jsonb; last_at timestamptz;
begin
  select * into p from pacts where id = p_pact for update;
  if me is null or p.id is null or p.created_by <> me then raise exception 'Pact not found'; end if;
  today := (now() at time zone p.timezone)::date;
  if today > p.start_date + p.duration_days - 1 then raise exception 'This pact has already finished'; end if;

  n := p;
  if p_cadence is null or p_cadence not in ('daily', 'weekly') then raise exception 'Check the details'; end if;
  n.cadence := p_cadence;
  n.times_per_week := case when p_cadence = 'daily' then 7 else p_times_per_week end;
  n.duration_days := p_duration_days;
  n.start_date := p_start_date;
  n.measure := coalesce(p_measure, 'none');
  n.unit := nullif(trim(p_unit), '');
  n.rest_days := 0;
  n.limit_step := null;
  n.ask_next_morning := false;
  if p.kind = 'break' then
    if n.measure not in ('none', 'count') then raise exception 'Check the details'; end if;
    if n.cadence = 'weekly' and n.times_per_week not between 1 and 6 then raise exception 'Check the details'; end if;
    if n.measure = 'count' and (n.cadence <> 'daily' or p_target is null) then raise exception 'Set a daily limit'; end if;
    n.direction := 'down';
    if n.cadence = 'daily' then n.rest_days := coalesce(p_rest_days, 0); end if;
    if n.rest_days < 0 or n.rest_days > 126 then raise exception 'Leave at least one day without a day off'; end if;
    if n.measure = 'count' then n.limit_step := p_limit_step; end if;
    n.ask_next_morning := coalesce(p_ask_next_morning, false);
  else
    n.direction := case when n.measure in ('time', 'weight') then coalesce(p_direction, 'up') else 'up' end;
  end if;
  if n.measure = 'distance' and coalesce(n.unit, '') not in ('km', 'mi', 'm') then n.unit := 'km'; end if;
  if n.measure = 'weight' and coalesce(n.unit, '') not in ('kg', 'lb') then n.unit := 'kg'; end if;
  if n.measure = 'count' and n.unit is null then n.unit := 'times'; end if;
  if n.measure in ('none', 'time') then n.unit := null; end if;
  n.target := case when n.measure = 'none' then null else p_target end;

  if n = p then return 'same'; end if;

  if exists (select 1 from checkins where pact_id = p_pact)
     or exists (select 1 from misses where pact_id = p_pact)
     or exists (select 1 from day_changes where pact_id = p_pact) then
    return 'locked';
  end if;
  if n.start_date is null or (n.start_date <> p.start_date and (n.start_date < today or n.start_date > today + 14)) then
    raise exception 'Start date must be within the next two weeks';
  end if;
  if n.start_date + n.duration_days - 1 < today then raise exception 'That would already be over'; end if;

  -- what the rules were, for anyone who joined under them. One entry per join is enough: an earlier one already
  -- holds what everyone else agreed to.
  last_at := coalesce((p.edits -> -1 ->> 'at')::timestamptz, '-infinity');
  if exists (select 1 from pact_members where pact_id = p_pact and user_id <> me and left_on is null and joined_at > last_at) then
    was := jsonb_build_object(
      'cadence', p.cadence, 'times_per_week', p.times_per_week, 'duration_days', p.duration_days, 'start_date', p.start_date,
      'measure', p.measure, 'direction', p.direction, 'unit', p.unit, 'target', p.target,
      'rest_days', p.rest_days, 'limit_step', p.limit_step, 'ask_next_morning', p.ask_next_morning);
    n.edits := p.edits || jsonb_build_array(jsonb_build_object('at', now(), 'was', was));
  end if;

  update pacts set
    cadence = n.cadence, times_per_week = n.times_per_week, duration_days = n.duration_days, start_date = n.start_date,
    measure = n.measure, direction = n.direction, unit = n.unit, target = n.target,
    rest_days = n.rest_days, limit_step = n.limit_step, ask_next_morning = n.ask_next_morning,
    edits = n.edits,
    freezes_allowed = case when n.cadence = 'daily' then greatest(1, n.duration_days / 10) else greatest(1, n.duration_days / 28) end
  where id = p_pact;

  -- nobody logged anything, so every freeze spent so far covered an empty day: hand them back. Any day that's still
  -- in the past after this is worked out again from the new rules.
  delete from freezes where pact_id = p_pact;

  -- whoever joined once it was running counts from a day worked out from the old start: work it out again, the way
  -- join_pact() would. Everyone else was in from the start and stays in from the start.
  if n.start_date <> p.start_date or n.cadence <> p.cadence then
    update pact_members m set joined_on = case
      when j.day <= n.start_date then j.day
      when n.cadence = 'weekly' and (j.day - n.start_date) % 7 = 0 then j.day
      when n.cadence = 'weekly' then n.start_date + ((j.day - n.start_date) / 7 + 1) * 7
      else j.day + 1 end
    from (select user_id, (joined_at at time zone p.timezone)::date as day from pact_members where pact_id = p_pact) j
    where m.pact_id = p_pact and m.user_id = j.user_id and m.joined_on > p.start_date;
  end if;
  return 'changed';
end $$;

revoke execute on function public.update_pact(uuid, text, int, int, date, text, text, text, numeric, int, numeric, boolean) from public, anon;
grant execute on function public.update_pact(uuid, text, int, int, date, text, text, text, numeric, int, numeric, boolean) to authenticated;
