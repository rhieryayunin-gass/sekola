-- Narrow read projections: no additional administrative REST grants for families.
create function school_private.family_report(kind text,student uuid,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); result jsonb; begin
 if kind not in ('academic','learning','exams') or page_offset<0 or page_offset>100000 then raise exception 'Invalid report'; end if;
 if not school_private.role(array['STUDENT','PARENT']) or not school_private.child(student) or not exists(select 1 from public.students where id=student and tenant_id=tenant)
 or (kind='academic' and not school_private.role(array['STUDENT']))
 or not exists(select 1 from public.tenants t left join public.school_settings s on s.tenant_id=t.id where t.id=tenant and t.is_active and coalesce(s.modules->kind,'true'::jsonb)='true'::jsonb)
 then raise exception 'Family report access denied' using errcode='42501'; end if;
 if kind='academic' then
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
 select c.id,c.name as title,cl.name as classroom,ay.name as academic_year,se.name as semester,su.name as subject,
 coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'version',p.version,'framework',p.framework)) from public.school_curriculum_course_links l join public.school_curriculum_programs p on p.id=l.program_id where l.course_id=c.id and l.is_active and p.is_active and school_private.curriculum_enrolled(c.id,l.curriculum_subject_id,student)),'[]') as programmes
 from public.courses c join public.classrooms cl on cl.id=c.classroom_id join public.academic_years ay on ay.id=c.academic_year_id join public.semesters se on se.id=c.semester_id join public.subjects su on su.id=c.subject_id
 where c.tenant_id=tenant and c.is_active and exists(select 1 from public.student_assignments a where a.student_id=student and a.tenant_id=tenant and a.classroom_id=c.classroom_id and a.semester_id=c.semester_id and a.is_active)
 order by c.name,c.id limit 100 offset page_offset)q;
 elsif kind='learning' then
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
 select a.id,a.title,c.name as course,a.due_at,s.submitted_at,case when s.reviewed_at is not null then s.score else null end as score,
 a.max_score,case when s.reviewed_at is not null then s.feedback else null end as feedback,
 case when s.reviewed_at is not null then 'REVIEWED' when s.submitted_at is not null then 'SUBMITTED' else 'PENDING' end as status
 from public.assignments a join public.courses c on c.id=a.course_id left join public.submissions s on s.assignment_id=a.id and s.student_id=student and s.tenant_id=tenant
 where a.tenant_id=tenant and a.is_published and exists(select 1 from public.student_assignments sa where sa.student_id=student and sa.classroom_id=c.classroom_id and sa.semester_id=c.semester_id and sa.tenant_id=tenant and sa.is_active)
 order by a.due_at desc nulls last,a.id limit 100 offset page_offset)q;
 else
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
 select es.id,e.title,c.name as course,es.starts_at,es.ends_at,es.status,
 case when r.status='PUBLISHED' then r.score else null end as score,case when r.status='PUBLISHED' then 'PUBLISHED' else 'PENDING' end as result_status
 from public.exam_sessions es join public.exams e on e.id=es.exam_id join public.courses c on c.id=e.course_id left join public.exam_results r on r.exam_session_id=es.id and r.student_id=student and r.tenant_id=tenant
 where es.tenant_id=tenant and e.status in ('PUBLISHED','CLOSED') and (es.student_id is null or es.student_id=student) and exists(select 1 from public.student_assignments sa where sa.student_id=student and sa.classroom_id=es.classroom_id and sa.semester_id=c.semester_id and sa.tenant_id=tenant and sa.is_active)
 order by es.starts_at desc,es.id limit 100 offset page_offset)q;
 end if;
 return jsonb_build_object('rows',result,'student',(select jsonb_build_object('id',s.id,'name',u.full_name,'number',s.student_number) from public.students s join public.users u on u.id=s.user_id where s.id=student and s.tenant_id=tenant),'school',(select name from public.tenants where id=tenant));
end $$;
create function public.school_family_report(kind text,student uuid,page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select school_private.family_report(kind,student,page_offset) $$;
revoke all on function school_private.family_report(text,uuid,integer),public.school_family_report(text,uuid,integer) from public,anon,authenticated;
grant execute on function school_private.family_report(text,uuid,integer),public.school_family_report(text,uuid,integer) to authenticated;

create function school_private.role_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); broad boolean:=school_private.role(array['PRINCIPAL','STAFF']); result jsonb; begin
 result:=school_private.dashboard();
 return result || jsonb_build_object('attendance_trend',coalesce((select jsonb_agg(to_jsonb(q)) from (
 select d::date as day,count(r.id) filter(where r.status in ('PRESENT','LATE')) as present,count(r.id) as recorded
 from generate_series((now() at time zone 'Asia/Jakarta')::date-6,(now() at time zone 'Asia/Jakarta')::date,interval '1 day')d
 left join public.attendance_records r on r.attendance_date=d::date and r.tenant_id=tenant and (broad or school_private.class_teaches(r.classroom_id) or school_private.child(r.student_id))
 group by d order by d)q),'[]'),
 'teaching_courses',(select count(*) from public.courses c where c.tenant_id=tenant and c.is_active and school_private.teaches(c.id)),
 'assignments_to_review',(select count(*) from public.submissions s join public.assignments a on a.id=s.assignment_id where s.tenant_id=tenant and s.submitted_at is not null and s.reviewed_at is null and school_private.teaches(a.course_id)),
 'family_tasks',(select count(*) from public.assignments a join public.courses c on c.id=a.course_id where a.tenant_id=tenant and a.is_published and exists(select 1 from public.student_assignments sa where sa.classroom_id=c.classroom_id and sa.semester_id=c.semester_id and sa.is_active and school_private.child(sa.student_id) and not exists(select 1 from public.submissions su where su.assignment_id=a.id and su.student_id=sa.student_id and su.submitted_at is not null))),
 'family_balance',case when school_private.role(array['PARENT']) then (select coalesce(sum(greatest(0,b.amount-coalesce(p.paid,0))),0) from public.student_bills b left join lateral(select sum(amount) paid from public.payments where student_bill_id=b.id and status='CONFIRMED')p on true where b.tenant_id=tenant and b.status not in ('VOID','DRAFT') and school_private.child(b.student_id)) else null end);
end $$;
create function public.school_role_dashboard() returns jsonb language sql security invoker set search_path='' as $$ select school_private.role_dashboard() $$;
revoke all on function school_private.role_dashboard(),public.school_role_dashboard() from public,anon,authenticated;
grant execute on function school_private.role_dashboard(),public.school_role_dashboard() to authenticated;
