-- Phase 48: attendance analytics by student, classroom, and teacher.
create view public.attendance_student_analytics with (security_invoker=true) as
select a.tenant_id,a.student_id,s.student_number,u.full_name,
 count(*) as recorded_days,count(*) filter(where a.status='PRESENT') as present_days,
 count(*) filter(where a.status='LATE') as late_days,count(*) filter(where a.status='EXCUSED') as excused_days,
 count(*) filter(where a.status='ABSENT') as absent_days,
 round(100.0*count(*) filter(where a.status in('PRESENT','LATE'))/nullif(count(*),0),2) as attendance_rate
from public.attendance_records a join public.students s on s.id=a.student_id
left join public.users u on u.id=s.user_id where a.student_id is not null
group by a.tenant_id,a.student_id,s.student_number,u.full_name;

create view public.attendance_classroom_analytics with (security_invoker=true) as
select a.tenant_id,a.classroom_id,c.name,count(*) as recorded_entries,
 count(*) filter(where a.status='ABSENT') as absent_entries,
 round(100.0*count(*) filter(where a.status in('PRESENT','LATE'))/nullif(count(*),0),2) as attendance_rate
from public.attendance_records a join public.classrooms c on c.id=a.classroom_id
group by a.tenant_id,a.classroom_id,c.name;

create view public.attendance_teacher_analytics with (security_invoker=true) as
select a.tenant_id,a.teacher_id,u.full_name,count(*) as recorded_days,
 count(*) filter(where a.status='ABSENT') as absent_days,
 round(100.0*count(*) filter(where a.status in('PRESENT','LATE'))/nullif(count(*),0),2) as attendance_rate
from public.attendance_records a join public.teachers t on t.id=a.teacher_id
left join public.users u on u.id=t.user_id where a.teacher_id is not null
group by a.tenant_id,a.teacher_id,u.full_name;

revoke all on public.attendance_student_analytics,public.attendance_classroom_analytics,public.attendance_teacher_analytics from anon,authenticated;
insert into public.permissions(code,name,description) values('attendance_analytics.read','Read attendance analytics','View student, class, and teacher attendance analytics') on conflict(code) do update set name=excluded.name,description=excluded.description,updated_at=timezone('utc',now());
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in('OWNER','PRINCIPAL','STAFF','TEACHER') and p.code='attendance_analytics.read' on conflict do nothing;
