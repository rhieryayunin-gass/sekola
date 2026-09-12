create table public.school_attendance_sessions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),classroom_id uuid not null references public.classrooms(id),
 attendance_date date not null default (now() at time zone 'Asia/Jakarta')::date,
 mode text not null check(mode in ('MANUAL','QR','RFID','FACE')),token_hash text not null,
 starts_at timestamptz not null default now(),ends_at timestamptz not null,late_at timestamptz not null,
 is_active boolean not null default true,created_by uuid not null references public.users(id),created_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '8 hours' and late_at between starts_at and ends_at)
);
create unique index school_attendance_open_class on public.school_attendance_sessions(classroom_id,attendance_date) where is_active;
create table public.school_attendance_devices (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),name text not null check(length(name) between 2 and 120),
 mode text not null check(mode in ('RFID','FACE')),secret_hash text not null,is_active boolean not null default true,created_at timestamptz not null default now()
);
create table public.school_device_bindings (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),device_id uuid not null references public.school_attendance_devices(id),
 student_id uuid not null references public.students(id),external_id_hash text not null,created_at timestamptz not null default now(),unique(device_id,external_id_hash)
);
create table public.school_attendance_events (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),session_id uuid not null references public.school_attendance_sessions(id),
 student_id uuid not null references public.students(id),device_id uuid references public.school_attendance_devices(id),event_key uuid not null,
 method text not null check(method in ('QR','RFID','FACE','MANUAL')),created_at timestamptz not null default now(),unique(session_id,student_id,method),unique(device_id,event_key)
);
create index school_attendance_event_device_time on public.school_attendance_events(device_id,created_at desc);
do $$ declare t text; maps jsonb; begin foreach t in array array['school_attendance_sessions','school_attendance_devices','school_device_bindings','school_attendance_events'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon,authenticated',t); execute format('create index on public.%I(tenant_id)',t);
 select jsonb_object_agg(a.attname,ft.relname) into maps from pg_constraint c join pg_class ft on ft.oid=c.confrelid join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.conrelid=('public.'||t)::regclass and c.contype='f' and a.attname<>'tenant_id' and exists(select 1 from pg_attribute ta where ta.attrelid=ft.oid and ta.attname='tenant_id');
 execute format('create trigger tenant_integrity before insert or update on public.%I for each row execute function public.enforce_tenant_relations(%L)',t,coalesce(maps,'{}')::text);
 end loop; end $$;
create function school_private.class_teaches(class_uuid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.classrooms c where c.id=class_uuid and c.tenant_id=school_private.tenant() and (school_private.staff() or c.homeroom_teacher_user_id=auth.uid() or exists(select 1 from public.teacher_assignments a join public.teachers t on t.id=a.teacher_id where a.classroom_id=c.id and a.is_active and t.user_id=auth.uid())))
$$;
create function school_private.attendance_context(class_uuid uuid default null,day date default (now() at time zone 'Asia/Jakarta')::date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); teacher boolean:=school_private.class_teaches(class_uuid); begin
 perform school_private.require_module('attendance');
 return jsonb_build_object('can_manage',teacher,
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'can_manage',school_private.class_teaches(c.id))) from public.classrooms c where c.tenant_id=tenant and (school_private.class_teaches(c.id) or exists(select 1 from public.student_assignments a where a.classroom_id=c.id and a.is_active and school_private.child(a.student_id)))),'[]'),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'classroom_id',s.classroom_id,'mode',s.mode,'starts_at',s.starts_at,'ends_at',s.ends_at,'late_at',s.late_at,'is_active',s.is_active)) from public.school_attendance_sessions s where s.tenant_id=tenant and s.classroom_id=class_uuid and s.attendance_date=day),'[]'),
 'students',coalesce((select jsonb_agg(to_jsonb(q)) from (select distinct st.id,u.full_name as name,ar.status,ar.note from public.students st join public.users u on u.id=st.user_id join public.student_assignments a on a.student_id=st.id left join public.attendance_records ar on ar.student_id=st.id and ar.attendance_date=day and ar.tenant_id=tenant where st.tenant_id=tenant and a.classroom_id=class_uuid and a.is_active and (teacher or school_private.child(st.id)))q),'[]'),
 'devices',case when school_private.staff() then coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'mode',d.mode,'is_active',d.is_active)) from public.school_attendance_devices d where d.tenant_id=tenant),'[]') else '[]'::jsonb end);
end $$;
create function public.school_attendance_context(class_uuid uuid default null,day date default (now() at time zone 'Asia/Jakarta')::date) returns jsonb language sql security invoker set search_path='' as $$ select school_private.attendance_context(class_uuid,day) $$;

create function school_private.attendance_open(class_uuid uuid,method text,duration_minutes integer,late_minutes integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare token text:=left(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),48); session public.school_attendance_sessions; begin
 perform school_private.require_module('attendance');
 if not school_private.class_teaches(class_uuid) or not public.app_has_permission(auth.uid(),'attendance.create') then raise exception 'Class teacher access required' using errcode='42501'; end if;
 if duration_minutes not between 1 and 480 or late_minutes not between 0 and duration_minutes then raise exception 'Invalid attendance window'; end if;
 if method in ('RFID','FACE') and not exists(select 1 from public.school_attendance_devices where tenant_id=school_private.tenant() and mode=method and is_active) then raise exception 'Configure a reader for this attendance method first'; end if;
 -- Only stale sessions are closed automatically; a live session is never replaced.
 update public.school_attendance_sessions set is_active=false where classroom_id=class_uuid and tenant_id=school_private.tenant() and ends_at<now() and is_active;
 insert into public.school_attendance_sessions(tenant_id,classroom_id,mode,token_hash,ends_at,late_at,created_by) values(school_private.tenant(),class_uuid,method,encode(sha256(convert_to(token,'UTF8')),'hex'),now()+make_interval(mins=>duration_minutes),now()+make_interval(mins=>late_minutes),auth.uid()) returning * into session;
 return jsonb_build_object('id',session.id,'code',case when method='QR' then token else null end,'ends_at',session.ends_at,'mode',session.mode);
end $$;
create function public.school_attendance_open(class_uuid uuid,method text,duration_minutes integer default 15,late_minutes integer default 5) returns jsonb language sql security invoker set search_path='' as $$ select school_private.attendance_open(class_uuid,method,duration_minutes,late_minutes) $$;
create function school_private.attendance_close(session_uuid uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.school_attendance_sessions s set is_active=false where s.id=session_uuid and s.tenant_id=school_private.tenant() and school_private.class_teaches(s.classroom_id);
 if not found then raise exception 'Session access denied' using errcode='42501'; end if; return true;
end $$;
create function public.school_attendance_close(session_uuid uuid) returns boolean language sql security invoker set search_path='' as $$ select school_private.attendance_close(session_uuid) $$;

create function school_private.attendance_record(session_uuid uuid,student_uuid uuid,method text,event_uuid uuid,device_uuid uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare session public.school_attendance_sessions; result jsonb; begin
 select * into session from public.school_attendance_sessions where id=session_uuid;
 if session.id is null or not session.is_active or now() not between session.starts_at and session.ends_at or session.mode<>method then raise exception 'Attendance session is not open'; end if;
 if not exists(select 1 from public.student_assignments a join public.students s on s.id=a.student_id where s.id=student_uuid and s.tenant_id=session.tenant_id and s.enrollment_status='ACTIVE' and a.classroom_id=session.classroom_id and a.is_active) then raise exception 'Student is not in this class' using errcode='42501'; end if;
 insert into public.school_attendance_events(tenant_id,session_id,student_id,device_id,event_key,method) values(session.tenant_id,session.id,student_uuid,device_uuid,event_uuid,method) on conflict do nothing;
 insert into public.attendance_records(tenant_id,student_id,classroom_id,attendance_date,status,note) values(session.tenant_id,student_uuid,session.classroom_id,session.attendance_date,case when now()>session.late_at then 'LATE' else 'PRESENT' end,'Check-in '||method) on conflict(tenant_id,student_id,attendance_date) do nothing;
 select jsonb_build_object('status',a.status,'attendance_date',a.attendance_date) into result from public.attendance_records a where a.tenant_id=session.tenant_id and a.student_id=student_uuid and a.attendance_date=session.attendance_date;
 return result;
end $$;
create function school_private.attendance_checkin(session_uuid uuid,code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare student uuid; begin
 perform school_private.require_module('attendance');
 if length(code)<>48 or not exists(select 1 from public.school_attendance_sessions s where s.id=session_uuid and s.tenant_id=school_private.tenant() and s.mode='QR' and s.token_hash=encode(sha256(convert_to(code,'UTF8')),'hex')) then raise exception 'Invalid QR session' using errcode='42501'; end if;
 select id into student from public.students where user_id=auth.uid() and tenant_id=school_private.tenant() and enrollment_status='ACTIVE';
 if student is null then raise exception 'Student account required' using errcode='42501'; end if;
 return school_private.attendance_record(session_uuid,student,'QR',gen_random_uuid(),null);
end $$;
create function public.school_attendance_checkin(session_uuid uuid,code text) returns jsonb language sql security invoker set search_path='' as $$ select school_private.attendance_checkin(session_uuid,code) $$;
create function school_private.attendance_override(class_uuid uuid,student_uuid uuid,day date,status_value text,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); result jsonb; begin
 perform school_private.require_module('attendance');
 if not school_private.class_teaches(class_uuid) or not public.app_has_permission(auth.uid(),'attendance.update') then raise exception 'Class teacher access required' using errcode='42501'; end if;
 if reason is null or length(trim(reason)) not between 5 and 1000 then raise exception 'Provide an override reason'; end if;
 if not exists(select 1 from public.student_assignments a where a.student_id=student_uuid and a.classroom_id=class_uuid and a.tenant_id=tenant and a.is_active) then raise exception 'Student is not in this class' using errcode='42501'; end if;
 insert into public.attendance_records(tenant_id,student_id,classroom_id,attendance_date,status,note) values(tenant,student_uuid,class_uuid,day,status_value,reason) on conflict(tenant_id,student_id,attendance_date) do update set status=excluded.status,note=excluded.note,recorded_at=now() returning to_jsonb(attendance_records.*) into result;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,auth.uid(),'UPDATE','attendance','attendance_records',(result->>'id')::uuid,jsonb_build_object('status',status_value,'reason',reason));
 return result;
end $$;
create function public.school_attendance_override(class_uuid uuid,student_uuid uuid,day date,status_value text,reason text) returns jsonb language sql security invoker set search_path='' as $$ select school_private.attendance_override(class_uuid,student_uuid,day,status_value,reason) $$;

create function school_private.device_manage(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); secret text; device uuid; begin
 if not school_private.staff() then raise exception 'School administrator required' using errcode='42501'; end if;
 if action='create' then
 secret:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.school_attendance_devices(tenant_id,name,mode,secret_hash) values(tenant,payload->>'name',payload->>'mode',encode(sha256(convert_to(secret,'UTF8')),'hex')) returning id into device;
 return jsonb_build_object('id',device,'secret',secret);
 elsif action='disable' then
 update public.school_attendance_devices set is_active=false where id=(payload->>'device_id')::uuid and tenant_id=tenant; return jsonb_build_object('disabled',found);
 elsif action='bind' then
 if length(payload->>'external_id') not between 2 and 200 then raise exception 'Provide the opaque identifier emitted by the reader'; end if;
 if not exists(select 1 from public.school_attendance_devices where id=(payload->>'device_id')::uuid and tenant_id=tenant and is_active) then raise exception 'Device not found'; end if;
 insert into public.school_device_bindings(tenant_id,device_id,student_id,external_id_hash) values(tenant,(payload->>'device_id')::uuid,(payload->>'student_id')::uuid,encode(sha256(convert_to(payload->>'external_id','UTF8')),'hex'));
 return jsonb_build_object('bound',true);
 end if; raise exception 'Unsupported device action';
end $$;
create function public.school_device_manage(action text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select school_private.device_manage(action,payload) $$;
create function school_private.device_event(device_uuid uuid,secret text,session_uuid uuid,event_uuid uuid,external_id text,occurred_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare device public.school_attendance_devices; student uuid; begin
 if length(secret)<>64 or length(external_id)>200 or occurred_at is null or abs(extract(epoch from now()-occurred_at))>120 then raise exception 'Invalid device event' using errcode='42501'; end if;
 select * into device from public.school_attendance_devices where id=device_uuid and is_active and secret_hash=encode(sha256(convert_to(secret,'UTF8')),'hex');
 if device.id is null or not exists(select 1 from public.school_attendance_sessions where id=session_uuid and tenant_id=device.tenant_id and mode=device.mode) or exists(select 1 from public.school_settings where tenant_id=device.tenant_id and modules->'attendance'='false') then raise exception 'Device access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(device_uuid::text,449));
 if (select count(*) from public.school_attendance_events where device_id=device_uuid and created_at>now()-interval '1 minute')>=300 then raise exception 'Device rate limit reached'; end if;
 select student_id into student from public.school_device_bindings where device_id=device_uuid and tenant_id=device.tenant_id and external_id_hash=encode(sha256(convert_to(external_id,'UTF8')),'hex');
 if student is null then raise exception 'Reader identity is not enrolled' using errcode='42501'; end if;
 if exists(select 1 from public.school_attendance_events where device_id=device_uuid and event_key=event_uuid and (student_id<>student or session_id<>session_uuid)) then raise exception 'Event identifier was already used' using errcode='42501'; end if;
 return school_private.attendance_record(session_uuid,student,device.mode,event_uuid,device_uuid);
end $$;
create function public.school_device_event(device_uuid uuid,secret text,session_uuid uuid,event_uuid uuid,external_id text,occurred_at timestamptz) returns jsonb language sql security invoker set search_path='' as $$ select school_private.device_event(device_uuid,secret,session_uuid,event_uuid,external_id,occurred_at) $$;

revoke all on function school_private.class_teaches(uuid),school_private.attendance_context(uuid,date),school_private.attendance_open(uuid,text,integer,integer),school_private.attendance_close(uuid),school_private.attendance_record(uuid,uuid,text,uuid,uuid),school_private.attendance_checkin(uuid,text),school_private.attendance_override(uuid,uuid,date,text,text),school_private.device_manage(text,jsonb),school_private.device_event(uuid,text,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function school_private.attendance_context(uuid,date),school_private.attendance_open(uuid,text,integer,integer),school_private.attendance_close(uuid),school_private.attendance_checkin(uuid,text),school_private.attendance_override(uuid,uuid,date,text,text),school_private.device_manage(text,jsonb) to authenticated;
revoke all on function public.school_attendance_context(uuid,date),public.school_attendance_open(uuid,text,integer,integer),public.school_attendance_close(uuid),public.school_attendance_checkin(uuid,text),public.school_attendance_override(uuid,uuid,date,text,text),public.school_device_manage(text,jsonb),public.school_device_event(uuid,text,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.school_attendance_context(uuid,date),public.school_attendance_open(uuid,text,integer,integer),public.school_attendance_close(uuid),public.school_attendance_checkin(uuid,text),public.school_attendance_override(uuid,uuid,date,text,text),public.school_device_manage(text,jsonb) to authenticated;
grant execute on function public.school_device_event(uuid,text,uuid,uuid,text,timestamptz),school_private.device_event(uuid,text,uuid,uuid,text,timestamptz) to anon,authenticated;
