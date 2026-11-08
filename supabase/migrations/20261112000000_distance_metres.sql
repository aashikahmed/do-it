-- Distance can be logged in metres (a swim, a sprint, a track session) as well as km or miles.
-- Same function as 20261107000000_tracking.sql; only the allowed distance units change.

create or replace function public.create_pact(
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
  if m = 'distance' and coalesce(u, '') not in ('km', 'mi', 'm') then u := 'km'; end if;
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
