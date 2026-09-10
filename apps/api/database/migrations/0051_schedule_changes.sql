-- Phase 46: calendar schedule change requests.
create table public.schedule_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  requester_user_id uuid not null references public.users(id) on delete restrict,
  calendar_event_id uuid not null references public.calendar_events(id) on delete cascade,
  proposed_starts_at timestamptz not null,
  proposed_ends_at timestamptz not null,
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  check (proposed_ends_at > proposed_starts_at)
);
create index schedule_changes_tenant_status_idx on public.schedule_change_requests(tenant_id,status,created_at);
alter table public.schedule_change_requests enable row level security;
revoke all on public.schedule_change_requests from anon,authenticated;
create policy schedule_changes_select_tenant on public.schedule_change_requests for select to authenticated using(tenant_id=public.current_tenant_id());
insert into public.permissions(code,name,description) values
 ('schedule_changes.read','Read schedule changes','View schedule change requests'),('schedule_changes.create','Create schedule changes','Submit schedule change requests'),('schedule_changes.cancel','Cancel schedule changes','Cancel schedule change requests')
on conflict(code) do update set name=excluded.name,description=excluded.description,updated_at=timezone('utc',now());
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in('OWNER','PRINCIPAL','STAFF','TEACHER') and p.code like 'schedule_changes.%' on conflict do nothing;
