-- "Ask a friend to choose": a link with a few ideas. Whoever opens it picks one and starts the pact, and the person who
-- asked is in it too. Additive: nothing that's live reads any of this.

create table public.idea_asks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- ids from the app's catalog (lib/explore/ideas.ts)
  idea_ids text[] not null check (cardinality(idea_ids) between 2 and 4),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references public.profiles (id) on delete set null,
  pact_id uuid references public.pacts (id) on delete set null
);
create index idea_asks_user on public.idea_asks (user_id, created_at);
-- only through the functions below
alter table public.idea_asks enable row level security;
revoke all on public.idea_asks from anon, authenticated;
grant select, delete on public.idea_asks to service_role;

create function public.create_ask(p_ideas text[]) returns text
language plpgsql security definer set search_path = public as $$
declare ids text[]; c text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  -- each once, in the order they were sent
  select array_agg(x order by o) into ids from (select x, min(o) as o from unnest(p_ideas) with ordinality as t(x, o) where char_length(x) between 1 and 60 group by x) s;
  if coalesce(cardinality(ids), 0) not between 2 and 4 then raise exception 'Pick two to four ideas'; end if;
  perform pg_advisory_xact_lock(hashtext('create_ask:' || auth.uid()::text));
  if (select count(*) from idea_asks where user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'That''s plenty of links for today';
  end if;
  insert into idea_asks (user_id, idea_ids) values (auth.uid(), ids) returning code into c;
  return c;
end $$;

-- What the link shows, signed in or not: a first name and the ideas. The pact only to someone who's in it.
create function public.ask_preview(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', split_part(trim(pr.display_name), ' ', 1),
    'ideas', a.idea_ids,
    'mine', a.user_id is not distinct from auth.uid(),
    'open', a.answered_at is null and a.created_at > now() - interval '30 days',
    'pact', case when a.pact_id is not null and auth.uid() is not null and public.is_member(a.pact_id) then a.pact_id end
  )
  from idea_asks a join profiles pr on pr.id = a.user_id
  where a.code = lower(trim(p_code));
$$;

-- The pact the chooser just made answers the ask, and the person who asked joins it. Returns who that is, or null when
-- someone had already answered (the pact stands on its own).
create function public.answer_ask(p_code text, p_pact uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a idea_asks; p pacts; today date;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into a from idea_asks where code = lower(trim(p_code)) for update;
  if a.id is null or a.answered_at is not null or a.created_at < now() - interval '30 days' or a.user_id = auth.uid() then return null; end if;
  select * into p from pacts where id = p_pact for update;
  -- only a pact they've just made themselves, from one of the ideas
  if p.id is null or p.created_by <> auth.uid() or p.idea_id is null or not (p.idea_id = any (a.idea_ids))
     or p.created_at < now() - interval '10 minutes' or p.previous_id is not null then
    return null;
  end if;
  today := (now() at time zone p.timezone)::date;
  -- in from the start, like the person who made it
  insert into pact_members (pact_id, user_id, joined_on) values (p.id, a.user_id, today) on conflict do nothing;
  update idea_asks set answered_at = now(), answered_by = auth.uid(), pact_id = p.id where id = a.id;
  return a.user_id;
end $$;

revoke execute on function public.create_ask(text[]), public.ask_preview(text), public.answer_ask(text, uuid) from public, anon;
grant execute on function public.create_ask(text[]), public.answer_ask(text, uuid) to authenticated;
grant execute on function public.ask_preview(text) to anon, authenticated;
