-- Misses pay for themselves, and quiet people are paused.
-- The rules are computed in lib/streak.ts from the check-in history (nothing is stored for a pause):
--   * a miss past the make-up window uses the missing person's own freeze, automatically
--   * out of freezes: they're paused at once and the period counts without them, while someone else kept it
--   * 3 quiet days in a row (1 silent week): paused from the next period; back with their next check-in
-- The hourly cron writes the automatic freezes down as rows (paid_by = covers, used_by null), so the freeze
-- counts here stay in step with the app.
--
-- SQL can't see pauses, so a manual freeze now names who it covers: the app sends one person per period,
-- from planFreezes(). Each one must have fallen short in that period. The old two-argument use_freezes()
-- stays for the code that's live while this deploys; a later migration drops it.

create function public.use_freezes(p_pact uuid, p_periods date[], p_covers uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare p pacts; today date; d date; len int; c uuid; payer uuid; me uuid := auth.uid(); n int := 0;
        i int; pend date; days int; need int; done int; slipped int;
begin
  if me is null or not public.is_member(p_pact) then raise exception 'Pact not found'; end if;
  if coalesce(array_length(p_periods, 1), 0) = 0 or coalesce(array_length(p_covers, 1), 0) <> array_length(p_periods, 1) then
    raise exception 'There''s nothing to freeze right now';
  end if;
  select * into p from pacts where id = p_pact for update;
  today := (now() at time zone p.timezone)::date;
  len := public.period_len(p);
  for i in 1 .. array_length(p_periods, 1) loop
    d := p_periods[i];
    c := p_covers[i];
    if d < p.start_date or (d - p.start_date) % len <> 0 or d > p.start_date + p.duration_days - 1 then
      raise exception 'Only missed days can be frozen';
    end if;
    if not exists (select 1 from pact_members where pact_id = p_pact and user_id = c and joined_on <= d and (left_on is null or d < left_on)) then
      raise exception 'Only missed days can be frozen';
    end if;
    pend := least(d + len - 1, p.start_date + p.duration_days - 1);
    days := pend - d + 1;
    need := least(case when p.cadence = 'daily' then 1 else p.times_per_week end, days);
    select count(*) into done from checkins x where x.pact_id = p_pact and x.user_id = c and x.day between d and pend
      and (x.value is null or public.limit_on(p, x.day) is null or x.value <= public.limit_on(p, x.day));
    select count(*) into slipped from misses x where x.pact_id = p_pact and x.user_id = c and x.day between d and pend;
    -- over: they fell short. still running: only a break pact they've already lost (gave in too often)
    if pend >= today and not (p.kind = 'break' and slipped > days - need) then
      raise exception 'Only missed days can be frozen';
    end if;
    if done >= need or public.is_rest_day(p, d) then raise exception 'Only missed days can be frozen'; end if;
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
  return n;
end $$;

grant execute on function public.use_freezes(uuid, date[], uuid[]) to authenticated;

-- A late "log yesterday" hands back the freeze that covered that person (not anyone else's).
-- Old shared rows (covers null) still go back only once the whole period is complete.
create or replace function public.refund_freeze() returns trigger
language plpgsql security definer set search_path = public as $$
declare p pacts; pstart date; pend date; need int; done int;
begin
  select * into p from pacts where id = new.pact_id;
  pstart := p.start_date + ((new.day - p.start_date) / public.period_len(p)) * public.period_len(p);
  pend := least(pstart + public.period_len(p) - 1, p.start_date + p.duration_days - 1);
  need := least(case when p.cadence = 'daily' then 1 else p.times_per_week end, pend - pstart + 1);
  select count(*) into done from checkins x where x.pact_id = new.pact_id and x.user_id = new.user_id and x.day between pstart and pend
    and (x.value is null or public.limit_on(p, x.day) is null or x.value <= public.limit_on(p, x.day));
  if done >= need then
    delete from freezes where pact_id = new.pact_id and period_start = pstart and covers = new.user_id;
  end if;
  if exists (select 1 from freezes where pact_id = new.pact_id and period_start = pstart and covers is null)
     and public.period_complete(new.pact_id, pstart) then
    delete from freezes where pact_id = new.pact_id and period_start = pstart and covers is null;
  end if;
  return null;
end $$;
