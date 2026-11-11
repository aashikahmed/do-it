-- Sign-in handoff: a parked code can only be collected after someone confirms in the browser that received it.
-- Without this, anyone could start a Google sign-in on their own device, send the link to someone else and
-- collect that person's code once they signed in. The callback now also sets a random secret in an httpOnly
-- cookie on the receiving browser and stores its hash here; tapping "Yes, that was me" there sets confirmed_at.
alter table public.auth_handoffs
  add column confirm_hash text,
  add column confirmed_at timestamptz;
