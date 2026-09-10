-- Phase 51: synchronous transactional integrations, keyed by source (no duplicate events).
alter table public.calendars add column integration_managed boolean not null default false;
create unique index calendars_integration_owner on public.calendars(tenant_id,owner_user_id) where integration_managed;
alter table public.calendar_events add column source_table text, add column source_id uuid;
create unique index calendar_event_source on public.calendar_events(calendar_id,source_table,source_id);
-- Shared manual calendars retain their existing scope. Integration calendars
-- contain recipient-specific tasks/deadlines and are readable only by the owner.
drop policy calendars_select_tenant on public.calendars;
create policy calendars_select_tenant on public.calendars for select to authenticated
  using(tenant_id=public.current_tenant_id() and (not integration_managed or owner_user_id=auth.uid()));
drop policy calendar_events_select_tenant on public.calendar_events;
create policy calendar_events_select_tenant on public.calendar_events for select to authenticated
  using(exists(select 1 from public.calendars c where c.id=calendar_events.calendar_id and c.tenant_id=public.current_tenant_id() and (not c.integration_managed or c.owner_user_id=auth.uid())));

create function public.integration_recipients(source text, row_data jsonb) returns setof uuid
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
    (source in('academic_years','semesters') and public.app_has_permission(u.id,source||'.read'))
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
revoke all on function public.integration_recipients(text,jsonb) from public,anon,authenticated;

create function public.sync_cross_module_record() returns trigger
language plpgsql set search_path='' as $$
declare row_data jsonb; recipient uuid; cal uuid; starts timestamptz; ends timestamptz;
  label text; active boolean := true; tenant uuid; record_key uuid;
begin
  row_data := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  tenant := (row_data->>'tenant_id')::uuid; record_key := (row_data->>'id')::uuid;
  if tg_op='UPDATE' and (row_data-'updated_at')=(to_jsonb(old)-'updated_at') then return new; end if;
  if tg_op='DELETE' then
    delete from public.calendar_events e using public.calendars c where c.id=e.calendar_id and c.tenant_id=tenant and e.source_table=tg_table_name and e.source_id=record_key;
    return old;
  end if;
  label := coalesce(row_data->>'title',row_data->>'name',row_data->>'invoice_number',row_data->>'receipt_number',replace(tg_table_name,'_',' '));
  case tg_table_name
    when 'academic_years','semesters' then starts:=(row_data->>'starts_on')::date; ends:=(row_data->>'ends_on')::date+1; active:=coalesce((row_data->>'is_active')::boolean,false);
    when 'lessons' then starts:=(row_data->>'scheduled_at')::timestamptz; active:=coalesce((row_data->>'is_published')::boolean,false);
    when 'assignments' then starts:=(row_data->>'due_at')::timestamptz; active:=coalesce((row_data->>'is_published')::boolean,false);
    when 'exams' then starts:=(row_data->>'starts_at')::timestamptz; ends:=(row_data->>'ends_at')::timestamptz; active:=row_data->>'status'='PUBLISHED';
    when 'exam_sessions' then starts:=(row_data->>'starts_at')::timestamptz; ends:=(row_data->>'ends_at')::timestamptz; active:=row_data->>'status'<>'CLOSED';
    when 'team_tasks' then starts:=(row_data->>'due_date')::date; active:=row_data->>'status'<>'DONE';
    when 'team_projects' then starts:=(row_data->>'due_on')::date; active:=row_data->>'status' not in('COMPLETED','ARCHIVED');
    when 'exam_results' then active:=row_data->>'status'='PUBLISHED';
    when 'student_bills','team_project_invoices' then active:=row_data->>'status' not in('DRAFT','VOID');
    when 'payments','team_project_payments' then active:=row_data->>'status'='CONFIRMED';
    else null;
  end case;
  -- Remove obsolete dates/recipients when unpublished, reassigned, or unscheduled.
  delete from public.calendar_events e using public.calendars c
    where c.id=e.calendar_id and c.tenant_id=tenant and e.source_table=tg_table_name and e.source_id=record_key
      and (not active or starts is null or c.owner_user_id not in(select public.integration_recipients(tg_table_name,row_data)));
  if not active then return new; end if;
  for recipient in select public.integration_recipients(tg_table_name,row_data) loop
    if starts is not null then
      insert into public.calendars(tenant_id,owner_user_id,name,integration_managed)
        values(tenant,recipient,'atsekola integrated calendar',true)
        on conflict(tenant_id,owner_user_id) where integration_managed do update set is_active=true returning id into cal;
      insert into public.calendar_events(calendar_id,title,starts_at,ends_at,event_type,source_table,source_id)
        values(cal,label,starts,coalesce(ends,starts),'DEADLINE',tg_table_name,record_key)
        on conflict(calendar_id,source_table,source_id) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at;
    end if;
    -- Do not disclose grades, medical reasons, or amounts in notification previews.
    if tg_table_name not like 'team_%' or not exists(select 1 from public.team_project_settings s where s.project_id=coalesce((row_data->>'project_id')::uuid,record_key) and s.tenant_id=tenant and not s.notifications_enabled) then
      insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id)
        values(tenant,recipient,'INFO','atsekola: '||replace(tg_table_name,'_',' ')||' updated','Open the module to view the latest details.',tg_table_name,record_key);
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.sync_cross_module_record() from public,anon,authenticated;
do $$ declare resource text; begin
  foreach resource in array array['academic_years','semesters','courses','lessons','assignments','submissions','attendance_records','exams','exam_sessions','exam_results','student_bills','payments','team_projects','team_tasks','team_project_invoices','team_project_payments'] loop
    execute format('create trigger cross_module_sync after insert or update or delete on public.%I for each row execute function public.sync_cross_module_record()',resource);
  end loop;
end $$;
