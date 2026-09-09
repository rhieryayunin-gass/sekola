create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 120),
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint academic_year_dates_check check (ends_on > starts_on),
  constraint academic_year_name_per_tenant unique (tenant_id, name)
);
create unique index academic_years_one_active_per_tenant on public.academic_years(tenant_id) where is_active;
create index academic_years_tenant_idx on public.academic_years(tenant_id);
alter table public.academic_years enable row level security;
revoke all on public.academic_years from anon, authenticated;
create policy academic_years_select_tenant on public.academic_years for select to authenticated using (tenant_id = public.current_tenant_id());
insert into public.permissions(code,name,description) values
 ('academic_years.read','Read academic years','View academic years in the current tenant'),
 ('academic_years.create','Create academic years','Create academic years in the current tenant'),
 ('academic_years.update','Update academic years','Maintain academic years in the current tenant'),
 ('academic_years.delete','Delete academic years','Delete inactive academic years in the current tenant') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in ('OWNER','PRINCIPAL','STAFF') and p.code like 'academic_years.%' on conflict do nothing;
