-- Phase 08: generic access-control scopes for the locked role catalog.
-- Scope targets are identifiers only; no later business modules are introduced.

create type public.access_scope_type as enum ('GLOBAL', 'TENANT', 'MODULE', 'RESOURCE');

create table public.role_access_scopes (
  role_id uuid not null references public.roles(id) on delete cascade,
  scope_type public.access_scope_type not null,
  scope_key text not null default '*',
  created_at timestamptz not null default timezone('utc', now()),
  primary key (role_id, scope_type, scope_key),
  constraint role_access_scopes_key_not_blank check (length(trim(scope_key)) > 0)
);

create index role_access_scopes_type_key_idx
  on public.role_access_scopes(scope_type, scope_key);

alter table public.role_access_scopes enable row level security;
revoke all on table public.role_access_scopes from anon, authenticated;

-- OWNER is the only administration role. Operational role capabilities remain
-- configured through the Phase 07 permission matrix, not guessed here.
insert into public.role_access_scopes (role_id, scope_type, scope_key)
select id, 'GLOBAL', '*'
from public.roles
where code = 'OWNER'
on conflict do nothing;
