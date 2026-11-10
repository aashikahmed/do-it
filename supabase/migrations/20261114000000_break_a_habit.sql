-- Break a habit: pacts about stopping or cutting down on something, next to the usual "build" pacts.
-- The three ways to break one reuse existing fields:
--   none at all        daily, measure none        a check-in means "I stayed off it"
--   some days a week   weekly, times_per_week     = 7 - the days allowed; each "I had some" uses one
--   a little each day  daily, measure count,      target is the daily limit, direction down
-- "I gave in" is a row in misses, and for break pacts it can be about today as well as yesterday.
-- The rules live in lib/streak.ts too ("broken" periods, limits, days off); keep the two in sync.

alter table public.pacts
  add column kind text not null default 'build' check (kind in ('build', 'break')),
  -- what's being given up, as typed ("soda"); used in sentences
  add column subject text check (subject is null or char_length(subject) between 1 and 40),
  -- days off, as a weekday bitmask (bit 0 = Sunday … bit 6 = Saturday); daily pacts only, never every day
  add column rest_days int not null default 0 check (rest_days between 0 and 126),
  -- "a little each day": lower the limit by this much each week
  add column limit_step numeric check (limit_step is null or limit_step > 0),
  -- for rules that run into the night: today can only be answered the next morning
  add column ask_next_morning boolean not null default false,
  add column craving_plan text check (craving_plan is null or char_length(craving_plan) <= 140),
  add constraint rest_days_daily check (rest_days = 0 or cadence = 'daily');

-- ───────────────────────── rules ─────────────────────────

create function public.is_rest_day(p pacts, d date) returns boolean
language sql immutable as $$
  select p.cadence = 'daily' and (p.rest_days & (1 << extract(dow from d)::int)) <> 0
$$;

-- the most allowed on day d for "a little each day", after weekly reductions; null when there's no limit
create function public.limit_on(p pacts, d date) returns numeric
language sql immutable as $$
  select case when p.kind = 'break' and p.target is not null
    then greatest(0, p.target - coalesce(p.limit_step, 0) * ((d - p.start_date) / 7))
  end
$$;

-- same as before, plus: days off always count, and check-ins over the limit don't
create or replace function public.period_complete(p_pact uuid, p_start date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p pacts; len int; pend date; need int; req int; ok int;
begin
  select * into p from pacts where id = p_pact;
  if public.is_rest_day(p, p_start) then return true; end if;
  len := public.period_len(p);
  pend := least(p_start + len - 1, p.start_date + p.duration_days - 1);
  need := least(case when p.cadence = 'daily' then 1 else p.times_per_week end, pend - p_start + 1);
  select count(*) into req from pact_members m
    where m.pact_id = p_pact and m.joined_on <= p_start and (m.left_on is null or p_start < m.left_on);
  select count(*) into ok from pact_members m
    where m.pact_id = p_pact and m.joined_on <= p_start and (m.left_on is null or p_start < m.left_on)
      and (select count(*) from checkins c where c.pact_id = p_pact and c.user_id = m.user_id
           and c.day between p_start and pend
           and (c.value is null or public.limit_on(p, c.day) is null or c.value <= public.limit_on(p, c.day))) >= need;
  return req > 0 and ok = req;
end $$;

-- Break pacts: did someone give in more often than the period allows? Then it's lost before it ends.
create function public.period_broken(p_pact uuid, p_start date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p pacts; pend date; days int; need int;
begin
  select * into p from pacts where id = p_pact;
  if p.kind <> 'break' or public.is_rest_day(p, p_start) then return false; end if;
  pend := least(p_start + public.period_len(p) - 1, p.start_date + p.duration_days - 1);
  days := pend - p_start + 1;
  need := least(case when p.cadence = 'daily' then 1 else p.times_per_week end, days);
  return exists (
    select 1 from pact_members m
    where m.pact_id = p_pact and m.joined_on <= p_start and (m.left_on is null or p_start < m.left_on)
      and (select count(*) from misses x where x.pact_id = p_pact and x.user_id = m.user_id
           and x.day between p_start and pend) > days - need
  );
end $$;

revoke execute on function public.is_rest_day(pacts, date), public.limit_on(pacts, date), public.period_broken(uuid, date)
  from public, anon, authenticated;

-- Break pacts: today opens at 6pm (or never, with ask_next_morning), and a day you gave in can't also be a yes.
create or replace function public.checkins_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pacts; t date;
begin
  select * into p from pacts where id = new.pact_id;
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

-- Break pacts can give in today as well as yesterday, and that replaces a "yes" for the same day.
create or replace function public.misses_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pacts; t date;
begin
  select * into p from pacts where id = new.pact_id;
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

-- Freezes: a break pact's period that's already lost (someone gave in) can be frozen right away.
create or replace function public.use_freezes(p_pact uuid, p_periods date[]) returns int
language plpgsql security definer set search_path = public as $$
declare p pacts; today date; used int; d date; len int;
begin
  if auth.uid() is null or not public.is_member(p_pact) then raise exception 'Pact not found'; end if;
  select * into p from pacts where id = p_pact for update;
  today := (now() at time zone p.timezone)::date;
  len := public.period_len(p);
  if coalesce(array_length(p_periods, 1), 0) = 0 then raise exception 'There''s nothing to freeze right now'; end if;
  select count(*) into used from freezes where pact_id = p_pact;
  if used + array_length(p_periods, 1) > p.freezes_allowed then raise exception 'No freezes left'; end if;
  foreach d in array p_periods loop
    if d < p.start_date or (d - p.start_date) % len <> 0 then
      raise exception 'Only missed days can be frozen';
    end if;
    if least(d + len - 1, p.start_date + p.duration_days - 1) >= today and not public.period_broken(p_pact, d) then
      raise exception 'Only missed days can be frozen';
    end if;
    if public.period_complete(p_pact, d) then raise exception 'Only missed days can be frozen'; end if;
    insert into freezes (pact_id, period_start, used_by) values (p_pact, d, auth.uid()) on conflict do nothing;
  end loop;
  return array_length(p_periods, 1);
end $$;

-- ───────────────────────── create ─────────────────────────

drop function public.create_pact(text, text, text, text, int, int, date, text, text, text, text, numeric);

create function public.create_pact(
  p_title text, p_emoji text, p_color text, p_cadence text, p_times_per_week int,
  p_duration_days int, p_start_date date, p_timezone text,
  p_measure text, p_direction text, p_unit text, p_target numeric,
  p_kind text, p_subject text, p_rest_days int, p_limit_step numeric, p_ask_next_morning boolean, p_craving_plan text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; today date; allowed int; m text; u text; k text; dir text; rest int; step numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  begin
    today := (now() at time zone p_timezone)::date;
  exception when others then
    raise exception 'Unknown timezone';
  end;
  if p_start_date < today or p_start_date > today + 14 then
    raise exception 'Start date must be within the next two weeks';
  end if;
  k := coalesce(p_kind, 'build');
  m := coalesce(p_measure, 'none');
  u := nullif(trim(p_unit), '');
  rest := 0;
  step := null;
  if k = 'break' then
    if nullif(trim(p_subject), '') is null then raise exception 'Say what you''re giving up'; end if;
    if m not in ('none', 'count') then raise exception 'Check the details'; end if;
    if p_cadence = 'weekly' and p_times_per_week not between 1 and 6 then raise exception 'Check the details'; end if;
    if m = 'count' and (p_cadence <> 'daily' or p_target is null) then raise exception 'Set a daily limit'; end if;
    dir := 'down';
    if p_cadence = 'daily' then rest := coalesce(p_rest_days, 0); end if;
    if rest < 0 or rest > 126 then raise exception 'Leave at least one day without a day off'; end if;
    if m = 'count' then step := p_limit_step; end if;
  else
    dir := case when m in ('time', 'weight') then coalesce(p_direction, 'up') else 'up' end;
  end if;
  if m = 'distance' and coalesce(u, '') not in ('km', 'mi', 'm') then u := 'km'; end if;
  if m = 'weight' and coalesce(u, '') not in ('kg', 'lb') then u := 'kg'; end if;
  if m = 'time' then u := null; end if;
  if m = 'count' and u is null then u := 'times'; end if;
  allowed := case when p_cadence = 'daily' then greatest(1, p_duration_days / 10)
                  else greatest(1, p_duration_days / 28) end;
  insert into pacts (title, emoji, color, cadence, times_per_week, duration_days, start_date,
                     timezone, measure, direction, unit, target, freezes_allowed, created_by,
                     kind, subject, rest_days, limit_step, ask_next_morning, craving_plan)
  values (trim(p_title), p_emoji, p_color, p_cadence,
          case when p_cadence = 'daily' then 7 else p_times_per_week end,
          p_duration_days, p_start_date, p_timezone,
          m, dir,
          case when m = 'none' then null else u end,
          case when m = 'none' then null else p_target end,
          allowed, auth.uid(),
          k,
          case when k = 'break' then trim(p_subject) end,
          rest, step,
          k = 'break' and coalesce(p_ask_next_morning, false),
          case when k = 'break' then nullif(trim(p_craving_plan), '') end)
  returning id into pid;
  insert into pact_members (pact_id, user_id, joined_on) values (pid, auth.uid(), today);
  return pid;
end $$;

grant execute on function public.create_pact(text, text, text, text, int, int, date, text, text, text, text, numeric, text, text, int, numeric, boolean, text)
  to authenticated;

-- Go again carries the new settings over.
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
                     kind, subject, rest_days, limit_step, ask_next_morning, craving_plan)
  values (p.title, p.emoji, p.color, p.cadence, p.times_per_week, p.duration_days, today, p.timezone,
          p.measure, p.direction, p.unit, p.target, p.freezes_allowed, auth.uid(), p.id, p.round + 1,
          p.kind, p.subject, p.rest_days, p.limit_step, p.ask_next_morning, p.craving_plan)
  returning id into nid;

  -- everyone still in the pact comes along; anyone can leave the new round from its menu
  insert into pact_members (pact_id, user_id, joined_on)
    select nid, user_id, today from pact_members
    where pact_id = p.id and left_on is null
    order by joined_at;
  return nid;
end $$;

-- the invite page says what kind of pact it is
create or replace function public.invite_preview(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'emoji', p.emoji, 'color', p.color,
    'cadence', p.cadence, 'times_per_week', p.times_per_week,
    'duration_days', p.duration_days, 'start_date', p.start_date,
    'timezone', p.timezone, 'measure', p.measure, 'direction', p.direction, 'unit', p.unit, 'target', p.target,
    'kind', p.kind, 'subject', p.subject, 'rest_days', p.rest_days, 'limit_step', p.limit_step,
    'ended', (now() at time zone p.timezone)::date > p.start_date + p.duration_days - 1,
    'members', coalesce((
      select json_agg(json_build_object('id', pr.id, 'name', pr.display_name) order by m.joined_at)
      from pact_members m join profiles pr on pr.id = m.user_id where m.pact_id = p.id and m.left_on is null
    ), '[]'::json)
  )
  from pacts p where p.invite_code = lower(trim(p_code));
$$;

-- the creator can edit their plan for cravings later
grant update (title, emoji, color, craving_plan) on public.pacts to authenticated;
