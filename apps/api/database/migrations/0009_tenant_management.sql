-- ============================================================
-- SEKOLA AI
-- Tenant management permissions and row isolation
-- ============================================================

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select application_user.tenant_id
  from public.users as application_user
  where application_user.id = auth.uid()
    and application_user.is_active = true
$$;

revoke all on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;

alter table public.tenants enable row level security;

drop policy if exists tenants_select_own on public.tenants;
create policy tenants_select_own
on public.tenants for select
to authenticated
using (
  id = public.current_tenant_id()
  and is_active = true
);

drop policy if exists tenants_update_own on public.tenants;
create policy tenants_update_own
on public.tenants for update
to authenticated
using (
  id = public.current_tenant_id()
  and is_active = true
)
with check (
  id = public.current_tenant_id()
  and is_active = true
);

revoke all on table public.tenants from anon;
revoke insert, update, delete on table public.tenants from authenticated;
grant select on table public.tenants to authenticated;
grant update (name) on table public.tenants to authenticated;

insert into public.permissions (code, name, description)
values
  (
    'tenants.read_all',
    'Read all tenants',
    'View every tenant from the platform administration context'
  ),
  (
    'tenants.create',
    'Create tenants',
    'Create a new tenant from the platform administration context'
  ),
  (
    'tenants.update_all',
    'Update all tenants',
    'Update any tenant from the platform administration context'
  ),
  (
    'tenants.deactivate',
    'Deactivate tenants',
    'Deactivate a tenant from the platform administration context'
  ),
  (
    'tenants.update_own',
    'Update own tenant',
    'Update the authenticated user tenant profile'
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = timezone('utc', now());

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles as role
cross join public.permissions as permission
where
  (
    upper(replace(role.code, '-', '_')) = 'SUPER_ADMIN'
    and permission.code in (
      'tenants.read_all',
      'tenants.create',
      'tenants.update_all',
      'tenants.deactivate',
      'tenants.update_own'
    )
  )
  or (
    upper(replace(role.code, '-', '_')) = 'ADMIN'
    and permission.code = 'tenants.update_own'
  )
on conflict (role_id, permission_id) do nothing;
