-- Hearts: double-tap someone else's check-in to send them a heart. A quiet, undocumented gesture;
-- everyone in the pact sees who sent one. One per person per check-in, so un-hearting is a delete.
-- pact_id is stored (and checked against the check-in) so reads and realtime can filter by pact.

create table public.hearts (
  checkin_id uuid not null references public.checkins(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  pact_id uuid not null references public.pacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (checkin_id, from_user)
);
create index hearts_pact_idx on public.hearts (pact_id);

alter table public.hearts enable row level security;

create policy "hearts: members read" on public.hearts for select to authenticated
  using (public.is_member(pact_id));
-- only current members, only on someone else's check-in, and pact_id must be that check-in's pact
create policy "hearts: send" on public.hearts for insert to authenticated
  with check (
    from_user = auth.uid()
    and exists (select 1 from public.pact_members m where m.pact_id = hearts.pact_id and m.user_id = auth.uid() and m.left_on is null)
    and exists (select 1 from public.checkins c where c.id = hearts.checkin_id and c.pact_id = hearts.pact_id and c.user_id <> auth.uid())
  );
create policy "hearts: take back" on public.hearts for delete to authenticated
  using (from_user = auth.uid());

revoke all on public.hearts from anon, authenticated;
grant select, insert, delete on public.hearts to authenticated;
grant all on public.hearts to service_role;

alter publication supabase_realtime add table public.hearts;
