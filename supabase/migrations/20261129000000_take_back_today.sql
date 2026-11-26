-- Break pacts: take back today's "I gave in" (held from Activity). Today isn't over, so it goes back to unanswered,
-- like Undo on a yes: answer again from 6pm. Nothing to log in day_changes (only days that are over are changes).
-- The freeze it spent comes back once you're no longer the reason the day (or week) is lost, same rule as set_day().
create function public.take_back_miss(p_pact uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  p pacts; me uuid := auth.uid(); t date; len int; pstart date; refunded int := 0;
begin
  if me is null or not public.is_member(p_pact) then raise exception 'Pact not found'; end if;
  select * into p from pacts where id = p_pact for update;
  if p.kind is distinct from 'break' then raise exception 'Nothing to take back'; end if;
  t := (now() at time zone p.timezone)::date;

  delete from misses where pact_id = p_pact and user_id = me and day = t;
  if not found then raise exception 'Nothing to take back'; end if;

  len := public.period_len(p);
  pstart := p.start_date + ((t - p.start_date) / len) * len;
  if not exists (select 1 from public.period_culprits(p_pact, pstart) x(u) where x.u = me) then
    delete from freezes where pact_id = p_pact and period_start = pstart and covers = me;
    get diagnostics refunded = row_count;
  end if;

  return json_build_object('refunded', refunded > 0);
end $$;

revoke execute on function public.take_back_miss(uuid) from public, anon;
grant execute on function public.take_back_miss(uuid) to authenticated;
