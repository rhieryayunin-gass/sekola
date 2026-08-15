-- ============================================================
-- SEKOLA AI
-- Core Users
-- ============================================================

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,

  full_name text,
  email text,

  is_active boolean not null default true,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index users_email_idx
  on public.users(email);

create index users_is_active_idx
  on public.users(is_active);

create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

alter table public.users enable row level security;
