-- Phase 12: shared, tenant-scoped calendar infrastructure.
alter table public.calendars add column if not exists tenant_id uuid references public.tenants(id) on delete restrict;
update public.calendars c set tenant_id = u.tenant_id from public.users u where c.owner_user_id = u.id and c.tenant_id is null;
do $$ begin
  if exists (select 1 from public.calendars where tenant_id is null) then
    raise exception 'Every existing calendar must belong to an active tenant';
  end if;
end $$;
alter table public.calendars alter column tenant_id set not null;
create index if not exists calendars_tenant_id_idx on public.calendars(tenant_id);
alter table public.calendar_events
  add column if not exists event_type text not null default 'GENERAL',
  add column if not exists recurrence_rule text,
  add column if not exists requires_approval boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.calendar_events'::regclass and conname = 'calendar_events_event_type_check') then
    alter table public.calendar_events add constraint calendar_events_event_type_check check (event_type in ('GENERAL', 'MEETING', 'HOLIDAY', 'DEADLINE'));
  end if;
end $$;
create table if not exists public.calendar_event_participants (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  response text not null default 'PENDING' check (response in ('PENDING', 'ACCEPTED', 'REJECTED')),
  invited_at timestamptz not null default timezone('utc', now()), responded_at timestamptz,
  primary key (event_id, user_id)
);
create table if not exists public.calendar_approvals (
  event_id uuid primary key references public.calendar_events(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by_user_id uuid references public.users(id) on delete set null, reviewed_at timestamptz, note text
);
alter table public.calendar_event_participants enable row level security;
alter table public.calendar_approvals enable row level security;
revoke all on table public.calendar_event_participants, public.calendar_approvals from anon, authenticated;

-- The authenticated client can read calendars and events only in its active
-- tenant. Mutations remain server-mediated through the permission-guarded API.
drop policy if exists calendars_select_own on public.calendars;
drop policy if exists calendars_insert_own on public.calendars;
drop policy if exists calendars_update_own on public.calendars;
drop policy if exists calendars_delete_own on public.calendars;
drop policy if exists calendars_select_tenant on public.calendars;
create policy calendars_select_tenant on public.calendars for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists calendar_events_select_own on public.calendar_events;
drop policy if exists calendar_events_insert_own on public.calendar_events;
drop policy if exists calendar_events_update_own on public.calendar_events;
drop policy if exists calendar_events_delete_own on public.calendar_events;
drop policy if exists calendar_events_select_tenant on public.calendar_events;
create policy calendar_events_select_tenant on public.calendar_events for select to authenticated
  using (exists (select 1 from public.calendars c where c.id = calendar_events.calendar_id and c.tenant_id = public.current_tenant_id()));

insert into public.permissions (code, name, description)
values
  ('calendar.read', 'Read calendars', 'View shared calendars inside the current tenant'),
  ('calendar.create', 'Create calendars', 'Create calendars and events inside the current tenant'),
  ('calendar.update', 'Update calendars', 'Maintain owned calendars, events, invitations, and approvals'),
  ('calendar.delete', 'Delete calendars', 'Delete owned calendars and events inside the current tenant')
on conflict (code) do update set name = excluded.name, description = excluded.description, updated_at = timezone('utc', now());

-- Preserve existing calendar access. If this is a fresh catalog, provision
-- only the established administrative/teaching roles; no roles are created.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role cross join public.permissions permission
where role.code in ('OWNER', 'PRINCIPAL', 'STAFF', 'TEACHER')
  and permission.code in ('calendar.read', 'calendar.create', 'calendar.update', 'calendar.delete')
on conflict (role_id, permission_id) do nothing;
