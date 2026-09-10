-- Phase 41: task comments and immutable project activity.
create table public.team_task_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  project_id uuid not null references public.team_projects(id) on delete cascade,
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  author_user_id uuid not null references public.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.team_project_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  project_id uuid not null references public.team_projects(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  activity_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index team_task_comments_task_idx
  on public.team_task_comments (tenant_id, task_id, created_at);
create index team_project_activity_project_idx
  on public.team_project_activity (tenant_id, project_id, created_at desc);

alter table public.team_task_comments enable row level security;
alter table public.team_project_activity enable row level security;
revoke all on public.team_task_comments, public.team_project_activity from anon, authenticated;
create policy team_task_comments_select_tenant on public.team_task_comments
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy team_project_activity_select_tenant on public.team_project_activity
  for select to authenticated using (tenant_id = public.current_tenant_id());

insert into public.permissions (code, name, description)
values
  ('team_collaboration.read', 'Read Team+ collaboration', 'View task comments and project activity'),
  ('team_collaboration.create', 'Create Team+ collaboration', 'Add comments to Team+ tasks'),
  ('team_collaboration.delete', 'Delete Team+ collaboration', 'Remove permitted Team+ comments')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = timezone('utc', now());

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code in ('OWNER', 'PRINCIPAL', 'STAFF', 'TEACHER')
  and permission.code like 'team_collaboration.%'
on conflict (role_id, permission_id) do nothing;
