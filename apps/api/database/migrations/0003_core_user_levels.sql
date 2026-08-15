-- ============================================================
-- SEKOLA AI
-- Core User Levels
-- ============================================================

create table public.user_levels (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  description text,

  is_active boolean not null default true,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index user_levels_is_active_idx
  on public.user_levels(is_active);

create trigger user_levels_set_updated_at
before update on public.user_levels
for each row
execute function public.set_updated_at();

alter table public.user_levels enable row level security;
