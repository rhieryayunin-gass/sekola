-- Phase 49: tenant finance analytics.
create view public.finance_analytics with (security_invoker=true) as
select t.id as tenant_id,
 coalesce((select sum(p.amount) from public.payments p where p.tenant_id=t.id and p.status='CONFIRMED'),0) as revenue,
 coalesce((select sum(b.amount) from public.student_bills b where b.tenant_id=t.id and b.status not in('VOID','PAID')),0) as receivable,
 coalesce((select count(*) from public.payments p where p.tenant_id=t.id and p.status='CONFIRMED'),0) as payment_count,
 coalesce((select count(*) from public.student_bills b where b.tenant_id=t.id and b.status in('OPEN','PARTIAL','OVERDUE')),0) as outstanding_invoices,
 coalesce((select sum(b.amount) from public.student_bills b where b.tenant_id=t.id and b.status in('OPEN','PARTIAL','OVERDUE')),0) as outstanding_amount
from public.tenants t;
revoke all on public.finance_analytics from anon,authenticated;
insert into public.permissions(code,name,description) values('finance_analytics.read','Read finance analytics','View revenue, receivable, payment, and outstanding analytics') on conflict(code) do update set name=excluded.name,description=excluded.description,updated_at=timezone('utc',now());
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in('OWNER','PRINCIPAL','STAFF') and p.code='finance_analytics.read' on conflict do nothing;
