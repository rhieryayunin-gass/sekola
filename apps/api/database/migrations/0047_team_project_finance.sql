-- Phase 42: project invoices and payments integrated with Finance+ masters.
create table public.team_project_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  project_id uuid not null references public.team_projects(id) on delete cascade,
  finance_category_id uuid references public.finance_categories(id) on delete restrict,
  invoice_number text not null,
  description text,
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'OPEN'
    check (status in ('DRAFT', 'OPEN', 'PARTIAL', 'PAID', 'VOID', 'OVERDUE')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, invoice_number)
);

create table public.team_project_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  project_id uuid not null references public.team_projects(id) on delete cascade,
  project_invoice_id uuid not null references public.team_project_invoices(id) on delete restrict,
  finance_account_id uuid references public.finance_accounts(id) on delete restrict,
  receipt_number text not null,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default timezone('utc', now()),
  status text not null default 'CONFIRMED'
    check (status in ('PENDING', 'CONFIRMED', 'VOID', 'REFUNDED')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (tenant_id, receipt_number)
);

create view public.team_project_finance_summary with (security_invoker=true) as
select
  invoice.tenant_id,
  invoice.project_id,
  count(*) filter (where invoice.status not in ('VOID', 'PAID')) as outstanding_invoices,
  coalesce(sum(invoice.amount) filter (where invoice.status <> 'VOID'), 0) as invoiced_amount,
  coalesce(payment.confirmed_amount, 0) as paid_amount,
  coalesce(sum(invoice.amount) filter (where invoice.status <> 'VOID'), 0)
    - coalesce(payment.confirmed_amount, 0) as outstanding_amount
from public.team_project_invoices invoice
left join (
  select tenant_id, project_id, sum(amount) as confirmed_amount
  from public.team_project_payments
  where status = 'CONFIRMED'
  group by tenant_id, project_id
) payment using (tenant_id, project_id)
group by invoice.tenant_id, invoice.project_id, payment.confirmed_amount;

create index team_project_invoices_project_idx
  on public.team_project_invoices (tenant_id, project_id, status, due_date);
create index team_project_payments_project_idx
  on public.team_project_payments (tenant_id, project_id, paid_at desc);

alter table public.team_project_invoices enable row level security;
alter table public.team_project_payments enable row level security;
revoke all on public.team_project_invoices, public.team_project_payments,
  public.team_project_finance_summary from anon, authenticated;
create policy team_project_invoices_select_tenant on public.team_project_invoices
  for select to authenticated using (tenant_id = public.current_tenant_id());
create policy team_project_payments_select_tenant on public.team_project_payments
  for select to authenticated using (tenant_id = public.current_tenant_id());

insert into public.permissions (code, name, description)
values
  ('team_finance.read', 'Read Team+ project finance', 'View project invoices, payments, and Finance+ summary'),
  ('team_finance.create', 'Create Team+ project finance', 'Create project invoices and payments'),
  ('team_finance.update', 'Update Team+ project finance', 'Maintain project invoices and payments'),
  ('team_finance.delete', 'Delete Team+ project finance', 'Void or delete project finance records')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = timezone('utc', now());

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code in ('OWNER', 'PRINCIPAL', 'STAFF')
  and permission.code like 'team_finance.%'
on conflict (role_id, permission_id) do nothing;
