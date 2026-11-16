-- HomeManager reminders. Paste this whole file into the Supabase SQL editor and run it once,
-- after schema.sql. It is safe to run again.

-- One row per phone that has reminders switched on.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  member_id text not null,
  p256dh text not null,
  auth text not null,
  hour smallint not null check (hour between 0 and 23),
  tz text not null,
  last_sent date,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "phones manage their own reminders" on public.push_subscriptions;
create policy "phones manage their own reminders" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_household_member(household_id));

-- Signing keys for notifications. No policies, so only the reminders function can read them.
create table if not exists public.push_config (
  id boolean primary key default true check (id),
  public_key text not null,
  private_key text not null
);

alter table public.push_config enable row level security;

-- Run the reminders function at the top of every hour.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'homemanager-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://qaibkqourgtxedgmjzje.supabase.co/functions/v1/reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
