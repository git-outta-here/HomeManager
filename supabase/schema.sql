-- HomeManager sync schema. Paste this whole file into the Supabase SQL editor and run it once.
--
-- Each phone signs in anonymously, then creates a household or joins one with its invite code.
-- Row level security limits every phone to the households it has joined.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  join_code text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  primary key (household_id, user_id)
);

-- One row per member, chore, task, reward, redemption, plus one for household settings.
-- Deletions are kept as rows with deleted = true so every change reaches the other phone.
create table if not exists public.items (
  household_id uuid not null references public.households on delete cascade,
  id text not null,
  kind text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.items enable row level security;

create or replace function public.is_household_member(h uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members where household_id = h and user_id = auth.uid()
  )
$$;

drop policy if exists "members read their household" on public.households;
create policy "members read their household" on public.households
  for select to authenticated using (public.is_household_member(id));

drop policy if exists "users read their memberships" on public.household_members;
create policy "users read their memberships" on public.household_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "members read and write items" on public.items;
create policy "members read and write items" on public.items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Creates a household, makes the caller its first member, returns its id and invite code.
create or replace function public.create_household()
returns json
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
  code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into households (join_code) values (code) returning id into h;
  insert into household_members (household_id, user_id) values (h, auth.uid());
  return json_build_object('id', h, 'join_code', code);
end
$$;

-- Adds the caller to the household with this invite code and returns its id.
create or replace function public.join_household(code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  h uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into h from households where join_code = upper(trim(code));
  if h is null then raise exception 'No household has that code'; end if;
  insert into household_members (household_id, user_id) values (h, auth.uid())
    on conflict do nothing;
  return h;
end
$$;

revoke all on function public.create_household() from public, anon;
revoke all on function public.join_household(text) from public, anon;
grant execute on function public.create_household() to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- Push changes to the other phone as they happen.
do $$
begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end
$$;
