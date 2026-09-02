-- ============================================================
-- SEKOLA AI
-- Legacy tenant, authorization, and calendar reconciliation
-- ============================================================
-- This migration is intentionally idempotent. It captures objects that were
-- created in the staging database before migration history was introduced.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.tenants
add column if not exists updated_at timestamptz
not null default timezone('utc', now());

create index if not exists tenants_code_idx
  on public.tenants(code);

create index if not exists tenants_is_active_idx
  on public.tenants(is_active);

drop trigger if exists tenants_set_updated_at on public.tenants;

create trigger tenants_set_updated_at
before update on public.tenants
for each row
execute function public.set_updated_at();

alter table public.tenants enable row level security;

alter table public.users
add column if not exists tenant_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_tenant_id_fkey'
  ) then
    alter table public.users
    add constraint users_tenant_id_fkey
    foreign key (tenant_id)
    references public.tenants(id)
    on delete restrict;
  end if;
end;
$$;

alter table public.users
alter column tenant_id set not null;

create index if not exists users_tenant_id_idx
  on public.users(tenant_id);

create table if not exists public.user_level_roles (
  user_level_id uuid not null
    references public.user_levels(id) on delete cascade,
  role_id uuid not null
    references public.roles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_level_id, role_id)
);

alter table public.user_level_roles
add column if not exists created_at timestamptz
not null default timezone('utc', now());

create index if not exists user_level_roles_role_id_idx
  on public.user_level_roles(role_id);

alter table public.user_level_roles enable row level security;

create table if not exists public.calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_user_id uuid not null
    references public.users(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists calendars_owner_user_id_idx
  on public.calendars(owner_user_id);

create index if not exists calendars_is_active_idx
  on public.calendars(is_active);

drop trigger if exists calendars_set_updated_at on public.calendars;

create trigger calendars_set_updated_at
before update on public.calendars
for each row
execute function public.set_updated_at();

alter table public.calendars enable row level security;

drop policy if exists calendars_select_own on public.calendars;
create policy calendars_select_own
on public.calendars for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists calendars_insert_own on public.calendars;
create policy calendars_insert_own
on public.calendars for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists calendars_update_own on public.calendars;
create policy calendars_update_own
on public.calendars for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists calendars_delete_own on public.calendars;
create policy calendars_delete_own
on public.calendars for delete
to authenticated
using (owner_user_id = auth.uid());

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null
    references public.calendars(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_all_day boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint calendar_events_time_order_check
    check (ends_at is null or ends_at >= starts_at)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.calendar_events'::regclass
      and conname = 'calendar_events_time_order_check'
  ) then
    alter table public.calendar_events
    add constraint calendar_events_time_order_check
    check (ends_at is null or ends_at >= starts_at);
  end if;
end;
$$;

create index if not exists calendar_events_calendar_id_idx
  on public.calendar_events(calendar_id);

create index if not exists calendar_events_starts_at_idx
  on public.calendar_events(starts_at);

drop trigger if exists calendar_events_set_updated_at
on public.calendar_events;

create trigger calendar_events_set_updated_at
before update on public.calendar_events
for each row
execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

drop policy if exists calendar_events_select_own
on public.calendar_events;
create policy calendar_events_select_own
on public.calendar_events for select
to authenticated
using (
  exists (
    select 1
    from public.calendars as calendar
    where calendar.id = calendar_events.calendar_id
      and calendar.owner_user_id = auth.uid()
  )
);

drop policy if exists calendar_events_insert_own
on public.calendar_events;
create policy calendar_events_insert_own
on public.calendar_events for insert
to authenticated
with check (
  exists (
    select 1
    from public.calendars as calendar
    where calendar.id = calendar_events.calendar_id
      and calendar.owner_user_id = auth.uid()
  )
);

drop policy if exists calendar_events_update_own
on public.calendar_events;
create policy calendar_events_update_own
on public.calendar_events for update
to authenticated
using (
  exists (
    select 1
    from public.calendars as calendar
    where calendar.id = calendar_events.calendar_id
      and calendar.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.calendars as calendar
    where calendar.id = calendar_events.calendar_id
      and calendar.owner_user_id = auth.uid()
  )
);

drop policy if exists calendar_events_delete_own
on public.calendar_events;
create policy calendar_events_delete_own
on public.calendar_events for delete
to authenticated
using (
  exists (
    select 1
    from public.calendars as calendar
    where calendar.id = calendar_events.calendar_id
      and calendar.owner_user_id = auth.uid()
  )
);
