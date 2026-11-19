-- Fire: a triple-tap on someone else's check-in sends a 🔥 instead of a heart. Still one reaction per
-- person per check-in (the primary key), so fire replaces your heart. Existing rows and the current
-- app keep working: kind defaults to 'heart'.

alter table public.hearts add column kind text not null default 'heart' check (kind in ('heart', 'fire'));

-- upgrading a heart to fire is an update of kind, and only of your own reaction
create policy "hearts: change own" on public.hearts for update to authenticated
  using (from_user = auth.uid()) with check (from_user = auth.uid());
grant update (kind) on public.hearts to authenticated;
