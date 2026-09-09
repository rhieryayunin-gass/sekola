create table public.semesters (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
 academic_year_id uuid not null references public.academic_years(id) on delete restrict,
 name text not null check (char_length(trim(name)) between 2 and 120), starts_on date not null, ends_on date not null,
 is_active boolean not null default false, created_at timestamptz not null default timezone('utc',now()), updated_at timestamptz not null default timezone('utc',now()),
 constraint semester_dates_check check (ends_on > starts_on), constraint semester_name_per_year unique(academic_year_id,name)
);
create unique index semesters_one_active_per_tenant on public.semesters(tenant_id) where is_active;
create index semesters_tenant_year_idx on public.semesters(tenant_id,academic_year_id);
alter table public.semesters enable row level security; revoke all on public.semesters from anon,authenticated;
create policy semesters_select_tenant on public.semesters for select to authenticated using (tenant_id=public.current_tenant_id());
insert into public.permissions(code,name,description) values ('semesters.read','Read semesters','View semesters'),('semesters.create','Create semesters','Create semesters'),('semesters.update','Update semesters','Maintain semesters'),('semesters.delete','Delete semesters','Delete semesters') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in ('OWNER','PRINCIPAL','STAFF') and p.code like 'semesters.%' on conflict do nothing;
