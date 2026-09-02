-- ============================================================
-- SEKOLA AI
-- Supabase Auth admin-create metadata sequencing
-- ============================================================
-- Supabase Admin createUser inserts auth.users before it applies custom
-- app_metadata in the same transaction. The initial INSERT must therefore be
-- allowed to complete; the subsequent raw_app_meta_data UPDATE performs the
-- tenant validation and creates the Core profile atomically.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_tenant_id uuid;
  metadata_tenant_id uuid;
  has_tenant_metadata boolean;
begin
  select application_user.tenant_id
  into existing_tenant_id
  from public.users as application_user
  where application_user.id = new.id;

  has_tenant_metadata := coalesce(
    new.raw_app_meta_data ? 'tenant_id',
    false
  );

  if has_tenant_metadata then
    select tenant.id
    into metadata_tenant_id
    from public.tenants as tenant
    where tenant.id::text = new.raw_app_meta_data ->> 'tenant_id'
      and tenant.is_active = true;

    if metadata_tenant_id is null then
      raise exception
        'A valid active tenant_id is required in Auth app metadata'
        using errcode = '23514';
    end if;
  end if;

  if existing_tenant_id is not null
    and metadata_tenant_id is not null
    and existing_tenant_id <> metadata_tenant_id then
    raise exception
      'Auth app metadata cannot move an existing user to another tenant'
      using errcode = '23514';
  end if;

  if existing_tenant_id is null and metadata_tenant_id is null then
    if tg_op = 'INSERT' and not has_tenant_metadata then
      return new;
    end if;

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
    coalesce(existing_tenant_id, metadata_tenant_id)
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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert or update of email, raw_app_meta_data, raw_user_meta_data
on auth.users
for each row
execute function public.handle_new_auth_user();
