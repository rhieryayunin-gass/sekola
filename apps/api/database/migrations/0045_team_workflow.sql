-- Phase 40: fixed Jira-style Kanban workflow and transition history.
create table public.team_task_transitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  project_id uuid not null references public.team_projects(id) on delete cascade,
  task_id uuid not null references public.team_tasks(id) on delete cascade,
  from_status text check (from_status is null or from_status in ('BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE')),
  to_status text not null check (to_status in ('BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE')),
  moved_by_user_id uuid not null references public.users(id) on delete restrict,
  moved_at timestamptz not null default timezone('utc', now())
);

create index team_task_transitions_task_idx
  on public.team_task_transitions (tenant_id, task_id, moved_at desc);

alter table public.team_task_transitions enable row level security;
revoke all on public.team_task_transitions from anon, authenticated;
create policy team_task_transitions_select_tenant on public.team_task_transitions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

insert into public.permissions (code, name, description)
values ('team_workflow.manage', 'Manage Team+ workflow', 'Move tasks across the Team+ Kanban workflow')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = timezone('utc', now());

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code in ('OWNER', 'PRINCIPAL', 'STAFF', 'TEACHER')
  and permission.code = 'team_workflow.manage'
on conflict (role_id, permission_id) do nothing;
