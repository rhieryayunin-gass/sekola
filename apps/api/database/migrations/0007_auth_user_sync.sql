-- ============================================================
-- SEKOLA AI
-- Supabase Auth → tenant-aware Core User synchronization
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_tenant_id uuid;
begin
  select application_user.tenant_id
  into resolved_tenant_id
  from public.users as application_user
  where application_user.id = new.id;

  if resolved_tenant_id is null then
    select tenant.id
    into resolved_tenant_id
    from public.tenants as tenant
    where tenant.id::text = new.raw_app_meta_data ->> 'tenant_id'
      and tenant.is_active = true;
  end if;

  if resolved_tenant_id is null then
    raise exception
      'A valid active tenant_id is required in Auth app metadata'
      using errcode = '23514';
  end if;

  insert into public.users (
    id,
    email,
    full_name,
    tenant_id
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    resolved_tenant_id
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.users.full_name),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user()
from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from public, anon, authenticated';
  end if;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert or update of email on auth.users
for each row
execute function public.handle_new_auth_user();

update public.users as application_user
set
  email = auth_user.email,
  full_name = coalesce(
    nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
    application_user.full_name
  ),
  updated_at = timezone('utc', now())
from auth.users as auth_user
where application_user.id = auth_user.id;

insert into public.users (
  id,
  email,
  full_name,
  tenant_id
)
select
  auth_user.id,
  auth_user.email,
  nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
  tenant.id
from auth.users as auth_user
join public.tenants as tenant
  on tenant.id::text = auth_user.raw_app_meta_data ->> 'tenant_id'
  and tenant.is_active = true
left join public.users as application_user
  on application_user.id = auth_user.id
where application_user.id is null
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from auth.users as auth_user
    left join public.users as application_user
      on application_user.id = auth_user.id
    where application_user.id is null
  ) then
    raise exception
      'Auth users without tenant-aware Core profiles remain after backfill';
  end if;
end;
$$;
