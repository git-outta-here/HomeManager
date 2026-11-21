-- HomeManager calendar feed. Run once, after schema.sql. Safe to run again.
-- Each household gets a private token; the calendar link contains it.
alter table public.households
  add column if not exists calendar_token text unique
  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
