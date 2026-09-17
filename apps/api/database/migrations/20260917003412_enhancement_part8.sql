-- Part 8: private recruitment records, owner-only settlement accounts, follow-up.
create table public.school_settlement_accounts (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 bank_name text not null check(length(trim(bank_name)) between 2 and 100),
 account_name text not null check(length(trim(account_name)) between 2 and 160),
 account_number text not null check(account_number ~ '^[0-9]{5,40}$'),
 is_active boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,bank_name,account_number)
);
create unique index settlement_one_active on public.school_settlement_accounts(tenant_id) where is_active;
alter table public.school_settlement_accounts enable row level security;
revoke all on public.school_settlement_accounts from public,anon,authenticated;
grant all on public.school_settlement_accounts to service_role;

create table public.school_partner_applications (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 160),
 nik text not null check(nik ~ '^[0-9]{16}$'), phone text not null check(phone ~ '^\+?[0-9]{8,16}$'),
 domicile text not null check(length(trim(domicile)) between 2 and 300), occupation text not null check(length(trim(occupation)) between 2 and 200),
 school_count integer not null check(school_count between 0 and 100000), contacts text not null check(length(contacts) between 2 and 3000),
 cv bytea not null check(octet_length(cv) between 5 and 1048576 and substring(cv from 1 for 5)=decode('255044462d','hex')),
 cv_name text not null check(length(cv_name) between 1 and 180), photo_confirmed boolean not null check(photo_confirmed), consent_at timestamptz not null default now(),
 status text not null default 'NEW' check(status in ('NEW','REVIEW','INTERVIEW','ACCEPTED','REJECTED')),
 is_active boolean not null default false, partner_id uuid references public.school_partners(id),
 bank_name text, bank_account_name text, bank_account_number text check(bank_account_number is null or bank_account_number ~ '^[0-9]{5,40}$'),
 referral_schools text check(length(referral_schools)<=10000), owner_notes text check(length(owner_notes)<=5000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index partner_applications_nik_time on public.school_partner_applications(nik,created_at desc);
alter table public.school_partner_applications enable row level security;
revoke all on public.school_partner_applications from public,anon,authenticated;
grant all on public.school_partner_applications to service_role;
alter table public.school_leads add column follow_up text not null default 'NOT_STARTED' check(follow_up in ('NOT_STARTED','IN_PROGRESS','DONE'));

create function school_private.partner_apply(payload jsonb,cv_base64 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result_id uuid; bytes bytea;begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>10000 or length(cv_base64)>1398104 or coalesce((payload->>'consent')::boolean,false)=false or coalesce(payload->>'website','')<>'' then raise exception 'Invalid application' using errcode='22023';end if;
 bytes:=decode(cv_base64,'base64');
 perform pg_advisory_xact_lock(hashtextextended('partner_applications',8));
 if (select count(*) from public.school_partner_applications where created_at>now()-interval '1 day')>=100 or exists(select 1 from public.school_partner_applications where nik=payload->>'nik' and created_at>now()-interval '30 days') then raise exception 'An application was already received or today’s intake is full. Please contact OSEKOLA.' using errcode='P0001';end if;
 insert into public.school_partner_applications(name,nik,phone,domicile,occupation,school_count,contacts,cv,cv_name,photo_confirmed)
 values(trim(payload->>'name'),payload->>'nik',payload->>'phone',trim(payload->>'domicile'),trim(payload->>'occupation'),(payload->>'school_count')::integer,payload->>'contacts',bytes,payload->>'cv_name',(payload->>'photo_confirmed')::boolean) returning id into result_id;
 return jsonb_build_object('id',result_id,'status','NEW');
end $$;
create function public.school_partner_apply(payload jsonb,cv_base64 text) returns jsonb language sql security definer set search_path='' as $$select school_private.partner_apply(payload,cv_base64)$$;
revoke all on function school_private.partner_apply(jsonb,text),public.school_partner_apply(jsonb,text) from public,anon,authenticated;
grant execute on function public.school_partner_apply(jsonb,text) to anon,authenticated;

-- New kinds share the established owner checks and audit model.
alter function school_private.owner_list(text,jsonb,integer,integer) rename to owner_list_before_part8;
create function school_private.owner_list(kind text,filters jsonb default '{}',page_number integer default 1,page_size integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb; total bigint;begin
 perform school_private.require_owner();
 if kind not in ('settlement_accounts','applications') then return school_private.owner_list_before_part8(kind,filters,page_number,page_size);end if;
 if page_number<1 or page_size not between 1 and 100 or length(coalesce(filters->>'query',''))>160 then raise exception 'Invalid pagination';end if;
 if kind='settlement_accounts' then
 select count(*) into total from public.school_settlement_accounts where tenant_id=(filters->>'tenant_id')::uuid;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (select * from public.school_settlement_accounts where tenant_id=(filters->>'tenant_id')::uuid order by is_active desc,created_at desc,id limit page_size offset (page_number-1)::bigint*page_size)q;
 else
 select count(*) into total from public.school_partner_applications r where (coalesce(filters->>'query','')='' or strpos(lower(r.name||' '||r.phone||' '||r.domicile),lower(filters->>'query'))>0) and (coalesce(filters->>'status','')='' or r.status=filters->>'status');
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into items from (select id,name,right(nik,4) as nik_last4,phone,domicile,occupation,school_count,contacts,cv_name,status,is_active,partner_id,bank_name,bank_account_name,bank_account_number,referral_schools,owner_notes,created_at from public.school_partner_applications r where (coalesce(filters->>'query','')='' or strpos(lower(r.name||' '||r.phone||' '||r.domicile),lower(filters->>'query'))>0) and (coalesce(filters->>'status','')='' or r.status=filters->>'status') order by created_at desc,id limit page_size offset (page_number-1)::bigint*page_size)q;
 end if;
 return jsonb_build_object('items',items,'total',total,'page',page_number,'page_size',page_size);
end $$;
alter function school_private.owner_save(text,jsonb,uuid) rename to owner_save_before_part8;
create function school_private.owner_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare row_id uuid:=coalesce(record_id,gen_random_uuid());t uuid;prev jsonb;result jsonb;begin
 perform school_private.require_owner();
 if kind not in ('settlement_account','application','lead_follow_up') then return school_private.owner_save_before_part8(kind,payload,record_id);end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>18000 then raise exception 'Invalid data';end if;
 if kind='settlement_account' then
 select tenant_id,to_jsonb(a) into t,prev from public.school_settlement_accounts a where id=record_id;
 if record_id is not null and t is null then raise exception 'Account not found';end if;
 t:=coalesce(t,(payload->>'tenant_id')::uuid);
 if t is null or not exists(select 1 from public.tenants where id=t and deleted_at is null) then raise exception 'School not found';end if;
 if payload ? 'tenant_id' and (payload->>'tenant_id')::uuid<>t then raise exception 'Account school cannot change';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text,808));
 if coalesce((payload->>'is_active')::boolean,false) then update public.school_settlement_accounts set is_active=false,updated_at=now() where tenant_id=t and is_active;end if;
 if record_id is null then
 insert into public.school_settlement_accounts(id,tenant_id,bank_name,account_name,account_number,is_active) values(row_id,t,payload->>'bank_name',payload->>'account_name',payload->>'account_number',coalesce((payload->>'is_active')::boolean,false));
 else update public.school_settlement_accounts set bank_name=coalesce(payload->>'bank_name',bank_name),account_name=coalesce(payload->>'account_name',account_name),account_number=coalesce(payload->>'account_number',account_number),is_active=coalesce((payload->>'is_active')::boolean,is_active),updated_at=now() where id=row_id;end if;
 select to_jsonb(a) into result from public.school_settlement_accounts a where id=row_id;
 elsif kind='application' then
 select to_jsonb(a)-'cv'-'nik' into prev from public.school_partner_applications a where id=record_id for update;
 if prev is null then raise exception 'Application not found';end if;
 update public.school_partner_applications set name=coalesce(payload->>'name',name),phone=coalesce(payload->>'phone',phone),domicile=coalesce(payload->>'domicile',domicile),occupation=coalesce(payload->>'occupation',occupation),school_count=coalesce((payload->>'school_count')::integer,school_count),contacts=coalesce(payload->>'contacts',contacts),status=coalesce(payload->>'status',status),is_active=coalesce((payload->>'is_active')::boolean,is_active),bank_name=coalesce(payload->>'bank_name',bank_name),bank_account_name=coalesce(payload->>'bank_account_name',bank_account_name),bank_account_number=coalesce(nullif(payload->>'bank_account_number',''),bank_account_number),referral_schools=coalesce(payload->>'referral_schools',referral_schools),owner_notes=coalesce(payload->>'owner_notes',owner_notes),partner_id=coalesce(nullif(payload->>'partner_id','')::uuid,partner_id),updated_at=now() where id=record_id;
 select to_jsonb(a)-'cv'-'nik' into result from public.school_partner_applications a where id=record_id;
 else
 update public.school_leads set follow_up=payload->>'follow_up',updated_at=now() where id=record_id returning to_jsonb(school_leads.*) into result;
 if result is null then raise exception 'Lead not found';end if;
 end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,before_state,after_state) values(school_private.tenant(),auth.uid(),'UPDATE','owner',kind,row_id,case when kind='settlement_account' then jsonb_build_object('is_active',prev->'is_active') else null end,jsonb_build_object('id',row_id,'is_active',result->'is_active','status',result->'status','follow_up',result->'follow_up'));
 return result;
end $$;
create function school_private.partner_document(application_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin perform school_private.require_owner();select jsonb_build_object('name',cv_name,'data',encode(cv,'base64'),'nik',nik) into result from public.school_partner_applications where id=application_id;if result is null then raise exception 'Application not found';end if;return result;end$$;
create function public.school_partner_document(application_id uuid) returns jsonb language sql security invoker set search_path='' as $$select school_private.partner_document(application_id)$$;
revoke all on function school_private.owner_list(text,jsonb,integer,integer),school_private.owner_save(text,jsonb,uuid),school_private.partner_document(uuid),public.school_partner_document(uuid) from public,anon,authenticated;
grant execute on function school_private.owner_list(text,jsonb,integer,integer),school_private.owner_save(text,jsonb,uuid),school_private.partner_document(uuid),public.school_partner_document(uuid) to authenticated;

-- Retain historical generated content and audit records; remove generation capability.
revoke all on function public.school_setup_suggestion(text,uuid,jsonb),school_private.setup_suggestion(text,uuid,jsonb),public.school_ai_reserve(uuid,uuid,integer),school_private.ai_reserve(uuid,uuid,integer),public.school_ai_finish(uuid,jsonb,jsonb),school_private.ai_finish(uuid,jsonb,jsonb) from public,anon,authenticated;
-- Multi-program configuration preserves old records and leaves O-Team unchanged.
alter table public.school_curriculum_programs add column program_type text not null default 'CURRICULUM' check(program_type in ('CURRICULUM','QUALIFICATION','PEDAGOGY','ENRICHMENT'));
alter table public.school_curriculum_programs add column valid_from date;
alter table public.school_curriculum_programs add column valid_until date;
alter table public.school_curriculum_programs add constraint program_dates check(valid_until is null or valid_from is null or valid_until>=valid_from);
alter table public.school_curriculum_programs drop constraint school_curriculum_programs_framework_check;
alter table public.school_curriculum_programs add constraint school_curriculum_programs_framework_check check(framework in ('MERDEKA','K13','CAMBRIDGE','IB_PYP','IB_MYP','IB_DP','IB_CP','EDEXCEL','IEYC','IPC','IMYC','MONTESSORI','SINGAPORE','US_STANDARDS','AP','AUSTRALIAN','MADRASAH','SIT','SCHOOL'));
alter table public.school_curriculum_enrollments add column valid_from date;
alter table public.school_curriculum_enrollments add column valid_until date;
alter table public.school_curriculum_enrollments add column participation text not null default 'INCLUDE' check(participation in ('INCLUDE','EXCLUDE'));
alter table public.school_curriculum_enrollments add column subject_ids uuid[] not null default '{}';
alter table public.school_curriculum_enrollments add constraint enrollment_dates check(valid_until is null or valid_from is null or valid_until>=valid_from);
alter table public.school_curriculum_enrollments add constraint exclusion_individual check(participation='INCLUDE' or student_id is not null);
do $$declare n text;begin select conname into n from pg_constraint where conrelid='public.school_curriculum_enrollments'::regclass and contype='u';execute format('alter table public.school_curriculum_enrollments drop constraint %I',n);end$$;
create unique index curriculum_enrollment_period on public.school_curriculum_enrollments(program_id,stage_id,classroom_id,student_id,valid_from) nulls not distinct;
alter table public.school_curriculum_scales add column rubric_dimensions text[] not null default '{}';
alter table public.school_curriculum_evidence add column rubric_results jsonb not null default '{}';
alter table public.school_curriculum_alignments add column relationship text not null default 'SUPPORTS' check(relationship in ('EQUIVALENT','PARTIAL','SUPPORTS'));

create or replace function school_private.curriculum_enrolled(course uuid,subject uuid,student uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses c join public.school_curriculum_subjects cs on cs.id=subject and cs.subject_id=c.subject_id
 join public.school_curriculum_programs p on p.id=cs.program_id and p.academic_year_id=c.academic_year_id and p.is_active and (p.valid_from is null or p.valid_from<=current_date) and (p.valid_until is null or p.valid_until>=current_date)
 join public.school_curriculum_stages st on st.id=cs.stage_id and st.is_active
 join public.school_curriculum_enrollments e on e.program_id=p.id and e.stage_id=cs.stage_id and e.classroom_id=c.classroom_id and e.is_active
 where c.id=course and cs.is_active and e.participation='INCLUDE' and (e.valid_from is null or e.valid_from<=current_date) and (e.valid_until is null or e.valid_until>=current_date)
 and (cardinality(e.subject_ids)=0 or subject=any(e.subject_ids)) and (student is null or e.student_id is null or e.student_id=student)
 and (student is null or not exists(select 1 from public.school_curriculum_enrollments x where x.program_id=p.id and x.stage_id=cs.stage_id and x.classroom_id=c.classroom_id and x.student_id=student and x.is_active and x.participation='EXCLUDE' and (x.valid_from is null or x.valid_from<=current_date) and (x.valid_until is null or x.valid_until>=current_date) and (cardinality(x.subject_ids)=0 or subject=any(x.subject_ids)))))
$$;
create function school_private.curriculum_part8_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare d text;scale public.school_curriculum_scales;begin
 if tg_table_name='school_curriculum_enrollments' then
 if exists(select 1 from unnest(new.subject_ids)x where not exists(select 1 from public.school_curriculum_subjects s where s.id=x and s.program_id=new.program_id and s.stage_id=new.stage_id)) then raise exception 'Electives must belong to this programme stage' using errcode='23514';end if;
 elsif tg_table_name='school_curriculum_scales' then
 if cardinality(new.rubric_dimensions)>30 or exists(select 1 from unnest(new.rubric_dimensions)x where length(trim(x)) not between 1 and 160) or (select count(distinct x) from unnest(new.rubric_dimensions)x)<>cardinality(new.rubric_dimensions) then raise exception 'Use up to 30 distinct rubric dimensions';end if;
 if tg_op='UPDATE' and new.rubric_dimensions is distinct from old.rubric_dimensions and exists(select 1 from public.school_curriculum_evidence where scale_id=new.id) then raise exception 'Create a new rubric version after assessment';end if;
 elsif tg_table_name='school_curriculum_evidence' then
 select * into scale from public.school_curriculum_scales where id=new.scale_id;
 if jsonb_typeof(new.rubric_results) is distinct from 'object' or octet_length(new.rubric_results::text)>6000 then raise exception 'Invalid rubric results';end if;
 if exists(select 1 from jsonb_object_keys(new.rubric_results)k where not k=any(scale.rubric_dimensions)) then raise exception 'Unknown rubric dimension';end if;
 foreach d in array scale.rubric_dimensions loop
 if new.status='PUBLISHED' and not new.rubric_results ? d then raise exception 'Complete all rubric dimensions before publishing';end if;
 if new.rubric_results ? d and (jsonb_typeof(new.rubric_results->d) not in ('string','number') or length(trim(new.rubric_results->>d)) not between 1 and 160) then raise exception 'Enter a result for each rubric dimension';end if;
 end loop;
 end if;
 return new;
end$$;
create trigger part8_integrity before insert or update on public.school_curriculum_enrollments for each row execute function school_private.curriculum_part8_integrity();
create trigger part8_integrity before insert or update on public.school_curriculum_scales for each row execute function school_private.curriculum_part8_integrity();
create trigger part8_integrity before insert or update on public.school_curriculum_evidence for each row execute function school_private.curriculum_part8_integrity();
revoke all on function school_private.curriculum_part8_integrity() from public,anon,authenticated;

create function school_private.curriculum_history() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,before_state,after_state) values(new.tenant_id,auth.uid(),'UPDATE','curriculum',tg_table_name,new.id,to_jsonb(old),to_jsonb(new));return new;end$$;
create trigger curriculum_history after update on public.school_curriculum_enrollments for each row execute function school_private.curriculum_history();
create trigger curriculum_history after update on public.school_curriculum_programs for each row execute function school_private.curriculum_history();
revoke all on function school_private.curriculum_history() from public,anon,authenticated;

-- Provider results are source records, never calculated equivalents of internal marks.
create table public.school_qualification_results (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),program_id uuid not null references public.school_curriculum_programs(id),student_id uuid not null references public.students(id),
 specification text not null check(length(trim(specification)) between 1 and 160),pathway text not null check(pathway in ('LINEAR','MODULAR')),
 unit_code text,session_name text not null check(length(trim(session_name)) between 1 and 120),session_date date,
 raw_score numeric check(raw_score>=0 and raw_score::text not in ('NaN','Infinity','-Infinity')),ums numeric check(ums>=0 and ums::text not in ('NaN','Infinity','-Infinity')),
 unit_grade text,qualification_grade text,cash_in_status text not null default 'NOT_REQUESTED' check(cash_in_status in ('NOT_REQUESTED','REQUESTED','CONFIRMED')),
 official_reference text not null check(length(trim(official_reference)) between 1 and 500),supersedes_id uuid references public.school_qualification_results(id),
 status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED')),context jsonb not null default '{}',recorded_by uuid not null references public.users(id),created_at timestamptz not null default now()
);
alter table public.school_qualification_results enable row level security;
revoke all on public.school_qualification_results from public,anon,authenticated;
grant all on public.school_qualification_results to service_role;
create index qualification_student on public.school_qualification_results(tenant_id,student_id,created_at desc);
create function school_private.qualifications(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant();result jsonb;p public.school_curriculum_programs;s uuid:=(payload->>'student_id')::uuid;rid uuid;begin
 if action='list' then
 if school_private.role(array['STAFF','TEACHER']) then perform school_private.require_module('academic');end if;
 if not school_private.role(array['STAFF','TEACHER']) and (s is null or not school_private.child(s)) then raise exception 'Student access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(q) from (select * from public.school_qualification_results r where tenant_id=t and (s is null or student_id=s) and (nullif(payload->>'program_id','') is null or program_id=(payload->>'program_id')::uuid) and (school_private.role(array['STAFF','TEACHER']) or status='PUBLISHED') order by created_at desc,id limit 100 offset greatest(coalesce((payload->>'offset')::integer,0),0))q),'[]');
 end if;
 perform school_private.require_module('academic');
 if action<>'save' or octet_length(payload::text)>10000 then raise exception 'Invalid qualification action';end if;
 select * into p from public.school_curriculum_programs where id=(payload->>'program_id')::uuid and tenant_id=t;
 if p.id is null or not exists(select 1 from public.students where id=s and tenant_id=t) then raise exception 'Programme and student must belong to this school';end if;
 if not exists(select 1 from public.school_curriculum_enrollments e where e.program_id=p.id and e.participation='INCLUDE' and (e.student_id=s or (e.student_id is null and exists(select 1 from public.student_assignments a where a.student_id=s and a.classroom_id=e.classroom_id and a.academic_year_id=p.academic_year_id)))) then raise exception 'Student needs a programme enrolment before recording a result';end if;
 if payload->>'supersedes_id' is not null and not exists(select 1 from public.school_qualification_results where id=(payload->>'supersedes_id')::uuid and student_id=s and program_id=p.id and tenant_id=t) then raise exception 'Previous result must belong to this student and programme';end if;
 insert into public.school_qualification_results(tenant_id,program_id,student_id,specification,pathway,unit_code,session_name,session_date,raw_score,ums,unit_grade,qualification_grade,cash_in_status,official_reference,supersedes_id,status,recorded_by,context)
 values(t,p.id,s,payload->>'specification',payload->>'pathway',payload->>'unit_code',payload->>'session_name',(payload->>'session_date')::date,(payload->>'raw_score')::numeric,(payload->>'ums')::numeric,payload->>'unit_grade',payload->>'qualification_grade',coalesce(payload->>'cash_in_status','NOT_REQUESTED'),payload->>'official_reference',(payload->>'supersedes_id')::uuid,coalesce(payload->>'status','DRAFT'),auth.uid(),jsonb_build_object('program',to_jsonb(p))) returning id into rid;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id) values(t,auth.uid(),'CREATE','academic','school_qualification_results',rid);
 return jsonb_build_object('id',rid);
end$$;
create function public.school_qualifications(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select school_private.qualifications(action,payload)$$;
revoke all on function school_private.qualifications(text,jsonb),public.school_qualifications(text,jsonb) from public,anon,authenticated;
grant execute on function school_private.qualifications(text,jsonb),public.school_qualifications(text,jsonb) to authenticated;

create or replace function school_private.setup_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 union all select 'mapping','academic',case when not exists(select 1 from public.school_curriculum_programs where tenant_id=t and academic_year_id=y and is_active) then 1 else count(*)::integer end from public.school_curriculum_programs p where p.tenant_id=t and p.academic_year_id=y and p.is_active and (not exists(select 1 from public.school_curriculum_stages s where s.program_id=p.id and s.is_active) or not exists(select 1 from public.school_curriculum_subjects s where s.program_id=p.id and s.is_active) or not exists(select 1 from public.school_curriculum_scales s where s.program_id=p.id and s.is_active))
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


create or replace function school_private.assessment(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); eid uuid:=(payload->>'exam_id')::uuid; cid uuid:=(payload->>'course_id')::uuid; e public.exams; d public.school_assessment_designs; a public.school_exam_attempts; item jsonb; errors jsonb:='[]'; result jsonb; sid uuid; unit public.school_learning_units; uid uuid; total numeric; begin
 perform school_private.require_module('exams');
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>100000 then raise exception 'Invalid assessment request'; end if;
 if action='courses' then
 return coalesce((select jsonb_agg(school_private.studio_context(c.id) order by c.name) from public.courses c where c.tenant_id=t and school_private.teaches(c.id)),'[]');
 elsif action='course' then
 if not school_private.teaches(cid) then raise exception 'Course teacher required' using errcode='42501'; end if;
 return jsonb_build_object('context',school_private.studio_context(cid),
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title)) from public.school_learning_units where course_id=cid),'[]'),
 'outcomes',coalesce((select jsonb_agg(to_jsonb(o)) from public.school_curriculum_outcomes o where o.is_active and exists(select 1 from public.school_curriculum_course_links l where l.course_id=cid and l.curriculum_subject_id=o.curriculum_subject_id and l.is_active)),'[]'));
 elsif action='save' then
 if not school_private.teaches(cid) or not public.app_has_permission(auth.uid(),'exams.create') then raise exception 'Course teacher required' using errcode='42501'; end if;
 if eid is not null then select * into e from public.exams where id=eid and tenant_id=t and course_id=cid for update; if e.id is null or e.status<>'DRAFT' then raise exception 'Only a draft assessment may be edited'; end if; end if;
 if payload->>'unit_id' is not null and not exists(select 1 from public.school_learning_units where id=(payload->>'unit_id')::uuid and course_id=cid and tenant_id=t) then raise exception 'Choose a unit from this class'; end if;
 if jsonb_typeof(coalesce(payload->'blueprint','[]'))<>'array' then raise exception 'Invalid blueprint'; end if;
 for item in select value from jsonb_array_elements(coalesce(payload->'blueprint','[]')) loop
 if item->>'count' is null or item->>'weight' is null or (item->>'weight')::numeric::text in ('NaN','Infinity','-Infinity') or (item->>'count')::integer not between 1 and 100 or (item->>'weight')::numeric not between 0.01 and 100 or not exists(select 1 from public.school_curriculum_outcomes o join public.school_curriculum_course_links l on l.curriculum_subject_id=o.curriculum_subject_id where o.id=(item->>'outcome_id')::uuid and o.is_active and l.course_id=cid and l.is_active) then raise exception 'Choose mapped outcomes, question counts and positive weights'; end if;
 end loop;
 if eid is null then insert into public.exams(tenant_id,course_id,title,description,starts_at,ends_at) values(t,cid,payload->>'title',payload->>'instructions',(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz) returning id into eid;
 else update public.exams set title=payload->>'title',description=payload->>'instructions',starts_at=(payload->>'starts_at')::timestamptz,ends_at=(payload->>'ends_at')::timestamptz where id=eid; end if;
 insert into public.school_assessment_designs(exam_id,tenant_id,unit_id,kind,duration_minutes,instructions,result_mode,blueprint) values(eid,t,(payload->>'unit_id')::uuid,coalesce(payload->>'kind','QUIZ'),coalesce((payload->>'duration_minutes')::integer,60),coalesce(payload->>'instructions',''),coalesce(payload->>'result_mode','FEEDBACK'),coalesce(payload->'blueprint','[]')) on conflict(exam_id) do update set unit_id=excluded.unit_id,kind=excluded.kind,duration_minutes=excluded.duration_minutes,instructions=excluded.instructions,result_mode=excluded.result_mode,blueprint=excluded.blueprint;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id) values(t,auth.uid(),'SAVE','exams','assessment_studio',eid);
 return jsonb_build_object('id',eid);
 end if;
 select * into e from public.exams where id=eid and tenant_id=t;
 select * into d from public.school_assessment_designs where exam_id=eid;
 if e.id is null then raise exception 'Assessment not found' using errcode='42501'; end if;
 if action='ready' then
 select id into sid from public.students where user_id=auth.uid() and tenant_id=t;
 if not school_private.teaches(e.course_id) and not school_private.exam_visible(eid,sid) then raise exception 'Assessment access denied' using errcode='42501'; end if;
 return jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,'duration_minutes',coalesce(d.duration_minutes,ceil(extract(epoch from (e.ends_at-e.starts_at))/60)::integer),
 'instructions',coalesce(d.instructions,e.description,''),'result_mode',coalesce(d.result_mode,'FEEDBACK'),'extra_minutes',coalesce((select extra_minutes from public.school_assessment_participants where exam_id=eid and student_id=sid),0),'question_count',(select count(*) from public.school_exam_items where exam_id=eid),'server_time',now(),'attempt',(select jsonb_build_object('id',id,'status',status) from public.school_exam_attempts where exam_id=eid and user_id=auth.uid()));
 end if;
 if not school_private.teaches(e.course_id) then raise exception 'Course teacher required' using errcode='42501'; end if;
 if action in ('design','check') then
 if e.starts_at is null or e.ends_at is null or e.ends_at<=now() then errors:=errors||'"schedule"'::jsonb; end if;
 if not exists(select 1 from public.school_exam_items where exam_id=eid) then errors:=errors||'"questions"'::jsonb; end if;
 if exists(select 1 from public.school_learning_spaces where course_id=e.course_id and status<>'LIVE') then errors:=errors||'"class_draft"'::jsonb; end if;
 if d.unit_id is not null and not exists(select 1 from public.school_learning_units where id=d.unit_id and published) then errors:=errors||'"unit_draft"'::jsonb; end if;
 if not exists(select 1 from public.students s where s.tenant_id=t and school_private.studio_visible('courses',e.course_id,s.id) and (d.unit_id is null or school_private.studio_visible('units',d.unit_id,s.id))) then errors:=errors||'"participants"'::jsonb; end if;
 if jsonb_array_length(coalesce(d.blueprint,'[]'))>0 then
 select sum((v->>'weight')::numeric) into total from jsonb_array_elements(d.blueprint)v;
 if total is distinct from 100::numeric then errors:=errors||'"weights"'::jsonb; end if;
 for item in select value from jsonb_array_elements(d.blueprint) loop
 if (select count(*) from public.school_exam_items i where i.exam_id=eid and i.snapshot->>'outcome_id'=item->>'outcome_id') is distinct from (item->>'count')::bigint then errors:=errors||jsonb_build_array('coverage:'||(item->>'outcome_id')); end if;
 end loop;
 if exists(select 1 from public.school_exam_items i where i.exam_id=eid and not exists(select 1 from jsonb_array_elements(d.blueprint)v where v->>'outcome_id'=i.snapshot->>'outcome_id')) then errors:=errors||'"unmapped_questions"'::jsonb; end if;
 end if;
 return jsonb_build_object('exam',to_jsonb(e),'design',coalesce(to_jsonb(d),'{}'),'issues',errors,'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'question_id',question_id,'position',position,'content',snapshot) order by position) from public.school_exam_items where exam_id=eid),'[]'));
 elsif action='map_question' then
 if e.status<>'DRAFT' then raise exception 'Published questions are immutable'; end if;
 if not exists(select 1 from jsonb_array_elements(d.blueprint)v where v->>'outcome_id'=payload->>'outcome_id') then raise exception 'Select a blueprint outcome'; end if;
 if jsonb_typeof(coalesce(payload->'outcome_ids','[]'))<>'array' then raise exception 'Invalid additional outcomes';end if;
 if exists(select 1 from jsonb_array_elements_text(coalesce(payload->'outcome_ids','[]'))v where not exists(select 1 from public.school_curriculum_outcomes o join public.school_curriculum_course_links l on l.curriculum_subject_id=o.curriculum_subject_id where o.id=v::uuid and l.course_id=e.course_id and o.is_active and l.is_active)) then raise exception 'Additional outcomes must be mapped to the course';end if;
 update public.school_exam_items set snapshot=snapshot||jsonb_build_object('outcome_id',payload->>'outcome_id','outcome_ids',coalesce(payload->'outcome_ids','[]')) where id=(payload->>'item_id')::uuid and exam_id=eid;
 elsif action='accommodation' then
 sid:=(payload->>'student_id')::uuid;
 if length(trim(coalesce(payload->>'reason','')))<3 or not exists(select 1 from public.school_assessment_participants where exam_id=eid and student_id=sid) then raise exception 'Select a participant and record the reason'; end if;
 update public.school_assessment_participants set extra_minutes=(payload->>'extra_minutes')::integer,reason=payload->>'reason' where exam_id=eid and student_id=sid;
 update public.school_exam_attempts set deadline=least(e.ends_at,started_at+make_interval(mins=>coalesce(d.duration_minutes,480)))+make_interval(mins=>(payload->>'extra_minutes')::integer) where exam_id=eid and student_id=sid and status='IN_PROGRESS';
 elsif action='release' then
 select * into a from public.school_exam_attempts where id=(payload->>'attempt_id')::uuid and exam_id=eid for update;
 if a.id is null or a.status<>'GRADED' or a.reviewed_at is null then raise exception 'Review this result before publication'; end if;
 if d.result_mode='DISCUSSION' and (now()<e.ends_at or exists(select 1 from public.school_exam_attempts where exam_id=eid and status='IN_PROGRESS')) then raise exception 'Discussion can be released after all attempts and the exam window have ended'; end if;
 update public.school_exam_attempts set released_at=now() where id=a.id;
 update public.exam_results set score=a.score,status='PUBLISHED',graded_at=now() where exam_session_id=a.session_id and student_id=a.student_id;
 elsif action='live' then
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select s.id as student_id,u.full_name,att.id as attempt_id,coalesce(att.status,'NOT_STARTED') as status,att.saved_at,att.submitted_at,att.deadline,att.score,att.reviewed_at,att.released_at,coalesce(p.extra_minutes,0) as extra_minutes
 from public.students s join public.users u on u.id=s.user_id left join public.school_exam_attempts att on att.student_id=s.id and att.exam_id=eid left join public.school_assessment_participants p on p.student_id=s.id and p.exam_id=eid
 where s.tenant_id=t and (p.student_id is not null or (d.exam_id is null and school_private.exam_visible(eid,s.id))) order by u.full_name limit 5000)q),'[]');
 elsif action='remedial' then
 perform school_private.require_module('learning');
 for sid in select value::uuid from jsonb_array_elements_text(payload->'student_ids') loop
 if not exists(select 1 from public.school_exam_attempts where exam_id=eid and student_id=sid and released_at is not null) then raise exception 'Choose learners with released results'; end if;end loop;
 if jsonb_array_length(coalesce(payload->'student_ids','[]'))=0 then raise exception 'Choose at least one learner'; end if;
 insert into public.school_learning_units(tenant_id,course_id,title,description,position,outcome_ids,student_ids,source_exam_id)
 values(t,e.course_id,payload->>'title',payload->>'description',coalesce((select max(position)+1 from public.school_learning_units where course_id=e.course_id),1),array(select (v->>'outcome_id')::uuid from jsonb_array_elements(coalesce(d.blueprint,'[]'))v),array(select value::uuid from jsonb_array_elements_text(payload->'student_ids')),eid) returning id into uid;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(t,auth.uid(),upper(action),'exams','assessment_studio',eid,jsonb_build_object('created_id',uid));
 return jsonb_build_object('id',uid,'course_id',e.course_id);
 elsif action='retake' then
 insert into public.exams(tenant_id,course_id,title,description) values(t,e.course_id,left(e.title||' · Retake',200),e.description) returning id into uid;
 insert into public.school_assessment_designs(exam_id,tenant_id,unit_id,source_exam_id,kind,duration_minutes,instructions,result_mode,blueprint) values(uid,t,d.unit_id,eid,'RETAKE',coalesce(d.duration_minutes,60),coalesce(d.instructions,''),coalesce(d.result_mode,'FEEDBACK'),coalesce(d.blueprint,'[]'));
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(t,auth.uid(),upper(action),'exams','assessment_studio',eid,jsonb_build_object('created_id',uid));
 return jsonb_build_object('id',uid,'course_id',e.course_id);
 else raise exception 'Unknown assessment action'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(t,auth.uid(),upper(action),'exams','assessment_studio',eid,jsonb_build_object('attempt_id',payload->'attempt_id','student_id',payload->'student_id','extra_minutes',payload->'extra_minutes','reason',payload->'reason'));
 return jsonb_build_object('id',eid);
end $$;
