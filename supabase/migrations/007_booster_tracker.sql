-- Booster module: one tracker row per Threads handle

create table if not exists booster_trackers (
  id           uuid        primary key default gen_random_uuid(),
  handle       text        not null unique,
  tracker      jsonb,
  style_guide  text,
  concept_library text,
  brand_voice  text,
  config       jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists booster_trackers_handle_idx on booster_trackers (handle);

alter table booster_trackers enable row level security;
create policy "allow all" on booster_trackers for all using (true);
