create table public.school_admission_cycles (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),name text not null check(length(trim(name)) between 2 and 160),
 opens_at timestamptz not null,closes_at timestamptz not null,fee_amount numeric(14,0) not null default 0 check(fee_amount>=0),
 exam_at timestamptz,exam_location text not null default '',instructions text not null default '',is_published boolean not null default false,
 created_at timestamptz not null default now(),check(closes_at>opens_at),check(length(instructions)<=6000 and length(exam_location)<=500)
);
create table public.school_admission_applications (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),cycle_id uuid not null references public.school_admission_cycles(id),
 applicant_user_id uuid references public.users(id),access_hash text not null,number text not null unique,
 full_name text not null check(length(trim(full_name)) between 2 and 200),birth_date date not null,previous_school text not null default '',
 guardian_name text not null check(length(trim(guardian_name)) between 2 and 200),email text not null check(email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 phone text not null check(length(phone) between 7 and 30),fee_amount numeric(14,0) not null check(fee_amount>=0),
 payment_status text not null check(payment_status in ('UNPAID','PAID')),selection_status text not null default 'PENDING' check(selection_status in ('PENDING','ELIGIBLE','INELIGIBLE')),
 selection_note text not null default '',selection_published_at timestamptz,exam_card_issued_at timestamptz,
 final_status text not null default 'PENDING' check(final_status in ('PENDING','PASSED','WAITLIST','NOT_PASSED')),final_note text not null default '',final_published_at timestamptz,
 consent_at timestamptz not null default now(),created_at timestamptz not null default now(),unique(cycle_id,full_name,birth_date,email),check(length(previous_school)<=200 and length(selection_note)<=3000 and length(final_note)<=3000)
);
create table public.school_admission_receipts (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),application_id uuid not null unique references public.school_admission_applications(id),
 amount numeric(14,0) not null check(amount>0),reference text not null check(length(trim(reference)) between 3 and 200),paid_at timestamptz not null,created_by uuid references public.users(id),created_at timestamptz not null default now()
);
create index admission_cycles_tenant on public.school_admission_cycles(tenant_id);
create index admission_applications_cycle on public.school_admission_applications(tenant_id,cycle_id,created_at desc);
create index admission_applications_account on public.school_admission_applications(applicant_user_id);
create index admission_applications_rate on public.school_admission_applications(lower(email),created_at);
create index admission_receipts_tenant on public.school_admission_receipts(tenant_id);
do $$ declare tab text; begin foreach tab in array array['school_admission_cycles','school_admission_applications','school_admission_receipts'] loop
 execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from anon,authenticated',tab);
 end loop;end $$;
create function school_private.admission_manage() returns boolean language sql stable security definer set search_path='' as $$
 select school_private.role(array['STAFF','TEACHER']) and public.app_module_enabled(auth.uid(),'core')
$$;
create function school_private.admission_public(school_code text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('school',jsonb_build_object('name',t.name,'code',t.code),'cycles',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'opens_at',c.opens_at,'closes_at',c.closes_at,'fee_amount',c.fee_amount,'exam_at',c.exam_at,'exam_location',c.exam_location,'instructions',c.instructions,'registration_open',now() between c.opens_at and c.closes_at)) from public.school_admission_cycles c where c.tenant_id=t.id and c.is_published),'[]')) from public.tenants t left join public.school_settings s on s.tenant_id=t.id where lower(t.code)=lower(school_code) and t.is_active and coalesce(s.modules->'core','true'::jsonb)='true'::jsonb
$$;
create function school_private.admission_register(cycle uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.school_admission_cycles; app uuid; token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); registrant_email text:=lower(trim(payload->>'email')); actor uuid; begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>5000 or payload->>'consent' is distinct from 'true' then raise exception 'Valid registration and consent required'; end if;
 select * into c from public.school_admission_cycles where id=cycle and is_published and now() between opens_at and closes_at for share;
 if c.id is null or not exists(select 1 from public.tenants where id=c.tenant_id and is_active) then raise exception 'Registration is closed'; end if;
 if (payload->>'birth_date')::date not between current_date-interval '30 years' and current_date then raise exception 'Invalid birth date'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c.tenant_id::text,725));
 if (select count(*) from public.school_admission_applications a where a.tenant_id=c.tenant_id and a.created_at>now()-interval '1 day')>=1000 or (select count(*) from public.school_admission_applications a where lower(a.email)=registrant_email and a.created_at>now()-interval '1 day')>=5 then raise exception 'Registration limit reached. Contact school staff.'; end if;
 select id into actor from public.users where id=auth.uid() and tenant_id=c.tenant_id and is_active and deleted_at is null;
 insert into public.school_admission_applications(tenant_id,cycle_id,applicant_user_id,access_hash,number,full_name,birth_date,previous_school,guardian_name,email,phone,fee_amount,payment_status)
 values(c.tenant_id,c.id,actor,encode(sha256(convert_to(token,'UTF8')),'hex'),'SPMB-'||upper(left(replace(gen_random_uuid()::text,'-',''),16)),trim(payload->>'full_name'),(payload->>'birth_date')::date,coalesce(payload->>'previous_school',''),trim(payload->>'guardian_name'),registrant_email,trim(payload->>'phone'),c.fee_amount,case when c.fee_amount=0 then 'PAID' else 'UNPAID' end) returning id into app;
 return jsonb_build_object('id',app,'access_token',token);
end $$;
create function school_private.admission_portal(application uuid,access_token text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.school_admission_applications; c public.school_admission_cycles; begin
 select * into a from public.school_admission_applications where id=application;
 if a.id is null or not exists(select 1 from public.tenants where id=a.tenant_id and is_active) or not(coalesce(a.applicant_user_id=auth.uid(),false) or (length(access_token)=64 and a.access_hash=encode(sha256(convert_to(access_token,'UTF8')),'hex'))) then raise exception 'Application access denied' using errcode='42501'; end if;
 select * into c from public.school_admission_cycles where id=a.cycle_id;
 return jsonb_build_object('id',a.id,'number',a.number,'full_name',a.full_name,'guardian_name',a.guardian_name,'email',a.email,'phone',a.phone,'fee_amount',a.fee_amount,'payment_status',a.payment_status,'school',(select name from public.tenants where id=a.tenant_id),'cycle',c.name,'exam_at',c.exam_at,'exam_location',c.exam_location,'instructions',c.instructions,
 'selection_status',case when a.selection_published_at is not null then a.selection_status else 'PENDING' end,'selection_note',case when a.selection_published_at is not null then a.selection_note else '' end,
 'exam_card_issued_at',a.exam_card_issued_at,'final_status',case when a.final_published_at is not null then a.final_status else 'PENDING' end,'final_note',case when a.final_published_at is not null then a.final_note else '' end);
end $$;
create function school_private.admission_list(cycle uuid default null,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not school_private.admission_manage() then raise exception 'Staff or Teacher required' using errcode='42501'; end if;
 if page_offset<0 then raise exception 'Invalid page'; end if;
 return jsonb_build_object('school_code',(select code from public.tenants where id=school_private.tenant()),'cycles',coalesce((select jsonb_agg(to_jsonb(c)) from public.school_admission_cycles c where c.tenant_id=school_private.tenant()),'[]'),
 'applications',coalesce((select jsonb_agg(to_jsonb(q)-'access_hash') from (select * from public.school_admission_applications where tenant_id=school_private.tenant() and (cycle is null or cycle_id=cycle) order by created_at desc,id limit 100 offset page_offset)q),'[]'));
end $$;
create function school_private.admission_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); a public.school_admission_applications; result jsonb; begin
 if not school_private.admission_manage() or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>12000 then raise exception 'Staff or Teacher required' using errcode='42501'; end if;
 if kind='cycle' then
 if record_id is null then insert into public.school_admission_cycles(tenant_id,name,opens_at,closes_at,fee_amount,exam_at,exam_location,instructions,is_published) values(tenant,payload->>'name',(payload->>'opens_at')::timestamptz,(payload->>'closes_at')::timestamptz,(payload->>'fee_amount')::numeric,nullif(payload->>'exam_at','')::timestamptz,coalesce(payload->>'exam_location',''),coalesce(payload->>'instructions',''),(payload->>'is_published')::boolean) returning to_jsonb(school_admission_cycles.*) into result;
 else update public.school_admission_cycles set name=payload->>'name',opens_at=(payload->>'opens_at')::timestamptz,closes_at=(payload->>'closes_at')::timestamptz,fee_amount=(payload->>'fee_amount')::numeric,exam_at=nullif(payload->>'exam_at','')::timestamptz,exam_location=coalesce(payload->>'exam_location',''),instructions=coalesce(payload->>'instructions',''),is_published=(payload->>'is_published')::boolean where id=record_id and tenant_id=tenant returning to_jsonb(school_admission_cycles.*) into result;end if;
 else
 select * into a from public.school_admission_applications where id=record_id and tenant_id=tenant for update;
 if a.id is null then raise exception 'Application not found'; end if;
 if kind='receipt' then
 if not school_private.role(array['STAFF']) or not public.app_module_enabled(auth.uid(),'finance') or a.payment_status='PAID' then raise exception 'Staff Finance access and unpaid application required' using errcode='42501'; end if;
 insert into public.school_admission_receipts(tenant_id,application_id,amount,reference,paid_at,created_by) values(tenant,a.id,a.fee_amount,trim(payload->>'reference'),(payload->>'paid_at')::timestamptz,auth.uid());
 update public.school_admission_applications set payment_status='PAID' where id=a.id;
 elsif kind='selection' then
 if a.payment_status<>'PAID' or a.exam_card_issued_at is not null then raise exception 'Payment required; issued exam cards cannot be invalidated'; end if;
 update public.school_admission_applications set selection_status=payload->>'status',selection_note=coalesce(payload->>'note',''),selection_published_at=case when (payload->>'publish')::boolean then now() else null end where id=a.id;
 elsif kind='card' then
 if a.payment_status<>'PAID' or a.selection_status<>'ELIGIBLE' or a.selection_published_at is null or not exists(select 1 from public.school_admission_cycles where id=a.cycle_id and exam_at is not null and length(trim(exam_location))>0) then raise exception 'Published eligibility and exam schedule required'; end if;
 update public.school_admission_applications set exam_card_issued_at=coalesce(exam_card_issued_at,now()) where id=a.id;
 elsif kind='final' then
 if a.exam_card_issued_at is null then raise exception 'Issue the exam card first'; end if;
 update public.school_admission_applications set final_status=payload->>'status',final_note=coalesce(payload->>'note',''),final_published_at=case when (payload->>'publish')::boolean then now() else null end where id=a.id;
 else raise exception 'Unsupported admission operation';end if;
 select to_jsonb(x)-'access_hash' into result from public.school_admission_applications x where id=a.id;
 end if;
 if result is null then raise exception 'Record not found'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,auth.uid(),'ADMISSION_'||upper(kind),'exams','admissions',(result->>'id')::uuid,result);
 return result;
end $$;
create function public.school_admission_public(school_code text) returns jsonb language sql security invoker set search_path='' as $$ select school_private.admission_public(school_code) $$;
revoke all on function school_private.admission_public(text),public.school_admission_public(text) from public,anon,authenticated;
grant execute on function school_private.admission_public(text),public.school_admission_public(text) to anon,authenticated;
create function public.school_admission_register(cycle uuid,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select school_private.admission_register(cycle,payload) $$;
revoke all on function school_private.admission_register(uuid,jsonb),public.school_admission_register(uuid,jsonb) from public,anon,authenticated;
grant execute on function school_private.admission_register(uuid,jsonb),public.school_admission_register(uuid,jsonb) to anon,authenticated;
create function public.school_admission_portal(application uuid,access_token text default '') returns jsonb language sql security invoker set search_path='' as $$ select school_private.admission_portal(application,access_token) $$;
revoke all on function school_private.admission_portal(uuid,text),public.school_admission_portal(uuid,text) from public,anon,authenticated;
grant execute on function school_private.admission_portal(uuid,text),public.school_admission_portal(uuid,text) to anon,authenticated;
create function public.school_admission_list(cycle uuid default null,page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select school_private.admission_list(cycle,page_offset) $$;
revoke all on function school_private.admission_list(uuid,integer),public.school_admission_list(uuid,integer) from public,anon,authenticated;
grant execute on function school_private.admission_list(uuid,integer),public.school_admission_list(uuid,integer) to authenticated;
create function public.school_admission_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.admission_save(kind,payload,record_id) $$;
revoke all on function school_private.admission_save(text,jsonb,uuid),public.school_admission_save(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function school_private.admission_save(text,jsonb,uuid),public.school_admission_save(text,jsonb,uuid) to authenticated;
revoke all on function school_private.admission_manage() from public,anon,authenticated;
create function school_private.admission_mine() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'number',a.number,'full_name',a.full_name,'school_code',t.code)),'[]') from public.school_admission_applications a join public.tenants t on t.id=a.tenant_id where a.applicant_user_id=auth.uid() and a.tenant_id=school_private.tenant() and t.is_active
$$;
create function public.school_admission_mine() returns jsonb language sql security invoker set search_path='' as $$ select school_private.admission_mine() $$;
revoke all on function school_private.admission_mine(),public.school_admission_mine() from public,anon,authenticated;
grant execute on function school_private.admission_mine(),public.school_admission_mine() to authenticated;
