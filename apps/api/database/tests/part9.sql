-- Disposable regression fixtures. No production identities or records.
begin;
create function pg_temp.p9_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Part9: %',msg;end if;end$$;
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
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000007',true);
do $$declare r jsonb;p jsonb:=jsonb_build_object('student_id','f9300000-0000-4000-8000-000000000006','leave_type','SICK','starts_on',current_date-2,'ends_on',current_date-1,'reason','Recovery at home');begin
 perform pg_temp.p9_assert(jsonb_array_length(public.school_leave_options()->'children')=1,'parent children');
 begin perform public.school_leave_submit(p||'{"student_id":"f9300000-0000-4000-8000-000000000009"}');raise exception 'Foreign child accepted';exception when insufficient_privilege then null;end;
 r:=public.school_leave_submit(p);perform set_config('test.p9.leave',r->>'id',true);perform set_config('test.p9.leave_request',r->>'approval_request_id',true);
 perform pg_temp.p9_assert(r->>'status'='PENDING','parent leave pending');
 begin perform public.school_leave_submit(p);raise exception 'Overlapping leave accepted';exception when check_violation then null;end;
 begin perform public.school_approval_decide((r->>'approval_request_id')::uuid,'APPROVED');raise exception 'Self approval accepted';exception when insufficient_privilege then null;end;
 begin perform public.school_people_list('TEACHER');raise exception 'Parent directory allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare l public.leave_requests;begin
 select * into l from public.leave_requests where id=current_setting('test.p9.leave')::uuid;
 perform pg_temp.p9_assert(l.chat_message_id is not null,'parent leave creates chat message');
 perform pg_temp.p9_assert((select approver_user_id='f9200000-0000-4000-8000-000000000004' from public.approval_steps where approval_request_id=l.approval_request_id),'homeroom routing');
 perform set_config('test.p9.message',l.chat_message_id::text,true);
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000004',true);
do $$declare r jsonb;begin
 r:=public.school_leave_message(current_setting('test.p9.message')::uuid);perform pg_temp.p9_assert((r->>'can_decide')::boolean,'inline chat approval');
 perform public.school_approval_decide(current_setting('test.p9.leave_request')::uuid,'APPROVED');
 begin perform public.school_approval_decide(current_setting('test.p9.leave_request')::uuid,'APPROVED');raise exception 'Double approval accepted';exception when insufficient_privilege then null;end;
 begin perform public.school_leave_submit(jsonb_build_object('leave_type','SICK','starts_on',current_date-4,'ends_on',current_date-3,'reason','Rest for recovery'));raise exception 'Teacher without substitute accepted';exception when invalid_parameter_value then null;end;
 r:=public.school_leave_submit(jsonb_build_object('leave_type','SICK','starts_on',current_date-4,'ends_on',current_date-3,'reason','Rest for recovery','substitute_teacher_id','f9300000-0000-4000-8000-000000000005','substitute_kind','SUBJECT'));perform set_config('test.p9.employee_leave',r->>'approval_request_id',true);
 begin perform public.school_setup_state();raise exception 'Teacher setup allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
select pg_temp.p9_assert((select count(*)=2 from public.attendance_records where student_id='f9300000-0000-4000-8000-000000000006' and status='SICK'),'backdated student attendance');
select pg_temp.p9_assert((select chat_message_id is null and substitute_teacher_id is not null from public.leave_requests where approval_request_id=current_setting('test.p9.employee_leave')::uuid),'employee leave no chat');
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000003',true);
do $$declare r jsonb;begin
 perform public.school_approval_decide(current_setting('test.p9.employee_leave')::uuid,'APPROVED');
 r:=public.school_principal_dashboard();perform pg_temp.p9_assert(jsonb_array_length(r->'history')=6 and jsonb_array_length(r->'grades')=7,'principal charts');
 perform pg_temp.p9_assert((r->>'employees_total')::int=3 and (r->>'students_total')::int=1,'principal tenant counts');
 perform public.school_absence_list('STUDENT');perform public.school_absence_list('EMPLOYEE');
 begin perform public.school_setup_state();raise exception 'Principal setup allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
select pg_temp.p9_assert((select count(*)=2 from public.school_user_attendance where user_id='f9200000-0000-4000-8000-000000000004' and status='SICK'),'backdated employee attendance');
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000002',true);
do $$declare r jsonb;token text;begin
 perform pg_temp.p9_assert(jsonb_array_length(public.school_people_list('STUDENT'))=1,'staff directory tenant scope');
 begin perform public.school_people_request('ARCHIVE','STUDENT','{}','f9200000-0000-4000-8000-000000000009');raise exception 'Foreign account archived';exception when insufficient_privilege then null;end;
 begin perform public.school_people_execution(auth.uid(),gen_random_uuid(),'CLAIM');raise exception 'Browser execution allowed';exception when insufficient_privilege then null;end;
 r:=public.school_people_request('CREATE','TEACHER','{"full_name":"Approved Teacher","email":"p9-new@school.invalid","employee_number":"P9-EMP"}');perform set_config('test.p9.change',r->>'id',true);perform set_config('test.p9.change_request',r->>'approval_request_id',true);
 perform pg_temp.p9_assert(r->>'status'='PENDING','teacher approval required');
 r:=public.school_people_request('UPDATE','PRINCIPAL','{"full_name":"Updated Principal","email":"p9-3@school.invalid"}','f9200000-0000-4000-8000-000000000003');perform set_config('test.p9.principal_change',r->>'id',true);perform set_config('test.p9.principal_request',r->>'approval_request_id',true);
 r:=public.school_identity_save('f9200000-0000-4000-8000-000000000006','QR');token:=r->>'token';perform set_config('test.p9.qr',token,true);
 perform pg_temp.p9_assert((public.school_identity_checkin('QR',token)->>'present')::boolean,'student QR attendance');
 perform public.school_identity_save('f9200000-0000-4000-8000-000000000007','RFID','1234ABCD');perform public.school_identity_checkin('RFID','1234ABCD');
 perform public.school_identity_save('f9200000-0000-4000-8000-000000000007','RFID','',true);
 begin perform public.school_identity_checkin('RFID','1234ABCD');raise exception 'Revoked RFID accepted';exception when insufficient_privilege then null;end;
 perform pg_temp.p9_assert(jsonb_array_length(public.school_identity_directory())=6,'all school roles enrolled');
 perform public.school_staff_record('assets','SAVE','{"name":"Science lab","category":"LAB","capacity":24}');perform public.school_staff_record('classrooms');
 perform public.school_cash_entries('CREATE',jsonb_build_object('kind','EXPENSE','amount',100,'entry_date',current_date,'description','Learning supplies'));
end$$;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000008',true);
do $$begin
 begin perform public.school_identity_checkin('QR',current_setting('test.p9.qr'));raise exception 'Foreign QR accepted';exception when insufficient_privilege then null;end;
 perform pg_temp.p9_assert(jsonb_array_length(public.school_approval_queue())=0,'foreign approval hidden');
end$$;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000003',true);
do $$begin
 perform pg_temp.p9_assert(public.school_approval_count()=1,'principal approval count');
 begin perform public.school_approval_decide(current_setting('test.p9.principal_request')::uuid,'APPROVED');raise exception 'Principal self change approval';exception when insufficient_privilege then null;end;
 perform public.school_approval_decide(current_setting('test.p9.change_request')::uuid,'APPROVED');
end$$;
reset role;
-- Synthetic Auth creation models the service provisioner after a valid decision.
update auth.users set raw_app_meta_data=raw_app_meta_data||jsonb_build_object('school_change_id',current_setting('test.p9.change')) where id='f9200000-0000-4000-8000-000000000011';
do $$declare r jsonb;begin
 r:=public.school_people_execution('f9200000-0000-4000-8000-000000000002',current_setting('test.p9.change')::uuid,'CLAIM');
 perform set_config('test.p9.lease',r->>'execution_token',true);
 begin perform public.school_people_execution('f9200000-0000-4000-8000-000000000002',current_setting('test.p9.change')::uuid,'CLAIM');raise exception 'Double lease accepted';exception when serialization_failure then null;end;
 perform public.school_people_execution('f9200000-0000-4000-8000-000000000002',current_setting('test.p9.change')::uuid,'COMPLETE',(r->>'execution_token')::uuid,'f9200000-0000-4000-8000-000000000011');
 r:=public.school_people_execution('f9200000-0000-4000-8000-000000000002',current_setting('test.p9.change')::uuid,'CLAIM');perform pg_temp.p9_assert(r->>'execution_status'='DB_APPLIED','auth synchronization resumable');
 perform public.school_people_execution('f9200000-0000-4000-8000-000000000002',current_setting('test.p9.change')::uuid,'AUTH_COMPLETE',current_setting('test.p9.lease')::uuid);
 perform pg_temp.p9_assert(public.app_role_in('f9200000-0000-4000-8000-000000000011',array['TEACHER']),'approved role provisioned');
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000001',true);
do $$begin
 perform pg_temp.p9_assert(public.school_approval_count()=1,'cross-tenant designated Owner step');
 perform public.school_approval_decide(current_setting('test.p9.principal_request')::uuid,'APPROVED');
 begin perform public.school_attendance_history();raise exception 'Owner personal attendance allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$declare r jsonb;begin
 r:=public.school_people_execution('f9200000-0000-4000-8000-000000000001',current_setting('test.p9.principal_change')::uuid,'CLAIM');
 perform public.school_people_execution('f9200000-0000-4000-8000-000000000001',current_setting('test.p9.principal_change')::uuid,'COMPLETE',(r->>'execution_token')::uuid);
 perform public.school_people_execution('f9200000-0000-4000-8000-000000000001',current_setting('test.p9.principal_change')::uuid,'AUTH_COMPLETE',(r->>'execution_token')::uuid);
 perform pg_temp.p9_assert((select full_name='Updated Principal' from public.users where id='f9200000-0000-4000-8000-000000000003'),'owner execution audit supports target school');
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000002',true);
do $$declare r jsonb;begin
 r:=public.school_people_request('ARCHIVE','STUDENT','{}','f9200000-0000-4000-8000-000000000006');perform set_config('test.p9.archive',r->>'id',true);
end$$;
reset role;
do $$declare r jsonb;begin
 r:=public.school_people_execution('f9200000-0000-4000-8000-000000000002',current_setting('test.p9.archive')::uuid,'CLAIM');
 perform public.school_people_execution('f9200000-0000-4000-8000-000000000002',current_setting('test.p9.archive')::uuid,'COMPLETE',(r->>'execution_token')::uuid);
 perform public.school_people_execution('f9200000-0000-4000-8000-000000000002',current_setting('test.p9.archive')::uuid,'AUTH_COMPLETE',(r->>'execution_token')::uuid);
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000002',true);
select pg_temp.p9_assert(jsonb_array_length(public.school_people_list('STUDENT'))=1,'archived users remain available for restoration');
select public.school_people_request('RESTORE','STUDENT','{}','f9200000-0000-4000-8000-000000000006');
reset role;
rollback;
