-- Phase 07: permission master and canonical owner administration.
-- Access scopes remain exclusively in Phase 08.

insert into public.permissions (code, name, description)
values
  ('permissions.read', 'Read permissions', 'View the permission catalog'),
  ('permissions.manage', 'Manage permissions', 'Maintain role-permission mappings'),
  ('roles.read', 'Read roles', 'View canonical roles and their permissions'),
  ('roles.manage', 'Manage roles', 'Maintain canonical role permission mappings'),
  ('users.roles.manage', 'Manage user roles', 'Assign direct canonical roles inside the current tenant')
on conflict (code) do update
set name = excluded.name, description = excluded.description, updated_at = timezone('utc', now());

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code = 'OWNER'
  and permission.code in (
    'permissions.read', 'permissions.manage', 'roles.read', 'roles.manage', 'users.roles.manage'
  )
on conflict (role_id, permission_id) do nothing;

-- Direct user-role assignments may only be read by their owner through the
-- server API. Browser-side mutation remains denied; Phase 08 owns scopes.
alter table public.user_roles enable row level security;
revoke all on table public.user_roles from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.code = 'OWNER' and p.code = 'users.roles.manage'
  ) then
    raise exception 'OWNER permission administration mapping is missing';
  end if;
end;
$$;
