-- Nobody counts toward the chain until their first check-in. Someone who joins a pact and never shows up
-- can't break it for the people who do. You count from the first period that starts on or after your
-- first check-in (and never before you joined), so a mid-week first check-in counts you from next week,
-- the same way joining does. Before anyone in the pact has checked in, the old rule applies: whoever
-- checked in during the period counts, otherwise everyone does.
-- Mirrors computePactState() in lib/streak.ts (countsFrom); keep the two in sync.

-- Who has to hit the target in the period starting p_start.
create function public.period_required(p_pact uuid, p_start date) returns setof uuid
language plpgsql stable security definer set search_path = public as $$
declare p pacts; len int; pend date;
begin
  select * into p from pacts where id = p_pact;
  len := public.period_len(p);
  pend := least(p_start + len - 1, p.start_date + p.duration_days - 1);
  return query
  with in_pact as (
    select m.user_id, m.joined_on from pact_members m
    where m.pact_id = p_pact and m.joined_on <= p_start and (m.left_on is null or p_start < m.left_on)
  ),
  -- check-ins that count: inside the pact, and not over a break pact's daily limit
  counting as (
    select c.user_id, c.day from checkins c
    where c.pact_id = p_pact and c.day between p.start_date and p.start_date + p.duration_days - 1
      and (c.value is null or public.limit_on(p, c.day) is null or c.value <= public.limit_on(p, c.day))
  ),
  firsts as (select user_id, min(day) as first_day from counting group by user_id),
  counted as (
    select i.user_id from in_pact i join firsts f on f.user_id = i.user_id
    where greatest(i.joined_on, p.start_date + ((f.first_day - p.start_date + len - 1) / len) * len) <= p_start
  ),
  showed_up as (
    select i.user_id from in_pact i
    where exists (select 1 from counting c where c.user_id = i.user_id and c.day between p_start and pend)
  )
  select user_id from counted
  union all
  select user_id from showed_up where not exists (select 1 from counted)
  union all
  select user_id from in_pact where not exists (select 1 from counted) and not exists (select 1 from showed_up);
end $$;

revoke execute on function public.period_required(uuid, date) from public, anon, authenticated;

-- same as before, but only the members period_required() names
create or replace function public.period_complete(p_pact uuid, p_start date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p pacts; len int; pend date; need int; req int; ok int;
begin
  select * into p from pacts where id = p_pact;
  if public.is_rest_day(p, p_start) then return true; end if;
  len := public.period_len(p);
  pend := least(p_start + len - 1, p.start_date + p.duration_days - 1);
  need := least(case when p.cadence = 'daily' then 1 else p.times_per_week end, pend - p_start + 1);
  select count(*) into req from public.period_required(p_pact, p_start);
  select count(*) into ok from public.period_required(p_pact, p_start) r(user_id)
    where (select count(*) from checkins c where c.pact_id = p_pact and c.user_id = r.user_id
           and c.day between p_start and pend
           and (c.value is null or public.limit_on(p, c.day) is null or c.value <= public.limit_on(p, c.day))) >= need;
  return req > 0 and ok = req;
end $$;

create or replace function public.period_broken(p_pact uuid, p_start date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p pacts; pend date; days int; need int;
begin
  select * into p from pacts where id = p_pact;
  if p.kind <> 'break' or public.is_rest_day(p, p_start) then return false; end if;
  pend := least(p_start + public.period_len(p) - 1, p.start_date + p.duration_days - 1);
  days := pend - p_start + 1;
  need := least(case when p.cadence = 'daily' then 1 else p.times_per_week end, days);
  return exists (
    select 1 from public.period_required(p_pact, p_start) r(user_id)
    where (select count(*) from misses x where x.pact_id = p_pact and x.user_id = r.user_id
           and x.day between p_start and pend) > days - need
  );
end $$;

-- Hand back freezes that were only spent because of someone who hadn't started: under the new rule those
-- periods are complete without them, so the freeze did nothing.
delete from public.freezes f where public.period_complete(f.pact_id, f.period_start);
