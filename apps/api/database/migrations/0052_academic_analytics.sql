-- Phase 47: academic analytics across students, teachers, classrooms, subjects, and performance.
create view public.academic_student_analytics with (security_invoker=true) as
select s.tenant_id,s.id as student_id,s.student_number,u.full_name,
 count(distinct er.id) filter(where er.status in('GRADED','PUBLISHED')) as graded_results,
 coalesce(avg(er.score) filter(where er.status in('GRADED','PUBLISHED')),0) as average_score
from public.students s left join public.users u on u.id=s.user_id
left join public.exam_results er on er.student_id=s.id and er.tenant_id=s.tenant_id
group by s.tenant_id,s.id,s.student_number,u.full_name;

create view public.academic_teacher_analytics with (security_invoker=true) as
select t.tenant_id,t.id as teacher_id,u.full_name,
 count(distinct c.id) as course_count,count(distinct er.id) filter(where er.status in('GRADED','PUBLISHED')) as graded_results,
 coalesce(avg(er.score) filter(where er.status in('GRADED','PUBLISHED')),0) as average_score
from public.teachers t left join public.users u on u.id=t.user_id
left join public.courses c on c.teacher_id=t.id and c.tenant_id=t.tenant_id
left join public.exams e on e.course_id=c.id and e.tenant_id=t.tenant_id
left join public.exam_sessions es on es.exam_id=e.id and es.tenant_id=t.tenant_id
left join public.exam_results er on er.exam_session_id=es.id and er.tenant_id=t.tenant_id
group by t.tenant_id,t.id,u.full_name;

create view public.academic_classroom_analytics with (security_invoker=true) as
select c.tenant_id,c.id as classroom_id,c.name,
 count(distinct sa.student_id) filter(where sa.is_active) as student_count,
 count(distinct es.id) as exam_session_count,
 coalesce(avg(er.score) filter(where er.status in('GRADED','PUBLISHED')),0) as average_score
from public.classrooms c left join public.student_assignments sa on sa.classroom_id=c.id and sa.tenant_id=c.tenant_id
left join public.exam_sessions es on es.classroom_id=c.id and es.tenant_id=c.tenant_id
left join public.exam_results er on er.exam_session_id=es.id and er.tenant_id=c.tenant_id
group by c.tenant_id,c.id,c.name;

create view public.academic_subject_analytics with (security_invoker=true) as
select s.tenant_id,s.id as subject_id,s.code,s.name,
 count(distinct c.id) as course_count,count(distinct er.id) filter(where er.status in('GRADED','PUBLISHED')) as graded_results,
 coalesce(avg(er.score) filter(where er.status in('GRADED','PUBLISHED')),0) as average_score
from public.subjects s left join public.courses c on c.subject_id=s.id and c.tenant_id=s.tenant_id
left join public.exams e on e.course_id=c.id and e.tenant_id=s.tenant_id
left join public.exam_sessions es on es.exam_id=e.id and es.tenant_id=s.tenant_id
left join public.exam_results er on er.exam_session_id=es.id and er.tenant_id=s.tenant_id
group by s.tenant_id,s.id,s.code,s.name;

revoke all on public.academic_student_analytics,public.academic_teacher_analytics,public.academic_classroom_analytics,public.academic_subject_analytics from anon,authenticated;
insert into public.permissions(code,name,description) values('academic_analytics.read','Read academic analytics','View student, teacher, classroom, subject, and performance analytics') on conflict(code) do update set name=excluded.name,description=excluded.description,updated_at=timezone('utc',now());
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in('OWNER','PRINCIPAL','STAFF','TEACHER') and p.code='academic_analytics.read' on conflict do nothing;
