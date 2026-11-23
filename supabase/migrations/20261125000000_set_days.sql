-- Catch up on several days at once: the card that offers it after 3 or more of your days with nothing logged.
-- set_days() runs set_day() for each day in date order, in one transaction, so either every answer is saved or
-- none is. Each set_day() call checks its own rules (inside the round, not today, not a day off, the round still
-- open for changes), hands back the freezes its change made unnecessary, and records what the day said before.
-- No manual freezes: misses past the make-up window pay for themselves (see lib/streak.ts).
-- previewDays() in lib/activity.ts mirrors this; keep them in sync.
--
-- p_days: [{ "day": "2026-11-15", "did": true, "value": 50 }, ...], at most 31 entries, each day once.

create function public.set_days(p_pact uuid, p_days jsonb) returns int
language plpgsql set search_path = public as $$
declare e jsonb; n int := 0;
begin
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 then raise exception 'There''s nothing to save'; end if;
  if jsonb_array_length(p_days) > 31 then raise exception 'That''s too many days at once'; end if;
  if (select count(distinct x->>'day') from jsonb_array_elements(p_days) x) <> jsonb_array_length(p_days) then
    raise exception 'Check the details and try again';
  end if;
  for e in select x from jsonb_array_elements(p_days) x order by (x->>'day')::date loop
    perform public.set_day(p_pact, (e->>'day')::date, (e->>'did')::boolean, (e->>'value')::numeric, null, null, false);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.set_days(uuid, jsonb) from public, anon;
grant execute on function public.set_days(uuid, jsonb) to authenticated;
