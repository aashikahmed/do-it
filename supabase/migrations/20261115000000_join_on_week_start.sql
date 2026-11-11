-- Weekly pacts: joining on the first day of a week (including the pact's first day) counts you in that week,
-- the same as everyone else. Join any later and you still count from the next week, so joining never reopens a
-- week the group already closed. The one way a week can close on its first day (1× a week, everyone already in)
-- keeps the old rule. Daily pacts are unchanged: you count from tomorrow.
-- `create or replace` keeps the existing grants (authenticated only).
create or replace function public.join_pact(p_code text) returns uuid
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
  len := public.period_len(p);
  counts_from := case
    when today < p.start_date then today
    -- first day of a week that's still open: you're in it, like everyone else
    when len > 1 and (today - p.start_date) % len = 0 and not public.period_complete(p.id, today) then today
    -- otherwise you count from the next period
    else p.start_date + ((today - p.start_date) / len + 1) * len end;
  insert into pact_members (pact_id, user_id, joined_on) values (p.id, auth.uid(), counts_from);
  return p.id;
end $$;
