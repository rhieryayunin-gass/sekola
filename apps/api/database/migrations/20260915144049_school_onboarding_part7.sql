-- Part 7 is an additive orchestration layer over the existing school records.
create table public.school_setup (
 tenant_id uuid primary key references public.tenants(id),
 mode text not null default 'GUIDED' check(mode in ('GUIDED','IMPORT','ASSISTED')),
 operations jsonb not null default '{}' check(jsonb_typeof(operations)='object' and octet_length(operations::text)<=40000),
 launched_at timestamptz, launched_by uuid references public.users(id),
 revision integer not null default 0, updated_at timestamptz not null default now()
);
alter table public.school_setup enable row level security;
revoke all on public.school_setup from public,anon,authenticated;
grant all on public.school_setup to service_role;

alter table public.classrooms add column grade_level text check(length(grade_level)<=40),
 add column stream text check(length(stream)<=80), add column campus text check(length(campus)<=120);

create function school_private.setup_access(write_access boolean default false) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 perform school_private.require_module('core');
 if not school_private.role(array['OWNER','STAFF','TEACHER','PRINCIPAL']) or (write_access and not school_private.role(array['STAFF']))
 then raise exception 'School setup requires Staff access; teachers and principals may review readiness' using errcode='42501'; end if;
end $$;

create function school_private.setup_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); y uuid; term uuid; checks jsonb; setup jsonb; blockers integer; score integer; begin
 perform school_private.setup_access();
 select id into y from public.academic_years where tenant_id=t and is_active;
 select id into term from public.semesters where tenant_id=t and academic_year_id=y and is_active order by starts_on desc limit 1;
 select to_jsonb(s) into setup from public.school_setup s where tenant_id=t;
 with checklist as (
 select 'identity' as key,'core' as phase,case when length(trim(coalesce(address,'')))>0 and length(trim(coalesce(contact_email,'')))>0 then 0 else 1 end as issues from public.tenants where id=t
 union all select 'operations','core',case when length(coalesce(setup->'operations'->>'hours',''))>0 and jsonb_array_length(coalesce(setup->'operations'->'units','[]'))>0 then 0 else 1 end
 union all select 'people','core',case when exists(select 1 from public.users u where u.tenant_id=t and u.is_active and public.app_role_in(u.id,array['PRINCIPAL'])) and exists(select 1 from public.teachers where tenant_id=t and employment_status='ACTIVE') then 0 else 1 end
 union all select 'facilities','core',case when exists(select 1 from public.school_assets where tenant_id=t and is_active) then 0 else 1 end
 union all select 'year','academic',case when y is not null then 0 else 1 end
 union all select 'terms','academic',case when term is not null then 0 else 1 end
 union all select 'curriculum','academic',case when exists(select 1 from public.school_curriculum_programs where tenant_id=t and academic_year_id=y and is_active) then 0 else 1 end
 union all select 'mapping','academic',count(*)::integer from public.school_curriculum_programs p where p.tenant_id=t and p.academic_year_id=y and p.is_active and (not exists(select 1 from public.school_curriculum_stages s where s.program_id=p.id and s.is_active) or not exists(select 1 from public.school_curriculum_subjects s where s.program_id=p.id and s.is_active) or not exists(select 1 from public.school_curriculum_scales s where s.program_id=p.id and s.is_active))
 union all select 'classes','academic',case when exists(select 1 from public.classrooms where tenant_id=t and academic_year_id=y and is_active) then 0 else 1 end
 union all select 'homeroom','academic',count(*)::integer from public.classrooms c where c.tenant_id=t and c.academic_year_id=y and c.is_active and not exists(select 1 from public.teachers te join public.users u on u.id=te.user_id where te.user_id=c.homeroom_teacher_user_id and te.tenant_id=t and te.employment_status='ACTIVE' and u.is_active)
 union all select 'placement','academic',case when not exists(select 1 from public.students where tenant_id=t and enrollment_status='ACTIVE') then 1 else (select count(*)::integer from public.students s where s.tenant_id=t and s.enrollment_status='ACTIVE' and not exists(select 1 from public.student_assignments a where a.student_id=s.id and a.semester_id=term and a.is_active)) end
 union all select 'capacity','academic',count(*)::integer from public.classrooms c where c.tenant_id=t and c.academic_year_id=y and c.is_active and (c.capacity<=0 or (select count(*) from public.student_assignments a where a.classroom_id=c.id and a.semester_id=term and a.is_active)>c.capacity)
 union all select 'assignments','academic',case when exists(select 1 from public.teacher_assignments a where a.tenant_id=t and a.semester_id=term and a.is_active) then 0 else 1 end
 union all select 'enrollment','academic',count(*)::integer from public.classrooms c where c.tenant_id=t and c.academic_year_id=y and c.is_active and not exists(select 1 from public.school_curriculum_enrollments e where e.classroom_id=c.id and e.is_active)
 ) select jsonb_agg(jsonb_build_object('key',key,'phase',phase,'issues',issues,'complete',issues=0)),count(*) filter(where issues>0),round(100.0*count(*) filter(where issues=0)/count(*)) into checks,blockers,score from checklist;
 return jsonb_build_object('school',(select to_jsonb(q) from (select id,name,legal_name,address,contact_email,contact_phone,timezone,locale,week_starts_on,notifications_in_app_enabled from public.tenants where id=t)q),
 'setup',coalesce(setup,jsonb_build_object('mode','GUIDED','operations','{}'::jsonb,'revision',0)),
 'checks',checks,'score',score,'blockers',blockers,'year_id',y,'term_id',term,'can_edit',school_private.role(array['STAFF']),'can_identity',public.app_has_permission(auth.uid(),'tenants.update_own'),'can_academic',school_private.role(array['STAFF','TEACHER']),'can_facilities',school_private.staff(),
 'counts',jsonb_build_object('students',(select count(*) from public.students where tenant_id=t and enrollment_status='ACTIVE'),'teachers',(select count(*) from public.teachers where tenant_id=t and employment_status='ACTIVE'),'classes',(select count(*) from public.classrooms where tenant_id=t and academic_year_id=y and is_active)),
 'activity',coalesce((select jsonb_agg(q) from (select action,module,resource_type,created_at from public.audit_logs where tenant_id=t and module in ('setup','ACADEMIC','PEOPLE','school') order by created_at desc limit 8)q),'[]'));
end $$;

create function school_private.setup_action(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); state jsonb; op jsonb; k text; begin
 perform school_private.setup_access();
 if action='identity' then if not public.app_has_permission(auth.uid(),'tenants.update_own') then raise exception 'School identity requires the existing tenant settings permission' using errcode='42501';end if;else perform school_private.setup_access(true);end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>45000 then raise exception 'Invalid setup data'; end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text,707));
 insert into public.school_setup(tenant_id) values(t) on conflict do nothing;
 if action='preferences' then
 if (payload->>'revision')::integer is distinct from (select revision from public.school_setup where tenant_id=t) then raise exception 'Setup changed. Refresh before saving.' using errcode='40001'; end if;
 op:=coalesce(payload->'operations','{}');
 if jsonb_typeof(op) is distinct from 'object' or jsonb_typeof(coalesce(op->'units','[]'))<>'array' or jsonb_typeof(coalesce(op->'campuses','[]'))<>'array' then raise exception 'Use named campuses and administrative units'; end if;
 for k in select jsonb_object_keys(op) loop if k<>all(array['hours','units','campuses','approval_notes','migration_notes','communication_notes','school_levels','school_status']) then raise exception 'Unknown operational setting'; end if; end loop;
 if jsonb_array_length(coalesce(op->'units','[]'))>100 or jsonb_array_length(coalesce(op->'campuses','[]'))>100 or exists(select 1 from jsonb_array_elements(coalesce(op->'units','[]')||coalesce(op->'campuses','[]')) v where jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 120) then raise exception 'Use up to 100 valid names'; end if;
 update public.school_setup set mode=coalesce(payload->>'mode',mode),operations=op,revision=revision+1,updated_at=now() where tenant_id=t;
 elsif action='identity' then
 if length(trim(payload->>'name')) not between 2 and 160 or length(payload->>'address')>500 or (payload->>'locale') not in ('id-ID','en-US') or not exists(select 1 from pg_timezone_names where name=payload->>'timezone') then raise exception 'Enter a valid school identity'; end if;
 update public.tenants set name=trim(payload->>'name'),legal_name=left(payload->>'legal_name',160),address=payload->>'address',contact_email=left(payload->>'contact_email',320),contact_phone=left(payload->>'contact_phone',40),timezone=payload->>'timezone',locale=payload->>'locale',week_starts_on=coalesce((payload->>'week_starts_on')::integer,1) where id=t;
 elsif action='launch' then
 state:=school_private.setup_state();
 if (state->>'blockers')::integer>0 then raise exception 'Resolve readiness blockers before launch' using errcode='23514'; end if;
 update public.school_setup set launched_at=coalesce(launched_at,now()),launched_by=coalesce(launched_by,auth.uid()),revision=revision+1,updated_at=now() where tenant_id=t;
 else raise exception 'Unknown setup action'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,after_state) values(t,auth.uid(),upper(action),'setup','school_setup',jsonb_build_object('action',action));
 return school_private.setup_state();
end $$;

-- The same canonical mutation path backs interactive setup and atomic imports.
create function school_private.setup_records(resource text,rows jsonb,dry_run boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); row jsonb; fields text[]; key text; payload jsonb; result jsonb; errors jsonb:='[]'; count integer:=0; n integer:=0; begin
 perform school_private.setup_access(true);
 if resource in ('academic_years','semesters','classrooms','subjects','teacher_assignments','student_assignments') then perform school_private.require_module('academic'); end if;
 fields:=case resource
 when 'academic_years' then array['name','starts_on','ends_on','is_active']
 when 'semesters' then array['academic_year_id','name','starts_on','ends_on','is_active']
 when 'classrooms' then array['academic_year_id','name','capacity','homeroom_teacher_user_id','grade_level','stream','campus','is_active']
 when 'subjects' then array['code','name','description','is_active']
 when 'teachers' then array['user_id','employee_number','employment_status']
 when 'students' then array['user_id','student_number','admission_date','enrollment_status']
 when 'teacher_assignments' then array['academic_year_id','semester_id','classroom_id','subject_id','teacher_id','is_active']
 when 'student_assignments' then array['academic_year_id','semester_id','classroom_id','student_id','is_active']
 when 'school_assets' then array['name','category','capacity','room_id','description','is_active']
 when 'school_guardians' then array['parent_user_id','student_id','relationship'] end;
 if fields is null or jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 500 or octet_length(rows::text)>500000 then raise exception 'Choose a supported resource and 1–500 rows'; end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text,707));
 begin
 for row in select value from jsonb_array_elements(rows) loop
 n:=n+1;
 begin
 payload:=row-'record_id';
 for key in select jsonb_object_keys(payload) loop if key<>all(fields) then raise exception 'Unsupported column: %',key; end if; end loop;
 if resource='classrooms' and payload->>'homeroom_teacher_user_id' is not null and not exists(select 1 from public.teachers te where te.tenant_id=t and te.user_id=(payload->>'homeroom_teacher_user_id')::uuid and te.employment_status='ACTIVE') then raise exception 'Choose an active school teacher as homeroom teacher'; end if;
 if resource in ('school_assets','school_guardians') then result:=school_private.save(resource,payload,(row->>'record_id')::uuid);
 else result:=public.mutate_tenant_record(auth.uid(),resource,(row->>'record_id')::uuid,case when row->>'record_id' is null then 'CREATE' else 'UPDATE' end,payload,'setup'); end if;
 count:=count+1;
 exception when others then errors:=errors||jsonb_build_array(jsonb_build_object('row',n,'message',sqlerrm)); end;
 end loop;
 if dry_run or jsonb_array_length(errors)>0 then raise exception using errcode='P7700',message='Rollback preview or invalid batch'; end if;
 exception when sqlstate 'P7700' then null;
 end;
 return jsonb_build_object('valid',jsonb_array_length(errors)=0,'errors',errors,'rows',count,'committed',not dry_run and jsonb_array_length(errors)=0,'record',case when not dry_run and jsonb_array_length(errors)=0 then result else null end);
end $$;

create function public.school_setup_state() returns jsonb language sql security invoker set search_path='' as $$ select school_private.setup_state() $$;
create function public.school_setup_action(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select school_private.setup_action(action,payload) $$;
create function public.school_setup_records(resource text,rows jsonb,dry_run boolean default true) returns jsonb language sql security invoker set search_path='' as $$ select school_private.setup_records(resource,rows,dry_run) $$;
revoke all on function school_private.setup_access(boolean),school_private.setup_state(),school_private.setup_action(text,jsonb),school_private.setup_records(text,jsonb,boolean),public.school_setup_state(),public.school_setup_action(text,jsonb),public.school_setup_records(text,jsonb,boolean) from public,anon,authenticated;
grant execute on function school_private.setup_state(),school_private.setup_action(text,jsonb),school_private.setup_records(text,jsonb,boolean),public.school_setup_state(),public.school_setup_action(text,jsonb),public.school_setup_records(text,jsonb,boolean) to authenticated;

create table public.school_setup_suggestions (
 id uuid primary key,tenant_id uuid not null references public.tenants(id),user_id uuid not null references public.users(id),
 status text not null default 'RESERVED' check(status in ('RESERVED','COMPLETED','FAILED')),
 context jsonb not null,result jsonb,model text,input_tokens integer,output_tokens integer,estimated_cost_usd numeric(12,8),
 created_at timestamptz not null default now(),completed_at timestamptz
);
alter table public.school_setup_suggestions enable row level security;
revoke all on public.school_setup_suggestions from public,anon,authenticated;
grant all on public.school_setup_suggestions to service_role;
create index on public.school_setup_suggestions(tenant_id,user_id,created_at desc);
create function school_private.setup_suggestion(action text,request_id uuid,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant();r public.school_setup_suggestions;ctx jsonb;begin
 perform school_private.setup_access(action='reserve');
 if request_id is null or octet_length(payload::text)>20000 then raise exception 'Invalid suggestion request';end if;
 if action='reserve' then
 perform pg_advisory_xact_lock(hashtextextended(t::text,778));
 if (select count(*) from public.school_setup_suggestions where tenant_id=t and created_at>now()-interval '1 day')>=15 then raise exception 'Daily setup assistance limit reached';end if;
 ctx:=school_private.setup_state();ctx:=jsonb_build_object('checks',ctx->'checks','counts',ctx->'counts','mode',ctx->'setup'->'mode');
 insert into public.school_setup_suggestions(id,tenant_id,user_id,context) values(request_id,t,auth.uid(),ctx) returning * into r;
 elsif action in ('finish','read') then
 select * into r from public.school_setup_suggestions where id=request_id and tenant_id=t and user_id=auth.uid() for update;
 if r.id is null then raise exception 'Suggestion access denied' using errcode='42501';end if;
 if action='finish' and r.status='RESERVED' then
 if payload->'result' is not null and payload->'result'<>'null'::jsonb and (jsonb_typeof(payload->'result')<>'object' or jsonb_typeof(payload->'result'->'steps')<>'array') then raise exception 'Invalid suggestion result';end if;
 update public.school_setup_suggestions set status=case when payload->'result' is null or payload->'result'='null'::jsonb then 'FAILED' else 'COMPLETED' end,result=payload->'result',model=left(payload->>'model',120),input_tokens=greatest(0,(payload->>'input_tokens')::integer),output_tokens=greatest(0,(payload->>'output_tokens')::integer),estimated_cost_usd=greatest(0,(payload->>'estimated_cost_usd')::numeric),completed_at=now() where id=request_id returning * into r;
 end if;
 else raise exception 'Unknown suggestion action';end if;
 return to_jsonb(r);
end $$;
create function public.school_setup_suggestion(action text,request_id uuid,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select school_private.setup_suggestion(action,request_id,payload)$$;
revoke all on function school_private.setup_suggestion(text,uuid,jsonb),public.school_setup_suggestion(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function school_private.setup_suggestion(text,uuid,jsonb),public.school_setup_suggestion(text,uuid,jsonb) to authenticated;

-- Resumable account imports resolve profiles by their canonical account key.
create function school_private.setup_profile(resource text,person_id uuid,identifier text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant();rid uuid;old_number text;field text;begin
 perform school_private.require_module('core');
 if not public.app_has_permission(auth.uid(),resource||'.create') then raise exception 'Profile creation permission required' using errcode='42501';end if;
 if resource not in ('students','teachers') or identifier is null or length(trim(identifier)) not between 1 and 80 then raise exception 'Select a profile and a valid number';end if;
 perform pg_advisory_xact_lock(hashtextextended(person_id::text,779));
 if not exists(select 1 from public.users u where u.id=person_id and u.tenant_id=t and u.is_active and public.app_role_in(u.id,case when resource='students' then array['STUDENT'] else array['TEACHER'] end)) then raise exception 'Matching active account required' using errcode='42501';end if;
 field:=case when resource='students' then 'student_number' else 'employee_number' end;
 execute format('select id,%I from public.%I where tenant_id=$1 and user_id=$2',field,resource) into rid,old_number using t,person_id;
 if rid is not null then
 if coalesce(old_number,'')<>trim(identifier) then raise exception 'Existing profile number differs. Review the profile before importing.';end if;
 return jsonb_build_object('valid',true,'record',jsonb_build_object('id',rid),'reused',true);
 end if;
 return jsonb_build_object('valid',true,'record',public.mutate_tenant_record(auth.uid(),resource,null,'CREATE',jsonb_build_object('user_id',person_id,field,trim(identifier)),'setup'));
end $$;
create function public.school_setup_profile(resource text,person_id uuid,identifier text) returns jsonb language sql security invoker set search_path='' as $$select school_private.setup_profile(resource,person_id,identifier)$$;
revoke all on function school_private.setup_profile(text,uuid,text),public.school_setup_profile(text,uuid,text) from public,anon,authenticated;
grant execute on function school_private.setup_profile(text,uuid,text),public.school_setup_profile(text,uuid,text) to authenticated;
