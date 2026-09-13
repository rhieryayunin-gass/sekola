-- Supervised face attendance: inference is local to the browser, templates are
-- encrypted in Vault, and a trusted Staff/Teacher confirms the person present.
create table public.school_face_enrollments (
 user_id uuid primary key references public.users(id),tenant_id uuid not null references public.tenants(id),secret_id uuid not null,
 model text not null default 'human-3.3.6-mobileface-b62d89d9',consent_recorded_by uuid not null references public.users(id),consent_at timestamptz not null default now(),
 verified_at timestamptz,updated_at timestamptz not null default now()
);
create table public.school_face_challenges (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),actor_id uuid not null references public.users(id),target_id uuid not null references public.users(id),
 purpose text not null check(purpose in ('ENROLL','VERIFY','CHECKIN')),classroom_id uuid references public.classrooms(id),expires_at timestamptz not null default now()+interval '90 seconds',used_at timestamptz,matched boolean,created_at timestamptz not null default now()
);
create table public.school_user_attendance (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),user_id uuid not null references public.users(id),attendance_date date not null default (now() at time zone 'Asia/Jakarta')::date,
 recorded_by uuid not null references public.users(id),method text not null default 'FACE' check(method='FACE'),created_at timestamptz not null default now(),unique(tenant_id,user_id,attendance_date)
);
create index face_enrollments_tenant on public.school_face_enrollments(tenant_id);
create index face_challenges_actor on public.school_face_challenges(tenant_id,actor_id,created_at);
create index user_attendance_tenant_day on public.school_user_attendance(tenant_id,attendance_date);
do $$ declare tab text;begin foreach tab in array array['school_face_enrollments','school_face_challenges','school_user_attendance'] loop execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from anon,authenticated',tab);end loop;end $$;
create function school_private.face_target(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select school_private.role(array['STAFF','TEACHER']) and public.app_module_enabled(auth.uid(),'attendance') and exists(select 1 from public.users u where u.id=target and u.tenant_id=school_private.tenant() and u.is_active and u.deleted_at is null)
 and public.app_role_in(target,array['PRINCIPAL','STAFF','TEACHER','STUDENT']) and not public.app_role_in(target,array['OWNER','PARENT'])
$$;
create function school_private.face_directory(query text default '',page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform school_private.require_module('attendance');
 if not school_private.role(array['STAFF','TEACHER']) or length(query)>160 or page_offset<0 then raise exception 'Staff or Teacher access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select u.id,u.full_name,coalesce((select jsonb_agg(distinct r.code) from public.roles r where r.is_active and r.id in(select role_id from public.user_roles where user_id=u.id union select role_id from public.user_level_roles where user_level_id=u.user_level_id)),'[]') as roles,
 f.updated_at as enrolled_at,f.verified_at,(select created_at from public.school_user_attendance where user_id=u.id and tenant_id=u.tenant_id and attendance_date=(now() at time zone 'Asia/Jakarta')::date) as attended_at,
 (select id from public.students where user_id=u.id and tenant_id=u.tenant_id) as student_id
 from public.users u left join public.school_face_enrollments f on f.user_id=u.id where school_private.face_target(u.id) and (query='' or u.full_name ilike '%'||query||'%') order by u.full_name,u.id limit 50 offset page_offset)q),'[]');
end $$;
create function school_private.face_challenge(target uuid,purpose text,classroom uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not school_private.face_target(target) then raise exception 'Face enrollment access denied' using errcode='42501';end if;
 if purpose not in ('ENROLL','VERIFY','CHECKIN') then raise exception 'Invalid purpose';end if;
 if purpose='CHECKIN' and exists(select 1 from public.students where user_id=target and tenant_id=school_private.tenant()) and not school_private.class_teaches(classroom) then raise exception 'Choose an assigned classroom';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,727));
 delete from public.school_face_challenges where actor_id=auth.uid() and created_at<now()-interval '1 day';
 if (select count(*) from public.school_face_challenges where actor_id=auth.uid() and created_at>now()-interval '1 minute')>=20 then raise exception 'Too many scans. Wait one minute.';end if;
 insert into public.school_face_challenges(tenant_id,actor_id,target_id,purpose,classroom_id) values(school_private.tenant(),auth.uid(),target,purpose,classroom) returning jsonb_build_object('id',id,'expires_at',expires_at) into result;
 return result;
end $$;
create function school_private.face_similarity(a jsonb,b jsonb) returns numeric language sql immutable set search_path='' as $$
 select coalesce(sum(x*y)/nullif(sqrt(sum(x*x)*sum(y*y)),0),0) from (select (v.value::text)::numeric as x,(w.value::text)::numeric as y from jsonb_array_elements(a) with ordinality v(value,n) join jsonb_array_elements(b) with ordinality w(value,n) using(n))q
$$;
create function school_private.face_scan(challenge uuid,samples jsonb,consent boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.school_face_challenges; f public.school_face_enrollments; saved jsonb; vec jsonb; score numeric:=0; temp numeric; keyid uuid; student uuid;begin
 select * into c from public.school_face_challenges where id=challenge and actor_id=auth.uid() for update;
 if c.id is null or c.used_at is not null or c.expires_at<now() or not school_private.face_target(c.target_id) then raise exception 'Scan expired or access denied' using errcode='42501';end if;
 if consent is distinct from true then raise exception 'Supervisor confirmation and enrollment consent required';end if;
 if jsonb_typeof(samples) is distinct from 'array' or jsonb_array_length(samples)<>3 or octet_length(samples::text)>50000 then raise exception 'Three face samples required';end if;
 for vec in select value from jsonb_array_elements(samples) loop
 if jsonb_typeof(vec) is distinct from 'array' or jsonb_array_length(vec)<>256 or exists(select 1 from jsonb_array_elements(vec) v where jsonb_typeof(v)<>'number' or (v::text)::numeric not between -100 and 100) or school_private.face_similarity(vec,vec)<0.99 then raise exception 'Invalid face descriptor';end if;
 end loop;
 update public.school_face_challenges set used_at=now() where id=c.id;
 if school_private.face_similarity(samples->0,samples->1)<0.85 or school_private.face_similarity(samples->0,samples->2)<0.85 then return jsonb_build_object('matched',false,'reason','INCONSISTENT_SCAN');end if;
 perform pg_advisory_xact_lock(hashtextextended(c.target_id::text,728));
 select * into f from public.school_face_enrollments where user_id=c.target_id and tenant_id=c.tenant_id for update;
 if c.purpose='ENROLL' then
 keyid:=f.secret_id;
 if keyid is null then select vault.create_secret(samples::text) into keyid;else perform vault.update_secret(keyid,samples::text);end if;
 insert into public.school_face_enrollments(user_id,tenant_id,secret_id,consent_recorded_by) values(c.target_id,c.tenant_id,keyid,auth.uid()) on conflict(user_id) do update set secret_id=excluded.secret_id,consent_recorded_by=excluded.consent_recorded_by,consent_at=now(),verified_at=null,updated_at=now();
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id) values(c.tenant_id,auth.uid(),'FACE_ENROLL','attendance','users',c.target_id);
 return jsonb_build_object('enrolled',true,'verified',false);
 end if;
 if f.user_id is null or (c.purpose='CHECKIN' and f.verified_at is null) then raise exception 'Enroll and verify this user first';end if;
 select decrypted_secret::jsonb into saved from vault.decrypted_secrets where id=f.secret_id;
 -- Average of three best cosine similarities; no template is returned to clients.
 for vec in select value from jsonb_array_elements(samples) loop
 select max(school_private.face_similarity(vec,v)) into temp from jsonb_array_elements(saved)v;score:=score+temp/3;
 end loop;
 if score<0.85 then update public.school_face_challenges set matched=false where id=c.id;return jsonb_build_object('matched',false,'reason','FACE_NOT_MATCHED');end if;
 update public.school_face_challenges set matched=true where id=c.id;
 if c.purpose='VERIFY' then update public.school_face_enrollments set verified_at=now() where user_id=c.target_id;
 else
 select id into student from public.students where user_id=c.target_id and tenant_id=c.tenant_id and enrollment_status='ACTIVE';
 if student is not null then
 if c.classroom_id is null or not school_private.class_teaches(c.classroom_id) or not exists(select 1 from public.student_assignments where student_id=student and classroom_id=c.classroom_id and tenant_id=c.tenant_id and is_active) then raise exception 'Student is not in the selected classroom';end if;
 if exists(select 1 from public.attendance_records where tenant_id=c.tenant_id and student_id=student and attendance_date=(now() at time zone 'Asia/Jakarta')::date and status<>'PRESENT') then raise exception 'An attendance status already exists for today. Review it in manual attendance before checking in.';end if;
 insert into public.attendance_records(tenant_id,student_id,classroom_id,attendance_date,status,note) values(c.tenant_id,student,c.classroom_id,(now() at time zone 'Asia/Jakarta')::date,'PRESENT','Supervised browser face check-in') on conflict(tenant_id,student_id,attendance_date) do nothing;
 end if;
 insert into public.school_user_attendance(tenant_id,user_id,recorded_by) values(c.tenant_id,c.target_id,auth.uid()) on conflict(tenant_id,user_id,attendance_date) do nothing;
 end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id) values(c.tenant_id,auth.uid(),'FACE_'||c.purpose,'attendance','users',c.target_id);
 return jsonb_build_object('matched',true,'purpose',c.purpose);
end $$;
create function school_private.face_delete(target uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare keyid uuid;begin
 if not school_private.face_target(target) then raise exception 'Access denied' using errcode='42501';end if;
 delete from public.school_face_enrollments where user_id=target and tenant_id=school_private.tenant() returning secret_id into keyid;
 if keyid is not null then delete from vault.secrets where id=keyid;end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id) values(school_private.tenant(),auth.uid(),'FACE_DELETE','attendance','users',target);return true;
end $$;
create function public.school_face_directory(query text default '',page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select school_private.face_directory(query,page_offset) $$;
revoke all on function school_private.face_directory(text,integer),public.school_face_directory(text,integer) from public,anon,authenticated;
grant execute on function school_private.face_directory(text,integer),public.school_face_directory(text,integer) to authenticated;
create function public.school_face_challenge(target uuid,purpose text,classroom uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.face_challenge(target,purpose,classroom) $$;
revoke all on function school_private.face_challenge(uuid,text,uuid),public.school_face_challenge(uuid,text,uuid) from public,anon,authenticated;
grant execute on function school_private.face_challenge(uuid,text,uuid),public.school_face_challenge(uuid,text,uuid) to authenticated;
create function public.school_face_scan(challenge uuid,samples jsonb,consent boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select school_private.face_scan(challenge,samples,consent) $$;
revoke all on function school_private.face_scan(uuid,jsonb,boolean),public.school_face_scan(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function school_private.face_scan(uuid,jsonb,boolean),public.school_face_scan(uuid,jsonb,boolean) to authenticated;
create function public.school_face_delete(target uuid) returns boolean language sql security invoker set search_path='' as $$ select school_private.face_delete(target) $$;
revoke all on function school_private.face_delete(uuid),public.school_face_delete(uuid) from public,anon,authenticated;
grant execute on function school_private.face_delete(uuid),public.school_face_delete(uuid) to authenticated;
revoke all on function school_private.face_target(uuid),school_private.face_similarity(jsonb,jsonb) from public,anon,authenticated;
