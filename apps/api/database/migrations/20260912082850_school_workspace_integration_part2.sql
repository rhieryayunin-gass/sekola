-- Read-only projections for role dashboards and shared calendar/finance views.
create function school_private.dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); staff boolean:=school_private.staff(); educator boolean:=school_private.role(array['TEACHER']); begin
 return jsonb_build_object(
 'school', (select name from public.tenants where id=tenant),
 'students',(select count(*) from public.students s where s.tenant_id=tenant and (staff or school_private.child(s.id) or (educator and exists(select 1 from public.student_assignments a where a.student_id=s.id and school_private.class_teaches(a.classroom_id))))),
 'teachers',case when staff then (select count(*) from public.teachers where tenant_id=tenant and employment_status='ACTIVE') else null end,
 'classes',(select count(*) from public.classrooms c where c.tenant_id=tenant and (staff or school_private.class_teaches(c.id) or exists(select 1 from public.student_assignments a where a.classroom_id=c.id and school_private.child(a.student_id)))),
 'attendance_today',(select count(*) from public.attendance_records r where r.tenant_id=tenant and r.attendance_date=(now() at time zone 'Asia/Jakarta')::date and r.status in ('PRESENT','LATE') and (staff or school_private.class_teaches(r.classroom_id) or school_private.child(r.student_id))),
 'pending_approvals',case when public.app_has_permission(auth.uid(),'approvals.read') then public.list_my_approvals(auth.uid(),0,100) else null end,
 'children',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',u.full_name,'number',s.student_number,'attendance',(select r.status from public.attendance_records r where r.student_id=s.id and r.attendance_date=(now() at time zone 'Asia/Jakarta')::date and r.tenant_id=tenant))) from public.students s join public.users u on u.id=s.user_id where s.tenant_id=tenant and school_private.child(s.id)),'[]'),
 'tenants',case when school_private.owner() then coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'is_active',t.is_active,'plan_code',coalesce(s.plan_code,'ESSENTIAL'),'modules',coalesce(s.modules,'{"core":true,"academic":true,"attendance":true,"connect":true,"learning":true,"exams":true,"finance":true,"team":true}'),'users',(select count(*) from public.users u where u.tenant_id=t.id and u.is_active))) from public.tenants t left join public.school_settings s on s.tenant_id=t.id),'[]') else '[]'::jsonb end
 );
end $$;
create function public.school_dashboard() returns jsonb language sql security invoker set search_path='' as $$ select school_private.dashboard() $$;

create function school_private.finance_report(resource text,date_from date,date_to date,query text default '',status_filter text default '',page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); admin boolean:=school_private.staff() and public.app_has_permission(auth.uid(),'finance_reports.read'); result jsonb; begin
 perform school_private.require_module('finance');
 if date_from is null or date_to is null or date_to<date_from or date_to-date_from>3660 or length(query)>200 then raise exception 'Choose a valid report range'; end if;
 if not admin and not school_private.role(array['PARENT','STUDENT']) then raise exception 'Finance access required' using errcode='42501'; end if;
 if resource='bills' then
 with matching as (select b.id,b.invoice_number,u.full_name as student_name,b.amount,b.due_date,b.status,coalesce(p.paid,0) as paid_amount,b.amount-coalesce(p.paid,0) as outstanding_amount from public.student_bills b join public.students s on s.id=b.student_id join public.users u on u.id=s.user_id left join lateral(select sum(amount) as paid from public.payments where student_bill_id=b.id and status='CONFIRMED')p on true where b.tenant_id=tenant and (admin or school_private.child(s.id)) and b.due_date between date_from and date_to and (status_filter='' or b.status=status_filter) and (query='' or b.invoice_number ilike '%'||query||'%' or u.full_name ilike '%'||query||'%'))
 select jsonb_build_object('count',(select count(*) from matching),'total',(select coalesce(sum(amount) filter(where status<>'VOID'),0) from matching),'paid',(select coalesce(sum(paid_amount),0) from matching),'outstanding',(select coalesce(sum(outstanding_amount) filter(where status not in ('VOID','DRAFT')),0) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(q)) from (select * from matching order by due_date desc,id limit 100 offset greatest(page_offset,0))q),'[]')) into result;
 elsif resource='payments' then
 with matching as (select p.id,p.receipt_number,b.invoice_number,u.full_name as student_name,p.amount,p.paid_at,p.status,p.reference from public.payments p join public.student_bills b on b.id=p.student_bill_id join public.students s on s.id=b.student_id join public.users u on u.id=s.user_id where p.tenant_id=tenant and (admin or school_private.child(s.id)) and (p.paid_at at time zone 'Asia/Jakarta')::date between date_from and date_to and (status_filter='' or p.status=status_filter) and (query='' or p.receipt_number ilike '%'||query||'%' or b.invoice_number ilike '%'||query||'%' or u.full_name ilike '%'||query||'%'))
 select jsonb_build_object('count',(select count(*) from matching),'total',(select coalesce(sum(amount) filter(where status='CONFIRMED'),0) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(q)) from (select * from matching order by paid_at desc,id limit 100 offset greatest(page_offset,0))q),'[]')) into result;
 else raise exception 'Unsupported report'; end if;
 return result;
end $$;
create function public.school_finance_report(resource text,date_from date,date_to date,query text default '',status_filter text default '',page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select school_private.finance_report(resource,date_from,date_to,query,status_filter,page_offset) $$;

create function school_private.finance_options(resource text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); result jsonb; begin
 perform school_private.require_module('finance');
 if not school_private.staff() or resource not in ('finance_accounts','finance_categories','finance_periods','student_bills') then raise exception 'Finance administrator required' using errcode='42501'; end if;
 if resource='student_bills' then select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.invoice_number||' · '||coalesce(u.full_name,s.student_number))),'[]') into result from public.student_bills b join public.students s on s.id=b.student_id join public.users u on u.id=s.user_id where b.tenant_id=tenant and b.status not in ('VOID','PAID');
 else execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',r.id,''name'',r.name)),''[]'') from public.%I r where r.tenant_id=$1',resource) into result using tenant; end if;
 return result;
end $$;
create function public.school_finance_options(resource text) returns jsonb language sql security invoker set search_path='' as $$ select school_private.finance_options(resource) $$;

create function school_private.calendar_context(starts timestamptz,ends timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); begin
 if not public.app_has_permission(auth.uid(),'calendar.read') then raise exception 'Calendar access required' using errcode='42501'; end if;
 if ends<=starts or ends-starts>interval '370 days' then raise exception 'Calendar range too large'; end if;
 return jsonb_build_object('calendars',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'owner_user_id',c.owner_user_id,'integration_managed',c.integration_managed,'can_edit',c.owner_user_id=auth.uid() and not c.integration_managed)) from public.calendars c where c.tenant_id=tenant and c.is_active and (not c.integration_managed or c.owner_user_id=auth.uid())),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(q)) from (select e.* from public.calendar_events e join public.calendars c on c.id=e.calendar_id where c.tenant_id=tenant and c.is_active and (not c.integration_managed or c.owner_user_id=auth.uid()) and ((e.starts_at<ends and coalesce(e.ends_at,e.starts_at)>=starts) or (e.recurrence_rule is not null and e.starts_at<ends)) order by e.starts_at limit 2000)q),'[]'));
end $$;
create function public.school_calendar_context(starts timestamptz,ends timestamptz) returns jsonb language sql security invoker set search_path='' as $$ select school_private.calendar_context(starts,ends) $$;

-- Add linked guardians to existing transactional notifications and calendars.
alter function public.integration_recipients(text,jsonb) rename to integration_recipients_before_guardians;
create function public.integration_recipients(source text,row_data jsonb) returns setof uuid language plpgsql stable set search_path='' as $$
declare tenant uuid:=(row_data->>'tenant_id')::uuid; student uuid:=(row_data->>'student_id')::uuid; course uuid:=(row_data->>'course_id')::uuid; begin
 if source='payments' then select b.student_id into student from public.student_bills b where b.id=(row_data->>'student_bill_id')::uuid and b.tenant_id=tenant; end if;
 if source='exam_sessions' then select e.course_id into course from public.exams e where e.id=(row_data->>'exam_id')::uuid and e.tenant_id=tenant; end if;
 return query select public.integration_recipients_before_guardians(source,row_data)
 union select g.parent_user_id from public.school_guardians g join public.users u on u.id=g.parent_user_id where g.tenant_id=tenant and u.tenant_id=tenant and u.is_active and (
 g.student_id=student or (source in ('lessons','assignments','exams','exam_sessions') and exists(select 1 from public.courses c join public.student_assignments a on a.classroom_id=c.classroom_id and a.semester_id=c.semester_id where c.id=course and a.student_id=g.student_id and a.is_active)));
end $$;
revoke all on function public.integration_recipients(text,jsonb) from public,anon,authenticated;

create table public.school_project_committees (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),project_id uuid not null references public.team_projects(id) on delete cascade,
 user_id uuid not null references public.users(id),position text not null check(position in ('CHAIR','SECRETARY','TREASURER','COORDINATOR','MEMBER')),
 created_at timestamptz not null default now(),unique(project_id,position,user_id)
);
create index school_committee_project on public.school_project_committees(project_id);
alter table public.school_project_committees enable row level security;
revoke all on public.school_project_committees from anon,authenticated;
create trigger tenant_integrity before insert or update on public.school_project_committees for each row execute function public.enforce_tenant_relations('{"project_id":"team_projects","user_id":"users"}');
create function school_private.project_template(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); project uuid; role_key text; member uuid; task text; template text:=payload->>'template'; tasks text[]; begin
 perform school_private.require_module('team');
 if not public.app_has_permission(auth.uid(),'team_projects.create') then raise exception 'Project creation permission required' using errcode='42501'; end if;
 foreach role_key in array array['CHAIR','SECRETARY','TREASURER'] loop
 member:=(payload->'committee'->>role_key)::uuid;
 if member is null or not exists(select 1 from public.users where id=member and tenant_id=tenant and is_active) then raise exception 'Assign an active chair, secretary and treasurer from this school'; end if;
 end loop;
 tasks:=case template when 'GRADUATION' then array['Susun konsep kelulusan','Verifikasi data peserta','Siapkan anggaran dan vendor','Koordinasikan undangan orang tua','Gladi bersih','Dokumentasi dan evaluasi'] when 'OPEN_HOUSE' then array['Tentukan agenda dan narasumber','Siapkan publikasi','Daftar peserta dan undangan','Siapkan booth kelas','Evaluasi dan tindak lanjut'] when 'SCHOOL_TRIP' then array['Susun tujuan pembelajaran','Persetujuan orang tua','Anggaran dan transportasi','Pembagian pendamping','Rencana keselamatan','Laporan kegiatan'] when 'SPORTS_DAY' then array['Susun cabang lomba','Daftar peserta','Jadwal dan lapangan','Perlengkapan dan petugas','Dokumentasi dan evaluasi'] when 'CUSTOM' then array['Susun rencana kegiatan','Setujui anggaran','Laksanakan kegiatan','Evaluasi dan laporan'] else null end;
 if tasks is null then raise exception 'Select a project template'; end if;
 insert into public.team_projects(tenant_id,code,name,description,owner_user_id,created_by_user_id,starts_on,due_on) values(tenant,upper(payload->>'code'),payload->>'name',payload->>'description',(payload->'committee'->>'CHAIR')::uuid,auth.uid(),(payload->>'starts_on')::date,(payload->>'due_on')::date) returning id into project;
 insert into public.team_project_settings(project_id,tenant_id,metadata) values(project,tenant,jsonb_build_object('template',template));
 insert into public.team_project_members(tenant_id,project_id,user_id,member_role) values(tenant,project,auth.uid(),'MANAGER') on conflict(project_id,user_id) do nothing;
 foreach role_key in array array['CHAIR','SECRETARY','TREASURER'] loop
 member:=(payload->'committee'->>role_key)::uuid;
 insert into public.school_project_committees(tenant_id,project_id,user_id,position) values(tenant,project,member,role_key);
 insert into public.team_project_members(tenant_id,project_id,user_id,member_role) values(tenant,project,member,case when role_key='CHAIR' then 'OWNER' else 'MANAGER' end) on conflict(project_id,user_id) do update set member_role=case when excluded.member_role='OWNER' then 'OWNER' else team_project_members.member_role end;
 end loop;
 foreach task in array tasks loop insert into public.team_tasks(tenant_id,project_id,title,reporter_user_id,assignee_user_id) values(tenant,project,task,auth.uid(),(payload->'committee'->>'CHAIR')::uuid); end loop;
 return jsonb_build_object('id',project,'tasks',array_length(tasks,1));
end $$;
create function public.school_project_template(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select school_private.project_template(payload) $$;
create function school_private.committee(project_uuid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.team_projects p where p.id=project_uuid and p.tenant_id=school_private.tenant() and (p.owner_user_id=auth.uid() or exists(select 1 from public.team_project_members m where m.project_id=p.id and m.user_id=auth.uid()))) then raise exception 'Project membership required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'position',c.position,'name',u.full_name,'user_id',u.id)) from public.school_project_committees c join public.users u on u.id=c.user_id where c.project_id=project_uuid),'[]');
end $$;
create function public.school_committee(project_uuid uuid) returns jsonb language sql security invoker set search_path='' as $$ select school_private.committee(project_uuid) $$;

revoke all on function school_private.dashboard(),school_private.finance_report(text,date,date,text,text,integer),school_private.finance_options(text),school_private.calendar_context(timestamptz,timestamptz),school_private.project_template(jsonb),school_private.committee(uuid),public.school_dashboard(),public.school_finance_report(text,date,date,text,text,integer),public.school_finance_options(text),public.school_calendar_context(timestamptz,timestamptz),public.school_project_template(jsonb),public.school_committee(uuid) from public,anon,authenticated;
grant execute on function school_private.dashboard(),school_private.finance_report(text,date,date,text,text,integer),school_private.finance_options(text),school_private.calendar_context(timestamptz,timestamptz),school_private.project_template(jsonb),school_private.committee(uuid),public.school_dashboard(),public.school_finance_report(text,date,date,text,text,integer),public.school_finance_options(text),public.school_calendar_context(timestamptz,timestamptz),public.school_project_template(jsonb),public.school_committee(uuid) to authenticated;

-- Principals manage school photos without granting tenant-settings ownership.
create or replace function osekola_private.media_context() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'user_id',u.id,'tenant_id',t.id,'tenant_name',t.name,
    'can_manage_media',school_private.role(array['OWNER','PRINCIPAL']),
    'is_owner',exists(select 1 from public.roles r where r.is_active and r.code='OWNER' and r.id in(
      select ur.role_id from public.user_roles ur where ur.user_id=u.id
      union select lr.role_id from public.user_level_roles lr where lr.user_level_id=u.user_level_id)),
    'is_platform_admin',exists(select 1 from public.user_levels l where l.id=u.user_level_id and l.code='platform_admin' and l.is_active),
    'can_upload_learning',exists(select 1 from public.roles r where r.is_active and r.code in('OWNER','PRINCIPAL','TEACHER') and r.id in(
      select ur.role_id from public.user_roles ur where ur.user_id=u.id
      union select lr.role_id from public.user_level_roles lr where lr.user_level_id=u.user_level_id)))
  from public.users u left join public.tenants t on t.id=u.tenant_id and t.is_active
  where auth.uid() is not null and u.id=auth.uid() and u.is_active;
$$;
create or replace function osekola_private.can_write_media(bucket text, path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare ctx jsonb:=osekola_private.media_context(); parts text[]:=string_to_array(path,'/');
begin
  if auth.uid() is null or ctx is null then return false; end if;
  if bucket='platform-media' then
    return path='brand/osekola-logo' and coalesce((ctx->>'is_platform_admin')::boolean,false);
  end if;
  if ctx->>'tenant_id' is null or parts[1] is distinct from ctx->>'tenant_id' then return false; end if;
  if bucket='tenant-media' then
    if parts[2]='logos' then return cardinality(parts)=3 and parts[3]='logo' and (ctx->>'can_manage_media')::boolean; end if;
    if parts[2]='avatars' then
      return cardinality(parts)=3 and (parts[3]=ctx->>'user_id' or (ctx->>'can_manage_media')::boolean)
        and exists(select 1 from public.users u where u.id::text=parts[3] and u.tenant_id::text=ctx->>'tenant_id' and u.is_active);
    end if;
    if parts[2]='gallery' then return cardinality(parts)=3 and parts[3] ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$' and (ctx->>'can_manage_media')::boolean; end if;
  end if;
  if bucket='tenant-learning' then
    return cardinality(parts)=4 and parts[2]='learning' and parts[4] ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$'
      and ((ctx->>'can_manage_media')::boolean or ((ctx->>'can_upload_learning')::boolean and parts[3]=ctx->>'user_id'))
      and exists(select 1 from public.users u where u.id::text=parts[3] and u.tenant_id::text=ctx->>'tenant_id' and u.is_active);
  end if;
  return false;
end $$;

update storage.buckets set allowed_mime_types=array['image/png','image/jpeg','image/webp','application/pdf','video/mp4','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] where id='tenant-learning';

-- Keep newly written hierarchy links consistent within the selected school year.
create function school_private.check_hierarchy() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=to_jsonb(new); classroom uuid; semester uuid; course uuid; lesson uuid; subject uuid; expected_year uuid; actual_year uuid; begin
 classroom:=(row_data->>'classroom_id')::uuid; semester:=(row_data->>'semester_id')::uuid;
 course:=(row_data->>'course_id')::uuid; lesson:=(row_data->>'lesson_id')::uuid; subject:=(row_data->>'subject_id')::uuid;
 if classroom is not null and semester is not null then
 select academic_year_id into expected_year from public.classrooms where id=classroom;
 select academic_year_id into actual_year from public.semesters where id=semester;
 if expected_year is distinct from actual_year or (row_data ? 'academic_year_id' and expected_year is distinct from (row_data->>'academic_year_id')::uuid) then raise exception 'Classroom, semester and academic year must match' using errcode='23514'; end if;
 end if;
 if course is not null and subject is not null and not exists(select 1 from public.courses where id=course and subject_id=subject) then raise exception 'Choose a course from the selected subject' using errcode='23514'; end if;
 if lesson is not null and (course is null or not exists(select 1 from public.lessons where id=lesson and course_id=course)) then raise exception 'Choose a lesson from the selected course' using errcode='23514'; end if;
 if tg_table_name='school_question_sets' and (row_data->>'assignment_id') is not null and not exists(select 1 from public.assignments where id=(row_data->>'assignment_id')::uuid and course_id=course) then raise exception 'Choose an assignment from the selected course' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function school_private.check_hierarchy() from public,anon,authenticated;
create trigger school_hierarchy before insert or update of classroom_id,semester_id,academic_year_id on public.courses for each row execute function school_private.check_hierarchy();
create trigger school_hierarchy before insert or update of classroom_id,semester_id,academic_year_id on public.teacher_assignments for each row execute function school_private.check_hierarchy();
create trigger school_hierarchy before insert or update of classroom_id,semester_id,academic_year_id on public.student_assignments for each row execute function school_private.check_hierarchy();
create trigger school_hierarchy before insert or update of classroom_id,semester_id on public.school_timetable for each row execute function school_private.check_hierarchy();
create trigger school_hierarchy before insert or update of course_id,subject_id,lesson_id on public.school_library for each row execute function school_private.check_hierarchy();
create trigger school_hierarchy before insert or update of course_id,lesson_id,assignment_id on public.school_question_sets for each row execute function school_private.check_hierarchy();
