-- ============================================================
-- SEKOLA AI
-- User management, status authorization, and self-profile RLS
-- ============================================================

create unique index if not exists users_email_lower_unique_idx
  on public.users (lower(email))
  where email is not null;

comment on table public.users is
  'Core user master. The primary key is the related auth.users identifier.';

comment on column public.users.id is
  'One-to-one relationship with auth.users.id.';

insert into public.permissions (code, name, description)
values
  (
    'users.read',
    'Read users',
    'View user master records inside the authorized tenant'
  ),
  (
    'users.create',
    'Create users',
    'Provision Auth users and Core profiles inside the authorized tenant'
  ),
  (
    'users.update',
    'Update users',
    'Update user master records inside the authorized tenant'
  ),
  (
    'users.status',
    'Manage user status',
    'Activate or deactivate users inside the authorized tenant'
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = timezone('utc', now());

-- Preserve the access of legacy roles that used users.deactivate.
insert into public.role_permissions (role_id, permission_id)
select legacy_mapping.role_id, status_permission.id
from public.role_permissions as legacy_mapping
join public.permissions as legacy_permission
  on legacy_permission.id = legacy_mapping.permission_id
cross join public.permissions as status_permission
where legacy_permission.code = 'users.deactivate'
  and status_permission.code = 'users.status'
on conflict (role_id, permission_id) do nothing;

-- Existing administrator/owner identities receive Phase 05 user management.
-- No role is created or renamed here; the locked Role phase remains separate.
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
), user_management_roles as (
  select normalized_role.id
  from normalized_roles as normalized_role
  where position('OWNER' in normalized_role.identity) > 0
     or position('ADMIN' in normalized_role.identity) > 0
)
insert into public.role_permissions (role_id, permission_id)
select user_management_role.id, permission.id
from user_management_roles as user_management_role
cross join public.permissions as permission
where permission.code in (
  'users.read',
  'users.create',
  'users.update',
  'users.status'
)
on conflict (role_id, permission_id) do nothing;

alter table public.users enable row level security;

drop policy if exists users_select_self on public.users;
create policy users_select_self
on public.users for select
to authenticated
using (id = auth.uid());

revoke all on table public.users from anon;
revoke insert, update, delete on table public.users from authenticated;
grant select on table public.users to authenticated;

do $$
begin
  if not exists (
    select 1
    from public.role_permissions as role_permission
    join public.permissions as permission
      on permission.id = role_permission.permission_id
    where permission.code = 'users.status'
  ) then
    raise exception
      'No existing role can receive the users.status permission';
  end if;
end;
$$;
