-- Module switches are checked on server operations and authenticated table reads.
create function public.app_module_enabled(actor_id uuid,module_code text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.users u join public.tenants t on t.id=u.tenant_id
 left join public.school_settings s on s.tenant_id=t.id
 where u.id=actor_id and u.is_active and u.deleted_at is null and t.is_active
 and (module_code is null or (module_code in ('core','academic','attendance','connect','learning','exams','finance','team') and coalesce(s.modules->module_code,'true'::jsonb)='true'::jsonb)))
$$;
revoke all on function public.app_module_enabled(uuid,text) from public,anon,authenticated;
grant execute on function public.app_module_enabled(uuid,text) to service_role;

create function school_private.module_enabled(module_code text) returns boolean language sql stable security definer set search_path='' as $$ select public.app_module_enabled(auth.uid(),module_code) $$;
revoke all on function school_private.module_enabled(text) from public,anon;
grant execute on function school_private.module_enabled(text) to authenticated;
create or replace function school_private.require_module(module_code text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not school_private.module_enabled(module_code) then raise exception 'This module is disabled for the school' using errcode='42501'; end if;
end $$;

-- Revocation of a tenant or account also stops reads made through legacy RLS policies.
create or replace function public.current_tenant_id() returns uuid language sql stable security definer set search_path='' as $$
 select u.tenant_id from public.users u join public.tenants t on t.id=u.tenant_id where u.id=auth.uid() and u.is_active and u.deleted_at is null and t.is_active
$$;

create or replace function public.app_tenant(actor_id uuid) returns uuid language plpgsql stable set search_path='' as $$
declare result uuid; begin
 select u.tenant_id into result from public.users u join public.tenants t on t.id=u.tenant_id where u.id=actor_id and u.is_active and u.deleted_at is null and t.is_active;
 if result is null then raise exception 'Active tenant account required' using errcode='42501'; end if;
 return result;
end $$;

create or replace function public.app_has_permission(actor_id uuid,permission_code text) returns boolean language sql stable set search_path='' as $$
 select public.app_module_enabled(actor_id,case
 when split_part(permission_code,'.',1) in ('academic_years','semesters','classrooms','subjects','teacher_assignments','student_assignments','academic_analytics') then 'academic'
 when split_part(permission_code,'.',1) in ('teachers','students','users','rooms','room_bookings','approvals','leave_requests','schedule_changes','calendar','audit') then 'core'
 when split_part(permission_code,'.',1) in ('attendance','attendance_qr','attendance_analytics') then 'attendance'
 when split_part(permission_code,'.',1) in ('courses','lessons','assignments','submissions') then 'learning'
 when split_part(permission_code,'.',1) in ('exams','exam_questions','exam_sessions','exam_results','exam_analytics') then 'exams'
 when split_part(permission_code,'.',1) in ('finance_accounts','finance_categories','finance_periods','finance_reports','billing','payments','finance_analytics') then 'finance'
 when split_part(permission_code,'.',1) like 'team_%' then 'team'
 when split_part(permission_code,'.',1)='connect' then 'connect' end)
 and exists(select 1 from public.users u join public.role_permissions rp on rp.role_id in (
 select ur.role_id from public.user_roles ur where ur.user_id=u.id union select lr.role_id from public.user_level_roles lr where lr.user_level_id=u.user_level_id)
 join public.permissions p on p.id=rp.permission_id join public.roles r on r.id=rp.role_id and r.is_active
 where u.id=actor_id and u.is_active and p.code=permission_code)
$$;

-- Catalogs are also callable directly; protect the private entry, not only its wrapper.
alter function school_private.catalog(text,integer) rename to catalog_before_part3;
revoke all on function school_private.catalog_before_part3(text,integer) from public,anon,authenticated;
create function school_private.catalog(resource text,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform school_private.require_module(case when resource in ('courses','lessons','assignments') then 'learning' when resource in ('users','rooms','students','teachers') then 'core' else 'academic' end);
 return school_private.catalog_before_part3(resource,page_offset);
end $$;
revoke all on function school_private.catalog(text,integer) from public,anon;
grant execute on function school_private.catalog(text,integer) to authenticated;

-- Existing table grants are unchanged. Restrictive policies intersect with tenant/role RLS.
do $$ declare mapping record; begin
 for mapping in select * from (values
 ('school_alumni','core'),('school_assets','core'),('school_canteens','core'),('school_guardians','core'),
 ('rooms','core'),('room_bookings','core'),('leave_requests','core'),('schedule_changes','core'),
 ('academic_years','academic'),('semesters','academic'),('classrooms','academic'),('subjects','academic'),('teacher_assignments','academic'),('student_assignments','academic'),('school_timetable','academic'),
 ('courses','learning'),('lessons','learning'),('assignments','learning'),('submissions','learning'),('school_library','learning'),
 ('school_question_sets','learning'),('school_question_items','learning'),
 ('attendance_records','attendance'),('school_attendance_sessions','attendance'),('school_attendance_devices','attendance'),
 ('exams','exams'),('exam_questions','exams'),('exam_sessions','exams'),('exam_results','exams'),('school_exam_attempts','exams'),
 ('finance_accounts','finance'),('finance_categories','finance'),('finance_periods','finance'),('student_bills','finance'),('payments','finance'),
 ('team_projects','team'),('team_tasks','team'),('team_project_members','team')
 ) as m(table_name,module_name) loop
  if to_regclass('public.'||mapping.table_name) is not null then
   execute format('create policy module_access_part3 on public.%I as restrictive for all to authenticated using(school_private.module_enabled(%L)) with check(school_private.module_enabled(%L))',mapping.table_name,mapping.module_name,mapping.module_name);
  end if;
 end loop;
end $$;
