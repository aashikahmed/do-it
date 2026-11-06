-- Product signals, write-only from the app. First use: taps on someone else's avatar on a pact page,
-- to learn whether people want to see each other's profiles before building one.
-- Read them in the SQL editor (service role), e.g.
--   select count(*), count(distinct user_id) from ui_events where name = 'avatar_tap';

create table public.ui_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (name in ('avatar_tap')),
  pact_id uuid references public.pacts(id) on delete set null,
  target_user uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ui_events_name_idx on public.ui_events(name, created_at);

alter table public.ui_events enable row level security;
create policy "ui_events: log own" on public.ui_events for insert to authenticated
  with check (user_id = auth.uid());

-- clients can only add rows (no reading back), and only these columns
grant insert (name, pact_id, target_user) on public.ui_events to authenticated;
grant all on public.ui_events to service_role;
