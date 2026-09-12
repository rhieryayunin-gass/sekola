-- Additive school workspace. Browser calls identify the actor through auth.uid().
create schema if not exists school_private;
revoke all on schema school_private from public, anon;
grant usage on schema school_private to authenticated;

create table public.school_plans (
 code text primary key check(code in ('ESSENTIAL','ELEVATE','ENTERPRISE')),
 name text not null, price_monthly integer not null check(price_monthly>=0),
 features jsonb not null default '[]', offer_note text not null default '', updated_at timestamptz not null default now()
);
insert into public.school_plans(code,name,price_monthly,features) values
 ('ESSENTIAL','Essential',9999,'["Fondasi administrasi sekolah","Pendampingan digitalisasi"]'),
 ('ELEVATE','Elevate',14999,'["Integrasi proses sekolah","Pendampingan peningkatan layanan"]'),
 ('ENTERPRISE','Enterprise',29999,'["Konsultasi transformasi sekolah","Perencanaan integrasi lanjutan"]');
create table public.school_settings (
 tenant_id uuid primary key references public.tenants(id) on delete restrict,
 plan_code text not null default 'ESSENTIAL' references public.school_plans(code),
 modules jsonb not null default '{"core":true,"academic":true,"attendance":true,"connect":true,"learning":true,"exams":true,"finance":true,"team":true}',
 updated_at timestamptz not null default now(),
 check(jsonb_typeof(modules)='object' and modules ?& array['core','academic','attendance','connect','learning','exams','finance','team'])
);
create table public.school_guardians (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 parent_user_id uuid not null references public.users(id), student_id uuid not null references public.students(id),
 relationship text not null default 'PARENT' check(relationship in ('PARENT','GUARDIAN')),
 created_at timestamptz not null default now(), unique(parent_user_id,student_id)
);
create table public.school_alumni (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 student_id uuid references public.students(id), name text not null check(length(trim(name)) between 2 and 200),
 graduation_year integer not null check(graduation_year between 1900 and 2200), notes text,
 created_at timestamptz not null default now(), unique(student_id)
);
create table public.school_assets (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 2 and 200),
 category text not null check(category in ('CLASSROOM','LAB','FIELD','EQUIPMENT','OTHER')),
 capacity integer not null default 1 check(capacity>0), room_id uuid references public.rooms(id),
 description text, is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.school_canteens (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 2 and 200), operator_name text, location text, opening_hours text,
 is_active boolean not null default true, created_at timestamptz not null default now()
);
create table public.school_timetable (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 classroom_id uuid not null references public.classrooms(id), subject_id uuid not null references public.subjects(id),
 teacher_id uuid not null references public.teachers(id), semester_id uuid not null references public.semesters(id),
 weekday integer not null check(weekday between 1 and 7), starts_at time not null, ends_at time not null,
 room_id uuid references public.rooms(id), created_at timestamptz not null default now(), check(ends_at>starts_at),
 exclude using gist (classroom_id with =,semester_id with =,weekday with =,int4range((extract(epoch from starts_at))::integer,(extract(epoch from ends_at))::integer,'[)') with &&),
 exclude using gist (teacher_id with =,semester_id with =,weekday with =,int4range((extract(epoch from starts_at))::integer,(extract(epoch from ends_at))::integer,'[)') with &&),
 exclude using gist (room_id with =,semester_id with =,weekday with =,int4range((extract(epoch from starts_at))::integer,(extract(epoch from ends_at))::integer,'[)') with &&) where(room_id is not null)
);
create table public.school_library (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 title text not null check(length(trim(title)) between 2 and 200), description text,
 kind text not null check(kind in ('PDF','IMAGE','DOCUMENT','YOUTUBE')),
 url text not null check(length(url) between 1 and 2000), subject_id uuid references public.subjects(id),
 course_id uuid references public.courses(id), lesson_id uuid references public.lessons(id),
 created_by uuid not null references public.users(id), created_at timestamptz not null default now()
);

create function school_private.role(codes text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.roles r where r.code=any(codes) and r.is_active and r.id in (
 select role_id from public.user_roles where user_id=auth.uid() union select lr.role_id from public.user_level_roles lr join public.users u on u.user_level_id=lr.user_level_id where u.id=auth.uid()))
 and exists(select 1 from public.users where id=auth.uid() and is_active)
$$;
create function school_private.tenant() returns uuid language sql stable security definer set search_path='' as $$ select public.app_tenant(auth.uid()) $$;
create function school_private.staff() returns boolean language sql stable security definer set search_path='' as $$ select school_private.role(array['OWNER','PRINCIPAL','STAFF']) $$;
create function school_private.require_module(module_code text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 perform school_private.tenant();
 if exists(select 1 from public.school_settings where tenant_id=school_private.tenant() and modules->module_code='false'::jsonb) then raise exception 'This module is disabled for the school' using errcode='42501'; end if;
end $$;
create function school_private.child(student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.students s where s.id=student and s.tenant_id=school_private.tenant() and (s.user_id=auth.uid() or exists(select 1 from public.school_guardians g where g.student_id=s.id and g.parent_user_id=auth.uid() and g.tenant_id=s.tenant_id)))
$$;

do $$ declare t text; maps jsonb; begin
 foreach t in array array['school_plans','school_settings','school_guardians','school_alumni','school_assets','school_canteens','school_timetable','school_library'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 if t not in ('school_plans','school_settings') then
 execute format('create index on public.%I(tenant_id)',t);
 select jsonb_object_agg(a.attname,ft.relname) into maps from pg_constraint c join pg_class ft on ft.oid=c.confrelid join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.conrelid=('public.'||t)::regclass and c.contype='f' and a.attname<>'tenant_id' and exists(select 1 from pg_attribute ta where ta.attrelid=ft.oid and ta.attname='tenant_id');
 execute format('create trigger tenant_integrity before insert or update on public.%I for each row execute function public.enforce_tenant_relations(%L)',t,coalesce(maps,'{}')::text);
 end if;
 end loop;
end $$;
grant select on public.school_plans to anon,authenticated;
create policy plans_public on public.school_plans for select to anon,authenticated using(true);
grant select on public.school_settings,public.school_guardians,public.school_alumni,public.school_assets,public.school_canteens,public.school_timetable,public.school_library to authenticated;
create policy settings_tenant on public.school_settings for select to authenticated using(tenant_id=public.current_tenant_id());
create policy guardian_visibility on public.school_guardians for select to authenticated using(tenant_id=public.current_tenant_id() and (parent_user_id=auth.uid() or school_private.staff() or school_private.child(student_id)));
create policy alumni_tenant on public.school_alumni for select to authenticated using(tenant_id=public.current_tenant_id() and school_private.staff());
create policy assets_tenant on public.school_assets for select to authenticated using(tenant_id=public.current_tenant_id());
create policy canteens_tenant on public.school_canteens for select to authenticated using(tenant_id=public.current_tenant_id());
create policy timetable_tenant on public.school_timetable for select to authenticated using(tenant_id=public.current_tenant_id());
create policy library_tenant on public.school_library for select to authenticated using(tenant_id=public.current_tenant_id());

create function school_private.graduate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.enrollment_status='GRADUATED' and (tg_op='INSERT' or old.enrollment_status is distinct from new.enrollment_status) then
 insert into public.school_alumni(tenant_id,student_id,name,graduation_year) select new.tenant_id,new.id,coalesce(u.full_name,new.student_number),extract(year from now())::integer from public.users u where u.id=new.user_id on conflict(student_id) do nothing;
 end if; return new;
end $$;
create trigger school_graduation after insert or update of enrollment_status on public.students for each row execute function school_private.graduate();

create function school_private.timetable_notify() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id)
 select new.tenant_id,recipients.user_id,'INFO','Jadwal kelas diperbarui',c.name||' · '||s.name||' · '||new.starts_at||'–'||new.ends_at,'timetable',new.id
 from public.classrooms c,public.subjects s, lateral (
 select t.user_id from public.teachers t where t.id=new.teacher_id
 union select st.user_id from public.students st join public.student_assignments a on a.student_id=st.id where a.classroom_id=new.classroom_id and a.semester_id=new.semester_id and a.is_active
 union select g.parent_user_id from public.school_guardians g join public.student_assignments a on a.student_id=g.student_id where a.classroom_id=new.classroom_id and a.semester_id=new.semester_id and a.is_active
 ) recipients where c.id=new.classroom_id and s.id=new.subject_id;
 return new;
end $$;
create trigger school_timetable_notification after insert or update on public.school_timetable for each row execute function school_private.timetable_notify();

create function school_private.context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); result jsonb; begin
 select jsonb_build_object('tenant',jsonb_build_object('id',t.id,'name',t.name),'settings',coalesce((select to_jsonb(s) from public.school_settings s where s.tenant_id=tenant),jsonb_build_object('plan_code','ESSENTIAL','modules','{"core":true,"academic":true,"attendance":true,"connect":true,"learning":true,"exams":true,"finance":true,"team":true}'::jsonb)),
 'staff',school_private.staff(),'educator',school_private.role(array['OWNER','PRINCIPAL','STAFF','TEACHER']),
 'platform_owner',public.app_has_permission(auth.uid(),'tenants.update_all'),
 'children',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',u.full_name,'user_id',u.id)) from public.students s join public.users u on u.id=s.user_id where s.tenant_id=tenant and school_private.child(s.id)),'[]')) into result from public.tenants t where t.id=tenant;
 return result;
end $$;
create function public.school_context() returns jsonb language sql security invoker set search_path='' as $$ select school_private.context() $$;

-- Bounded, named catalogs for form choices. No credential or profile metadata.
create function school_private.catalog(resource text, page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); result jsonb; predicate text:=''; begin
 if resource not in ('academic_years','semesters','classrooms','subjects','teachers','students','teacher_assignments','student_assignments','courses','lessons','assignments','users','rooms') then raise exception 'Unsupported catalog' using errcode='42501'; end if;
 if resource='users' then
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (select id,full_name as name from public.users u where tenant_id=tenant and is_active and (school_private.staff() or id=auth.uid() or exists(select 1 from public.teachers t where t.user_id=u.id and t.tenant_id=tenant)) order by full_name,id limit 500 offset greatest(page_offset,0))q; return result;
 end if;
 if resource in ('teachers','students') then
 execute format('select coalesce(jsonb_agg(to_jsonb(q)),''[]'') from (select r.id,r.user_id,u.full_name as name from public.%I r join public.users u on u.id=r.user_id where r.tenant_id=$1 and ($2 or %s) order by u.full_name,r.id limit 500 offset $3)q',resource,case when resource='students' then 'school_private.child(r.id)' else 'true' end) into result using tenant,school_private.role(array['OWNER','PRINCIPAL','STAFF','TEACHER']),greatest(page_offset,0); return result;
 end if;
 if resource='student_assignments' and not school_private.role(array['OWNER','PRINCIPAL','STAFF','TEACHER']) then predicate:=' and school_private.child(r.student_id)'; end if;
 if resource in ('courses','lessons','assignments') and not school_private.role(array['OWNER','PRINCIPAL','STAFF','TEACHER']) then
 predicate:=case resource when 'courses' then ' and exists(select 1 from public.student_assignments a where a.classroom_id=r.classroom_id and a.semester_id=r.semester_id and a.is_active and school_private.child(a.student_id))' else ' and r.is_published and exists(select 1 from public.courses c join public.student_assignments a on a.classroom_id=c.classroom_id and a.semester_id=c.semester_id and a.is_active where c.id=r.course_id and school_private.child(a.student_id))' end;
 end if;
 execute format('select coalesce(jsonb_agg(to_jsonb(q)),''[]'') from (select r.* from public.%I r where r.tenant_id=$1 %s order by r.id limit 500 offset $2)q',resource,predicate) into result using tenant,greatest(page_offset,0);
 return result;
end $$;
create function public.school_catalog(resource text,page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select school_private.catalog(resource,page_offset) $$;

create function school_private.save(resource text, payload jsonb, record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); fields text[]; key text; cols text; vals text; result jsonb; begin
 perform school_private.require_module(case when resource='school_library' then 'learning' when resource='school_timetable' then 'academic' else 'core' end);
 if not school_private.staff() and not (resource='school_library' and public.app_has_permission(auth.uid(),'lessons.create')) then raise exception 'School administrator required' using errcode='42501'; end if;
 fields:=case resource
 when 'school_guardians' then array['parent_user_id','student_id','relationship']
 when 'school_alumni' then array['student_id','name','graduation_year','notes']
 when 'school_assets' then array['name','category','capacity','room_id','description','is_active']
 when 'school_canteens' then array['name','operator_name','location','opening_hours','is_active']
 when 'school_timetable' then array['classroom_id','subject_id','teacher_id','semester_id','weekday','starts_at','ends_at','room_id']
 when 'school_library' then array['title','description','kind','url','subject_id','course_id','lesson_id'] end;
 if fields is null or jsonb_typeof(payload)<>'object' or payload='{}'::jsonb then raise exception 'Invalid resource or payload' using errcode='22023'; end if;
 for key in select jsonb_object_keys(payload) loop if not key=any(fields) then raise exception 'Unsupported field: %',key using errcode='22023'; end if; end loop;
 if resource='school_guardians' and payload ? 'parent_user_id' and not exists(select 1 from public.users u where u.id=(payload->>'parent_user_id')::uuid and u.tenant_id=tenant and u.is_active and exists(select 1 from public.roles r where r.code='PARENT' and r.is_active and r.id in (select role_id from public.user_roles where user_id=u.id union select role_id from public.user_level_roles where user_level_id=u.user_level_id))) then raise exception 'Choose a parent in this school' using errcode='23514'; end if;
 if resource='school_library' and payload ? 'url' then
 if payload->>'kind'='YOUTUBE' and payload->>'url' !~ '^https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]{11}([?&].*)?$' then raise exception 'Use a YouTube video URL' using errcode='23514'; end if;
 if payload->>'kind'<>'YOUTUBE' and payload->>'url' !~ '^/api/media/file\?' then raise exception 'Choose a file uploaded to the school media library' using errcode='23514'; end if;
 end if;
 if record_id is null then
 payload:=payload||jsonb_build_object('tenant_id',tenant);
 if resource='school_library' then payload:=payload||jsonb_build_object('created_by',auth.uid()); end if;
 select string_agg(format('%I',k),','),string_agg(format('r.%I',k),',') into cols,vals from jsonb_object_keys(payload)k;
 execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1)r returning to_jsonb(%I.*)',resource,cols,vals,resource,resource) into result using payload;
 else
 select string_agg(format('%I=r.%I',k,k),',') into vals from jsonb_object_keys(payload)k;
 execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1)r where t.id=$2 and t.tenant_id=$3 returning to_jsonb(t.*)',resource,vals,resource) into result using payload,record_id,tenant;
 if result is null then raise exception 'Record not found' using errcode='P0002'; end if;
 end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,auth.uid(),case when record_id is null then 'CREATE' else 'UPDATE' end,'school',resource,(result->>'id')::uuid,jsonb_build_object('id',result->'id'));
 return result;
end $$;
create function public.school_save(resource text,payload jsonb,record_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.save(resource,payload,record_id) $$;

create function school_private.settings_save(target_tenant uuid,plan text,module_flags jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare key text; result jsonb; begin
 perform school_private.tenant();
 if not public.app_has_permission(auth.uid(),'tenants.update_all') then raise exception 'Platform owner required' using errcode='42501'; end if;
 if jsonb_typeof(module_flags)<>'object' or not module_flags ?& array['core','academic','attendance','connect','learning','exams','finance','team'] then raise exception 'Provide all eight module switches'; end if;
 for key in select jsonb_object_keys(module_flags) loop if key<>all(array['core','academic','attendance','connect','learning','exams','finance','team']) or jsonb_typeof(module_flags->key)<>'boolean' then raise exception 'Invalid module switch'; end if; end loop;
 insert into public.school_settings(tenant_id,plan_code,modules) values(target_tenant,plan,module_flags) on conflict(tenant_id) do update set plan_code=excluded.plan_code,modules=excluded.modules,updated_at=now() returning to_jsonb(school_settings.*) into result;
 return result;
end $$;
create function public.school_settings_save(target_tenant uuid,plan text,module_flags jsonb) returns jsonb language sql security invoker set search_path='' as $$ select school_private.settings_save(target_tenant,plan,module_flags) $$;

revoke all on all functions in schema school_private from public,anon,authenticated;
grant execute on function school_private.role(text[]),school_private.staff(),school_private.tenant(),school_private.child(uuid),school_private.context(),school_private.catalog(text,integer),school_private.save(text,jsonb,uuid),school_private.settings_save(uuid,text,jsonb) to authenticated;
revoke all on function public.school_context(),public.school_catalog(text,integer),public.school_save(text,jsonb,uuid),public.school_settings_save(uuid,text,jsonb) from public,anon;
grant execute on function public.school_context(),public.school_catalog(text,integer),public.school_save(text,jsonb,uuid),public.school_settings_save(uuid,text,jsonb) to authenticated;
