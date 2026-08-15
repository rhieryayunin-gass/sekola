-- ============================================================
-- SEKOLA AI
-- Core Roles & Permissions
-- ============================================================

create table public.permissions (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  description text,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,
  description text,

  is_active boolean not null default true,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,

  created_at timestamptz not null default timezone('utc', now()),

  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,

  created_at timestamptz not null default timezone('utc', now()),

  primary key (user_id, role_id)
);

create index roles_is_active_idx
  on public.roles(is_active);

create index user_roles_role_id_idx
  on public.user_roles(role_id);

create index role_permissions_permission_id_idx
  on public.role_permissions(permission_id);

create trigger permissions_set_updated_at
before update on public.permissions
for each row
execute function public.set_updated_at();

create trigger roles_set_updated_at
before update on public.roles
for each row
execute function public.set_updated_at();

alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
