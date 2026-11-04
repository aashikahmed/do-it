-- Progress tracking: one optional typed measure per pact, plus a one-tap "how did it go" per check-in.
--   measure    none | count | time | distance | weight
--   direction  up (more/longer/heavier is better) | down (faster/lighter is better)
--   unit       count: free text ("push-ups"); distance: km | mi; weight: kg | lb; time: unused (values are seconds)
--   target     the minimum promise per check-in, in the measure's unit (seconds for time). For direction=down it's a ceiling.

alter table public.pacts
  add column measure text not null default 'none' check (measure in ('none', 'count', 'time', 'distance', 'weight')),
  add column direction text not null default 'up' check (direction in ('up', 'down'));

-- existing pacts that tracked a number were counts
update public.pacts set measure = 'count' where unit is not null and measure = 'none';

alter table public.checkins
  add column feel smallint check (feel between 1 and 3);

grant update (value, note, feel) on public.checkins to authenticated;

drop function if exists public.create_pact(text, text, text, text, int, int, date, text, text, numeric);

create function public.create_pact(
  p_title text, p_emoji text, p_color text, p_cadence text, p_times_per_week int,
  p_duration_days int, p_start_date date, p_timezone text,
  p_measure text, p_direction text, p_unit text, p_target numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid; today date; allowed int; m text; u text;
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
  m := coalesce(p_measure, 'none');
  u := nullif(trim(p_unit), '');
  if m = 'distance' and coalesce(u, '') not in ('km', 'mi') then u := 'km'; end if;
  if m = 'weight' and coalesce(u, '') not in ('kg', 'lb') then u := 'kg'; end if;
  if m = 'time' then u := null; end if;
  if m = 'count' and u is null then u := 'times'; end if;
  allowed := case when p_cadence = 'daily' then greatest(1, p_duration_days / 10)
                  else greatest(1, p_duration_days / 28) end;
  insert into pacts (title, emoji, color, cadence, times_per_week, duration_days, start_date,
                     timezone, measure, direction, unit, target, freezes_allowed, created_by)
  values (trim(p_title), p_emoji, p_color, p_cadence,
          case when p_cadence = 'daily' then 7 else p_times_per_week end,
          p_duration_days, p_start_date, p_timezone,
          m, case when m in ('time', 'weight') then coalesce(p_direction, 'up') else 'up' end,
          case when m = 'none' then null else u end,
          case when m = 'none' then null else p_target end,
          allowed, auth.uid())
  returning id into pid;
  insert into pact_members (pact_id, user_id, joined_on) values (pid, auth.uid(), today);
  return pid;
end $$;

revoke execute on function public.create_pact(text,text,text,text,int,int,date,text,text,text,text,numeric) from anon;

-- the invite preview shows what's tracked
create or replace function public.invite_preview(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'emoji', p.emoji, 'color', p.color,
    'cadence', p.cadence, 'times_per_week', p.times_per_week,
    'duration_days', p.duration_days, 'start_date', p.start_date,
    'timezone', p.timezone, 'measure', p.measure, 'direction', p.direction, 'unit', p.unit, 'target', p.target,
    'ended', (now() at time zone p.timezone)::date > p.start_date + p.duration_days - 1,
    'members', coalesce((
      select json_agg(json_build_object('id', pr.id, 'name', pr.display_name) order by m.joined_at)
      from pact_members m join profiles pr on pr.id = m.user_id where m.pact_id = p.id and m.left_on is null
    ), '[]'::json)
  )
  from pacts p where p.invite_code = lower(trim(p_code));
$$;
