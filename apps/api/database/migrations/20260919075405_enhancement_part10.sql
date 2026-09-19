-- Part 10: scoped foundation dashboards, references, bookings and project timelines.
-- All existing users, tenants and module records remain intact.
create table public.school_groups(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 2 and 160),created_at timestamptz not null default now());
create table public.school_group_principals(group_id uuid not null references public.school_groups on delete cascade,user_id uuid not null references public.users on delete cascade,primary key(group_id,user_id));
create index school_group_principals_user on public.school_group_principals(user_id);
create table public.school_regions(code text primary key,name text not null,parent_code text references public.school_regions(code),level smallint not null check(level between 1 and 4),postal_code text check(postal_code ~ '^[0-9]{5}$'));
create index school_regions_parent on public.school_regions(parent_code,name);
create table public.school_npsn_reference(npsn text primary key check(npsn ~ '^[0-9]{8}$'),name text not null,region_code text references public.school_regions(code),address text,updated_at timestamptz not null default now());
alter table public.tenants add column group_id uuid references public.school_groups on delete set null,
 add column province_code text references public.school_regions(code),add column city_code text references public.school_regions(code),add column district_code text references public.school_regions(code),add column village_code text references public.school_regions(code),add column postal_code text check(postal_code ~ '^[0-9]{5}$');
create index tenants_school_group on public.tenants(group_id);
alter table public.school_partner_applications add column estimated_students integer check(estimated_students between 0 and 10000000);
do $$ declare t text;begin
 foreach t in array array['school_groups','school_group_principals','school_regions','school_npsn_reference'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function school_private.foundation_principal(actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.app_role_in(actor,array['PRINCIPAL']) and exists(select 1 from public.school_group_principals where user_id=actor)
$$;
revoke all on function school_private.foundation_principal(uuid) from public,anon,authenticated;
grant execute on function school_private.foundation_principal(uuid) to service_role;
create function school_private.principal_scope(target uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare home uuid:=school_private.tenant();begin
 if not school_private.role(array['PRINCIPAL']) then raise exception 'Principal access required' using errcode='42501';end if;
 if school_private.foundation_principal(auth.uid()) then
 if target is null then select t.id into target from public.tenants t join public.school_group_principals p on p.group_id=t.group_id where p.user_id=auth.uid() and t.is_active and t.deleted_at is null order by t.name,t.id limit 1;end if;
 if target is null or not exists(select 1 from public.tenants t join public.school_group_principals p on p.group_id=t.group_id where t.id=target and p.user_id=auth.uid() and t.is_active and t.deleted_at is null) then raise exception 'School is outside your assigned foundation' using errcode='42501';end if;
 elsif target is not null and target<>home then raise exception 'School is outside your access' using errcode='42501';
 else target:=home;end if;return target;
end $$;
revoke all on function school_private.principal_scope(uuid) from public,anon,authenticated;
alter function school_private.context() rename to context_before_part10;
revoke all on function school_private.context_before_part10() from public,anon,authenticated;
create function school_private.context() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 return school_private.context_before_part10()||jsonb_build_object('foundation_principal',school_private.foundation_principal(auth.uid()),'foundation_schools',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'group',g.name) order by t.name) from public.tenants t join public.school_groups g on g.id=t.group_id join public.school_group_principals p on p.group_id=g.id where p.user_id=auth.uid() and school_private.role(array['PRINCIPAL']) and t.is_active and t.deleted_at is null),'[]'));
end $$;
revoke all on function school_private.context() from public,anon,authenticated;
grant execute on function school_private.context() to authenticated;
-- Existing module gates protect both API handlers and authenticated RPCs.
create or replace function public.app_module_enabled(actor_id uuid,module_code text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.users u join public.tenants t on t.id=u.tenant_id
 left join public.school_settings s on s.tenant_id=t.id
 where u.id=actor_id and u.is_active and u.deleted_at is null and t.is_active
 and (module_code is null or (module_code in ('core','academic','attendance','connect','learning','exams','finance','team') and coalesce(s.modules->module_code,'true'::jsonb)='true'::jsonb))
 and case when module_code='academic' then public.app_role_in(actor_id,array['STAFF'])
 when module_code in ('learning','exams') then public.app_role_in(actor_id,array['TEACHER','STUDENT']) when module_code='finance' then public.app_role_in(actor_id,array['STAFF']) else true end)
$$;
alter function public.app_has_permission(uuid,text) rename to app_has_permission_before_part10;
revoke all on function public.app_has_permission_before_part10(uuid,text) from public,anon,authenticated;
create function public.app_has_permission(actor_id uuid,permission_code text) returns boolean language sql stable set search_path='' as $$
 select (split_part(permission_code,'.',1)<>'approvals' or not school_private.foundation_principal(actor_id)) and public.app_has_permission_before_part10(actor_id,permission_code)
$$;
revoke all on function public.app_has_permission(uuid,text) from public,anon,authenticated;
grant execute on function public.app_has_permission(uuid,text) to service_role;
create function school_private.principal_overview(target_tenant uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.principal_scope(target_tenant);today date;tz text;month_start date;previous_month date;result jsonb;begin
 if not school_private.role(array['PRINCIPAL']) then raise exception 'Principal access required' using errcode='42501';end if;
 select coalesce(timezone,'Asia/Jakarta') into tz from public.tenants where id=tenant;
 today:=(now() at time zone tz)::date;month_start:=date_trunc('month',today)::date;previous_month:=(month_start-interval '1 month')::date;
 with dates as(select d::date as month,least(today,(d+interval '1 month'-interval '1 day')::date) as cutoff from generate_series(month_start-interval '5 months',month_start,interval '1 month')d)
 select jsonb_build_object('today',today,'history',coalesce((select jsonb_agg(jsonb_build_object('month',month,
 'students',(select count(*) from public.students s join public.users u on u.id=s.user_id where s.tenant_id=tenant and coalesce(s.admission_date,(s.created_at at time zone tz)::date)<=cutoff and (u.deleted_at is null or (u.deleted_at at time zone tz)::date>cutoff)),
 'employees',(select count(*) from public.users u where u.tenant_id=tenant and (u.created_at at time zone tz)::date<=cutoff and (u.deleted_at is null or (u.deleted_at at time zone tz)::date>cutoff) and school_private.p9_has_role(u.id,array['STAFF','TEACHER'])),
 'assets',(select count(*) from public.school_assets a where a.tenant_id=tenant and (a.created_at at time zone tz)::date<=cutoff),
 'asset_categories',(select jsonb_object_agg(category,n) from(select category,count(*)n from public.school_assets a where a.tenant_id=tenant and (a.created_at at time zone tz)::date<=cutoff group by category)x)) order by month) from dates),'[]')) into result;
 with flows as(
 select (p.paid_at at time zone tz)::date as day,'INCOME'::text kind,p.amount from public.payments p where p.tenant_id=tenant and p.status='CONFIRMED'
 union all select entry_date,kind,amount from public.school_cash_entries where tenant_id=tenant and voided_at is null),
 totals as(select coalesce(sum(amount)filter(where kind='INCOME' and day between month_start and today),0)income,
 coalesce(sum(amount)filter(where kind='EXPENSE' and day between month_start and today),0)expenses,
 coalesce(sum(case when kind='EXPENSE' then -amount else amount end)filter(where day<=today),0)balance,
 coalesce(sum(amount)filter(where kind='INCOME' and day>=previous_month and day<month_start),0)previous_income,
 coalesce(sum(amount)filter(where kind='EXPENSE' and day>=previous_month and day<month_start),0)previous_expenses,
 coalesce(sum(case when kind='EXPENSE' then -amount else amount end)filter(where day<month_start),0)previous_balance from flows)
 select result||jsonb_build_object('finance',(select to_jsonb(t)||jsonb_build_object(
 'receivables',(select coalesce(sum(greatest(0,b.amount-coalesce((select sum(p.amount) from public.payments p where p.student_bill_id=b.id and p.status='CONFIRMED' and (p.paid_at at time zone tz)::date<=today),0))),0) from public.student_bills b where b.tenant_id=tenant and b.status not in('DRAFT','VOID') and (b.created_at at time zone tz)::date<=today),
 'previous_receivables',(select coalesce(sum(greatest(0,b.amount-coalesce((select sum(p.amount) from public.payments p where p.student_bill_id=b.id and p.status='CONFIRMED' and (p.paid_at at time zone tz)::date<month_start),0))),0) from public.student_bills b where b.tenant_id=tenant and b.status not in('DRAFT','VOID') and (b.created_at at time zone tz)::date<month_start)) from totals t)) into result;
 return result||jsonb_build_object(
 'students_total',(select count(*) from public.students s join public.users u on u.id=s.user_id where s.tenant_id=tenant and s.enrollment_status='ACTIVE' and u.is_active),
 'students_present',(select count(distinct a.student_id) from public.attendance_records a join public.students s on s.id=a.student_id join public.users u on u.id=s.user_id where a.tenant_id=tenant and a.attendance_date=today and a.status in('PRESENT','LATE') and s.enrollment_status='ACTIVE' and u.is_active),
 'employees_total',(select count(*) from public.users u where u.tenant_id=tenant and u.is_active and u.deleted_at is null and public.app_role_in(u.id,array['STAFF','TEACHER'])),
 'employees_present',(select count(*) from public.school_user_attendance a join public.users u on u.id=a.user_id where a.tenant_id=tenant and a.attendance_date=today and a.status in('PRESENT','LATE') and u.is_active and public.app_role_in(u.id,array['STAFF','TEACHER'])),
 'grades',coalesce((select jsonb_agg(jsonb_build_object('day',d::date,'average',(select round(avg(e.score),2) from public.exam_results e where e.tenant_id=tenant and e.status='PUBLISHED' and (e.graded_at at time zone tz)::date=d::date)) order by d) from generate_series(today-6,today,interval '1 day')d),'[]'));
end $$;
create function school_private.principal_absences(kind text,page_offset integer default 0,target_tenant uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare tenant uuid:=school_private.principal_scope(target_tenant);today date;begin
 if not school_private.role(array['PRINCIPAL']) then raise exception 'Principal access required' using errcode='42501';end if;
 if kind not in('STUDENT','EMPLOYEE') or page_offset<0 then raise exception 'Invalid list';end if;
 select (now() at time zone coalesce(timezone,'Asia/Jakarta'))::date into today from public.tenants where id=tenant;
 if kind='STUDENT' then return coalesce((select jsonb_agg(to_jsonb(x)) from(select u.full_name as name,c.name as classroom,h.full_name as homeroom,coalesce(a.status,'UNRECORDED')status,a.note as reason from public.students s join public.users u on u.id=s.user_id
 left join lateral(select sa.classroom_id from public.student_assignments sa join public.semesters sem on sem.id=sa.semester_id where sa.student_id=s.id and sa.tenant_id=tenant and sa.is_active order by sem.is_active desc,sem.starts_on desc limit 1)sa on true
 left join public.classrooms c on c.id=sa.classroom_id left join public.users h on h.id=c.homeroom_teacher_user_id left join public.attendance_records a on a.student_id=s.id and a.tenant_id=tenant and a.attendance_date=today
 where s.tenant_id=tenant and s.enrollment_status='ACTIVE' and u.is_active and coalesce(a.status,'UNRECORDED') not in('PRESENT','LATE') order by u.full_name,s.id limit 100 offset page_offset)x),'[]');end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select u.full_name as name,coalesce(a.status,'UNRECORDED')status,a.note as reason from public.users u left join public.school_user_attendance a on a.user_id=u.id and a.tenant_id=tenant and a.attendance_date=today where u.tenant_id=tenant and u.is_active and public.app_role_in(u.id,array['STAFF','TEACHER']) and coalesce(a.status,'UNRECORDED') not in('PRESENT','LATE') order by u.full_name,u.id limit 100 offset page_offset)x),'[]');
end $$;
create or replace function school_private.principal_dashboard() returns jsonb language sql stable security definer set search_path='' as $$select school_private.principal_overview(null)$$;
create or replace function school_private.absence_list(kind text,page_offset integer default 0) returns jsonb language sql stable security definer set search_path='' as $$select school_private.principal_absences(kind,page_offset,null)$$;
create function public.school_principal_overview(target_tenant uuid default null) returns jsonb language sql security invoker set search_path='' as $$select school_private.principal_overview(target_tenant)$$;
create function public.school_principal_absences(kind text,page_offset integer default 0,target_tenant uuid default null) returns jsonb language sql security invoker set search_path='' as $$select school_private.principal_absences(kind,page_offset,target_tenant)$$;
alter function school_private.approval_queue(integer,uuid) rename to approval_queue_before_part10;
revoke all on function school_private.approval_queue_before_part10(integer,uuid) from public,anon,authenticated;
create function school_private.approval_queue(page_offset integer default 0,request_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform school_private.tenant();if school_private.foundation_principal(auth.uid()) then raise exception 'Foundation dashboards do not include approvals' using errcode='42501';end if;
 return school_private.approval_queue_before_part10(page_offset,request_id);
end $$;
create or replace function school_private.approval_decide(request_id uuid,decision text,note text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();a public.approval_requests;c public.school_user_changes;l public.leave_requests;actor uuid:=auth.uid();begin
 if school_private.foundation_principal(auth.uid()) then raise exception 'Foundation dashboards do not include approvals' using errcode='42501';end if;
 if decision not in('APPROVED','REJECTED') or length(note)>1000 or (decision='REJECTED' and length(trim(note))<3) then raise exception 'Choose a decision and include a rejection reason';end if;
 select * into a from public.approval_requests where id=request_id for update;
 if a.id is null or a.status<>'PENDING' or not exists(select 1 from public.approval_steps s where s.approval_request_id=a.id and s.sequence=a.current_step and s.status='PENDING' and s.approver_user_id=actor) then raise exception 'This request is not awaiting your decision' using errcode='42501';end if;
 if a.resource_type='USER_CHANGE' then
 select * into c from public.school_user_changes where id=a.resource_id and tenant_id=a.tenant_id;
 if c.id is null or not public.app_role_in(actor,case when c.role_code='PRINCIPAL' then array['OWNER'] else array['PRINCIPAL'] end) or (c.role_code<>'PRINCIPAL' and a.tenant_id<>tenant) then raise exception 'Current approver role required' using errcode='42501';end if;
 update public.approval_steps set status=decision,note=approval_decide.note,decided_at=now() where approval_request_id=a.id and sequence=a.current_step;
 update public.approval_requests set status=decision,decided_at=now() where id=a.id;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,actor,decision,'OPERATIONS','school_user_changes',c.id,jsonb_build_object('target_tenant',c.tenant_id,'note',note));
 insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id) values(a.tenant_id,a.requester_user_id,'INFO','User change '||lower(decision),note,'approval_request',a.id);
 return jsonb_build_object('id',a.id,'status',decision,'change_id',c.id);
 end if;
 if a.tenant_id<>tenant or not public.app_has_permission(actor,'approvals.decide') then raise exception 'Assigned school approver required' using errcode='42501';end if;
 if a.resource_type='LEAVE_REQUEST' then
 select * into l from public.leave_requests where id=a.resource_id;
 if l.subject_user_id is not null then
 if l.student_id is null and not public.app_role_in(actor,array['PRINCIPAL']) then raise exception 'Principal approval required' using errcode='42501';end if;
 if l.student_id is not null and (not public.app_role_in(actor,array['TEACHER']) or not exists(select 1 from public.classrooms where id=l.classroom_id and tenant_id=tenant and homeroom_teacher_user_id=actor)) then raise exception 'Current homeroom teacher approval required' using errcode='42501';end if;
 end if;
 end if;
 return public.decide_operational_request(actor,a.id,decision,note);
end $$;
alter function school_private.approval_count() rename to approval_count_before_part10;
revoke all on function school_private.approval_count_before_part10() from public,anon,authenticated;
create function school_private.approval_count() returns bigint language plpgsql stable security definer set search_path='' as $$begin
 perform school_private.tenant();if school_private.foundation_principal(auth.uid()) then return 0;end if;return school_private.approval_count_before_part10();
end $$;
create function school_private.foundation_approval_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='approval_steps' then
 if school_private.foundation_principal(new.approver_user_id) then raise exception 'Assign a school principal; foundation executives do not approve requests' using errcode='42501';end if;
 elsif new.type='APPROVAL' and school_private.foundation_principal(new.user_id) then return null;end if;return new;
end $$;
create trigger p10_no_foundation_approvals before insert or update on public.approval_steps for each row execute function school_private.foundation_approval_guard();
create trigger p10_no_foundation_alerts before insert or update on public.notifications for each row execute function school_private.foundation_approval_guard();
revoke all on function school_private.foundation_approval_guard() from public,anon,authenticated;
create or replace function school_private.p9_approver(tenant uuid,role_code text,requester uuid) returns uuid language plpgsql stable security definer set search_path='' as $$declare chosen uuid;begin
 select u.id into chosen from public.users u join public.tenants t on t.id=u.tenant_id where u.is_active and u.deleted_at is null and t.is_active and u.id<>requester and not school_private.foundation_principal(u.id) and (role_code='OWNER' or u.tenant_id=tenant) and public.app_role_in(u.id,array[role_code]) order by (u.tenant_id=tenant) desc,u.created_at,u.id limit 1;
 if chosen is null then raise exception 'No active approver is assigned. Ask the school administrator to appoint one.' using errcode='22023';end if;return chosen;
end $$;
create or replace function school_private.partner_apply(payload jsonb,cv_base64 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result_id uuid; bytes bytea;begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>10000 or length(cv_base64)>1398104 or coalesce((payload->>'consent')::boolean,false)=false or coalesce(payload->>'website','')<>'' then raise exception 'Invalid application' using errcode='22023';end if;
 bytes:=decode(cv_base64,'base64');
 perform pg_advisory_xact_lock(hashtextextended('partner_applications',8));
 if (select count(*) from public.school_partner_applications where created_at>now()-interval '1 day')>=100 or exists(select 1 from public.school_partner_applications where nik=payload->>'nik' and created_at>now()-interval '30 days') then raise exception 'An application was already received or today’s intake is full. Please contact OSEKOLA.' using errcode='P0001';end if;
 insert into public.school_partner_applications(name,nik,phone,domicile,occupation,school_count,contacts,cv,cv_name,photo_confirmed,estimated_students)
 values(trim(payload->>'name'),payload->>'nik',payload->>'phone',trim(payload->>'domicile'),trim(payload->>'occupation'),(payload->>'school_count')::integer,payload->>'contacts',bytes,payload->>'cv_name',(payload->>'photo_confirmed')::boolean,nullif(payload->>'estimated_students','')::integer) returning id into result_id;
 return jsonb_build_object('id',result_id,'status','NEW');
end $$;

create function school_private.owner_reference(resource text,parent text default null,query text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform school_private.require_owner();
 if length(query)>200 then raise exception 'Search is too long';end if;
 if resource='regions' then return coalesce((select jsonb_agg(to_jsonb(r) order by r.name) from public.school_regions r where r.parent_code is not distinct from nullif(parent,'')),'[]');
 elsif resource='npsn' then return coalesce((select jsonb_agg(to_jsonb(r)) from(select * from public.school_npsn_reference where npsn like query||'%' order by npsn limit 20)r),'[]');
 elsif resource='groups' then return coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('principals',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name)) from public.school_group_principals p join public.users u on u.id=p.user_id where p.group_id=g.id),'[]')) order by g.name) from public.school_groups g),'[]');
 elsif resource='principals' then return coalesce((select jsonb_agg(to_jsonb(r)) from(select u.id,u.full_name as name,t.name as school from public.users u join public.tenants t on t.id=u.tenant_id where u.is_active and u.deleted_at is null and t.is_active and public.app_role_in(u.id,array['PRINCIPAL']) and not public.app_role_in(u.id,array['OWNER','STAFF','TEACHER','PARENT','STUDENT']) and (query='' or u.full_name ilike '%'||query||'%') order by u.full_name,u.id limit 50)r),'[]');end if;
 raise exception 'Unknown reference';
end $$;
create function public.school_owner_reference(resource text,parent text default null,query text default '') returns jsonb language sql security invoker set search_path='' as $$select school_private.owner_reference(resource,parent,query)$$;
create function school_private.group_save(payload jsonb,record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;person uuid;begin
 perform school_private.require_owner();
 if jsonb_typeof(payload) is distinct from 'object' or length(trim(payload->>'name')) not between 2 and 160 or jsonb_typeof(payload->'principals') is distinct from 'array' or jsonb_array_length(payload->'principals')>50 then raise exception 'Enter a foundation name and principal list';end if;
 if record_id is null then insert into public.school_groups(name) values(trim(payload->>'name')) returning id into target;
 else update public.school_groups set name=trim(payload->>'name') where id=record_id returning id into target;end if;
 if target is null then raise exception 'Foundation not found';end if;
 for person in select value::uuid from jsonb_array_elements_text(payload->'principals') loop
 if not exists(select 1 from public.users u join public.tenants t on t.id=u.tenant_id where u.id=person and u.is_active and u.deleted_at is null and t.is_active and public.app_role_in(u.id,array['PRINCIPAL']) and not public.app_role_in(u.id,array['OWNER','STAFF','TEACHER','PARENT','STUDENT'])) then raise exception 'Choose an active Principal account without another role';end if;
 if exists(select 1 from public.approval_steps s join public.approval_requests a on a.id=s.approval_request_id where s.approver_user_id=person and s.status='PENDING' and a.status='PENDING') then raise exception 'Resolve this principal’s pending approvals before assigning foundation access';end if;
 end loop;
 delete from public.school_group_principals where group_id=target;
 insert into public.school_group_principals(group_id,user_id) select distinct target,value::uuid from jsonb_array_elements_text(payload->'principals');
 delete from public.notifications where type='APPROVAL' and user_id in(select user_id from public.school_group_principals where group_id=target);
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(school_private.tenant(),auth.uid(),'SAVE','PLATFORM','school_groups',target,payload);
 return jsonb_build_object('id',target);
end $$;
create function public.school_group_save(payload jsonb,record_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select school_private.group_save(payload,record_id)$$;
alter function school_private.owner_list(text,jsonb,integer,integer) rename to owner_list_before_part10;
revoke all on function school_private.owner_list_before_part10(text,jsonb,integer,integer) from public,anon,authenticated;
create function school_private.owner_list(kind text,filters jsonb default '{}',page_number integer default 1,page_size integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform school_private.require_owner();result:=school_private.owner_list_before_part10(kind,filters,page_number,page_size);
 if kind='tenants' then return jsonb_set(result,'{items}',coalesce((select jsonb_agg(e||jsonb_build_object('group_id',t.group_id,'province_code',t.province_code,'city_code',t.city_code,'district_code',t.district_code,'village_code',t.village_code,'postal_code',t.postal_code) order by ord) from jsonb_array_elements(result->'items') with ordinality x(e,ord) join public.tenants t on t.id=(e->>'id')::uuid),'[]'));
 elsif kind='applications' then return jsonb_set(result,'{items}',coalesce((select jsonb_agg(e||jsonb_build_object('estimated_students',a.estimated_students) order by ord) from jsonb_array_elements(result->'items') with ordinality x(e,ord) join public.school_partner_applications a on a.id=(e->>'id')::uuid),'[]'));end if;return result;
end $$;
alter function school_private.owner_save(text,jsonb,uuid) rename to owner_save_before_part10;
revoke all on function school_private.owner_save_before_part10(text,jsonb,uuid) from public,anon,authenticated;
create function school_private.owner_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;legacy jsonb;current_row jsonb;key text;parent text;region text;idx integer;begin
 perform school_private.require_owner();
 if kind='tenant' then
 legacy:=payload-array['group_id','province_code','city_code','district_code','village_code','postal_code'];
 if record_id is null and nullif(payload->>'code','') is null then legacy:=legacy||jsonb_build_object('code','SCH-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)));end if;
 if record_id is not null then select to_jsonb(t) into current_row from public.tenants t where id=record_id for update;end if;
 current_row:=coalesce(current_row,'{}')||payload;idx:=0;
 if legacy='{}'::jsonb and record_id is not null then legacy:=jsonb_build_object('name',current_row->>'name');end if;
 foreach key in array array['province_code','city_code','district_code','village_code'] loop
 idx:=idx+1;region:=nullif(current_row->>key,'');
 if region is not null and not exists(select 1 from public.school_regions r where r.code=region and r.level=idx and r.parent_code is not distinct from parent) then raise exception 'Select matching province, city, district and village';end if;
 parent:=region;
 end loop;
 if nullif(current_row->>'postal_code','') is not null and not exists(select 1 from public.school_regions r where r.code=current_row->>'village_code' and r.postal_code=current_row->>'postal_code') then raise exception 'Postal code does not match the selected village';end if;
 result:=school_private.owner_save_before_part10(kind,legacy,record_id);
 update public.tenants set group_id=nullif(current_row->>'group_id','')::uuid,province_code=nullif(current_row->>'province_code',''),city_code=nullif(current_row->>'city_code',''),district_code=nullif(current_row->>'district_code',''),village_code=nullif(current_row->>'village_code',''),postal_code=nullif(current_row->>'postal_code','') where id=(result->>'id')::uuid;
 return result||jsonb_build_object('group_id',nullif(current_row->>'group_id',''));
 elsif kind='application' and payload ? 'estimated_students' then
 legacy:=payload-'estimated_students';if legacy='{}'::jsonb then legacy:=jsonb_build_object('name',(select name from public.school_partner_applications where id=record_id));end if;
 result:=school_private.owner_save_before_part10(kind,legacy,record_id);
 update public.school_partner_applications set estimated_students=nullif(payload->>'estimated_students','')::integer where id=record_id;
 return result||jsonb_build_object('estimated_students',nullif(payload->>'estimated_students','')::integer);
 end if;return school_private.owner_save_before_part10(kind,payload,record_id);
end $$;

-- Booking holds are transactionally rebuilt from event recurrence. Shared room IDs
-- also prevent two differently named assets representing the same room colliding.
alter table public.calendar_events add column asset_id uuid references public.school_assets(id) on delete restrict;
create table public.school_asset_reservations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants,
 event_id uuid not null references public.calendar_events on delete cascade,asset_id uuid not null references public.school_assets,
 booking_key uuid not null,starts_at timestamptz not null,ends_at timestamptz not null,check(ends_at>starts_at),
 exclude using gist(booking_key with =,tstzrange(starts_at,ends_at,'[)') with &&)
);
create index school_asset_reservations_event on public.school_asset_reservations(event_id);
create index school_asset_reservations_tenant on public.school_asset_reservations(tenant_id);
alter table public.school_asset_reservations enable row level security;
revoke all on public.school_asset_reservations from public,anon,authenticated;
grant all on public.school_asset_reservations to service_role;
create function school_private.asset_calendar_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare tenant uuid;asset public.school_assets;freq text;n integer:=1;i integer;start_time timestamptz;end_time timestamptz;zone text;month_offset integer:=0;begin
 if new.asset_id is null then delete from public.school_asset_reservations where event_id=new.id;return new;end if;
 select c.tenant_id,t.timezone into tenant,zone from public.calendars c join public.tenants t on t.id=c.tenant_id where c.id=new.calendar_id;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,10));
 select * into asset from public.school_assets where id=new.asset_id and tenant_id=tenant and is_active;
 if asset.id is null then raise exception 'Select an active school asset' using errcode='23503';end if;
 if new.ends_at is null or new.ends_at<=new.starts_at or new.ends_at-new.starts_at>interval '31 days' then raise exception 'Asset bookings need a valid start and end (up to 31 days)';end if;
 if new.recurrence_rule is not null then
 if new.recurrence_rule !~ '^FREQ=(DAILY|WEEKLY|MONTHLY);COUNT=[0-9]{1,3}$' then raise exception 'Asset bookings support daily, weekly or monthly repeats with a fixed occurrence count';end if;
 freq:=split_part(split_part(new.recurrence_rule,';',1),'=',2);n:=split_part(new.recurrence_rule,'COUNT=',2)::integer;
 if n not between 1 and 366 then raise exception 'Choose 1–366 booking occurrences';end if;
 end if;
 delete from public.school_asset_reservations where event_id=new.id;
 for i in 0..n-1 loop
 if freq='MONTHLY' then
 loop
 start_time:=new.starts_at+make_interval(months=>month_offset);month_offset:=month_offset+1;
 exit when extract(day from start_time at time zone 'UTC')=extract(day from new.starts_at at time zone 'UTC');
 end loop;
 else start_time:=new.starts_at+case when freq='WEEKLY' then make_interval(days=>i*7) when freq='DAILY' then make_interval(days=>i) else interval '0' end;end if;
 end_time:=start_time+(new.ends_at-new.starts_at);
 if exists(select 1 from public.room_bookings b where b.tenant_id=tenant and b.room_id=asset.room_id and b.status in('PENDING','APPROVED') and tstzrange(b.starts_at,b.ends_at,'[)')&&tstzrange(start_time,end_time,'[)')) then raise exception 'This room already has a booking' using errcode='23P01';end if;
 if exists(select 1 from public.school_timetable tt join public.semesters s on s.id=tt.semester_id cross join lateral generate_series((start_time at time zone zone)::date,(end_time at time zone zone)::date,interval '1 day')d where tt.tenant_id=tenant and tt.room_id=asset.room_id and d::date between s.starts_on and s.ends_on and extract(isodow from d)=tt.weekday and tstzrange((d::date+tt.starts_at) at time zone zone,(d::date+tt.ends_at) at time zone zone,'[)')&&tstzrange(start_time,end_time,'[)')) then raise exception 'This asset is reserved for a teaching timetable' using errcode='23P01';end if;
 insert into public.school_asset_reservations(tenant_id,event_id,asset_id,booking_key,starts_at,ends_at) values(tenant,new.id,asset.id,coalesce(asset.room_id,asset.id),start_time,end_time);
 end loop;return new;
end $$;
create trigger p10_asset_calendar_sync after insert or update of asset_id,starts_at,ends_at,recurrence_rule,calendar_id on public.calendar_events for each row execute function school_private.asset_calendar_sync();
revoke all on function school_private.asset_calendar_sync() from public,anon,authenticated;
create function school_private.booking_conflict_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare zone text;begin
 perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text,10));
 select timezone into zone from public.tenants where id=new.tenant_id;
 if tg_table_name='room_bookings' then
 if new.status in('PENDING','APPROVED') and exists(select 1 from public.school_asset_reservations b where b.tenant_id=new.tenant_id and b.booking_key=new.room_id and tstzrange(b.starts_at,b.ends_at,'[)')&&tstzrange(new.starts_at,new.ends_at,'[)')) then raise exception 'This room is reserved by a calendar event' using errcode='23P01';end if;
 elsif new.room_id is not null and exists(select 1 from public.school_asset_reservations b join public.semesters s on s.id=new.semester_id cross join lateral generate_series((b.starts_at at time zone zone)::date,(b.ends_at at time zone zone)::date,interval '1 day')d where b.tenant_id=new.tenant_id and b.booking_key=new.room_id and d::date between s.starts_on and s.ends_on and extract(isodow from d)=new.weekday and tstzrange((d::date+new.starts_at) at time zone zone,(d::date+new.ends_at) at time zone zone,'[)')&&tstzrange(b.starts_at,b.ends_at,'[)')) then raise exception 'This room is reserved by a calendar event' using errcode='23P01';end if;
 return new;
end $$;
create trigger p10_room_calendar_conflict before insert or update on public.room_bookings for each row execute function school_private.booking_conflict_guard();
create trigger p10_timetable_calendar_conflict before insert or update on public.school_timetable for each row execute function school_private.booking_conflict_guard();
revoke all on function school_private.booking_conflict_guard() from public,anon,authenticated;
create function school_private.calendar_save(calendar_uuid uuid,payload jsonb,event_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();result jsonb;begin
 if not public.app_has_permission(auth.uid(),case when event_id is null then 'calendar.create' else 'calendar.update' end) or not exists(select 1 from public.calendars c where c.id=calendar_uuid and c.tenant_id=tenant and c.owner_user_id=auth.uid() and c.is_active and not c.integration_managed) then raise exception 'Owned editable calendar required' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>20000 or length(trim(payload->>'title')) not between 1 and 200 or length(coalesce(payload->>'description',''))>10000 or length(coalesce(payload->>'recurrence_rule',''))>300 then raise exception 'Enter a valid event title and description';end if;
 if event_id is null then
 insert into public.calendar_events(calendar_id,title,description,starts_at,ends_at,is_all_day,event_type,recurrence_rule,asset_id) values(calendar_uuid,trim(payload->>'title'),payload->>'description',(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,coalesce((payload->>'is_all_day')::boolean,false),coalesce(payload->>'event_type','GENERAL'),nullif(payload->>'recurrence_rule',''),nullif(payload->>'asset_id','')::uuid) returning to_jsonb(calendar_events.*) into result;
 else update public.calendar_events set title=trim(payload->>'title'),description=payload->>'description',starts_at=(payload->>'starts_at')::timestamptz,ends_at=(payload->>'ends_at')::timestamptz,is_all_day=coalesce((payload->>'is_all_day')::boolean,false),event_type=coalesce(payload->>'event_type','GENERAL'),recurrence_rule=nullif(payload->>'recurrence_rule',''),asset_id=nullif(payload->>'asset_id','')::uuid where id=event_id and calendar_id=calendar_uuid and source_table is null returning to_jsonb(calendar_events.*) into result;end if;
 if result is null then raise exception 'Event not found' using errcode='P0002';end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,auth.uid(),'SAVE','CALENDAR','calendar_events',(result->>'id')::uuid,result);
 return result;
end $$;
create function public.school_calendar_save(calendar_uuid uuid,payload jsonb,event_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select school_private.calendar_save(calendar_uuid,payload,event_id)$$;
alter function school_private.calendar_context(timestamptz,timestamptz) rename to calendar_context_before_part10;
revoke all on function school_private.calendar_context_before_part10(timestamptz,timestamptz) from public,anon,authenticated;
create function school_private.calendar_context(starts timestamptz,ends timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;tenant uuid:=school_private.tenant();zone text;teaching jsonb;begin
 result:=school_private.calendar_context_before_part10(starts,ends);
 select timezone into zone from public.tenants where id=tenant;
 select coalesce(jsonb_agg(jsonb_build_object('id',tt.id::text||':'||d::date::text,'calendar_id','timetable','title',s.name||' · '||c.name,'description',u.full_name||coalesce(' · '||a.name,' · '||r.name,''),'starts_at',(d::date+tt.starts_at) at time zone zone,'ends_at',(d::date+tt.ends_at) at time zone zone,'is_all_day',false,'event_type','GENERAL','recurrence_rule',null,'asset_name',coalesce(a.name,r.name),'source_table','school_timetable') order by d,tt.starts_at),'[]') into teaching
 from public.school_timetable tt join public.semesters sem on sem.id=tt.semester_id join public.classrooms c on c.id=tt.classroom_id join public.subjects s on s.id=tt.subject_id join public.teachers te on te.id=tt.teacher_id join public.users u on u.id=te.user_id
 left join public.rooms r on r.id=tt.room_id left join lateral(select name from public.school_assets where room_id=tt.room_id and tenant_id=tenant and is_active order by name limit 1)a on true
 cross join lateral generate_series((starts at time zone zone)::date,(ends at time zone zone)::date,interval '1 day')d
 where tt.tenant_id=tenant and c.is_active and d::date between sem.starts_on and sem.ends_on and extract(isodow from d)=tt.weekday
 and (d::date+tt.starts_at) at time zone zone<ends and (d::date+tt.ends_at) at time zone zone>=starts
 and (school_private.role(array['STAFF','PRINCIPAL']) or te.user_id=auth.uid() or exists(select 1 from public.student_assignments sa where sa.classroom_id=tt.classroom_id and sa.semester_id=tt.semester_id and sa.is_active and school_private.child(sa.student_id)));
 result:=jsonb_set(result,'{events}',coalesce((select jsonb_agg(e||jsonb_build_object('asset_name',a.name)) from jsonb_array_elements(result->'events')e left join public.school_assets a on a.id=nullif(e->>'asset_id','')::uuid),'[]')||teaching);
 return result||jsonb_build_object('calendars',(result->'calendars')||jsonb_build_array(jsonb_build_object('id','timetable','name','Teaching timetable','can_edit',false,'integration_managed',true)),'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'category',a.category) order by a.name) from public.school_assets a where a.tenant_id=tenant and a.is_active),'[]'));
end $$;

alter table public.team_tasks add column starts_on date,add column parent_task_id uuid references public.team_tasks(id) on delete restrict;
alter table public.team_tasks add constraint team_activity_dates check(starts_on is null or due_date is null or due_date>=starts_on);
create index team_tasks_parent on public.team_tasks(parent_task_id);
create function school_private.project_member(project uuid,manage boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.team_projects p where p.id=project and p.tenant_id=school_private.tenant() and (p.owner_user_id=auth.uid() or exists(select 1 from public.team_project_members m where m.project_id=p.id and m.user_id=auth.uid() and (not manage or m.member_role in('OWNER','MANAGER')))))
$$;
revoke all on function school_private.project_member(uuid,boolean) from public,anon,authenticated;
create function school_private.project_work(project_uuid uuid,action text default 'read',payload jsonb default '{}',record_id uuid default null,page_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();result jsonb;member uuid;parent uuid;begin
 perform school_private.require_module('team');
 if not public.app_has_permission(auth.uid(),'team_projects.read') or not school_private.project_member(project_uuid) then raise exception 'Project membership required' using errcode='42501';end if;
 if action='read' then
 return jsonb_build_object('can_manage',school_private.project_member(project_uuid,true),'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('assignee',jsonb_build_object('id',u.id,'full_name',u.full_name),'parent_title',p.title) order by coalesce(t.starts_on,t.due_date),t.created_at,t.id) from (select * from public.team_tasks where project_id=project_uuid order by coalesce(starts_on,due_date),created_at,id limit 50 offset greatest(page_offset,0))t left join public.users u on u.id=t.assignee_user_id left join public.team_tasks p on p.id=t.parent_task_id),'[]'));
 end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>20000 then raise exception 'Invalid project data';end if;
 if action in('member','project') then
 if not school_private.project_member(project_uuid,true) or not public.app_has_permission(auth.uid(),'team_projects.update') then raise exception 'Project manager required' using errcode='42501';end if;
 if action='member' then
 member:=(payload->>'user_id')::uuid;
 if not exists(select 1 from public.users where id=member and tenant_id=tenant and is_active and deleted_at is null) or coalesce(payload->>'position','') not in('COORDINATOR','MEMBER') then raise exception 'Select an active school user and committee position';end if;
 insert into public.school_project_committees(tenant_id,project_id,user_id,position) values(tenant,project_uuid,member,payload->>'position') on conflict do nothing;
 insert into public.team_project_members(tenant_id,project_id,user_id,member_role) values(tenant,project_uuid,member,'MEMBER') on conflict(project_id,user_id) do nothing;
 result:=jsonb_build_object('id',member);
 else
 update public.team_projects set starts_on=nullif(payload->>'starts_on','')::date,due_on=nullif(payload->>'due_on','')::date,status=coalesce(payload->>'status',status) where id=project_uuid returning to_jsonb(team_projects.*) into result;
 end if;
 elsif action='activity' then
 if not public.app_has_permission(auth.uid(),case when record_id is null then 'team_tasks.create' else 'team_tasks.update' end) or (not school_private.project_member(project_uuid,true) and not exists(select 1 from public.team_project_members where project_id=project_uuid and user_id=auth.uid() and member_role='MEMBER')) then raise exception 'Project activity editor required' using errcode='42501';end if;
 member:=nullif(payload->>'assignee_user_id','')::uuid;parent:=nullif(payload->>'parent_task_id','')::uuid;
 if member is not null and not exists(select 1 from public.users u where u.id=member and u.tenant_id=tenant and u.is_active and u.deleted_at is null and (exists(select 1 from public.team_project_members where project_id=project_uuid and user_id=member) or exists(select 1 from public.team_projects where id=project_uuid and owner_user_id=member))) then raise exception 'Choose an active project member';end if;
 if parent is not null and (parent=record_id or not exists(select 1 from public.team_tasks where id=parent and project_id=project_uuid and parent_task_id is null) or exists(select 1 from public.team_tasks where parent_task_id=record_id)) then raise exception 'Choose a main activity in this project';end if;
 if record_id is null then
 insert into public.team_tasks(tenant_id,project_id,title,description,status,priority,reporter_user_id,assignee_user_id,starts_on,due_date,parent_task_id) values(tenant,project_uuid,trim(payload->>'title'),payload->>'description',coalesce(payload->>'status','TODO'),coalesce(payload->>'priority','MEDIUM'),auth.uid(),member,nullif(payload->>'starts_on','')::date,nullif(payload->>'due_date','')::date,parent) returning to_jsonb(team_tasks.*) into result;
 else update public.team_tasks set title=trim(payload->>'title'),description=payload->>'description',status=coalesce(payload->>'status',status),priority=coalesce(payload->>'priority',priority),assignee_user_id=member,starts_on=nullif(payload->>'starts_on','')::date,due_date=nullif(payload->>'due_date','')::date,parent_task_id=parent where id=record_id and project_id=project_uuid returning to_jsonb(team_tasks.*) into result;end if;
 if result is null then raise exception 'Activity not found' using errcode='P0002';end if;
 else raise exception 'Unknown project action';end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,auth.uid(),upper(action),'TEAM','team_projects',project_uuid,payload);
 return result;
end $$;
create function public.school_project_work(project_uuid uuid,action text default 'read',payload jsonb default '{}',record_id uuid default null,page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select school_private.project_work(project_uuid,action,payload,record_id,page_offset)$$;
alter function public.integration_recipients(text,jsonb) rename to integration_recipients_before_part10;
revoke all on function public.integration_recipients_before_part10(text,jsonb) from public,anon,authenticated;
create function public.integration_recipients(source text,row_data jsonb) returns setof uuid language plpgsql stable security definer set search_path='' as $$
declare project uuid:=case when source='team_projects' then (row_data->>'id')::uuid else (row_data->>'project_id')::uuid end;begin
 if source in('team_projects','team_tasks') then
 return query select distinct u.id from public.users u where u.tenant_id=(row_data->>'tenant_id')::uuid and u.is_active and u.deleted_at is null and (u.id in(select m.user_id from public.team_project_members m where m.project_id=project) or u.id in(select p.owner_user_id from public.team_projects p where p.id=project));
 else return query select public.integration_recipients_before_part10(source,row_data);end if;
end $$;
revoke all on function public.integration_recipients(text,jsonb) from public,anon,authenticated;
grant execute on function public.integration_recipients(text,jsonb) to service_role;
create function school_private.project_calendar_sync() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;project uuid;tenant uuid;zone text;r record;recipient uuid;cal uuid;begin
 project:=case when tg_table_name='team_projects' then (row_data->>'id')::uuid else (row_data->>'project_id')::uuid end;
 select p.tenant_id,t.timezone into tenant,zone from public.team_projects p join public.tenants t on t.id=p.tenant_id where p.id=project;
 if tenant is null then return null;end if;
 -- Membership removal, cancellation and cleared dates remove obsolete events.
 delete from public.calendar_events e using public.calendars c where c.id=e.calendar_id and c.tenant_id=tenant and (e.source_table='team_projects' and e.source_id=project or e.source_table='team_tasks' and e.source_id in(select id from public.team_tasks where project_id=project)) and (c.owner_user_id not in(select public.integration_recipients('team_projects',jsonb_build_object('id',project,'tenant_id',tenant))) or exists(select 1 from public.team_projects where id=project and status in('COMPLETED','ARCHIVED')));
 for r in select 'team_projects'::text source,p.id,p.name title,p.description,coalesce(p.starts_on,p.due_on) starts,coalesce(p.due_on,p.starts_on)+1 ends,p.status in('COMPLETED','ARCHIVED') inactive from public.team_projects p where p.id=project
 union all select 'team_tasks',t.id,t.title,t.description,coalesce(t.starts_on,t.due_date),coalesce(t.due_date,t.starts_on)+1,t.status='DONE' or p.status in('COMPLETED','ARCHIVED') from public.team_tasks t join public.team_projects p on p.id=t.project_id where t.project_id=project loop
 if r.inactive or r.starts is null then delete from public.calendar_events where source_table=r.source and source_id=r.id;continue;end if;
 for recipient in select public.integration_recipients('team_projects',jsonb_build_object('id',project,'tenant_id',tenant)) loop
 insert into public.calendars(tenant_id,owner_user_id,name,integration_managed) values(tenant,recipient,'School projects',true) on conflict(tenant_id,owner_user_id) where integration_managed do update set is_active=true returning id into cal;
 insert into public.calendar_events(calendar_id,title,description,starts_at,ends_at,is_all_day,event_type,source_table,source_id) values(cal,r.title,r.description,r.starts::timestamp at time zone zone,r.ends::timestamp at time zone zone,true,'DEADLINE',r.source,r.id) on conflict(calendar_id,source_table,source_id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,is_all_day=true;
 end loop;end loop;return null;
end $$;
create trigger p10_project_timeline after insert or update on public.team_projects for each row execute function school_private.project_calendar_sync();
create trigger p10_activity_timeline after insert or update or delete on public.team_tasks for each row execute function school_private.project_calendar_sync();
create trigger p10_member_timeline after insert or update or delete on public.team_project_members for each row execute function school_private.project_calendar_sync();
revoke all on function school_private.project_calendar_sync() from public,anon,authenticated;

-- Student academic administrative projections are retired. Learning remains scoped.
alter function school_private.family_report(text,uuid,integer) rename to family_report_before_part10;
revoke all on function school_private.family_report_before_part10(text,uuid,integer) from public,anon,authenticated;
create function school_private.family_report(kind text,student uuid,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if kind='academic' then raise exception 'Academic is managed by Staff' using errcode='42501';end if;
 return school_private.family_report_before_part10(kind,student,page_offset);
end $$;
-- Explicit grants: only narrow public invoker entrypoints expose these operations.
do $$ declare signature text;begin
 foreach signature in array array['principal_overview(uuid)','principal_absences(text,integer,uuid)','owner_reference(text,text,text)','group_save(jsonb,uuid)','calendar_save(uuid,jsonb,uuid)','project_work(uuid,text,jsonb,uuid,integer)'] loop
 execute 'revoke all on function school_private.'||signature||' from public,anon,authenticated';
 execute 'grant execute on function school_private.'||signature||' to authenticated';
 execute 'revoke all on function public.school_'||signature||' from public,anon,authenticated';
 execute 'grant execute on function public.school_'||signature||' to authenticated';
 end loop;
 foreach signature in array array['approval_queue(integer,uuid)','approval_decide(uuid,text,text)','approval_count()','owner_list(text,jsonb,integer,integer)','owner_save(text,jsonb,uuid)','calendar_context(timestamptz,timestamptz)','family_report(text,uuid,integer)'] loop
 execute 'revoke all on function school_private.'||signature||' from public,anon,authenticated';
 execute 'grant execute on function school_private.'||signature||' to authenticated';
 end loop;
end $$;
notify pgrst,'reload schema';
