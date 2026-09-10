-- Phase 43: rooms and booking requests with Calendar/Notification integration points.
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9_-]{2,32}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  location text,
  capacity integer not null default 1 check (capacity between 1 and 5000),
  facilities jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, code)
);

create table public.room_bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  requester_user_id uuid not null references public.users(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 200),
  purpose text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (ends_at > starts_at)
);

create index rooms_tenant_active_idx on public.rooms (tenant_id, is_active);
create index room_bookings_schedule_idx on public.room_bookings (tenant_id, room_id, starts_at, ends_at);
alter table public.rooms enable row level security;
alter table public.room_bookings enable row level security;
revoke all on public.rooms, public.room_bookings from anon, authenticated;
create policy rooms_select_tenant on public.rooms for select to authenticated using (tenant_id = public.current_tenant_id());
create policy room_bookings_select_tenant on public.room_bookings for select to authenticated using (tenant_id = public.current_tenant_id());

insert into public.permissions(code,name,description) values
 ('rooms.read','Read rooms','View tenant rooms'),('rooms.create','Create rooms','Create rooms'),('rooms.update','Update rooms','Maintain rooms'),('rooms.delete','Delete rooms','Delete rooms'),
 ('room_bookings.read','Read room bookings','View room bookings'),('room_bookings.create','Create room bookings','Request room bookings'),('room_bookings.update','Update room bookings','Maintain room bookings'),('room_bookings.delete','Delete room bookings','Cancel room bookings')
on conflict(code) do update set name=excluded.name,description=excluded.description,updated_at=timezone('utc',now());
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code in('OWNER','PRINCIPAL','STAFF','TEACHER') and (p.code like 'rooms.%' or p.code like 'room_bookings.%') on conflict do nothing;
