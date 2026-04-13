-- Social Amp schema
-- Run this once in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

create table products (
  id         text primary key,
  created_at timestamptz default now(),
  data       jsonb not null
);

create table accounts (
  id         text primary key,
  created_at timestamptz default now(),
  data       jsonb not null
);

create table calendar_posts (
  id         text primary key,
  month_key  text not null,
  created_at timestamptz default now(),
  data       jsonb not null
);
create index on calendar_posts (month_key);

create table trend_snapshots (
  id         text primary key,
  created_at timestamptz default now(),
  data       jsonb not null
);

create table platform_configs (
  platform text primary key,
  data     jsonb not null
);

-- RLS: allow full access via anon key (app-level auth handled by Vercel middleware)
alter table products        enable row level security;
alter table accounts        enable row level security;
alter table calendar_posts  enable row level security;
alter table trend_snapshots enable row level security;
alter table platform_configs enable row level security;

create policy "allow all" on products        for all to anon using (true) with check (true);
create policy "allow all" on accounts        for all to anon using (true) with check (true);
create policy "allow all" on calendar_posts  for all to anon using (true) with check (true);
create policy "allow all" on trend_snapshots for all to anon using (true) with check (true);
create policy "allow all" on platform_configs for all to anon using (true) with check (true);
