-- Phase 50: cross-domain executive dashboard snapshot.
create view public.executive_dashboard with (security_invoker=true) as
select t.id as tenant_id,
 (select count(*) from public.students s where s.tenant_id=t.id and s.enrollment_status='ACTIVE') as active_students,
 (select count(*) from public.teachers tr where tr.tenant_id=t.id and tr.employment_status='ACTIVE') as active_teachers,
 (select count(*) from public.classrooms c where c.tenant_id=t.id and c.is_active) as active_classrooms,
 coalesce((select avg(er.score) from public.exam_results er where er.tenant_id=t.id and er.status in('GRADED','PUBLISHED')),0) as average_exam_score,
 coalesce((select round(100.0*count(*) filter(where ar.status in('PRESENT','LATE'))/nullif(count(*),0),2) from public.attendance_records ar where ar.tenant_id=t.id),0) as attendance_rate,
 coalesce((select sum(p.amount) from public.payments p where p.tenant_id=t.id and p.status='CONFIRMED'),0) as finance_revenue,
 coalesce((select sum(b.amount) from public.student_bills b where b.tenant_id=t.id and b.status in('OPEN','PARTIAL','OVERDUE')),0) as finance_outstanding,
 (select count(*) from public.lessons l where l.tenant_id=t.id and l.is_published) as published_lessons,
 (select count(*) from public.assignments a where a.tenant_id=t.id and a.is_published) as published_assignments,
 (select count(*) from public.exams e where e.tenant_id=t.id) as exams,
 (select count(*) from public.team_projects p where p.tenant_id=t.id and p.status='ACTIVE') as active_projects,
 (select count(*) from public.team_tasks tt where tt.tenant_id=t.id and tt.status<>'DONE') as open_team_tasks,
 (select count(*) from public.approval_requests ar where ar.tenant_id=t.id and ar.status='PENDING') as pending_approvals
from public.tenants t;
revoke all on public.executive_dashboard from anon,authenticated;
insert into public.permissions(code,name,description) values('executive_dashboard.read','Read executive dashboard','View cross-domain executive metrics') on conflict(code) do update set name=excluded.name,description=excluded.description,updated_at=timezone('utc',now());
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in('OWNER','PRINCIPAL') and p.code='executive_dashboard.read' on conflict do nothing;
