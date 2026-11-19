-- Change a day: hold one of your own rows in Activity and fix what it says, for any day of the round that's
-- over, until a week after the round ends. Trust-based, so the safeguard is that everyone can see it:
-- day_changes keeps what a day said before, and Activity marks it "changed".
--
-- set_day() is the only way to write a day older than yesterday. The check-in and miss guards keep their
-- today-or-yesterday window for every other write, and step aside only while set_day() is running.
-- A freeze can cover any missed day of the round: set_day() spends one of your own when you say you missed it.

-- ───────────────────────── change log ─────────────────────────
create table public.day_changes (
  id uuid primary key default gen_random_uuid(),
  pact_id uuid not null references public.pacts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  -- did = checked in (or stayed off it), missed = said they missed it (or gave in), none = nothing logged
  before text not null check (before in ('did', 'missed', 'none')),
  before_value numeric,
  after text not null check (after in ('did', 'missed')),
  after_value numeric,
  created_at timestamptz not null default now()
);
create index day_changes_pact_day_idx on public.day_changes (pact_id, day);

alter table public.day_changes enable row level security;
create policy "day_changes: members read" on public.day_changes for select to authenticated
  using (public.is_member(pact_id));
grant select on public.day_changes to authenticated;
grant all on public.day_changes to service_role;

-- ───────────────────────── guards ─────────────────────────
-- Same as 20261114000000_break_a_habit.sql, plus: set_day() checks its own rules.
create or replace function public.checkins_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pacts; t date;
begin
  if current_setting('doit.set_day', true) = 'on' then return new; end if;
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

create or replace function public.misses_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pacts; t date;
begin
  if current_setting('doit.set_day', true) = 'on' then return new; end if;
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

-- ───────────────────────── set_day ─────────────────────────
-- p_did: true = I did it (break pacts: I stayed off it), false = I missed it (break pacts: I gave in).
-- p_freeze: if the day ends up missed by you (a miss, or a number over a break pact's limit), cover it with one of
-- your own freezes. Only spent when that keeps the day: if someone else missed it too and isn't covered, a freeze
-- from you wouldn't save it.
-- Returns { frozen: whether a freeze was spent }.
create function public.set_day(
  p_pact uuid, p_day date, p_did boolean, p_value numeric, p_note text, p_feel smallint, p_freeze boolean
) returns json
language plpgsql security definer set search_path = public as $$
declare
  p pacts; me uuid := auth.uid(); t date; joined date; pend_all date; len int; pstart date;
  had checkins; had_miss boolean; before text; after text; frozen boolean := false;
begin
  if me is null or not public.is_member(p_pact) then raise exception 'Pact not found'; end if;
  select * into p from pacts where id = p_pact for update;
  t := (now() at time zone p.timezone)::date;
  pend_all := p.start_date + p.duration_days - 1;
  select joined_on into joined from pact_members where pact_id = p_pact and user_id = me;
  if p_day < greatest(p.start_date, joined) or p_day > pend_all then raise exception 'That day is outside this pact'; end if;
  if p_day >= t then raise exception 'You can change a day once it''s over'; end if;
  if t > pend_all + 7 then raise exception 'This round can''t be changed any more'; end if;
  if public.is_rest_day(p, p_day) then raise exception 'Days off always count'; end if;
  if p_value is not null and (p_value < 0 or p_value > 999999) then raise exception 'Check the number and try again'; end if;
  if p_feel is not null and p_feel not in (1, 2, 3) then raise exception 'Check the details and try again'; end if;

  select * into had from checkins where pact_id = p_pact and user_id = me and day = p_day;
  had_miss := exists (select 1 from misses where pact_id = p_pact and user_id = me and day = p_day);
  before := case when had.id is not null then 'did' when had_miss then 'missed' else 'none' end;
  after := case when p_did then 'did' else 'missed' end;

  perform set_config('doit.set_day', 'on', true);
  if p_did then
    delete from misses where pact_id = p_pact and user_id = me and day = p_day;
    if had.id is not null then
      update checkins set value = p_value, note = nullif(trim(p_note), ''), feel = p_feel where id = had.id;
    else
      insert into checkins (pact_id, user_id, day, value, note, feel, made_up)
      values (p_pact, me, p_day, p_value, nullif(trim(p_note), ''), p_feel, false);
    end if;
  else
    delete from checkins where pact_id = p_pact and user_id = me and day = p_day;
    insert into misses (pact_id, user_id, day) values (p_pact, me, p_day) on conflict do nothing;
  end if;
  perform set_config('doit.set_day', 'off', true);

  -- freezes for this period: hand back whatever the change made unnecessary
  len := public.period_len(p);
  pstart := p.start_date + ((p_day - p.start_date) / len) * len;
  if public.period_complete(p_pact, pstart) then
    delete from freezes where pact_id = p_pact and period_start = pstart;
  elsif not exists (select 1 from public.period_culprits(p_pact, pstart) x(u) where x.u = me) then
    delete from freezes where pact_id = p_pact and period_start = pstart and covers = me;
  end if;

  -- a miss you want covered: one of your own freezes, when nobody else is left uncovered
  if p_freeze
     and exists (select 1 from public.period_culprits(p_pact, pstart) x(u) where x.u = me)
     and not exists (select 1 from freezes where pact_id = p_pact and period_start = pstart and (covers = me or covers is null))
     and not exists (
       select 1 from public.period_culprits(p_pact, pstart) x(u)
       where x.u <> me
         and not exists (select 1 from freezes f where f.pact_id = p_pact and f.period_start = pstart and (f.covers = x.u or f.covers is null))
     ) then
    if public.freezes_left(p_pact, me) <= 0 then raise exception 'You have no freezes left'; end if;
    insert into freezes (pact_id, period_start, covers, paid_by, used_by) values (p_pact, pstart, me, me, me);
    frozen := true;
  end if;

  -- logging yesterday for the first time is the normal late check-in, not a change
  if (before <> after or (p_did and had.value is distinct from p_value)) and not (before = 'none' and p_day = t - 1) then
    insert into day_changes (pact_id, user_id, day, before, before_value, after, after_value)
    values (p_pact, me, p_day, before, had.value, after, case when p_did then p_value end);
  end if;

  return json_build_object('frozen', frozen);
end $$;

revoke execute on function public.set_day(uuid, date, boolean, numeric, text, smallint, boolean) from public, anon;
grant execute on function public.set_day(uuid, date, boolean, numeric, text, smallint, boolean) to authenticated;
