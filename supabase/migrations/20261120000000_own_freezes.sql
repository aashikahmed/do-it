-- Everyone has their own freezes. pacts.freezes_allowed is now how many each person gets (same 1 per 10 days,
-- 1 per 4 weeks). A missed period is frozen by spending one freeze per person who missed it: theirs while they
-- have any, otherwise one given by whoever tapped "use a freeze". Nobody has one to give: the chain breaks.
-- Anyone in the pact can still tap it. Mirrors planFreezes() in lib/streak.ts; keep the two in sync.

-- One row per person covered, per period. Old rows (one per period, shared) keep covers null and are
-- charged to whoever used them.
alter table public.freezes drop constraint freezes_pkey;
alter table public.freezes
  add column id uuid not null default gen_random_uuid() primary key,
  -- whose miss this covers
  add column covers uuid references public.profiles(id) on delete cascade,
  -- whose freezes it came from (differs from covers when it was a gift)
  add column paid_by uuid references public.profiles(id) on delete set null;
update public.freezes set paid_by = used_by where paid_by is null;
create unique index freezes_period_covers_idx on public.freezes (pact_id, period_start, covers);

-- How many of their own freezes this person has left in this pact.
create function public.freezes_left(p_pact uuid, p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, p.freezes_allowed - (select count(*) from freezes f where f.pact_id = p_pact and f.paid_by = p_user))::int
  from pacts p where p.id = p_pact;
$$;

-- Whose miss a freeze has to cover in the period starting p_start: once it's over, everyone who counts and fell
-- short; while it's still running (a break pact lost early), whoever went over the days allowed.
create function public.period_culprits(p_pact uuid, p_start date) returns setof uuid
language plpgsql stable security definer set search_path = public as $$
declare p pacts; pend date; days int; need int; today date;
begin
  select * into p from pacts where id = p_pact;
  if public.is_rest_day(p, p_start) or public.period_complete(p_pact, p_start) then return; end if;
  today := (now() at time zone p.timezone)::date;
  pend := least(p_start + public.period_len(p) - 1, p.start_date + p.duration_days - 1);
  days := pend - p_start + 1;
  need := least(case when p.cadence = 'daily' then 1 else p.times_per_week end, days);
  if pend < today then
    return query
      select r.user_id from public.period_required(p_pact, p_start) r(user_id)
      where (select count(*) from checkins c where c.pact_id = p_pact and c.user_id = r.user_id
             and c.day between p_start and pend
             and (c.value is null or public.limit_on(p, c.day) is null or c.value <= public.limit_on(p, c.day))) < need
      order by 1;
  else
    return query
      select r.user_id from public.period_required(p_pact, p_start) r(user_id)
      where (select count(*) from misses x where x.pact_id = p_pact and x.user_id = r.user_id
             and x.day between p_start and pend) > days - need
      order by 1;
  end if;
end $$;

revoke execute on function public.freezes_left(uuid, uuid), public.period_culprits(uuid, date) from public, anon, authenticated;

-- All or nothing: freeze a set of missed periods. Same checks as before, then one freeze per person who missed,
-- from their own freezes or, when they're out, from the caller's.
create or replace function public.use_freezes(p_pact uuid, p_periods date[]) returns int
language plpgsql security definer set search_path = public as $$
declare p pacts; today date; d date; len int; c uuid; payer uuid; me uuid := auth.uid(); n int := 0; covered int;
begin
  if me is null or not public.is_member(p_pact) then raise exception 'Pact not found'; end if;
  select * into p from pacts where id = p_pact for update;
  today := (now() at time zone p.timezone)::date;
  len := public.period_len(p);
  if coalesce(array_length(p_periods, 1), 0) = 0 then raise exception 'There''s nothing to freeze right now'; end if;
  foreach d in array p_periods loop
    if d < p.start_date or (d - p.start_date) % len <> 0 then
      raise exception 'Only missed days can be frozen';
    end if;
    if least(d + len - 1, p.start_date + p.duration_days - 1) >= today and not public.period_broken(p_pact, d) then
      raise exception 'Only missed days can be frozen';
    end if;
    if public.period_complete(p_pact, d) then raise exception 'Only missed days can be frozen'; end if;
    covered := 0;
    for c in select * from public.period_culprits(p_pact, d) loop
      covered := covered + 1;
      if exists (select 1 from freezes where pact_id = p_pact and period_start = d and (covers = c or covers is null)) then
        continue;
      end if;
      if public.freezes_left(p_pact, c) > 0 then payer := c;
      elsif public.freezes_left(p_pact, me) > 0 then payer := me;
      else raise exception 'No freezes left';
      end if;
      insert into freezes (pact_id, period_start, covers, paid_by, used_by) values (p_pact, d, c, payer, me);
      n := n + 1;
    end loop;
    if covered = 0 then raise exception 'Only missed days can be frozen'; end if;
  end loop;
  return n;
end $$;
