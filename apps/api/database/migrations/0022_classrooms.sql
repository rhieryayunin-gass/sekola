create table public.classrooms (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
 academic_year_id uuid not null references public.academic_years(id) on delete restrict, name text not null check(char_length(trim(name)) between 2 and 120),
 capacity integer not null default 0 check(capacity >= 0 and capacity <= 1000), homeroom_teacher_user_id uuid references public.users(id) on delete set null,
 is_active boolean not null default true, created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()),
 constraint classroom_name_per_year unique(academic_year_id,name)
);
create index classrooms_tenant_year_idx on public.classrooms(tenant_id,academic_year_id); alter table public.classrooms enable row level security; revoke all on public.classrooms from anon,authenticated;
create policy classrooms_select_tenant on public.classrooms for select to authenticated using (tenant_id=public.current_tenant_id());
insert into public.permissions(code,name,description) values ('classrooms.read','Read classrooms','View classrooms'),('classrooms.create','Create classrooms','Create classrooms'),('classrooms.update','Update classrooms','Maintain classrooms'),('classrooms.delete','Delete classrooms','Delete classrooms') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in ('OWNER','PRINCIPAL','STAFF') and p.code like 'classrooms.%' on conflict do nothing;
