-- One row per run of the hourly reminder cron (app/api/cron/reminders), for the admin Health page:
-- when it last ran, how long it took, pushes sent by kind and how many failed. Written and read only
-- with the service role. The cron drops rows older than 90 days as it goes.

create table public.cron_runs (
  id bigint generated always as identity primary key,
  job text not null check (char_length(job) <= 40),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  -- pacts looked at
  checked int not null default 0,
  -- pushes delivered, by kind: {"evening": 3, "makeup": 1, ...}
  sent jsonb not null default '{}'::jsonb,
  -- pushes a push service rejected (dead subscriptions excluded: those are pruned)
  failed int not null default 0,
  error text check (error is null or char_length(error) <= 1000)
);
create index cron_runs_started_idx on public.cron_runs (job, started_at desc);

-- service role only: RLS on, no policies, no grants for API roles
alter table public.cron_runs enable row level security;
revoke all on public.cron_runs from anon, authenticated;
grant all on public.cron_runs to service_role;
