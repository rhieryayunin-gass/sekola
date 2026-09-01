-- ============================================================
-- SEKOLA AI
-- Supabase Auth → Core User synchronization
-- ============================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (
    id,
    email,
    full_name
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user()
from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert or update of email on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.users (
  id,
  email,
  full_name
)
select
  auth_user.id,
  auth_user.email,
  nullif(auth_user.raw_user_meta_data ->> 'full_name', '')
from auth.users as auth_user
on conflict (id) do nothing;
