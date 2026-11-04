-- Google sign-in.

-- New accounts take their name from Google, so most people skip the "what should we call you" step.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), 40)
  )
  on conflict do nothing;
  return new;
end $$;

-- iOS Home Screen apps open Google sign-in in a separate browser sheet that can't see the app's
-- cookies. The callback parks the one-time auth code here under a hash of a nonce only the
-- originating app knows; the app collects it and finishes the exchange with its own PKCE verifier,
-- so a parked code is useless to anyone else. Service role only, single use, short-lived.
create table public.auth_handoffs (
  nonce_hash text primary key,
  code text not null,
  created_at timestamptz not null default now()
);
alter table public.auth_handoffs enable row level security;
grant all on public.auth_handoffs to service_role;
