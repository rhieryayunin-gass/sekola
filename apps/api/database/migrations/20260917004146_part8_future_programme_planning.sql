-- Staff may configure a future programme before its first learner-effective day.
-- Student visibility and evidence validation still enforce all effective dates.
create or replace function school_private.curriculum_enrolled(course uuid,subject uuid,student uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses c join public.school_curriculum_subjects cs on cs.id=subject and cs.subject_id=c.subject_id
 join public.school_curriculum_programs p on p.id=cs.program_id and p.academic_year_id=c.academic_year_id and p.is_active and (student is null or ((p.valid_from is null or p.valid_from<=current_date) and (p.valid_until is null or p.valid_until>=current_date)))
 join public.school_curriculum_stages st on st.id=cs.stage_id and st.is_active
 join public.school_curriculum_enrollments e on e.program_id=p.id and e.stage_id=cs.stage_id and e.classroom_id=c.classroom_id and e.is_active
 where c.id=course and cs.is_active and e.participation='INCLUDE' and (student is null or ((e.valid_from is null or e.valid_from<=current_date) and (e.valid_until is null or e.valid_until>=current_date)))
 and (cardinality(e.subject_ids)=0 or subject=any(e.subject_ids)) and (student is null or e.student_id is null or e.student_id=student)
 and (student is null or not exists(select 1 from public.school_curriculum_enrollments x where x.program_id=p.id and x.stage_id=cs.stage_id and x.classroom_id=c.classroom_id and x.student_id=student and x.is_active and x.participation='EXCLUDE' and (x.valid_from is null or x.valid_from<=current_date) and (x.valid_until is null or x.valid_until>=current_date) and (cardinality(x.subject_ids)=0 or subject=any(x.subject_ids)))))
$$;
