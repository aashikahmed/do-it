-- Rounds: "Go again" on a finished pact starts the next round with the same settings and the same people.
-- Each round is its own pact (own chain, own freezes); previous_id links them into a series so lifetime
-- totals can add up across rounds. A finished pact has at most one next round (unique), so two partners
-- tapping "Go again" at once land in the same round.

alter table public.pacts
  add column previous_id uuid unique references public.pacts(id) on delete set null,
  add column round int not null default 1 check (round between 1 and 1000);

create function public.start_next_round(p_prev uuid) returns uuid
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
                     measure, direction, unit, target, freezes_allowed, created_by, previous_id, round)
  values (p.title, p.emoji, p.color, p.cadence, p.times_per_week, p.duration_days, today, p.timezone,
          p.measure, p.direction, p.unit, p.target, p.freezes_allowed, auth.uid(), p.id, p.round + 1)
  returning id into nid;

  -- everyone still in the pact comes along; anyone can leave the new round from its menu
  insert into pact_members (pact_id, user_id, joined_on)
    select nid, user_id, today from pact_members
    where pact_id = p.id and left_on is null
    order by joined_at;
  return nid;
end $$;

revoke execute on function public.start_next_round(uuid) from anon;
