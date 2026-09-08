create table public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete restrict,
 actor_user_id uuid references public.users(id) on delete set null,
 action text not null,
 module text not null,
 resource_type text not null,
 resource_id uuid,
 before_state jsonb,
 after_state jsonb,
 created_at timestamptz not null default timezone('utc',now())
);
create index audit_logs_tenant_created_idx on public.audit_logs(tenant_id,created_at desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon,authenticated;
insert into public.permissions(code,name,description) values ('audit.read','Read audit logs','View tenant audit records') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code='OWNER' and p.code='audit.read' on conflict do nothing;
