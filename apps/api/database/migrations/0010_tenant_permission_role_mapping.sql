-- ============================================================
-- SEKOLA AI
-- Tenant permission mapping for legacy administrator role codes
-- ============================================================
-- Legacy staging data may use SCHOOL_ADMIN or another administrator code
-- instead of the shorter ADMIN code. Match the existing role identity without
-- creating or renaming roles.

with normalized_roles as (
  select
    role.id,
    regexp_replace(
      upper(concat_ws(' ', role.code, role.name)),
      '[^A-Z0-9]+',
      '',
      'g'
    ) as identity
  from public.roles as role
  where role.is_active = true
), eligible_mappings as (
  select normalized_role.id as role_id, permission.id as permission_id
  from normalized_roles as normalized_role
  cross join public.permissions as permission
  where
    (
      position('ADMIN' in normalized_role.identity) > 0
      and permission.code = 'tenants.update_own'
    )
    or (
      position('SUPER' in normalized_role.identity) > 0
      and position('ADMIN' in normalized_role.identity) > 0
      and permission.code in (
        'tenants.read_all',
        'tenants.create',
        'tenants.update_all',
        'tenants.deactivate'
      )
    )
)
insert into public.role_permissions (role_id, permission_id)
select eligible_mapping.role_id, eligible_mapping.permission_id
from eligible_mappings as eligible_mapping
on conflict (role_id, permission_id) do nothing;

do $$
begin
  if not exists (
    select 1
    from public.role_permissions as role_permission
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where permission.code = 'tenants.update_own'
  ) then
    raise exception
      'No active administrator role can receive tenants.update_own';
  end if;
end;
$$;
