-- Disposable CI regression; transaction rollback preserves preceding fixtures.
begin;
create temporary table approved_mappings as
select r.id as role_id, p.id as permission_id
from public.roles r cross join public.permissions p
where (r.code in ('OWNER', 'PRINCIPAL', 'STAFF', 'TEACHER', 'STUDENT', 'PARENT')
       and p.code in ('calendar.read', 'notifications.read'))
   or (r.code = 'OWNER' and p.code in
       ('users.read', 'users.create', 'users.update', 'users.status', 'tenants.update_own'));

delete from public.role_permissions rp using approved_mappings approved
where rp.role_id = approved.role_id and rp.permission_id = approved.permission_id;
create temporary table permissions_before as select * from public.role_permissions;
create temporary table scopes_before as select * from public.role_access_scopes;
create temporary table assignments_before as select * from public.user_roles;

\i :role_permissions_migration

do $$
begin
  if (select count(*) from approved_mappings) <> 17 then
    raise exception 'Expected exactly 17 approved role-permission pairs';
  end if;
  if exists (
    (select role_id, permission_id from public.role_permissions
     except select role_id, permission_id from permissions_before)
    except select role_id, permission_id from approved_mappings
  ) or exists (
    select role_id, permission_id from approved_mappings
    except select role_id, permission_id from public.role_permissions
  ) then
    raise exception 'Migration must add exactly the approved pairs';
  end if;
  if exists (select * from permissions_before except select * from public.role_permissions) then
    raise exception 'Existing permissions must be preserved';
  end if;
  if exists (
    (select * from scopes_before except select * from public.role_access_scopes)
    union all
    (select * from public.role_access_scopes except select * from scopes_before)
  ) or exists (
    (select * from assignments_before except select * from public.user_roles)
    union all
    (select * from public.user_roles except select * from assignments_before)
  ) then
    raise exception 'Role assignments and access scopes must be preserved';
  end if;
end;
$$;

create temporary table after_first_apply as select * from public.role_permissions;
\i :role_permissions_migration
do $$
begin
  if exists (
    (select * from after_first_apply except select * from public.role_permissions)
    union all
    (select * from public.role_permissions except select * from after_first_apply)
  ) then
    raise exception 'Reapplying the migration must preserve mappings and timestamps';
  end if;
end;
$$;
rollback;
