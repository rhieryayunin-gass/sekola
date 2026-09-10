-- Phase 45: leave requests integrated with Approval, Calendar, and Notification.
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  requester_user_id uuid not null references public.users(id) on delete restrict,
  leave_type text not null check (leave_type in ('ANNUAL','SICK','PERSONAL','MATERNITY','PATERNITY','OTHER')),
  starts_on date not null,
  ends_on date not null,
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  check (ends_on >= starts_on)
);
create index leave_requests_tenant_user_idx on public.leave_requests(tenant_id,requester_user_id,starts_on);
alter table public.leave_requests enable row level security;
revoke all on public.leave_requests from anon,authenticated;
create policy leave_requests_select_tenant on public.leave_requests for select to authenticated using(tenant_id=public.current_tenant_id());
insert into public.permissions(code,name,description) values
 ('leave_requests.read','Read leave requests','View leave requests'),('leave_requests.create','Create leave requests','Submit leave requests'),('leave_requests.update','Update leave requests','Maintain leave requests'),('leave_requests.cancel','Cancel leave requests','Cancel leave requests')
on conflict(code) do update set name=excluded.name,description=excluded.description,updated_at=timezone('utc',now());
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in('OWNER','PRINCIPAL','STAFF','TEACHER') and p.code like 'leave_requests.%' on conflict do nothing;
