-- Part 9: tenant-scoped administration, approval execution, and factual dashboards.
-- Existing records and authentication identifiers are retained.
alter table public.tenants add column npsn text check(npsn is null or npsn ~ '^[0-9]{8}$');
create or replace function school_private.owner_save_before_part8(kind text,payload jsonb,record_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; previous jsonb; target text; allowed text[]; columns text; actor_tenant uuid; tenant uuid; row_id uuid; invoice school_private.owner_invoice_rows; before_paid numeric; begin
 perform school_private.require_owner(); actor_tenant:=school_private.tenant();
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>16000 then raise exception 'Invalid payload' using errcode='22023'; end if;
 if kind='tenant' then
  target:='tenants'; allowed:=array['name','code','is_active','legal_name','npsn','address','contact_email','contact_phone','website_url','academic_year_label','week_starts_on','notifications_email_enabled','notifications_in_app_enabled','timezone','locale'];
  if record_id=actor_tenant and payload->'is_active'='false'::jsonb then raise exception 'Cannot deactivate your current tenant' using errcode='22023'; end if;
  if payload ? 'name' and length(trim(payload->>'name')) not between 2 and 160 then raise exception 'Invalid tenant name' using errcode='22023'; end if;
  if payload ? 'code' and payload->>'code' !~ '^[A-Za-z0-9_-]{2,32}$' then raise exception 'Invalid tenant code' using errcode='22023'; end if;
  if payload ? 'contact_email' and coalesce(payload->>'contact_email','')<>'' and payload->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email' using errcode='22023'; end if;
  if payload ? 'locale' and payload->>'locale' not in ('id-ID','en-US') then raise exception 'Invalid locale' using errcode='22023'; end if;
  if payload ? 'timezone' and not exists(select 1 from pg_timezone_names where name=payload->>'timezone') then raise exception 'Invalid time zone' using errcode='22023'; end if;
 elsif kind='partner' then
  target:='school_partners'; allowed:=array['name','user_id','referral_code','is_active','domicile','phone','bank_name','bank_account_name','bank_account_number','payment_url'];
  if record_id is not null and payload ? 'user_id' then raise exception 'Partner account cannot be reassigned' using errcode='22023'; end if;
  if payload ? 'name' and length(trim(payload->>'name')) not between 2 and 160 then raise exception 'Invalid partner name' using errcode='22023'; end if;
 elsif kind='contract' then
  if record_id is null then raise exception 'Choose a tenant' using errcode='22023'; end if;
  select to_jsonb(c) into previous from public.owner_contracts c where tenant_id=record_id;
  insert into public.owner_contracts(tenant_id,onboarded_on,expires_on,billing_period,annual_amount,period_amount)
  values(record_id,(payload->>'onboarded_on')::date,(payload->>'expires_on')::date,payload->>'billing_period',(payload->>'annual_amount')::numeric,(payload->>'period_amount')::numeric)
  on conflict(tenant_id) do update set onboarded_on=excluded.onboarded_on,expires_on=excluded.expires_on,billing_period=excluded.billing_period,annual_amount=excluded.annual_amount,period_amount=excluded.period_amount,updated_at=now()
  returning to_jsonb(owner_contracts.*) into result;
 elsif kind='module' then
  if record_id is null or payload->>'module' not in ('core','academic','attendance','connect','learning','exams','finance','team') or jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'Invalid module switch' using errcode='22023'; end if;
  insert into public.school_settings(tenant_id) values(record_id) on conflict do nothing;
  select to_jsonb(s) into previous from public.school_settings s where tenant_id=record_id for update;
  update public.school_settings set modules=jsonb_set(modules,array[payload->>'module'],payload->'enabled'),updated_at=now() where tenant_id=record_id returning to_jsonb(school_settings.*) into result;
 elsif kind='plan' then
  insert into public.school_settings(tenant_id,plan_code) values(record_id,payload->>'plan_code') on conflict(tenant_id) do update set plan_code=excluded.plan_code,updated_at=now() returning to_jsonb(school_settings.*) into result;
 elsif kind='invoice' then
  tenant:=(payload->>'tenant_id')::uuid;
  perform 1 from public.owner_contracts where tenant_id=tenant for update;
  if not found then raise exception 'Save the contract before creating an invoice' using errcode='22023'; end if;
  select to_jsonb(i) into result from public.owner_invoices i where request_id=(payload->>'request_id')::uuid;
  if result is not null then
   if result->>'tenant_id' is distinct from tenant::text or result->>'period_start' is distinct from payload->>'period_start' or result->>'period_end' is distinct from payload->>'period_end' or (result->>'amount')::numeric is distinct from (payload->>'amount')::numeric then raise exception 'Invoice request key already used with different values' using errcode='22023'; end if;
   return result;
  end if;
  if not exists(select 1 from public.owner_contracts where tenant_id=tenant and (payload->>'period_start')::date>=onboarded_on and (payload->>'period_end')::date<=expires_on) then raise exception 'Invoice period must be within the contract' using errcode='22023'; end if;
  if exists(select 1 from public.owner_invoices where tenant_id=tenant and daterange(period_start,period_end,'[]') && daterange((payload->>'period_start')::date,(payload->>'period_end')::date,'[]')) then raise exception 'An invoice already covers this period' using errcode='23505'; end if;
  row_id:=gen_random_uuid();
  insert into public.owner_invoices(id,request_id,tenant_id,number,period_start,period_end,due_on,amount,notes,created_by)
  values(row_id,(payload->>'request_id')::uuid,tenant,'OSE-'||to_char(current_date,'YYYYMM')||'-'||upper(substr(replace(row_id::text,'-',''),1,12)),(payload->>'period_start')::date,(payload->>'period_end')::date,(payload->>'due_on')::date,(payload->>'amount')::numeric,coalesce(payload->>'notes',''),auth.uid()) returning to_jsonb(owner_invoices.*) into result;
  insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id,metadata)
  select tenant,u.id,'ACTION_REQUIRED',case when t.locale='id-ID' then 'Invoice langganan OSEKOLA' else 'OSEKOLA subscription invoice' end,
   (result->>'number')||' · IDR '||(result->>'amount')||' · '||(result->>'due_on'),'owner_invoice',row_id,jsonb_build_object('href','/dashboard/subscription')
  from public.users u join public.tenants t on t.id=u.tenant_id where u.tenant_id=tenant and u.is_active and exists(select 1 from public.roles r where r.code in ('OWNER','PRINCIPAL','STAFF') and r.is_active and r.id in(select role_id from public.user_roles where user_id=u.id union select role_id from public.user_level_roles where user_level_id=u.user_level_id));
 elsif kind='receipt' then
  perform 1 from public.owner_invoices where id=record_id for update;
  select * into invoice from school_private.owner_invoice_rows where id=record_id;
  if invoice.id is null then raise exception 'Invoice not found' using errcode='P0002'; end if;
  select to_jsonb(r) into result from public.owner_receipts r where invoice_id=record_id and reference=payload->>'reference';
  if result is not null then
   if (result->>'amount')::numeric is distinct from (payload->>'amount')::numeric or result->>'paid_on' is distinct from payload->>'paid_on' then raise exception 'Payment reference already used with different values' using errcode='22023'; end if;
   return result;
  end if;
  if (payload->>'amount')::numeric>invoice.balance then raise exception 'Receipt exceeds the outstanding balance' using errcode='22023'; end if;
  insert into public.owner_receipts(invoice_id,amount,reference,paid_on,created_by) values(record_id,(payload->>'amount')::numeric,payload->>'reference',(payload->>'paid_on')::date,auth.uid()) returning to_jsonb(owner_receipts.*) into result;
 elsif kind='expense' then
  insert into public.owner_expenses(description,amount,reference,paid_on,created_by) values(payload->>'description',(payload->>'amount')::numeric,payload->>'reference',(payload->>'paid_on')::date,auth.uid()) returning to_jsonb(owner_expenses.*) into result;
 elsif kind='commission' then
  if not exists(select 1 from public.school_leads where id=(payload->>'lead_id')::uuid and partner_id=(payload->>'partner_id')::uuid and stage='WON') then raise exception 'Choose a won lead for this partner' using errcode='22023'; end if;
  insert into public.school_commissions(partner_id,lead_id,amount,status) values((payload->>'partner_id')::uuid,(payload->>'lead_id')::uuid,(payload->>'amount')::numeric,'PENDING') returning to_jsonb(school_commissions.*) into result;
 elsif kind='commission_paid' then
  if length(trim(coalesce(payload->>'reference','')))<3 then raise exception 'Payment reference required' using errcode='22023'; end if;
  select to_jsonb(c) into previous from public.school_commissions c where id=record_id for update;
  update public.school_commissions set status='RECEIVED',reference=payload->>'reference',received_at=now() where id=record_id and status='PENDING' returning to_jsonb(school_commissions.*) into result;
 else raise exception 'Unsupported operation' using errcode='22023'; end if;
 if target is not null then
  if payload='{}'::jsonb or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed))) then raise exception 'Unsupported fields' using errcode='22023'; end if;
  select string_agg(format('%I',k),',' order by k) into columns from jsonb_object_keys(payload)k;
  if record_id is null then
   execute format('insert into public.%1$I(%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) returning to_jsonb(%1$I.*)',target,columns) into result using payload;
  else
   execute format('select to_jsonb(t) from public.%I t where id=$1 for update',target) into previous using record_id;
   execute format('update public.%1$I set (%2$s)=(select %2$s from jsonb_populate_record(null::public.%1$I,$1)) where id=$2 returning to_jsonb(%1$I.*)',target,columns) into result using payload,record_id;
  end if;
 end if;
 if result is null then raise exception 'Record not found or already processed' using errcode='P0002'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,before_state,after_state)
 values(actor_tenant,auth.uid(),'OWNER_SAVE','PLATFORM',kind,coalesce(record_id,(result->>'id')::uuid),previous,result);
 return result;
end $$;

alter function school_private.owner_list(text,jsonb,integer,integer) rename to owner_list_before_part9;
create function school_private.owner_list(kind text,filters jsonb default '{}',page_number integer default 1,page_size integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;items jsonb;total bigint;begin
 perform school_private.require_owner();
 if page_number<1 or page_size not between 1 and 100 or length(coalesce(filters->>'query',''))>160 then raise exception 'Invalid pagination';end if;
 if kind='leads' then
 with matching as(select l.* from public.school_leads l where
 (coalesce(filters->>'query','')='' or strpos(lower(l.school_name||' '||coalesce(l.email,'')),lower(filters->>'query'))>0)
 and (coalesce(filters->>'follow_up','')='' or l.follow_up=filters->>'follow_up'))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from matching order by created_at desc,id limit page_size offset (page_number-1)::bigint*page_size)x),'[]'),'total',(select count(*) from matching),'page',page_number,'page_size',page_size) into result;
 return result;
 end if;
 result:=school_private.owner_list_before_part9(kind,filters,page_number,page_size);
 if kind in ('tenants','finance') then
 select coalesce(jsonb_agg(e||jsonb_build_object('npsn',t.npsn)),'[]') into items from jsonb_array_elements(result->'items')e join public.tenants t on t.id=(e->>'id')::uuid;
 result:=jsonb_set(result,'{items}',items);
 end if;return result;
end $$;
revoke all on function school_private.owner_list(text,jsonb,integer,integer) from public,anon;
grant execute on function school_private.owner_list(text,jsonb,integer,integer) to authenticated;

-- Only Staff can enter the build/update workflow, including direct RPC calls.
create or replace function school_private.setup_access(write_access boolean default false) returns void language plpgsql stable security definer set search_path='' as $$begin
 perform school_private.require_module('core');
 if not school_private.role(array['STAFF']) then raise exception 'School setup requires Staff access' using errcode='42501';end if;
end $$;

-- Preserve the established attendance stores. The reason is independently recorded.
alter table public.attendance_records drop constraint attendance_records_status_check;
alter table public.attendance_records add constraint attendance_records_status_check check(status in('PRESENT','LATE','SICK','EXCUSED','ABSENT'));
alter table public.school_user_attendance drop constraint school_user_attendance_method_check;
alter table public.school_user_attendance add constraint school_user_attendance_method_check check(method in('FACE','QR','RFID','MANUAL','LEAVE'));
alter table public.school_user_attendance add column status text not null default 'PRESENT' check(status in('PRESENT','LATE','SICK','EXCUSED','ABSENT')),add column note text;
alter table public.leave_requests add column subject_user_id uuid references public.users(id),add column student_id uuid references public.students(id),add column classroom_id uuid references public.classrooms(id),add column substitute_teacher_id uuid references public.teachers(id),add column substitute_kind text check(substitute_kind in('SUBJECT','HOMEROOM')),add column chat_message_id uuid references public.oconnect_messages(id);
create trigger p9_leave_tenant before insert or update on public.leave_requests for each row execute function public.enforce_tenant_relations('{"subject_user_id":"users","student_id":"students","classroom_id":"classrooms","substitute_teacher_id":"teachers"}');
-- A dedicated immutable link prevents chat text from impersonating an approval.
alter table public.oconnect_messages add column leave_request_id uuid references public.leave_requests(id);

create function school_private.p9_approver(tenant uuid,role_code text,requester uuid) returns uuid language plpgsql stable security definer set search_path='' as $$declare chosen uuid;begin
 select u.id into chosen from public.users u join public.tenants t on t.id=u.tenant_id where u.is_active and u.deleted_at is null and t.is_active and u.id<>requester and (role_code='OWNER' or u.tenant_id=tenant) and public.app_role_in(u.id,array[role_code]) order by (u.tenant_id=tenant) desc,u.created_at,u.id limit 1;
 if chosen is null then raise exception 'No active approver is assigned. Ask the school administrator to appoint one.' using errcode='22023';end if;return chosen;
end $$;

create function school_private.leave_submit(actor uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=public.app_tenant(actor);subject uuid:=actor;student uuid;class_id uuid;approver uuid;substitute uuid;leave_id uuid;request_id uuid;message_id uuid;conversation uuid;start_day date;end_day date;leave_kind text;begin
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>6000 then raise exception 'Invalid request';end if;
 if not public.app_module_enabled(actor,'core') or not public.app_module_enabled(actor,'attendance') then raise exception 'Module access denied' using errcode='42501';end if;
 start_day:=(payload->>'starts_on')::date;end_day:=(payload->>'ends_on')::date;leave_kind:=payload->>'leave_type';
 if start_day is null or end_day is null or end_day<start_day or end_day-start_day>90 or length(trim(coalesce(payload->>'reason',''))) not between 5 and 2000 or leave_kind not in('SICK','PERSONAL','OTHER','ANNUAL','MATERNITY','PATERNITY') then raise exception 'Check dates, leave type and reason' using errcode='22023';end if;
 if public.app_role_in(actor,array['PARENT']) and not public.app_role_in(actor,array['STAFF','TEACHER']) then
 student:=(payload->>'student_id')::uuid;
 select s.user_id into subject from public.students s join public.school_guardians g on g.student_id=s.id and g.tenant_id=s.tenant_id where s.id=student and s.tenant_id=tenant and g.parent_user_id=actor and s.enrollment_status='ACTIVE';
 if subject is null then raise exception 'Only a linked child may be selected' using errcode='42501';end if;
 select c.id,t.user_id into class_id,approver from public.student_assignments sa join public.classrooms c on c.id=sa.classroom_id join public.teachers t on t.user_id=c.homeroom_teacher_user_id join public.users u on u.id=t.user_id join public.semesters sem on sem.id=sa.semester_id where sa.student_id=student and sa.tenant_id=tenant and sa.is_active and c.is_active and u.is_active and u.deleted_at is null and t.employment_status='ACTIVE' and public.app_role_in(u.id,array['TEACHER']) order by sem.is_active desc,sem.starts_on desc,sa.created_at desc limit 1;
 if approver is null then raise exception 'Your child needs an active homeroom teacher before requesting leave' using errcode='22023';end if;
 if not public.app_has_permission(actor,'connect.read') or not public.app_has_permission(approver,'connect.read') then raise exception 'Parent and homeroom teacher need Connect access' using errcode='42501';end if;
 else
 if not public.app_role_in(actor,array['STAFF','TEACHER']) then raise exception 'Leave requests require Parent, Staff or Teacher access' using errcode='42501';end if;
 approver:=school_private.p9_approver(tenant,'PRINCIPAL',actor);
 if public.app_role_in(actor,array['TEACHER']) then
 substitute:=(payload->>'substitute_teacher_id')::uuid;
 if not exists(select 1 from public.teachers t join public.users u on u.id=t.user_id where t.id=substitute and t.tenant_id=tenant and t.employment_status='ACTIVE' and u.is_active and u.deleted_at is null and u.id<>actor and public.app_role_in(u.id,array['TEACHER'])) or payload->>'substitute_kind' not in('SUBJECT','HOMEROOM') or payload->>'substitute_kind' is null then raise exception 'Choose an active substitute teacher and duty' using errcode='22023';end if;
 end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(subject::text,9001));
 if exists(select 1 from public.leave_requests l where l.tenant_id=tenant and coalesce(l.subject_user_id,l.requester_user_id)=subject and l.status in('PENDING','APPROVED') and l.starts_on<=end_day and l.ends_on>=start_day) then raise exception 'An active leave request already covers these dates' using errcode='23514';end if;
 insert into public.leave_requests(tenant_id,requester_user_id,subject_user_id,student_id,classroom_id,leave_type,starts_on,ends_on,reason,substitute_teacher_id,substitute_kind) values(tenant,actor,subject,student,class_id,leave_kind,start_day,end_day,trim(payload->>'reason'),substitute,case when substitute is not null then payload->>'substitute_kind' end) returning id into leave_id;
 insert into public.approval_requests(tenant_id,requester_user_id,resource_type,resource_id,title,metadata) values(tenant,actor,'LEAVE_REQUEST',leave_id,case when student is null then 'Employee leave' else 'Student leave' end,jsonb_build_object('part9',true,'category','LEAVE')) returning id into request_id;
 insert into public.approval_steps(tenant_id,approval_request_id,approver_user_id,sequence) values(tenant,request_id,approver,1);
 update public.leave_requests set approval_request_id=request_id where id=leave_id;
 if student is not null then
 -- The caller is the verified parent; use the existing role/tenant conversation checks.
 conversation:=oconnect_private.create_conversation('DIRECT','',array[approver]);
 insert into public.oconnect_messages(tenant_id,conversation_id,sender_id,body,leave_request_id) values(tenant,conversation,actor,'Leave request: '||(select full_name from public.users where id=subject)||E'\n'||start_day::text||' – '||end_day::text||E'\n'||trim(payload->>'reason'),leave_id) returning id into message_id;
 update public.oconnect_conversations set updated_at=now() where id=conversation;
 update public.oconnect_members set archived=false where conversation_id=conversation;
 update public.leave_requests set chat_message_id=message_id where id=leave_id;
 end if;
 insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id) values(tenant,approver,'APPROVAL','Leave approval required',(select full_name from public.users where id=subject),case when conversation is null then 'approval_request' else 'oconnect' end,coalesce(conversation,request_id));
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,actor,'SUBMIT','OPERATIONS','leave_requests',leave_id,jsonb_build_object('status','PENDING','starts_on',start_day,'ends_on',end_day,'approver',approver));
 return jsonb_build_object('id',leave_id,'approval_request_id',request_id,'status','PENDING');
end $$;
create function public.school_leave_submit(payload jsonb) returns jsonb language sql security definer set search_path='' as $$select school_private.leave_submit(auth.uid(),payload)$$;
-- Existing Operations cannot bypass Principal routing or the substitute requirement.
alter function public.submit_operational_request(uuid,text,jsonb,uuid[]) rename to submit_operational_request_before_part9;
create function public.submit_operational_request(actor_id uuid,kind text,payload jsonb,approvers uuid[]) returns jsonb language plpgsql set search_path='' as $$begin
 if kind='LEAVE_REQUEST' then return school_private.leave_submit(actor_id,payload);end if;
 if kind='GENERIC' and payload->>'resource_type' in('USER_CHANGE') then raise exception 'Reserved resource type' using errcode='42501';end if;
 return public.submit_operational_request_before_part9(actor_id,kind,payload,approvers);
end $$;
revoke all on function public.submit_operational_request(uuid,text,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.submit_operational_request(uuid,text,jsonb,uuid[]) to service_role;

-- Apply attendance in the same transaction as final approval, including past dates.
create function school_private.leave_attendance() returns trigger language plpgsql security definer set search_path='' as $$declare l public.leave_requests;status_value text;day date;begin
 if new.status='APPROVED' and old.status is distinct from new.status and new.resource_type='LEAVE_REQUEST' then
 select * into l from public.leave_requests where id=new.resource_id and tenant_id=new.tenant_id;
 if l.subject_user_id is null then return new;end if;
 status_value:=case when l.leave_type='SICK' then 'SICK' else 'EXCUSED' end;
 for day in select d::date from generate_series(l.starts_on,l.ends_on,interval '1 day')d loop
 if l.student_id is not null then
 insert into public.attendance_records(tenant_id,student_id,classroom_id,attendance_date,status,note) values(l.tenant_id,l.student_id,l.classroom_id,day,status_value,l.reason)
 on conflict(tenant_id,student_id,attendance_date) do update set status=excluded.status,note=excluded.note,recorded_at=now(),updated_at=now();
 else
 insert into public.school_user_attendance(tenant_id,user_id,attendance_date,recorded_by,method,status,note) values(l.tenant_id,l.subject_user_id,day,(select approver_user_id from public.approval_steps where approval_request_id=new.id and sequence=new.current_step),'LEAVE',status_value,l.reason)
 on conflict(tenant_id,user_id,attendance_date) do update set method='LEAVE',status=excluded.status,note=excluded.note,recorded_by=excluded.recorded_by;
 end if;
 end loop;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(l.tenant_id,(select approver_user_id from public.approval_steps where approval_request_id=new.id and sequence=new.current_step),'APPLY_APPROVED_LEAVE','ATTENDANCE','leave_requests',l.id,jsonb_build_object('starts_on',l.starts_on,'ends_on',l.ends_on,'status',status_value));
 end if;return new;
end $$;
create trigger p9_apply_leave after update of status on public.approval_requests for each row execute function school_private.leave_attendance();

create function school_private.attendance_history(student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();today date;who uuid:=auth.uid();begin
 select (now() at time zone coalesce(timezone,'Asia/Jakarta'))::date into today from public.tenants where id=tenant;
 if school_private.role(array['OWNER']) then raise exception 'Personal attendance unavailable' using errcode='42501';end if;
 if student is not null then
 if not school_private.child(student) then raise exception 'Linked student required' using errcode='42501';end if;
 elsif school_private.role(array['PARENT']) and not school_private.role(array['STAFF','TEACHER','PRINCIPAL','STUDENT']) then raise exception 'Choose a linked child' using errcode='42501';
 else select s.id into student from public.students s where s.user_id=who and s.tenant_id=tenant;end if;
 return coalesce((select jsonb_agg(jsonb_build_object('day',d::date,'status',coalesce(a.status,u.status),'note',coalesce(a.note,u.note)) order by d) from generate_series(today-6,today,interval '1 day')d left join public.attendance_records a on a.tenant_id=tenant and a.student_id=student and a.attendance_date=d::date left join public.school_user_attendance u on u.tenant_id=tenant and u.user_id=who and student is null and u.attendance_date=d::date),'[]');
end $$;
create function public.school_attendance_history(student uuid default null) returns jsonb language sql security invoker set search_path='' as $$select school_private.attendance_history(student)$$;

-- User changes are proposed by Staff and executed only after the required decision.
create table public.school_user_changes(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),requester_id uuid not null references public.users(id),target_id uuid references public.users(id),
 operation text not null check(operation in('CREATE','UPDATE','ARCHIVE','RESTORE')),role_code text not null check(role_code in('STUDENT','PARENT','STAFF','TEACHER','PRINCIPAL')),
 payload jsonb not null,snapshot jsonb,approval_request_id uuid references public.approval_requests(id),
 execution_status text not null default 'WAITING' check(execution_status in('WAITING','PROCESSING','DB_APPLIED','DONE')),execution_token uuid,execution_started_at timestamptz,
 created_at timestamptz not null default now(),completed_at timestamptz
);
alter table public.school_user_changes enable row level security;
revoke all on public.school_user_changes from public,anon,authenticated;
grant all on public.school_user_changes to service_role;
create index p9_user_changes_tenant on public.school_user_changes(tenant_id,created_at desc);
create trigger p9_user_change_tenant before insert or update on public.school_user_changes for each row execute function public.enforce_tenant_relations('{"requester_id":"users","target_id":"users","approval_request_id":"approval_requests"}');
-- Allow only the explicitly designated Owner step for Principal personnel requests.
drop trigger tenant_integrity on public.approval_steps;
create trigger tenant_integrity before insert or update on public.approval_steps for each row execute function public.enforce_tenant_relations('{"approval_request_id":"approval_requests"}');
create function school_private.approver_tenant_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.users u where u.id=new.approver_user_id and (u.tenant_id=new.tenant_id or (public.app_role_in(u.id,array['OWNER']) and exists(select 1 from public.approval_requests a join public.school_user_changes c on c.id=a.resource_id where a.id=new.approval_request_id and a.resource_type='USER_CHANGE' and c.role_code='PRINCIPAL' and c.tenant_id=new.tenant_id)))) then raise exception 'Approver must belong to this school' using errcode='23503';end if;return new;
end $$;
create trigger p9_approver_scope before insert or update on public.approval_steps for each row execute function school_private.approver_tenant_guard();

create function school_private.p9_has_role(who uuid,codes text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.users u join public.roles r on r.is_active and r.code=any(codes) where u.id=who and r.id in(select role_id from public.user_roles where user_id=u.id union select role_id from public.user_level_roles where user_level_id=u.user_level_id))$$;
create function school_private.people_list(role_code text,query text default '',page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$declare tenant uuid:=school_private.tenant();begin
 if not school_private.role(array['STAFF']) or role_code not in('STUDENT','PARENT','STAFF','TEACHER','PRINCIPAL') then raise exception 'Staff access required' using errcode='42501';end if;
 if length(query)>160 or page_offset<0 or page_offset>100000 then raise exception 'Invalid search';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select u.id,u.full_name,u.email,u.phone,u.is_active,u.deleted_at,u.updated_at,
 (select s.student_number from public.students s where s.user_id=u.id and s.tenant_id=tenant) as student_number,
 (select t.employee_number from public.teachers t where t.user_id=u.id and t.tenant_id=tenant) as employee_number,
 coalesce((select jsonb_agg(g.student_id) from public.school_guardians g where g.parent_user_id=u.id and g.tenant_id=tenant),'[]') as student_ids,
 (select c.id from public.school_user_changes c join public.approval_requests a on a.id=c.approval_request_id where c.target_id=u.id and c.execution_status<>'DONE' and a.status in('PENDING','APPROVED') order by c.created_at desc limit 1) as pending_change
 from public.users u where u.tenant_id=tenant and school_private.p9_has_role(u.id,array[role_code]) and not school_private.p9_has_role(u.id,array['OWNER']) and (query='' or strpos(lower(coalesce(u.full_name,'')||' '||u.email),lower(query))>0) order by u.full_name,u.id limit 50 offset page_offset) x),'[]');
end $$;
create function public.school_people_list(role_code text,query text default '',page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select school_private.people_list(role_code,query,page_offset)$$;

create function school_private.people_request(operation text,role_code text,payload jsonb,target_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();actor uuid:=auth.uid();change_id uuid;request_id uuid;approver uuid;before_row jsonb;g uuid;begin
 perform school_private.require_module('core');
 if not school_private.role(array['STAFF']) then raise exception 'Staff access required' using errcode='42501';end if;
 if operation not in('CREATE','UPDATE','ARCHIVE','RESTORE') or role_code not in('STUDENT','PARENT','STAFF','TEACHER','PRINCIPAL') or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>6000 or exists(select 1 from jsonb_object_keys(payload)k where k not in('full_name','email','phone','student_number','employee_number','student_ids')) then raise exception 'Invalid user change';end if;
 if operation<>'CREATE' then
 if target_id=actor then raise exception 'Use your profile to edit your own account' using errcode='42501';end if;
 select to_jsonb(u) into before_row from public.users u where u.id=target_id and u.tenant_id=tenant for update;
 if before_row is null or not school_private.p9_has_role(target_id,array[role_code]) or school_private.p9_has_role(target_id,array['OWNER']) then raise exception 'User not in selected school and role' using errcode='42501';end if;
 if role_code<>'PRINCIPAL' and school_private.p9_has_role(target_id,array['PRINCIPAL']) then raise exception 'Manage this account as Principal for Owner approval' using errcode='42501';end if;
 if role_code in('STUDENT','PARENT') and school_private.p9_has_role(target_id,array['PRINCIPAL','STAFF','TEACHER']) then raise exception 'Manage this employee through their employee role' using errcode='42501';end if;
 if exists(select 1 from public.school_user_changes c join public.approval_requests a on a.id=c.approval_request_id where c.target_id=people_request.target_id and c.execution_status<>'DONE' and a.status in('PENDING','APPROVED')) then raise exception 'A change is already awaiting a decision or execution';end if;
 elsif target_id is not null then raise exception 'New accounts cannot specify an existing identity';end if;
 if operation='CREATE' then
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(payload->>'email')),9003));
 if exists(select 1 from public.school_user_changes c join public.approval_requests a on a.id=c.approval_request_id where c.tenant_id=tenant and c.operation='CREATE' and lower(trim(c.payload->>'email'))=lower(trim(people_request.payload->>'email')) and a.status in('PENDING','APPROVED') and c.execution_status<>'DONE') then raise exception 'An account change for this email is already pending';end if;
 end if;
 if operation in('CREATE','UPDATE') then
 if length(trim(coalesce(payload->>'full_name',''))) not between 2 and 160 or coalesce(payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(payload->>'email')>254 or length(coalesce(payload->>'phone',''))>40 then raise exception 'Check name, email and phone';end if;
 if role_code='STUDENT' and length(trim(coalesce(payload->>'student_number',''))) not between 1 and 60 then raise exception 'Student number required';end if;
 if exists(select 1 from public.users u where lower(u.email)=lower(trim(payload->>'email')) and u.id is distinct from target_id) then raise exception 'Email already registered';end if;
 end if;
 if role_code='PARENT' and operation in('CREATE','UPDATE') then
 if jsonb_typeof(payload->'student_ids') is distinct from 'array' or jsonb_array_length(payload->'student_ids') not between 1 and 50 then raise exception 'Link at least one student';end if;
 for g in select value::text::uuid from jsonb_array_elements_text(payload->'student_ids') loop
 if not exists(select 1 from public.students where id=g and tenant_id=tenant) then raise exception 'Child must belong to this school' using errcode='42501';end if;end loop;
 end if;
 if role_code in('STAFF','TEACHER','PRINCIPAL') then approver:=school_private.p9_approver(tenant,case when role_code='PRINCIPAL' then 'OWNER' else 'PRINCIPAL' end,actor);end if;
 insert into public.school_user_changes(tenant_id,requester_id,target_id,operation,role_code,payload,snapshot) values(tenant,actor,target_id,operation,role_code,payload,before_row) returning id into change_id;
 insert into public.approval_requests(tenant_id,requester_user_id,resource_type,resource_id,title,status,decided_at,metadata) values(tenant,actor,'USER_CHANGE',change_id,initcap(lower(operation))||' '||initcap(lower(role_code))||': '||coalesce(payload->>'full_name',before_row->>'full_name',''),case when approver is null then 'APPROVED' else 'PENDING' end,case when approver is null then now() end,jsonb_build_object('part9',true,'category','PEOPLE')) returning id into request_id;
 update public.school_user_changes set approval_request_id=request_id where id=change_id;
 if approver is not null then
 insert into public.approval_steps(tenant_id,approval_request_id,approver_user_id,sequence) values(tenant,request_id,approver,1);
 insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id) values(public.app_tenant(approver),approver,'APPROVAL','User change needs approval',initcap(lower(role_code))||' · '||operation,'approval_request',request_id);
 end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,actor,'REQUEST_'||operation,'CORE','school_user_changes',change_id,jsonb_build_object('role',role_code,'approval_required',approver is not null));
 return jsonb_build_object('id',change_id,'approval_request_id',request_id,'status',case when approver is null then 'APPROVED' else 'PENDING' end);
end $$;
create function public.school_people_request(operation text,role_code text,payload jsonb,target_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select school_private.people_request(operation,role_code,payload,target_id)$$;

-- Service execution is an explicit, short lease. Browser roles cannot call it.
create function public.school_people_execution(actor_id uuid,change_id uuid,action text,lease uuid default null,auth_user_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.school_user_changes;a public.approval_requests;u public.users;role_id uuid;person uuid;g uuid;result jsonb;begin
 perform public.app_tenant(actor_id);
 select * into c from public.school_user_changes where id=change_id for update;
 select * into a from public.approval_requests where id=c.approval_request_id;
 if c.id is null or a.status<>'APPROVED' or not (c.requester_id=actor_id or exists(select 1 from public.approval_steps s where s.approval_request_id=a.id and s.approver_user_id=actor_id and s.status='APPROVED')) then raise exception 'Approved change and authorized actor required' using errcode='42501';end if;
 if not ((c.requester_id=actor_id and public.app_role_in(actor_id,array['STAFF']) and public.app_tenant(actor_id)=c.tenant_id) or (exists(select 1 from public.approval_steps where approval_request_id=a.id and approver_user_id=actor_id and status='APPROVED') and public.app_role_in(actor_id,case when c.role_code='PRINCIPAL' then array['OWNER'] else array['PRINCIPAL'] end))) then raise exception 'Current authorized role required' using errcode='42501';end if;
 if c.execution_status='DONE' then return jsonb_build_object('done',true,'id',c.target_id);end if;
 if action='CLAIM' then
 if c.execution_status in('PROCESSING','DB_APPLIED') and c.execution_started_at>now()-interval '2 minutes' then raise exception 'Change is being applied. Retry shortly.' using errcode='40001';end if;
 if c.execution_status='DB_APPLIED' then update public.school_user_changes set execution_token=gen_random_uuid(),execution_started_at=now() where id=c.id returning * into c;return to_jsonb(c);end if;
 if c.target_id is not null then
 select * into u from public.users where id=c.target_id and tenant_id=c.tenant_id;
 if u.id is null or u.updated_at is distinct from (c.snapshot->>'updated_at')::timestamptz or school_private.p9_has_role(u.id,array['OWNER']) or not school_private.p9_has_role(u.id,array[c.role_code]) or (c.role_code<>'PRINCIPAL' and school_private.p9_has_role(u.id,array['PRINCIPAL'])) then raise exception 'User changed since submission; submit a new request' using errcode='40001';end if;
 end if;
 update public.school_user_changes set execution_status='PROCESSING',execution_token=gen_random_uuid(),execution_started_at=now() where id=c.id returning * into c;
 return to_jsonb(c)||jsonb_build_object('provisioned_id',(select id from auth.users where raw_app_meta_data->>'school_change_id'=c.id::text limit 1));
 end if;
 if c.execution_token is distinct from lease or c.execution_status not in('PROCESSING','DB_APPLIED') then raise exception 'Invalid execution lease' using errcode='42501';end if;
 if action='AUTH_COMPLETE' and c.execution_status='DB_APPLIED' then update public.school_user_changes set execution_status='DONE',completed_at=now(),execution_token=null where id=c.id;return jsonb_build_object('done',true,'id',c.target_id);end if;
 if c.execution_status='DB_APPLIED' then raise exception 'Authentication synchronization required';end if;
 if action='RELEASE' then update public.school_user_changes set execution_status='WAITING',execution_token=null,execution_started_at=null where id=c.id;return jsonb_build_object('released',true);end if;
 if action<>'COMPLETE' then raise exception 'Unknown execution action';end if;
 person:=coalesce(c.target_id,auth_user_id);
 select * into u from public.users where id=person and tenant_id=c.tenant_id for update;
 if u.id is null or (c.target_id is not null and (u.updated_at is distinct from (c.snapshot->>'updated_at')::timestamptz or school_private.p9_has_role(u.id,array['OWNER']) or not school_private.p9_has_role(u.id,array[c.role_code]) or (c.role_code<>'PRINCIPAL' and school_private.p9_has_role(u.id,array['PRINCIPAL'])))) then raise exception 'User changed since submission' using errcode='40001';end if;
 if c.operation='CREATE' then
 if not exists(select 1 from auth.users where id=person and raw_app_meta_data->>'school_change_id'=c.id::text) then raise exception 'Provisioned identity does not match this request' using errcode='42501';end if;
 update public.users set user_level_id=null where id=person;
 delete from public.user_roles where user_id=person;
 insert into public.user_roles(user_id,role_id) select person,r.id from public.roles r where r.code=c.role_code and r.is_active;
 end if;
 if c.operation in('CREATE','UPDATE') then
 update public.users set full_name=trim(c.payload->>'full_name'),email=lower(trim(c.payload->>'email')),phone=nullif(trim(c.payload->>'phone'),''),is_active=case when c.operation='CREATE' then true else is_active end where id=person;
 if c.role_code='STUDENT' then insert into public.students(tenant_id,user_id,student_number) values(c.tenant_id,person,trim(c.payload->>'student_number')) on conflict(tenant_id,user_id) do update set student_number=excluded.student_number,updated_at=now();end if;
 if c.role_code='TEACHER' then insert into public.teachers(tenant_id,user_id,employee_number) values(c.tenant_id,person,nullif(trim(c.payload->>'employee_number'),'')) on conflict(tenant_id,user_id) do update set employee_number=excluded.employee_number,updated_at=now();end if;
 if c.role_code='PARENT' then
 delete from public.school_guardians where parent_user_id=person and tenant_id=c.tenant_id;
 for g in select value::text::uuid from jsonb_array_elements_text(c.payload->'student_ids') loop
 if not exists(select 1 from public.students where id=g and tenant_id=c.tenant_id) then raise exception 'Child no longer available';end if;
 insert into public.school_guardians(tenant_id,parent_user_id,student_id) values(c.tenant_id,person,g) on conflict(parent_user_id,student_id) do nothing;end loop;
 end if;
 elsif c.operation='ARCHIVE' then update public.users set is_active=false,deleted_at=now() where id=person;
 elsif c.operation='RESTORE' then update public.users set is_active=true,deleted_at=null where id=person;end if;
 update public.school_user_changes set target_id=person,execution_status='DB_APPLIED' where id=c.id;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,before_state,after_state) values(public.app_tenant(actor_id),actor_id,'EXECUTE_'||c.operation,'CORE','users',person,c.snapshot,(select to_jsonb(x) from public.users x where x.id=person));
 insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id) values(c.tenant_id,c.requester_id,'SUCCESS','User change completed',a.title,'approval_request',a.id);
 return jsonb_build_object('database_applied',true,'id',person);
end $$;
revoke all on function public.school_people_execution(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.school_people_execution(uuid,uuid,text,uuid,uuid) to service_role;

create function school_private.approval_queue(page_offset integer default 0,request_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();actor uuid:=auth.uid();begin
 if page_offset<0 or page_offset>100000 then raise exception 'Invalid page';end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from(select a.id,a.title,a.resource_type,a.resource_id,a.status,a.created_at,a.current_step,a.requester_user_id,
 u.full_name as requester_name,t.name as school,
 exists(select 1 from public.approval_steps s where s.approval_request_id=a.id and s.sequence=a.current_step and s.approver_user_id=actor and s.status='PENDING') and a.status='PENDING' as can_decide,
 coalesce((select jsonb_agg(jsonb_build_object('sequence',s.sequence,'status',s.status,'note',s.note,'name',p.full_name) order by s.sequence) from public.approval_steps s join public.users p on p.id=s.approver_user_id where s.approval_request_id=a.id),'[]') as steps,
 case when a.resource_type='LEAVE_REQUEST' then (select to_jsonb(l)-'chat_message_id'||jsonb_build_object('subject_name',p.full_name,'substitute_name',st.full_name) from public.leave_requests l left join public.users p on p.id=coalesce(l.subject_user_id,l.requester_user_id) left join public.teachers tr on tr.id=l.substitute_teacher_id left join public.users st on st.id=tr.user_id where l.id=a.resource_id and l.tenant_id=a.tenant_id)
 when a.resource_type='USER_CHANGE' then (select jsonb_build_object('id',c.id,'operation',c.operation,'role',c.role_code,'payload',c.payload,'before',jsonb_build_object('full_name',c.snapshot->'full_name','email',c.snapshot->'email','phone',c.snapshot->'phone'),'execution_status',c.execution_status) from public.school_user_changes c where c.id=a.resource_id)
 when a.resource_type='ROOM_BOOKING' then (select to_jsonb(b) from public.room_bookings b where b.id=a.resource_id and b.tenant_id=a.tenant_id)
 when a.resource_type='SCHEDULE_CHANGE' then (select to_jsonb(b) from public.schedule_change_requests b where b.id=a.resource_id and b.tenant_id=a.tenant_id)
 else a.metadata end as details
 from public.approval_requests a join public.users u on u.id=a.requester_user_id join public.tenants t on t.id=a.tenant_id
 where (request_id is null or a.id=request_id) and (a.requester_user_id=actor or exists(select 1 from public.approval_steps s where s.approval_request_id=a.id and s.approver_user_id=actor))
 and (a.tenant_id=tenant or (school_private.role(array['OWNER']) and a.resource_type='USER_CHANGE'))
 order by (a.status='PENDING') desc,a.created_at desc,a.id limit 50 offset page_offset)q),'[]');
end $$;
create function public.school_approval_queue(page_offset integer default 0,request_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select school_private.approval_queue(page_offset,request_id)$$;
create function school_private.approval_count() returns bigint language plpgsql stable security definer set search_path='' as $$declare tenant uuid:=school_private.tenant();begin
 return (select count(*) from public.approval_requests a join public.approval_steps s on s.approval_request_id=a.id and s.sequence=a.current_step where a.status='PENDING' and s.status='PENDING' and s.approver_user_id=auth.uid() and (a.tenant_id=tenant or (school_private.role(array['OWNER']) and a.resource_type='USER_CHANGE')));
end $$;
create function public.school_approval_count() returns bigint language sql security invoker set search_path='' as $$select school_private.approval_count()$$;

create function school_private.approval_decide(request_id uuid,decision text,note text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();a public.approval_requests;c public.school_user_changes;l public.leave_requests;actor uuid:=auth.uid();begin
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
create function public.school_approval_decide(request_id uuid,decision text,note text default '') returns jsonb language sql security invoker set search_path='' as $$select school_private.approval_decide(request_id,decision,note)$$;
create function school_private.leave_message(message_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare request_id uuid;begin
 perform school_private.tenant();
 if not exists(select 1 from public.oconnect_messages m where m.id=message_id and m.deleted_at is null and oconnect_private.can_access(m.conversation_id)) then raise exception 'Conversation membership required' using errcode='42501';end if;
 select l.approval_request_id into request_id from public.leave_requests l join public.oconnect_messages m on m.leave_request_id=l.id where m.id=message_id;
 if request_id is null then return null;end if;return school_private.approval_queue(0,request_id)->0;
end $$;
create function public.school_leave_message(message_id uuid) returns jsonb language sql security invoker set search_path='' as $$select school_private.leave_message(message_id)$$;

-- Financial activity complements confirmed tuition payments; no inferred expenses.
create table public.school_cash_entries(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),kind text not null check(kind in('INCOME','EXPENSE','OPENING_BALANCE')),amount numeric(14,2) not null check(amount>0),entry_date date not null,description text not null check(length(trim(description)) between 3 and 500),created_by uuid not null references public.users(id),created_at timestamptz not null default now(),voided_at timestamptz);
alter table public.school_cash_entries enable row level security;
revoke all on public.school_cash_entries from public,anon,authenticated;
grant all on public.school_cash_entries to service_role;
create index p9_cash_tenant_date on public.school_cash_entries(tenant_id,entry_date);
create trigger p9_cash_tenant before insert or update on public.school_cash_entries for each row execute function public.enforce_tenant_relations('{"created_by":"users"}');
create function school_private.cash_entries(action text default 'LIST',payload jsonb default '{}',record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare tenant uuid:=school_private.tenant();result jsonb;begin
 perform school_private.require_module('finance');if not school_private.role(array['STAFF']) then raise exception 'Staff access required' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>3000 then raise exception 'Invalid cash entry';end if;
 if action='CREATE' then
 insert into public.school_cash_entries(tenant_id,kind,amount,entry_date,description,created_by) values(tenant,payload->>'kind',(payload->>'amount')::numeric,(payload->>'entry_date')::date,trim(payload->>'description'),auth.uid()) returning to_jsonb(school_cash_entries.*) into result;
 elsif action='VOID' then update public.school_cash_entries set voided_at=now() where id=record_id and tenant_id=tenant and voided_at is null returning to_jsonb(school_cash_entries.*) into result;if result is null then raise exception 'Entry unavailable';end if;
 elsif action='LIST' then return coalesce((select jsonb_agg(to_jsonb(x)) from(select * from public.school_cash_entries where tenant_id=tenant order by entry_date desc,created_at desc limit 100)x),'[]');
 else raise exception 'Invalid action';end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,auth.uid(),action,'FINANCE','school_cash_entries',(result->>'id')::uuid,result);return result;
end $$;
create function public.school_cash_entries(action text default 'LIST',payload jsonb default '{}',record_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select school_private.cash_entries(action,payload,record_id)$$;

create function school_private.principal_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();today date;tz text;month_start date;previous_month date;result jsonb;begin
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
create function public.school_principal_dashboard() returns jsonb language sql security invoker set search_path='' as $$select school_private.principal_dashboard()$$;
create function school_private.absence_list(kind text,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$declare tenant uuid:=school_private.tenant();today date;begin
 if not school_private.role(array['PRINCIPAL']) then raise exception 'Principal access required' using errcode='42501';end if;
 if kind not in('STUDENT','EMPLOYEE') or page_offset<0 then raise exception 'Invalid list';end if;
 select (now() at time zone coalesce(timezone,'Asia/Jakarta'))::date into today from public.tenants where id=tenant;
 if kind='STUDENT' then return coalesce((select jsonb_agg(to_jsonb(x)) from(select u.full_name as name,c.name as classroom,h.full_name as homeroom,coalesce(a.status,'UNRECORDED')status,a.note as reason from public.students s join public.users u on u.id=s.user_id
 left join lateral(select sa.classroom_id from public.student_assignments sa join public.semesters sem on sem.id=sa.semester_id where sa.student_id=s.id and sa.tenant_id=tenant and sa.is_active order by sem.is_active desc,sem.starts_on desc limit 1)sa on true
 left join public.classrooms c on c.id=sa.classroom_id left join public.users h on h.id=c.homeroom_teacher_user_id left join public.attendance_records a on a.student_id=s.id and a.tenant_id=tenant and a.attendance_date=today
 where s.tenant_id=tenant and s.enrollment_status='ACTIVE' and u.is_active and coalesce(a.status,'UNRECORDED') not in('PRESENT','LATE') order by u.full_name,s.id limit 100 offset page_offset)x),'[]');end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select u.full_name as name,coalesce(a.status,'UNRECORDED')status,a.note as reason from public.users u left join public.school_user_attendance a on a.user_id=u.id and a.tenant_id=tenant and a.attendance_date=today where u.tenant_id=tenant and u.is_active and public.app_role_in(u.id,array['STAFF','TEACHER']) and coalesce(a.status,'UNRECORDED') not in('PRESENT','LATE') order by u.full_name,u.id limit 100 offset page_offset)x),'[]');
end $$;
create function public.school_absence_list(kind text,page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select school_private.absence_list(kind,page_offset)$$;

create function school_private.leave_options() returns jsonb language plpgsql stable security definer set search_path='' as $$declare tenant uuid:=school_private.tenant();begin
 if not school_private.role(array['PARENT','STAFF','TEACHER']) then raise exception 'Leave access denied' using errcode='42501';end if;
 return jsonb_build_object('is_parent',school_private.role(array['PARENT']) and not school_private.role(array['STAFF','TEACHER']),'is_teacher',school_private.role(array['TEACHER']),
 'today',(select (now() at time zone timezone)::date from public.tenants where id=tenant),
 'children',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',u.full_name) order by u.full_name) from public.school_guardians g join public.students s on s.id=g.student_id join public.users u on u.id=s.user_id where g.tenant_id=tenant and g.parent_user_id=auth.uid() and s.enrollment_status='ACTIVE' and u.is_active),'[]'),
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',u.full_name) order by u.full_name) from public.teachers t join public.users u on u.id=t.user_id where t.tenant_id=tenant and t.employment_status='ACTIVE' and u.id<>auth.uid() and public.app_role_in(u.id,array['TEACHER'])),'[]'));
end $$;
create function public.school_leave_options() returns jsonb language sql security invoker set search_path='' as $$select school_private.leave_options()$$;
create function school_private.student_options(query text default '',selected uuid[] default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$declare tenant uuid:=school_private.tenant();begin
 if not school_private.role(array['STAFF']) then raise exception 'Staff access required' using errcode='42501';end if;
 if length(query)>160 or cardinality(selected)>50 then raise exception 'Invalid search';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select s.id,u.full_name as name,s.student_number as number from public.students s join public.users u on u.id=s.user_id where s.tenant_id=tenant and (s.id=any(selected) or strpos(lower(u.full_name||' '||s.student_number),lower(query))>0) order by (s.id=any(selected)) desc,u.full_name,s.id limit 100)x),'[]');
end $$;
create function public.school_student_options(query text default '',selected uuid[] default '{}') returns jsonb language sql security invoker set search_path='' as $$select school_private.student_options(query,selected)$$;
create function school_private.staff_record(resource text,action text default 'LIST',payload jsonb default '{}',record_id uuid default null,page_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$declare tenant uuid:=school_private.tenant();result jsonb;target text;begin
 if not school_private.role(array['STAFF']) then raise exception 'Staff access required' using errcode='42501';end if;
 perform school_private.require_module(case when resource='classrooms' then 'academic' else 'core' end);
 if resource not in('assets','classrooms') or page_offset<0 or page_offset>100000 then raise exception 'Invalid directory';end if;
 target:=case when resource='assets' then 'school_assets' else resource end;
 if action='LIST' then execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]'') from(select * from public.%I where tenant_id=$1 order by name,id limit 50 offset $2)x',target) into result using tenant,page_offset;return result;end if;
 if action<>'SAVE' or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>6000 then raise exception 'Invalid change';end if;
 result:=school_private.setup_records(target,jsonb_build_array(payload||case when record_id is null then '{}'::jsonb else jsonb_build_object('record_id',record_id) end),false);
 if not (result->>'valid')::boolean then raise exception '%',result->'errors'->0->>'message';end if;return result->'record';
end $$;
create function public.school_staff_record(resource text,action text default 'LIST',payload jsonb default '{}',record_id uuid default null,page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select school_private.staff_record(resource,action,payload,record_id,page_offset)$$;

-- Supervised credentials apply to every school role, including parents. Platform
-- Owner is intentionally outside personal school attendance.
create or replace function school_private.face_target(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select school_private.role(array['STAFF','TEACHER']) and public.app_module_enabled(auth.uid(),'attendance') and exists(select 1 from public.users u where u.id=target and u.tenant_id=school_private.tenant() and u.is_active and u.deleted_at is null) and public.app_role_in(target,array['PRINCIPAL','STAFF','TEACHER','STUDENT','PARENT']) and not public.app_role_in(target,array['OWNER'])
$$;
create table public.school_user_credentials(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),user_id uuid not null references public.users(id),kind text not null check(kind in('QR','RFID')),token_hash text not null,mask text,created_by uuid not null references public.users(id),created_at timestamptz not null default now(),constraint p9_credential_user_kind unique(tenant_id,user_id,kind),unique(tenant_id,kind,token_hash));
alter table public.school_user_credentials enable row level security;
revoke all on public.school_user_credentials from public,anon,authenticated;
grant all on public.school_user_credentials to service_role;
create trigger p9_credential_tenant before insert or update on public.school_user_credentials for each row execute function public.enforce_tenant_relations('{"user_id":"users","created_by":"users"}');
create function school_private.identity_directory(query text default '',page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 result:=school_private.face_directory(query,page_offset);
 return coalesce((select jsonb_agg(p||jsonb_build_object('credentials',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'mask',c.mask)) from public.school_user_credentials c where c.user_id=(p->>'id')::uuid and c.tenant_id=school_private.tenant()),'[]'))) from jsonb_array_elements(result)p),'[]');
end $$;
create function public.school_identity_directory(query text default '',page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select school_private.identity_directory(query,page_offset)$$;
create function school_private.identity_save(target uuid,kind text,token text default '',remove boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare tenant uuid:=school_private.tenant();value text;result jsonb;begin
 if not school_private.role(array['STAFF']) or not school_private.face_target(target) then raise exception 'Staff and a current school user required' using errcode='42501';end if;
 if kind not in('QR','RFID') then raise exception 'Invalid credential';end if;
 if remove then delete from public.school_user_credentials c where c.tenant_id=tenant and c.user_id=target and c.kind=identity_save.kind;result:=jsonb_build_object('removed',true);
 else
 value:=case when kind='QR' then replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') else upper(trim(token)) end;
 if value !~ '^[A-Z0-9a-z_-]{6,128}$' then raise exception 'Use the card identifier from your RFID reader (6–128 characters)';end if;
 insert into public.school_user_credentials(tenant_id,user_id,kind,token_hash,mask,created_by) values(tenant,target,kind,encode(sha256(convert_to(value,'UTF8')),'hex'),case when kind='RFID' then right(value,4) end,auth.uid()) on conflict on constraint p9_credential_user_kind do update set token_hash=excluded.token_hash,mask=excluded.mask,created_by=excluded.created_by,created_at=now() returning jsonb_build_object('id',id,'kind',school_user_credentials.kind) into result;
 if kind='QR' then result:=result||jsonb_build_object('token',value);end if;
 end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,auth.uid(),case when remove then 'REVOKE' else 'ENROLL' end,'ATTENDANCE','user_credentials',target,jsonb_build_object('kind',kind));return result;
end $$;
create function public.school_identity_save(target uuid,kind text,token text default '',remove boolean default false) returns jsonb language sql security invoker set search_path='' as $$select school_private.identity_save(target,kind,token,remove)$$;
create function school_private.identity_checkin(kind text,token text) returns jsonb language plpgsql security definer set search_path='' as $$declare tenant uuid:=school_private.tenant();who uuid;student uuid;class_id uuid;day date;begin
 perform school_private.require_module('attendance');
 if not school_private.role(array['STAFF','TEACHER']) or kind not in('QR','RFID') or length(token)>128 then raise exception 'Supervised school check-in required' using errcode='42501';end if;
 select c.user_id into who from public.school_user_credentials c where c.tenant_id=tenant and c.kind=identity_checkin.kind and c.token_hash=encode(sha256(convert_to(case when identity_checkin.kind='RFID' then upper(trim(token)) else trim(token) end,'UTF8')),'hex');
 if who is null or not school_private.face_target(who) then raise exception 'Credential is not active in this school' using errcode='42501';end if;
 select (now() at time zone timezone)::date into day from public.tenants where id=tenant;
 perform pg_advisory_xact_lock(hashtextextended(who::text,9002));
 if exists(select 1 from public.school_user_attendance where tenant_id=tenant and user_id=who and attendance_date=day and status not in('PRESENT','LATE')) then raise exception 'A different attendance status already exists. Review it before check-in.';end if;
 select s.id into student from public.students s where s.user_id=who and s.tenant_id=tenant and s.enrollment_status='ACTIVE';
 if student is not null then
 select sa.classroom_id into class_id from public.student_assignments sa join public.semesters sem on sem.id=sa.semester_id where sa.student_id=student and sa.tenant_id=tenant and sa.is_active and school_private.class_teaches(sa.classroom_id) order by sem.is_active desc,sem.starts_on desc limit 1;
 if class_id is null then raise exception 'No managed classroom found for this student' using errcode='42501';end if;
 if exists(select 1 from public.attendance_records where tenant_id=tenant and student_id=student and attendance_date=day and status not in('PRESENT','LATE')) then raise exception 'A different student attendance status already exists';end if;
 insert into public.attendance_records(tenant_id,student_id,classroom_id,attendance_date,status,note) values(tenant,student,class_id,day,'PRESENT','Supervised '||kind||' check-in') on conflict(tenant_id,student_id,attendance_date) do nothing;
 end if;
 insert into public.school_user_attendance(tenant_id,user_id,attendance_date,recorded_by,method) values(tenant,who,day,auth.uid(),kind) on conflict(tenant_id,user_id,attendance_date) do nothing;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id) values(tenant,auth.uid(),kind||'_CHECKIN','ATTENDANCE','users',who);
 return jsonb_build_object('present',true,'name',(select full_name from public.users where id=who),'date',day);
end $$;
create function public.school_identity_checkin(kind text,token text) returns jsonb language sql security invoker set search_path='' as $$select school_private.identity_checkin(kind,token)$$;

-- Existing server routes enforce the same assigned-role rules as the new UI.
alter function public.decide_operational_request(uuid,uuid,text,text) rename to decide_operational_request_before_part9;
do $$begin execute replace(pg_get_functiondef('public.decide_operational_request_before_part9(uuid,uuid,text,text)'::regprocedure),'decide_operational_request.note','decide_operational_request_before_part9.note');end$$;
create function public.decide_operational_request(actor_id uuid,request_id uuid,decision text,note text default null) returns jsonb language plpgsql set search_path='' as $$declare a public.approval_requests;l public.leave_requests;begin
 select * into a from public.approval_requests where id=request_id;
 if a.resource_type='USER_CHANGE' then raise exception 'Use the personnel approval workflow' using errcode='42501';end if;
 if a.resource_type='LEAVE_REQUEST' and decision in('APPROVED','REJECTED') then
 select * into l from public.leave_requests where id=a.resource_id;
 if l.subject_user_id is not null and (not public.app_role_in(actor_id,case when l.student_id is null then array['PRINCIPAL'] else array['TEACHER'] end) or (l.student_id is not null and not exists(select 1 from public.classrooms where id=l.classroom_id and homeroom_teacher_user_id=actor_id))) then raise exception 'Current assigned school approver required' using errcode='42501';end if;
 end if;
 return public.decide_operational_request_before_part9(actor_id,request_id,decision,note);
end $$;
revoke all on function public.decide_operational_request(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.decide_operational_request(uuid,uuid,text,text) to service_role;

-- Default PostgreSQL function privileges must never expose actor parameters.
revoke all on function school_private.p9_approver(uuid,text,uuid),school_private.p9_has_role(uuid,text[]),school_private.leave_submit(uuid,jsonb),school_private.leave_attendance(),school_private.approver_tenant_guard() from public,anon,authenticated;
grant usage on schema school_private to service_role;
grant execute on function school_private.leave_submit(uuid,jsonb) to service_role;
revoke all on function public.school_leave_submit(jsonb) from public,anon,authenticated;
grant execute on function public.school_leave_submit(jsonb) to authenticated;
do $$declare signature text;begin
 foreach signature in array array['attendance_history(uuid)','people_list(text,text,integer)','people_request(text,text,jsonb,uuid)','approval_queue(integer,uuid)','approval_count()','approval_decide(uuid,text,text)','leave_message(uuid)','cash_entries(text,jsonb,uuid)','principal_dashboard()','absence_list(text,integer)','leave_options()','student_options(text,uuid[])','staff_record(text,text,jsonb,uuid,integer)','identity_directory(text,integer)','identity_save(uuid,text,text,boolean)','identity_checkin(text,text)'] loop
 execute 'revoke all on function school_private.'||signature||',public.school_'||signature||' from public,anon,authenticated';
 execute 'grant execute on function school_private.'||signature||',public.school_'||signature||' to authenticated';
 end loop;
end $$;
notify pgrst,'reload schema';
