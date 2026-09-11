-- OSEKOLA: production role additions explicitly approved by the user.
-- Preserve existing permissions, role assignments, access scopes and RLS.
do $$
begin
  if (select count(*) from public.roles
      where code in ('OWNER', 'PRINCIPAL', 'STAFF', 'TEACHER', 'STUDENT', 'PARENT')
        and is_active = true) <> 6 then
    raise exception 'All six active canonical roles are required';
  end if;
  if (select count(*) from public.permissions
      where code in ('calendar.read', 'notifications.read', 'users.read',
        'users.create', 'users.update', 'users.status', 'tenants.update_own')) <> 7 then
    raise exception 'The seven approved permission definitions are required';
  end if;
end;
$$;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.is_active = true
  and (
    (r.code in ('OWNER', 'PRINCIPAL', 'STAFF', 'TEACHER', 'STUDENT', 'PARENT')
      and p.code in ('calendar.read', 'notifications.read'))
    or (r.code = 'OWNER'
      and p.code in ('users.read', 'users.create', 'users.update', 'users.status', 'tenants.update_own'))
  )
on conflict (role_id, permission_id) do nothing;

do $$
begin
  if (select count(*)
      from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
      join public.permissions p on p.id = rp.permission_id
      where (r.code in ('OWNER', 'PRINCIPAL', 'STAFF', 'TEACHER', 'STUDENT', 'PARENT')
        and p.code in ('calendar.read', 'notifications.read'))
      or (r.code = 'OWNER' and p.code in
        ('users.read', 'users.create', 'users.update', 'users.status', 'tenants.update_own'))) <> 17 then
    raise exception 'Approved OSEKOLA role permissions are incomplete';
  end if;
end;
$$;
