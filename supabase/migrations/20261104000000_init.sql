-- Do it. — shared-streak pacts
-- Days are always evaluated in the pact's timezone so every member shares one calendar.

create extension if not exists pgcrypto;

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── pacts ─────────────────────────
create table public.pacts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  emoji text not null default '🔥' check (char_length(emoji) <= 16),
  color text not null default 'blue' check (color in ('blue','sun','ember','mint','violet','rose')),
  cadence text not null check (cadence in ('daily','weekly')),
  times_per_week int not null default 7 check (times_per_week between 1 and 7),
  duration_days int not null check (duration_days between 7 and 365),
  start_date date not null,
  timezone text not null default 'UTC',
  unit text check (unit is null or char_length(unit) <= 24),
  target numeric check (target is null or target > 0),
  freezes_allowed int not null default 1 check (freezes_allowed between 0 and 20),
  invite_code text not null unique default lower(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint daily_is_seven check (cadence = 'weekly' or times_per_week = 7)
);

create table public.pact_members (
  pact_id uuid not null references public.pacts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- first period this member counts toward
  joined_on date not null,
  joined_at timestamptz not null default now(),
  -- set when they leave; they stop counting from this day, past periods are untouched
  left_on date,
  primary key (pact_id, user_id)
);
create index pact_members_user_idx on public.pact_members(user_id);

-- Membership check that bypasses RLS (avoids policy recursion).
create function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pact_members where pact_id = p and user_id = auth.uid() and left_on is null);
$$;

create function public.shares_pact(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pact_members a join pact_members b on a.pact_id = b.pact_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create function public.pact_today(p uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone timezone)::date from pacts where id = p;
$$;

create function public.period_len(p pacts) returns int
language sql immutable as $$ select case when p.cadence = 'daily' then 1 else 7 end $$;

-- Did every member required in the period starting p_start hit the target?
create function public.period_complete(p_pact uuid, p_start date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p pacts; len int; pend date; need int; req int; ok int;
begin
  select * into p from pacts where id = p_pact;
  len := public.period_len(p);
  pend := least(p_start + len - 1, p.start_date + p.duration_days - 1);
  need := least(case when p.cadence = 'daily' then 1 else p.times_per_week end, pend - p_start + 1);
  select count(*) into req from pact_members m
    where m.pact_id = p_pact and m.joined_on <= p_start and (m.left_on is null or p_start < m.left_on);
  select count(*) into ok from pact_members m
    where m.pact_id = p_pact and m.joined_on <= p_start and (m.left_on is null or p_start < m.left_on)
      and (select count(*) from checkins c where c.pact_id = p_pact and c.user_id = m.user_id
           and c.day between p_start and pend) >= need;
  return req > 0 and ok = req;
end $$;

-- ───────────────────────── check-ins ─────────────────────────
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  pact_id uuid not null references public.pacts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  value numeric check (value is null or (value >= 0 and value < 1000000)),
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  unique (pact_id, user_id, day)
);
create index checkins_pact_day_idx on public.checkins(pact_id, day);

-- Only today or yesterday (grace), and only inside the pact window.
create function public.checkins_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t date; s date; e date;
begin
  select (now() at time zone timezone)::date, start_date, start_date + duration_days - 1
    into t, s, e from pacts where id = new.pact_id;
  if new.day > t or new.day < t - 1 then
    raise exception 'You can only check in for today or yesterday';
  end if;
  if new.day < s or new.day > e then
    raise exception 'That day is outside this pact';
  end if;
  return new;
end $$;
create trigger checkins_guard before insert or update on public.checkins
  for each row execute function public.checkins_guard();

-- ───────────────────────── freezes ─────────────────────────
create table public.freezes (
  pact_id uuid not null references public.pacts(id) on delete cascade,
  period_start date not null,
  used_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (pact_id, period_start)
);

-- All-or-nothing: freeze a set of missed periods. Validates each one really started a period,
-- has ended, and was missed. Called by the app; there is no direct insert access.
create function public.use_freezes(p_pact uuid, p_periods date[]) returns int
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
    if d < p.start_date or (d - p.start_date) % len <> 0
       or least(d + len - 1, p.start_date + p.duration_days - 1) >= today then
      raise exception 'Only missed days can be frozen';
    end if;
    if public.period_complete(p_pact, d) then raise exception 'Only missed days can be frozen'; end if;
    insert into freezes (pact_id, period_start, used_by) values (p_pact, d, auth.uid()) on conflict do nothing;
  end loop;
  return array_length(p_periods, 1);
end $$;

-- A late "log yesterday" can complete a period someone already froze: hand the freeze back.
create function public.refund_freeze() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pacts; pstart date;
begin
  select * into p from pacts where id = new.pact_id;
  pstart := p.start_date + ((new.day - p.start_date) / public.period_len(p)) * public.period_len(p);
  if exists (select 1 from freezes where pact_id = new.pact_id and period_start = pstart)
     and public.period_complete(new.pact_id, pstart) then
    delete from freezes where pact_id = new.pact_id and period_start = pstart;
  end if;
  return null;
end $$;
create trigger checkins_refund_freeze after insert on public.checkins
  for each row execute function public.refund_freeze();

-- ───────────────────────── nudges ─────────────────────────
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  pact_id uuid not null references public.pacts(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (pact_id, from_user, to_user, day),
  check (from_user <> to_user)
);

-- ───────────────────────── push ─────────────────────────
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table public.checkin_notify_log (
  pact_id uuid not null references public.pacts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null,
  primary key (pact_id, user_id, day, kind)
);

create table public.reminder_log (
  pact_id uuid not null references public.pacts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  primary key (pact_id, user_id, day)
);

-- ───────────────────────── RPCs ─────────────────────────
-- Create a pact and add the creator as first member, atomically.
create function public.create_pact(
  p_title text, p_emoji text, p_color text, p_cadence text, p_times_per_week int,
  p_duration_days int, p_start_date date, p_timezone text, p_unit text, p_target numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; today date; allowed int;
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
  allowed := case when p_cadence = 'daily' then greatest(1, p_duration_days / 10)
                  else greatest(1, p_duration_days / 28) end;
  insert into pacts (title, emoji, color, cadence, times_per_week, duration_days, start_date,
                     timezone, unit, target, freezes_allowed, created_by)
  values (trim(p_title), p_emoji, p_color, p_cadence,
          case when p_cadence = 'daily' then 7 else p_times_per_week end,
          p_duration_days, p_start_date, p_timezone, nullif(trim(p_unit), ''), p_target, allowed, auth.uid())
  returning id into pid;
  insert into pact_members (pact_id, user_id, joined_on) values (pid, auth.uid(), today);
  return pid;
end $$;

-- Public preview of an invite (works signed out).
create function public.invite_preview(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'emoji', p.emoji, 'color', p.color,
    'cadence', p.cadence, 'times_per_week', p.times_per_week,
    'duration_days', p.duration_days, 'start_date', p.start_date,
    'timezone', p.timezone, 'unit', p.unit, 'target', p.target,
    'ended', (now() at time zone p.timezone)::date > p.start_date + p.duration_days - 1,
    'members', coalesce((
      select json_agg(json_build_object('id', pr.id, 'name', pr.display_name) order by m.joined_at)
      from pact_members m join profiles pr on pr.id = m.user_id where m.pact_id = p.id and m.left_on is null
    ), '[]'::json)
  )
  from pacts p where p.invite_code = lower(trim(p_code));
$$;

create function public.join_pact(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare p pacts; n int; today date; counts_from date; len int; m pact_members;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into p from pacts where invite_code = lower(trim(p_code)) for update;
  if p.id is null then raise exception 'This invite link is not valid'; end if;
  select * into m from pact_members where pact_id = p.id and user_id = auth.uid();
  if m.user_id is not null then
    if m.left_on is not null then raise exception 'You left this pact, so you can''t rejoin it'; end if;
    return p.id;
  end if;
  today := (now() at time zone p.timezone)::date;
  if today > p.start_date + p.duration_days - 1 then raise exception 'This pact has already finished'; end if;
  select count(*) into n from pact_members where pact_id = p.id and left_on is null;
  if n >= 10 then raise exception 'This pact is full (10 people max)'; end if;
  -- joining mid-way never reopens a period the group already closed: you count from the next one
  len := public.period_len(p);
  counts_from := case when today < p.start_date then today
                      else p.start_date + ((today - p.start_date) / len + 1) * len end;
  insert into pact_members (pact_id, user_id, joined_on) values (p.id, auth.uid(), counts_from);
  return p.id;
end $$;

create function public.leave_pact(p_pact uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p pacts;
begin
  select * into p from pacts where id = p_pact;
  if p.id is null or not public.is_member(p_pact) then raise exception 'Pact not found'; end if;
  update pact_members set left_on = (now() at time zone p.timezone)::date
    where pact_id = p_pact and user_id = auth.uid();
end $$;

grant execute on function public.invite_preview(text) to anon, authenticated;
revoke execute on function public.create_pact(text,text,text,text,int,int,date,text,text,numeric) from anon;
revoke execute on function public.join_pact(text) from anon;

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.pacts enable row level security;
alter table public.pact_members enable row level security;
alter table public.checkins enable row level security;
alter table public.freezes enable row level security;
alter table public.nudges enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security;

create policy "profiles: read self and pact-mates" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_pact(id));
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "pacts: members read" on public.pacts for select to authenticated
  using (public.is_member(id));
create policy "pacts: creator updates" on public.pacts for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "pacts: creator deletes" on public.pacts for delete to authenticated
  using (created_by = auth.uid());

create policy "members: members read" on public.pact_members for select to authenticated
  using (public.is_member(pact_id));

create policy "checkins: members read" on public.checkins for select to authenticated
  using (public.is_member(pact_id));
create policy "checkins: own insert" on public.checkins for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(pact_id));
create policy "checkins: own update" on public.checkins for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(pact_id));
create policy "checkins: own delete" on public.checkins for delete to authenticated
  using (user_id = auth.uid());

create policy "freezes: members read" on public.freezes for select to authenticated
  using (public.is_member(pact_id));

create policy "nudges: members read" on public.nudges for select to authenticated
  using (public.is_member(pact_id));
create policy "nudges: send" on public.nudges for insert to authenticated
  with check (from_user = auth.uid() and public.is_member(pact_id)
    and exists (select 1 from public.pact_members m where m.pact_id = nudges.pact_id and m.user_id = nudges.to_user and m.left_on is null));

create policy "push: own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- reminder_log: service role only (no policies).

-- ───────────────────────── realtime ─────────────────────────
alter publication supabase_realtime add table public.checkins, public.pact_members, public.freezes, public.nudges;

-- ───────────────────────── grants ─────────────────────────
-- New Supabase projects don't auto-grant table access to API roles; grant only what each table needs.
-- Column-level UPDATE grants stop clients from editing fields like freezes_allowed or check-in days.
grant select on public.profiles to authenticated;
grant update (display_name, timezone) on public.profiles to authenticated;
grant select, delete on public.pacts to authenticated;
grant update (title, emoji, color) on public.pacts to authenticated;
grant select on public.pact_members to authenticated;
grant select, insert, delete on public.checkins to authenticated;
grant update (value, note) on public.checkins to authenticated;
grant select on public.freezes to authenticated;
grant select, insert on public.nudges to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on all tables in schema public to service_role;
