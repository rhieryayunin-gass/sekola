-- Phase 44: reusable sequential approval engine.
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  requester_user_id uuid not null references public.users(id) on delete restrict,
  resource_type text not null,
  resource_id uuid not null,
  title text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  current_step integer not null default 1 check (current_step > 0),
  created_at timestamptz not null default timezone('utc',now()),
  decided_at timestamptz
);
create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  approval_request_id uuid not null references public.approval_requests(id) on delete cascade,
  approver_user_id uuid not null references public.users(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','SKIPPED')),
  note text,
  decided_at timestamptz,
  unique (approval_request_id, sequence)
);
alter table public.room_bookings add column approval_request_id uuid references public.approval_requests(id) on delete set null;
create index approval_requests_queue_idx on public.approval_requests(tenant_id,status,created_at);
create index approval_steps_approver_idx on public.approval_steps(tenant_id,approver_user_id,status);
alter table public.approval_requests enable row level security;
alter table public.approval_steps enable row level security;
revoke all on public.approval_requests,public.approval_steps from anon,authenticated;
create policy approval_requests_select_tenant on public.approval_requests for select to authenticated using(tenant_id=public.current_tenant_id());
create policy approval_steps_select_tenant on public.approval_steps for select to authenticated using(tenant_id=public.current_tenant_id());
insert into public.permissions(code,name,description) values
 ('approvals.read','Read approvals','View approval requests and steps'),('approvals.create','Create approvals','Create approval requests'),('approvals.decide','Decide approvals','Approve or reject assigned requests'),('approvals.cancel','Cancel approvals','Cancel approval requests')
on conflict(code) do update set name=excluded.name,description=excluded.description,updated_at=timezone('utc',now());
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in('OWNER','PRINCIPAL','STAFF','TEACHER') and p.code like 'approvals.%' on conflict do nothing;
