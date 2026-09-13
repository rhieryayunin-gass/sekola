-- Part 4: authoritative role limits intersect with tenant switches and grants.
create function public.app_role_in(actor_id uuid,codes text[]) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.users u join public.roles r on r.id in (
 select role_id from public.user_roles where user_id=u.id union
 select role_id from public.user_level_roles where user_level_id=u.user_level_id)
 where u.id=actor_id and u.is_active and u.deleted_at is null and r.is_active and r.code=any(codes))
$$;
revoke all on function public.app_role_in(uuid,text[]) from public,anon,authenticated;
grant execute on function public.app_role_in(uuid,text[]) to service_role;
create or replace function public.app_module_enabled(actor_id uuid,module_code text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.users u join public.tenants t on t.id=u.tenant_id
 left join public.school_settings s on s.tenant_id=t.id
 where u.id=actor_id and u.is_active and u.deleted_at is null and t.is_active
 and (module_code is null or (module_code in ('core','academic','attendance','connect','learning','exams','finance','team') and coalesce(s.modules->module_code,'true'::jsonb)='true'::jsonb))
 and case when module_code='academic' then public.app_role_in(actor_id,array['STAFF','TEACHER'])
 when module_code in ('learning','exams') then public.app_role_in(actor_id,array['TEACHER','STUDENT']) else true end)
$$;
create or replace function school_private.require_module(module_code text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not school_private.module_enabled(module_code) then raise exception 'This module is unavailable for your role or school' using errcode='42501'; end if;
end $$;

-- These private RPCs previously relied on school administrators as teachers.
create or replace function school_private.teaches(course uuid) returns boolean language sql stable security definer set search_path='' as $$
 select school_private.role(array['TEACHER']) and exists(select 1 from public.courses c join public.teachers t on t.id=c.teacher_id
 where c.id=course and c.tenant_id=school_private.tenant() and t.user_id=auth.uid() and t.employment_status='ACTIVE')
$$;
create or replace function school_private.ai_finish(request_id uuid,items jsonb,usage_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare generation public.school_ai_generations; item jsonb; count integer:=0; begin
 perform school_private.require_module('learning');
 select * into generation from public.school_ai_generations where id=request_id and tenant_id=school_private.tenant() and user_id=auth.uid() for update;
 if generation.id is null then raise exception 'Generation not found' using errcode='42501'; end if;
 if generation.status<>'RESERVED' then return jsonb_build_object('id',request_id,'status',generation.status); end if;
 if items is not null then
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)<>generation.requested_count then raise exception 'Unexpected question count'; end if;
 if usage_data->>'replace_id' is not null and (generation.requested_count<>1 or not exists(select 1 from public.school_question_items where id=(usage_data->>'replace_id')::uuid and set_id=generation.set_id and tenant_id=generation.tenant_id)) then raise exception 'Invalid question replacement'; end if;
 for item in select value from jsonb_array_elements(items) loop
 perform school_private.question_save('item',item||jsonb_build_object('set_id',generation.set_id,'source','AI','review_status','DRAFT'),(usage_data->>'replace_id')::uuid); count:=count+1;
 end loop; end if;
 update public.school_ai_generations set status=case when items is null then 'FAILED' else 'COMPLETED' end,model=left(usage_data->>'model',120),input_tokens=greatest(0,(usage_data->>'input_tokens')::integer),output_tokens=greatest(0,(usage_data->>'output_tokens')::integer),completed_at=now() where id=request_id;
 return jsonb_build_object('id',request_id,'saved',count);
end $$;
create or replace function school_private.exam_attempts(exam_uuid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform school_private.require_module('exams');
 if not exists(select 1 from public.exams e where e.id=exam_uuid and e.tenant_id=school_private.tenant() and school_private.teaches(e.course_id)) then raise exception 'Teacher access required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select a.id,a.student_id,u.full_name,a.status,a.score,a.saved_at,a.submitted_at from public.school_exam_attempts a join public.users u on u.id=a.user_id where a.exam_id=exam_uuid order by u.full_name limit 5000)q),'[]');
end $$;
create or replace function school_private.exam_grade(attempt_uuid uuid,final_score numeric,note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.school_exam_attempts; begin
 perform school_private.require_module('exams');
 select a.* into attempt from public.school_exam_attempts a join public.exams e on e.id=a.exam_id where a.id=attempt_uuid and a.tenant_id=school_private.tenant() and school_private.teaches(e.course_id) for update of a;
 if attempt.id is null or attempt.status='IN_PROGRESS' or not public.app_has_permission(auth.uid(),'exam_results.update') then raise exception 'Submitted attempt and grading permission required' using errcode='42501'; end if;
 if final_score is null or final_score not between 0 and 100 or length(note)>10000 then raise exception 'Invalid grade'; end if;
 update public.school_exam_attempts set score=final_score,feedback=note,status='GRADED' where id=attempt.id;
 update public.exam_results set score=final_score,status='PUBLISHED',graded_at=now() where exam_session_id=attempt.session_id and student_id=attempt.student_id and tenant_id=attempt.tenant_id;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(attempt.tenant_id,auth.uid(),'UPDATE','exams','school_exam_attempts',attempt.id,jsonb_build_object('score',final_score));
 return jsonb_build_object('id',attempt.id,'score',final_score);
end $$;

-- School date notifications remain shared Core calendar infrastructure.
create or replace function public.integration_recipients_before_guardians(source text, row_data jsonb) returns setof uuid
language plpgsql stable set search_path='' as $$
declare tenant uuid := (row_data->>'tenant_id')::uuid; course uuid; project uuid; student uuid; teacher uuid;
begin
  course := (row_data->>'course_id')::uuid;
  project := (row_data->>'project_id')::uuid;
  student := (row_data->>'student_id')::uuid;
  teacher := (row_data->>'teacher_id')::uuid;
  if source='courses' then course := (row_data->>'id')::uuid; end if;
  if source='team_projects' then project := (row_data->>'id')::uuid; end if;
  if source='submissions' then select a.course_id into course from public.assignments a where a.id=(row_data->>'assignment_id')::uuid and a.tenant_id=tenant; end if;
  if source='exam_sessions' then select e.course_id into course from public.exams e where e.id=(row_data->>'exam_id')::uuid and e.tenant_id=tenant; end if;
  if source='payments' then select b.student_id into student from public.student_bills b where b.id=(row_data->>'student_bill_id')::uuid and b.tenant_id=tenant; end if;
  return query select distinct u.id from public.users u where u.tenant_id=tenant and u.is_active and (
    (source in('academic_years','semesters') and public.app_has_permission(u.id,'calendar.read'))
    or u.id in(select s.user_id from public.students s where s.id=student and s.tenant_id=tenant)
    or u.id in(select t.user_id from public.teachers t where t.id=teacher and t.tenant_id=tenant)
    or u.id in(select t.user_id from public.courses c join public.teachers t on t.id=c.teacher_id and t.tenant_id=c.tenant_id where c.id=course and c.tenant_id=tenant)
    or (source in('courses','lessons','assignments','exams','exam_sessions') and u.id in(
      select s.user_id from public.courses c join public.student_assignments a on a.classroom_id=c.classroom_id and a.semester_id=c.semester_id and a.tenant_id=c.tenant_id
        join public.students s on s.id=a.student_id and s.tenant_id=a.tenant_id where c.id=course and c.tenant_id=tenant and a.is_active))
    or (project is not null and u.id in(select p.owner_user_id from public.team_projects p where p.id=project and p.tenant_id=tenant))
    or (source in('team_tasks','team_task_comments') and u.id=(row_data->>'assignee_user_id')::uuid)
    or (source='team_tasks' and u.id=(row_data->>'reporter_user_id')::uuid)
  );
end $$;

-- Teacher can read Academic setup; existing write grants are not broadened.
insert into public.role_permissions(role_id,permission_id)
 select r.id,p.id from public.roles r cross join public.permissions p where r.code='TEACHER'
 and p.code in ('academic_years.read','semesters.read','classrooms.read','subjects.read','teacher_assignments.read','student_assignments.read') on conflict do nothing;
-- Participation uses the student-scoped exam RPC, not the administrative REST list.
insert into public.permissions(code,name,description) values('exams.participate','Participate in exams','Use the assigned-class exam workspace') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
 select r.id,p.id from public.roles r cross join public.permissions p where r.code in ('TEACHER','STUDENT') and p.code='exams.participate' on conflict do nothing;
