-- Phase 38: Team+ project workspace.
create table public.team_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{2,32}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text,
  status text not null default 'PLANNING'
    check (status in ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED')),
  owner_user_id uuid not null references public.users(id) on delete restrict,
  starts_on date,
  due_on date,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, code),
  check (due_on is null or starts_on is null or due_on >= starts_on)
);

create table public.team_project_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  project_id uuid not null references public.team_projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  member_role text not null default 'MEMBER'
    check (member_role in ('OWNER', 'MANAGER', 'MEMBER', 'VIEWER')),
  joined_at timestamptz not null default timezone('utc', now()),
  unique (project_id, user_id)
);

create table public.team_project_settings (
  project_id uuid primary key references public.team_projects(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  visibility text not null default 'PROJECT'
    check (visibility in ('PROJECT', 'TENANT')),
  notifications_enabled boolean not null default true,
  allow_member_comments boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index team_projects_tenant_status_idx
  on public.team_projects (tenant_id, status);
create index team_project_members_tenant_user_idx
  on public.team_project_members (tenant_id, user_id);

alter table public.team_projects enable row level security;
alter table public.team_project_members enable row level security;
alter table public.team_project_settings enable row level security;

revoke all on public.team_projects, public.team_project_members,
  public.team_project_settings from anon, authenticated;

create policy team_projects_select_tenant on public.team_projects
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy team_project_members_select_tenant on public.team_project_members
  for select to authenticated
  using (tenant_id = public.current_tenant_id());
create policy team_project_settings_select_tenant on public.team_project_settings
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

insert into public.permissions (code, name, description)
values
  ('team_projects.read', 'Read Team+ projects', 'View projects, members, and settings'),
  ('team_projects.create', 'Create Team+ projects', 'Create Team+ projects'),
  ('team_projects.update', 'Update Team+ projects', 'Maintain projects, members, and settings'),
  ('team_projects.delete', 'Delete Team+ projects', 'Delete Team+ projects')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = timezone('utc', now());

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code in ('OWNER', 'PRINCIPAL', 'STAFF', 'TEACHER')
  and permission.code like 'team_projects.%'
on conflict (role_id, permission_id) do nothing;
