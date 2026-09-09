create table public.teachers (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
 user_id uuid not null references public.users(id) on delete restrict, employee_number text, employment_status text not null default 'ACTIVE' check (employment_status in ('ACTIVE','INACTIVE')),
 created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()),
 unique(tenant_id,user_id), unique(tenant_id,employee_number)
);
create table public.teacher_subject_specializations (teacher_id uuid not null references public.teachers(id) on delete cascade, subject_id uuid not null references public.subjects(id) on delete restrict, primary key(teacher_id,subject_id));
create index teachers_tenant_idx on public.teachers(tenant_id); alter table public.teachers enable row level security; alter table public.teacher_subject_specializations enable row level security; revoke all on public.teachers,public.teacher_subject_specializations from anon,authenticated;
create policy teachers_select_tenant on public.teachers for select to authenticated using(tenant_id=public.current_tenant_id());
insert into public.permissions(code,name,description) values ('teachers.read','Read teachers','View teacher profiles'),('teachers.create','Create teachers','Create teacher profiles'),('teachers.update','Update teachers','Maintain teacher profiles') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in ('OWNER','PRINCIPAL','STAFF') and p.code like 'teachers.%' on conflict do nothing;
