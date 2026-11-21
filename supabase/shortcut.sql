-- HomeManager Siri Shortcuts. Run once, after schema.sql. Safe to run again.
-- Each household gets a private token; the shortcut's link contains it and can add tasks.
alter table public.households
  add column if not exists shortcut_token text unique
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
