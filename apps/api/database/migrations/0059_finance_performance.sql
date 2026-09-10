-- Phase 52/54: serialize payments per invoice and derive outstanding from confirmed payments.
-- Student reads use one paged SQL query, not an unbounded client-side course-ID list.
create function public.list_student_learning(actor_id uuid, resource text, page_offset integer default 0, page_limit integer default 50) returns jsonb
language plpgsql stable set search_path='' as $$
declare tenant uuid:=public.app_tenant(actor_id); student uuid; result jsonb; course_join text; published text;
begin
  if resource not in('courses','lessons','assignments') or not public.app_has_permission(actor_id,resource||'.read') then raise exception 'Missing permission' using errcode='42501'; end if;
  select s.id into student from public.students s where s.user_id=actor_id and s.tenant_id=tenant;
  if student is null then return '[]'::jsonb; end if;
  course_join:=case when resource='courses' then 'c.id=r.id' else 'c.id=r.course_id' end;
  published:=case when resource='courses' then 'true' else 'r.is_published' end;
  execute format('select coalesce(jsonb_agg(q),''[]''::jsonb) from (select r.* from public.%I r join public.courses c on %s and c.tenant_id=r.tenant_id where r.tenant_id=$1 and %s and exists(select 1 from public.student_assignments a where a.tenant_id=$1 and a.student_id=$2 and a.classroom_id=c.classroom_id and a.semester_id=c.semester_id and a.is_active) order by r.created_at desc,r.id offset $3 limit $4) q',resource,course_join,published)
    into result using tenant,student,greatest(page_offset,0),least(greatest(page_limit,1),100);
  return result;
end $$;
revoke all on function public.list_student_learning(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.list_student_learning(uuid,text,integer,integer) to service_role;
insert into public.role_permissions(role_id,permission_id)
 select r.id,p.id from public.roles r cross join public.permissions p
 where r.code='STUDENT' and p.code in('courses.read','lessons.read','assignments.read') on conflict do nothing;

create function public.list_visible_projects(actor_id uuid, page_offset integer default 0, page_limit integer default 50) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(p),'[]'::jsonb) from (
    select p.* from public.team_projects p where p.tenant_id=public.app_tenant(actor_id)
      and (p.owner_user_id=actor_id
        or exists(select 1 from public.team_project_settings s where s.project_id=p.id and s.tenant_id=p.tenant_id and s.visibility='TENANT')
        or exists(select 1 from public.team_project_members m where m.project_id=p.id and m.tenant_id=p.tenant_id and m.user_id=actor_id))
    order by p.created_at desc,p.id offset greatest(page_offset,0) limit least(greatest(page_limit,1),100)
  ) p;
$$;
revoke all on function public.list_visible_projects(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.list_visible_projects(uuid,integer,integer) to service_role;
create function public.reconcile_invoice_payment() returns trigger
language plpgsql set search_path='' as $$
declare row_data jsonb; invoice_table text; invoice_key text; invoice_id uuid; bill jsonb; paid numeric; total numeric;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  invoice_table:=case tg_table_name when 'payments' then 'student_bills' else 'team_project_invoices' end;
  invoice_key:=case tg_table_name when 'payments' then 'student_bill_id' else 'project_invoice_id' end;
  if tg_op='UPDATE' and (to_jsonb(old)->>invoice_key is distinct from row_data->>invoice_key or old.tenant_id<>new.tenant_id) then raise exception 'Payment invoice is immutable' using errcode='23514'; end if;
  invoice_id:=(row_data->>invoice_key)::uuid;
  execute format('select to_jsonb(b) from public.%I b where id=$1 and tenant_id=$2 for update',invoice_table) into bill using invoice_id,(row_data->>'tenant_id')::uuid;
  if bill is null or bill->>'status' in('DRAFT','VOID') then raise exception 'Invoice unavailable for payment' using errcode='23514'; end if;
  if tg_table_name='team_project_payments' and bill->>'project_id'<>row_data->>'project_id' then raise exception 'Wrong project invoice' using errcode='23514'; end if;
  execute format('select coalesce(sum(amount),0) from public.%I where %I=$1 and status=''CONFIRMED'' and id<>$2',tg_table_name,invoice_key) into paid using invoice_id,(row_data->>'id')::uuid;
  total:=paid+case when tg_op<>'DELETE' and row_data->>'status'='CONFIRMED' then (row_data->>'amount')::numeric else 0 end;
  if total>(bill->>'amount')::numeric then raise exception 'Payment exceeds outstanding invoice' using errcode='23514'; end if;
  execute format('update public.%I set status=$1 where id=$2 and tenant_id=$3',invoice_table)
    using case when total=(bill->>'amount')::numeric then 'PAID' when total>0 then 'PARTIAL' when (bill->>'due_date')::date<current_date then 'OVERDUE' else 'OPEN' end,invoice_id,(row_data->>'tenant_id')::uuid;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.reconcile_invoice_payment() from public,anon,authenticated;
create trigger payment_balance before insert or update or delete on public.payments for each row execute function public.reconcile_invoice_payment();
create trigger project_payment_balance before insert or update or delete on public.team_project_payments for each row execute function public.reconcile_invoice_payment();

-- Invoice edits cannot erase confirmed debt/payment history or invent a paid status.
create function public.validate_invoice_totals() returns trigger
language plpgsql set search_path='' as $$
declare payment_table text; invoice_key text; paid numeric;
begin
  payment_table:=case tg_table_name when 'student_bills' then 'payments' else 'team_project_payments' end;
  invoice_key:=case tg_table_name when 'student_bills' then 'student_bill_id' else 'project_invoice_id' end;
  execute format('select coalesce(sum(amount),0) from public.%I where %I=$1 and tenant_id=$2 and status=''CONFIRMED''',payment_table,invoice_key) into paid using new.id,new.tenant_id;
  if new.amount<paid or (new.status in('DRAFT','VOID') and paid>0) then raise exception 'Invoice conflicts with confirmed payments' using errcode='23514'; end if;
  -- Payment trigger has already derived its prospective balance under row lock.
  if pg_trigger_depth()=1 and new.status not in('DRAFT','VOID') then
    new.status:=case when paid=new.amount then 'PAID' when paid>0 then 'PARTIAL' when new.due_date<current_date then 'OVERDUE' else 'OPEN' end;
  end if;
  return new;
end $$;
revoke all on function public.validate_invoice_totals() from public,anon,authenticated;
create trigger invoice_totals before insert or update on public.student_bills for each row execute function public.validate_invoice_totals();
create trigger project_invoice_totals before insert or update on public.team_project_invoices for each row execute function public.validate_invoice_totals();

create or replace view public.finance_analytics with(security_invoker=true) as
select t.id as tenant_id,
 coalesce(p.revenue,0) as revenue,coalesce(b.outstanding_amount,0) as receivable,
 coalesce(p.payment_count,0) as payment_count,coalesce(b.outstanding_invoices,0) as outstanding_invoices,coalesce(b.outstanding_amount,0) as outstanding_amount
from public.tenants t
left join (select tenant_id,sum(amount) as revenue,count(*) as payment_count from public.payments where status='CONFIRMED' group by tenant_id) p on p.tenant_id=t.id
left join (
 select invoice.tenant_id,count(*) filter(where invoice.amount>coalesce(payment.paid,0)) as outstanding_invoices,
 sum(greatest(invoice.amount-coalesce(payment.paid,0),0)) as outstanding_amount
 from public.student_bills invoice left join (select tenant_id,student_bill_id,sum(amount) as paid from public.payments where status='CONFIRMED' group by tenant_id,student_bill_id) payment on payment.tenant_id=invoice.tenant_id and payment.student_bill_id=invoice.id
 where invoice.status not in('DRAFT','VOID') group by invoice.tenant_id
) b on b.tenant_id=t.id;

-- Reuse one finance aggregation in the executive view.
create or replace view public.finance_dashboard with(security_invoker=true) as
select tenant_id,outstanding_invoices,outstanding_amount,revenue as payment_amount from public.finance_analytics;

create or replace view public.team_project_finance_summary with(security_invoker=true) as
select invoice.tenant_id,invoice.project_id,
 count(*) filter(where invoice.amount>coalesce(payment.paid,0)) as outstanding_invoices,
 coalesce(sum(invoice.amount),0) as invoiced_amount,
 coalesce(sum(payment.paid),0) as paid_amount,
 coalesce(sum(greatest(invoice.amount-coalesce(payment.paid,0),0)),0) as outstanding_amount
from public.team_project_invoices invoice
left join (select tenant_id,project_invoice_id,sum(amount) as paid from public.team_project_payments where status='CONFIRMED' group by tenant_id,project_invoice_id) payment
 on payment.tenant_id=invoice.tenant_id and payment.project_invoice_id=invoice.id
where invoice.status not in('DRAFT','VOID') group by invoice.tenant_id,invoice.project_id;

create or replace view public.executive_dashboard with(security_invoker=true) as
select t.id as tenant_id,
 (select count(*) from public.students s where s.tenant_id=t.id and s.enrollment_status='ACTIVE') as active_students,
 (select count(*) from public.teachers tr where tr.tenant_id=t.id and tr.employment_status='ACTIVE') as active_teachers,
 (select count(*) from public.classrooms c where c.tenant_id=t.id and c.is_active) as active_classrooms,
 coalesce((select avg(er.score) from public.exam_results er where er.tenant_id=t.id and er.status in('GRADED','PUBLISHED')),0) as average_exam_score,
 coalesce((select round(100.0*count(*) filter(where ar.status in('PRESENT','LATE'))/nullif(count(*),0),2) from public.attendance_records ar where ar.tenant_id=t.id),0) as attendance_rate,
 f.revenue as finance_revenue,f.outstanding_amount as finance_outstanding,
 (select count(*) from public.lessons l where l.tenant_id=t.id and l.is_published) as published_lessons,
 (select count(*) from public.assignments a where a.tenant_id=t.id and a.is_published) as published_assignments,
 (select count(*) from public.exams e where e.tenant_id=t.id) as exams,
 (select count(*) from public.team_projects p where p.tenant_id=t.id and p.status='ACTIVE') as active_projects,
 (select count(*) from public.team_tasks tt where tt.tenant_id=t.id and tt.status<>'DONE') as open_team_tasks,
 (select count(*) from public.approval_requests ar where ar.tenant_id=t.id and ar.status='PENDING') as pending_approvals
from public.tenants t join public.finance_analytics f on f.tenant_id=t.id;

create index payments_confirmed_invoice on public.payments(tenant_id,student_bill_id) include(amount) where status='CONFIRMED';
create index team_payments_confirmed_invoice on public.team_project_payments(tenant_id,project_invoice_id) include(amount) where status='CONFIRMED';
create index exam_results_graded_student on public.exam_results(tenant_id,student_id,exam_session_id) include(score) where status in('GRADED','PUBLISHED');
create index attendance_class_date on public.attendance_records(tenant_id,classroom_id,attendance_date) include(status);
create index approval_assignee_request on public.approval_steps(tenant_id,approver_user_id,approval_request_id);
do $$ declare resource text; begin
  foreach resource in array array['academic_years','semesters','classrooms','subjects','teachers','students','teacher_assignments','student_assignments','courses','lessons','assignments','submissions','attendance_records','attendance_qr_sessions','exams','exam_questions','exam_sessions','exam_results','finance_accounts','finance_categories','finance_periods','student_bills','payments','team_projects','team_tasks','rooms','room_bookings','leave_requests','schedule_change_requests','approval_requests'] loop
    execute format('create index %I on public.%I(tenant_id,created_at desc,id)',resource||'_page_idx',resource);
  end loop;
end $$;
