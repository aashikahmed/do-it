-- Make-up day: a missed day stays open until midnight the next day (pact timezone).
-- Logging yesterday was already allowed (checkins_guard). This adds:
--   checkins.made_up  "I'm doing it today to make up" as opposed to "I did it, I forgot to log"
--   misses            "I missed it": the link breaks now instead of at midnight, reminders stop
-- The rules live in lib/streak.ts ("late" periods); keep the two in sync.

alter table public.checkins add column made_up boolean not null default false;

-- same window as before, plus: only a check-in for yesterday can be a make-up
create or replace function public.checkins_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t date; s date; e date;
begin
  select (now() at time zone timezone)::date, start_date, start_date + duration_days - 1
    into t, s, e from pacts where id = new.pact_id;
  if new.day > t or new.day < t - 1 then
    raise exception 'You can only check in for today or yesterday';
  end if;
  if new.day < s or new.day > e then
    raise exception 'That day is outside this pact';
  end if;
  if new.made_up and new.day <> t - 1 then
    raise exception 'Only yesterday can be made up';
  end if;
  return new;
end $$;

-- ───────────────────────── misses ─────────────────────────
create table public.misses (
  pact_id uuid not null references public.pacts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (pact_id, user_id, day)
);

-- only about yesterday, and only inside the pact
create function public.misses_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare t date; s date; e date;
begin
  select (now() at time zone timezone)::date, start_date, start_date + duration_days - 1
    into t, s, e from pacts where id = new.pact_id;
  if new.day <> t - 1 or new.day < s or new.day > e then
    raise exception 'Only yesterday can be called a miss';
  end if;
  return new;
end $$;
create trigger misses_guard before insert on public.misses
  for each row execute function public.misses_guard();

alter table public.misses enable row level security;
create policy "misses: members read" on public.misses for select to authenticated
  using (public.is_member(pact_id));
create policy "misses: own insert" on public.misses for insert to authenticated
  with check (user_id = auth.uid() and public.is_member(pact_id));

grant select on public.misses to authenticated;
grant insert (pact_id, user_id, day) on public.misses to authenticated;
grant all on public.misses to service_role;

alter publication supabase_realtime add table public.misses;
