create table public.subjects (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
 code text not null check(code = upper(trim(code)) and char_length(code) between 2 and 32), name text not null check(char_length(trim(name)) between 2 and 160), description text,
 is_active boolean not null default true, created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()),
 constraint subject_code_per_tenant unique(tenant_id,code)
);
create index subjects_tenant_idx on public.subjects(tenant_id); alter table public.subjects enable row level security; revoke all on public.subjects from anon,authenticated;
create policy subjects_select_tenant on public.subjects for select to authenticated using (tenant_id=public.current_tenant_id());
insert into public.permissions(code,name,description) values ('subjects.read','Read subjects','View subject master'),('subjects.create','Create subjects','Create subject master'),('subjects.update','Update subjects','Maintain subject master'),('subjects.delete','Delete subjects','Delete subject master') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in ('OWNER','PRINCIPAL','STAFF') and p.code like 'subjects.%' on conflict do nothing;
