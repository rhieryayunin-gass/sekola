-- Disposable regression fixtures. No production identities or records.
begin;
create function pg_temp.p11_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Part11: %',msg;end if;end$$;
-- Keep routing deterministic within this rolled-back fixture transaction.
update public.users set is_active=false where public.app_role_in(id,array['OWNER']);
insert into public.tenants(id,name,code) values('f9100000-0000-4000-8000-000000000001','Part9 A','P9-A'),('f9100000-0000-4000-8000-000000000002','Part9 B','P9-B');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select ('f9200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'p9-'||n||'@school.invalid',jsonb_build_object('tenant_id',case when n in(1,8,9,10) then 'f9100000-0000-4000-8000-000000000002' else 'f9100000-0000-4000-8000-000000000001' end),jsonb_build_object('full_name','Part9 Person '||n) from generate_series(1,11)n;
insert into public.user_roles(user_id,role_id) select ('f9200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,r.id from generate_series(1,10)n join public.roles r on r.code=case n when 1 then 'OWNER' when 2 then 'STAFF' when 3 then 'PRINCIPAL' when 4 then 'TEACHER' when 5 then 'TEACHER' when 6 then 'STUDENT' when 7 then 'PARENT' when 8 then 'STAFF' when 9 then 'STUDENT' when 10 then 'PRINCIPAL' end;
insert into public.academic_years(id,tenant_id,name,starts_on,ends_on,is_active) values('f9300000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','Year',current_date-100,current_date+265,true);
insert into public.semesters(id,tenant_id,academic_year_id,name,starts_on,ends_on,is_active) values('f9300000-0000-4000-8000-000000000002','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','Term',current_date-50,current_date+130,true);
insert into public.classrooms(id,tenant_id,academic_year_id,name,homeroom_teacher_user_id,is_active) values('f9300000-0000-4000-8000-000000000003','f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','Class','f9200000-0000-4000-8000-000000000004',true);
insert into public.teachers(id,tenant_id,user_id) values('f9300000-0000-4000-8000-000000000004','f9100000-0000-4000-8000-000000000001','f9200000-0000-4000-8000-000000000004'),('f9300000-0000-4000-8000-000000000005','f9100000-0000-4000-8000-000000000001','f9200000-0000-4000-8000-000000000005');
insert into public.students(id,tenant_id,user_id,student_number) values('f9300000-0000-4000-8000-000000000006','f9100000-0000-4000-8000-000000000001','f9200000-0000-4000-8000-000000000006','P9-S1'),('f9300000-0000-4000-8000-000000000009','f9100000-0000-4000-8000-000000000002','f9200000-0000-4000-8000-000000000009','P9-S2');
insert into public.student_assignments(tenant_id,academic_year_id,semester_id,classroom_id,student_id) values('f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000002','f9300000-0000-4000-8000-000000000003','f9300000-0000-4000-8000-000000000006');
insert into public.school_guardians(tenant_id,parent_user_id,student_id) values('f9100000-0000-4000-8000-000000000001','f9200000-0000-4000-8000-000000000007','f9300000-0000-4000-8000-000000000006');


set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000001',true);
do $$declare t uuid;begin
 t:=(public.school_owner_save('tenant','{"name":"Part11 School","settlement_account":{"bank_name":"Test Bank","account_name":"School","account_number":"12345678"}}')->>'id')::uuid;
 perform set_config('test.p11.tenant',t::text,true);
end $$;
reset role;
select pg_temp.p11_assert(exists(select 1 from public.school_settlement_accounts where tenant_id=current_setting('test.p11.tenant')::uuid and account_number='12345678' and is_active),'tenant and optional bank account saved atomically');
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000002',true);
do $$declare p uuid;t uuid;s uuid;begin
 p:=(public.school_project_template('{"code":"P11","name":"Part11 Festival","template":"CUSTOM","starts_on":"2026-10-01","due_on":"2026-10-30","committee":{"CHAIR":"f9200000-0000-4000-8000-000000000002","SECRETARY":"f9200000-0000-4000-8000-000000000004","TREASURER":"f9200000-0000-4000-8000-000000000007"}}')->>'id')::uuid;
 perform set_config('test.p11.project',p::text,true);
 t:=(public.school_project11('task',p,'{"title":"Main Task","status":"TODO","due_date":"2026-10-12","assignees":["f9200000-0000-4000-8000-000000000004","f9200000-0000-4000-8000-000000000006"]}')->>'id')::uuid;perform set_config('test.p11.task',t::text,true);
 s:=(public.school_project11('task',p,jsonb_build_object('title','Subtask','status','TODO','parent_task_id',t,'assignees',jsonb_build_array('f9200000-0000-4000-8000-000000000006'),'due_date','2026-10-12'))->>'id')::uuid;perform set_config('test.p11.sub',s::text,true);
 begin perform public.school_project11('task',p,'{"title":"Foreign PIC","status":"TODO","assignees":["f9200000-0000-4000-8000-000000000009"]}');raise exception 'Foreign PIC allowed';exception when raise_exception then if sqlerrm='Foreign PIC allowed' then raise;end if;end;
 begin perform public.school_project11('move',p,'{"status":"DONE"}',t);raise exception 'Parent done with incomplete child';exception when raise_exception then if sqlerrm='Parent done with incomplete child' then raise;end if;end;
 begin insert into storage.objects(bucket_id,name) values('project-evidence','f9100000-0000-4000-8000-000000000001/'||p||'/early.pdf');raise exception 'Evidence before completion allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000003',true);
select pg_temp.p11_assert((public.school_project11('read',current_setting('test.p11.project')::uuid)->>'can_manage')::boolean=false,'Principal reads project without management membership');
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000006',true);
do $$declare p uuid:=current_setting('test.p11.project')::uuid;begin
 perform pg_temp.p11_assert((public.school_project11()->>'count')::int=1,'Assigned student can list project');
 perform public.school_project11('move',p,'{"status":"BLOCKED"}',current_setting('test.p11.sub')::uuid);
 perform public.school_project11('move',p,'{"status":"DONE"}',current_setting('test.p11.sub')::uuid);
 perform public.school_project11('move',p,'{"status":"DONE"}',current_setting('test.p11.task')::uuid);
 begin perform public.school_project11('member',p,'{"user_id":"f9200000-0000-4000-8000-000000000005","position":"MEMBER"}');raise exception 'Student escalated management';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000011',true);
do $$begin
 begin perform public.school_project11('read',current_setting('test.p11.project')::uuid);raise exception 'Unassigned user can read';exception when insufficient_privilege then null;end;
 perform pg_temp.p11_assert((public.school_project11()->>'count')::int=0,'Unassigned user list empty');
end $$;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000009',true);
do $$begin begin perform public.school_project11('read',current_setting('test.p11.project')::uuid);raise exception 'Foreign tenant read';exception when insufficient_privilege then null;end;end $$;
reset role;
select pg_temp.p11_assert((select count(*) from public.school_task_assignees where task_id=current_setting('test.p11.task')::uuid)=2,'multiple PICs persisted');
select pg_temp.p11_assert(exists(select 1 from public.notifications where user_id='f9200000-0000-4000-8000-000000000006' and resource_type='team_project' and resource_id=current_setting('test.p11.project')::uuid),'assignment notification links to project');
select pg_temp.p11_assert(exists(select 1 from public.calendar_events e join public.calendars c on c.id=e.calendar_id where c.owner_user_id='f9200000-0000-4000-8000-000000000006' and e.source_id=current_setting('test.p11.project')::uuid),'assigned student gets project calendar');
update public.team_tasks set status='DONE' where project_id=current_setting('test.p11.project')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000002',true);
select pg_temp.p11_assert((public.school_project11('read',current_setting('test.p11.project')::uuid)->>'complete')::boolean,'completion aggregates all tasks');
insert into storage.objects(bucket_id,name) values('project-evidence','f9100000-0000-4000-8000-000000000001/'||current_setting('test.p11.project')||'/complete.pdf');
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000011',true);
select pg_temp.p11_assert(not exists(select 1 from storage.objects where bucket_id='project-evidence'),'evidence is private to project audience');
reset role;
insert into public.finance_categories(id,tenant_id,name,category_type) values('f9500000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000001','Tuition','INCOME');
insert into public.students(id,tenant_id,user_id,student_number) values('f9300000-0000-4000-8000-000000000011','f9100000-0000-4000-8000-000000000001','f9200000-0000-4000-8000-000000000011','P11-OTHER');
insert into public.student_bills(tenant_id,student_id,category_id,invoice_number,amount,due_date,status) values('f9100000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-000000000011','f9500000-0000-4000-8000-000000000001','OTHER-CHILD',10000,current_date-10,'OPEN');
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000002',true);
do $$declare body jsonb;result jsonb;begin
 body:=jsonb_build_object('request_key','f9900000-0000-4000-8000-000000000001','name','Monthly Tuition','category_id','f9500000-0000-4000-8000-000000000001','amount',100000,'discount',10000,'occurrences',3,'first_due',current_date-5,'students',jsonb_build_array('f9300000-0000-4000-8000-000000000006'));
 result:=public.school_billing11(body);perform pg_temp.p11_assert((result->>'invoices')::int=3 and (result->>'total')::numeric=270000,'billing plan amount and count');
 perform pg_temp.p11_assert((public.school_billing11(body)->>'already_published')::boolean,'idempotent billing publish');
 perform pg_temp.p11_assert((public.school_finance11('bills')->>'count')::int=4,'staff sees all invoices');
end $$;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000007',true);
select pg_temp.p11_assert((public.school_finance11('bills')->>'count')::int=3,'parent sees only own child invoices');
select pg_temp.p11_assert((public.school_finance11()->>'outstanding')::numeric=270000,'parent summary excludes unrelated balances');
do $$begin begin perform public.school_finance11('reconciliation');raise exception 'Parent reconciliation leak';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000006',true);
select pg_temp.p11_assert((public.school_finance11('bills')->>'count')::int=3,'student sees own invoices');
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000003',true);
select pg_temp.p11_assert((public.school_finance11('bills')->>'count')::int=4,'principal finance oversight');
reset role;
select pg_temp.p11_assert(not has_table_privilege('authenticated','public.school_task_assignees','SELECT'),'PIC table remains RPC-only');
select pg_temp.p11_assert(not has_table_privilege('authenticated','public.school_billing_plans','INSERT'),'plans cannot bypass audited publish');
rollback;
