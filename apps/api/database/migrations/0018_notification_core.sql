-- Phase 13: tenant-scoped notification Core+ infrastructure.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('INFO','SUCCESS','WARNING','ACTION_REQUIRED','APPROVAL','REMINDER','SYSTEM')),
  title text not null,
  body text,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create index notifications_user_unread_idx on public.notifications(user_id, read_at, created_at desc);
create index notifications_tenant_created_idx on public.notifications(tenant_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant select on public.notifications to authenticated;
create policy notifications_select_self on public.notifications for select to authenticated using (user_id = auth.uid() and tenant_id = public.current_tenant_id());
insert into public.permissions(code,name,description) values
 ('notifications.read','Read notifications','View own tenant-scoped notifications'),
 ('notifications.manage','Manage notifications','Create and manage tenant notifications')
on conflict(code) do update set name=excluded.name,description=excluded.description,updated_at=timezone('utc',now());
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='OWNER' and p.code in ('notifications.read','notifications.manage')
on conflict do nothing;
