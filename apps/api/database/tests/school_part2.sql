-- Disposable database only. All fixtures and effects are rolled back.
begin;
insert into public.tenants(id,name,code) values
 ('d1000000-0000-4000-8000-000000000001','Part 2 school A','PART2-TEST-A'),
 ('d1000000-0000-4000-8000-000000000002','Part 2 school B','PART2-TEST-B');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select ('d2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'part2-test-'||n||'@school.invalid',jsonb_build_object('tenant_id',case when n=5 then 'd1000000-0000-4000-8000-000000000002' else 'd1000000-0000-4000-8000-000000000001' end),jsonb_build_object('full_name','Part2 Person '||n) from generate_series(1,8)n;
insert into public.user_roles(user_id,role_id) select ('d2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,r.id from generate_series(1,8)n join public.roles r on r.code=case n when 1 then 'OWNER' when 2 then 'TEACHER' when 3 then 'STUDENT' when 4 then 'PARENT' when 5 then 'OWNER' when 6 then 'STUDENT' when 7 then 'PARENT' else 'TEACHER' end;
insert into public.academic_years(id,tenant_id,name,starts_on,ends_on,is_active) values('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Part2 year','2026-07-01','2027-06-30',true);
insert into public.semesters(id,tenant_id,academic_year_id,name,starts_on,ends_on,is_active) values('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','Semester','2026-07-01','2026-12-31',true);
insert into public.classrooms(id,tenant_id,academic_year_id,name,homeroom_teacher_user_id) values('d3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','Part2 class','d2000000-0000-4000-8000-000000000002');
insert into public.students(id,tenant_id,user_id,student_number) values('d3000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003','P2-S1');
insert into public.students(id,tenant_id,user_id,student_number) values('d3000000-0000-4000-8000-000000000014','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000006','P2-S2');
insert into public.student_assignments(tenant_id,student_id,classroom_id,academic_year_id,semester_id) values('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002');
insert into public.subjects(id,tenant_id,code,name) values('d3000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001','MATH','Mathematics');
insert into public.teachers(id,tenant_id,user_id) values('d3000000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002');
insert into public.courses(id,tenant_id,subject_id,teacher_id,classroom_id,academic_year_id,semester_id,name) values('d3000000-0000-4000-8000-000000000007','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000005','d3000000-0000-4000-8000-000000000006','d3000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002','Numbers');
insert into public.exams(id,tenant_id,course_id,title,starts_at,ends_at) values('d3000000-0000-4000-8000-000000000008','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000007','Practice exam',now()-interval '1 minute',now()+interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
do $$ declare result jsonb; bank uuid; question uuid; begin
 if not (public.school_context()->>'staff')::boolean then raise exception 'Owner context failed'; end if;
 perform public.school_save('school_guardians','{"parent_user_id":"d2000000-0000-4000-8000-000000000004","student_id":"d3000000-0000-4000-8000-000000000004"}');
 begin perform public.school_save('school_assets','{"name":"Spoof","category":"LAB","capacity":20,"tenant_id":"d1000000-0000-4000-8000-000000000002"}'); raise exception 'Protected tenant accepted'; exception when invalid_parameter_value then null; end;
 bank:=(public.school_question_save('set','{"course_id":"d3000000-0000-4000-8000-000000000007","title":"Arithmetic","grade_level":5}')->>'id')::uuid;
 perform set_config('test.part2.bank',bank::text,true);
 question:=(public.school_question_save('item',jsonb_build_object('set_id',bank,'question_type','MULTIPLE_CHOICE','prompt','What is 2 + 2?','options','["3","4","5","6"]'::jsonb,'answer','4','difficulty','EASY','explanation','Two pairs make four.','review_status','APPROVED'))->>'id')::uuid;
 perform public.school_exam_manage('questions','d3000000-0000-4000-8000-000000000008',jsonb_build_array(question));
 perform public.school_exam_manage('publish','d3000000-0000-4000-8000-000000000008');
 result:=public.school_attendance_open('d3000000-0000-4000-8000-000000000003','QR',15,5);
 perform set_config('test.part2.session',result->>'id',true); perform set_config('test.part2.code',result->>'code',true);
 perform public.school_ai_reserve('d4000000-0000-4000-8000-000000000001',bank,1);
 perform public.school_ai_finish('d4000000-0000-4000-8000-000000000001','[{"question_type":"ESSAY","prompt":"Explain how addition works.","options":[],"answer":"Assess the explanation.","difficulty":"EASY"}]','{"model":"fixture","input_tokens":10,"output_tokens":10}');
 if jsonb_array_length(public.school_question_bank(bank)->'items')<>2 then raise exception 'AI draft not saved'; end if;
end $$;
do $$ declare report jsonb; project uuid; begin
 report:=public.school_dashboard();
 if (report->>'students')::integer<>2 then raise exception 'Dashboard student projection failed'; end if;
 if jsonb_typeof(report->'pending_approvals')<>'array' then raise exception 'Approval projection must be an array'; end if;
 perform public.school_calendar_context(now()-interval '1 day',now()+interval '40 days');
 perform public.school_finance_options('finance_accounts');
 report:=public.school_finance_report('bills','2026-01-01','2026-12-31');
 if (report->>'count')::integer<>0 then raise exception 'Fresh school has unexpected bills'; end if;
 report:=public.school_finance_report('payments','2026-01-01','2026-12-31');
 project:=(public.school_project_template(jsonb_build_object('code','P2-GRAD','name','Graduation committee','template','GRADUATION','committee',jsonb_build_object('CHAIR',auth.uid(),'SECRETARY','d2000000-0000-4000-8000-000000000002','TREASURER','d2000000-0000-4000-8000-000000000008')))->>'id')::uuid;
 perform set_config('test.part2.project',project::text,true);
 if jsonb_array_length(public.school_committee(project))<>3 then raise exception 'Required committee not created'; end if;
 begin perform public.school_project_template('{"code":"NO-PIC","name":"Missing PIC","template":"CUSTOM","committee":{}}'); raise exception 'Missing committee accepted'; exception when raise_exception then if sqlerrm='Missing committee accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
do $$ declare state jsonb; item uuid; result jsonb; begin
 result:=public.school_attendance_checkin(current_setting('test.part2.session')::uuid,current_setting('test.part2.code'));
 if result->>'status'<>'PRESENT' then raise exception 'QR check-in failed'; end if;
 perform public.school_attendance_checkin(current_setting('test.part2.session')::uuid,current_setting('test.part2.code'));
 begin perform public.school_attendance_override('d3000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000004',current_date,'ABSENT','Forged correction'); raise exception 'Student override accepted'; exception when insufficient_privilege then null; end;
 begin perform public.school_question_bank(current_setting('test.part2.bank')::uuid); raise exception 'Student read answer keys'; exception when insufficient_privilege then null; end;
 state:=public.school_exam_start('d3000000-0000-4000-8000-000000000008');
 if (state->'questions'->0->'content') ?| array['answer','explanation'] then raise exception 'Answer key leaked to student'; end if;
 perform set_config('test.part2.attempt',state->'attempt'->>'id',true); item:=(state->'questions'->0->>'id')::uuid;
 perform public.school_exam_save(current_setting('test.part2.attempt')::uuid,0,jsonb_build_object(item::text,'4'));
 begin perform public.school_exam_save(current_setting('test.part2.attempt')::uuid,0,jsonb_build_object(item::text,'3')); raise exception 'Stale revision overwritten'; exception when serialization_failure then null; end;
 result:=public.school_exam_save(current_setting('test.part2.attempt')::uuid,1,jsonb_build_object(item::text,'4'),true);
 if result->>'score'<>'100.00' then raise exception 'Server grading incorrect: %',result; end if;
 result:=public.school_exam_save(current_setting('test.part2.attempt')::uuid,1,jsonb_build_object(item::text,'3'),true);
 if (result->>'score')::numeric<>100 then raise exception 'Submit retry changed grade'; end if;
 begin insert into public.school_exam_attempts(tenant_id,exam_id,session_id,student_id,user_id) values('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000008',gen_random_uuid(),'d3000000-0000-4000-8000-000000000004',auth.uid()); raise exception 'Direct attempt insert accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000004',true);
do $$ declare result jsonb; begin
 if jsonb_array_length(public.school_context()->'children')<>1 then raise exception 'Guardian link missing'; end if;
 if jsonb_array_length(public.school_catalog('students'))<>1 then raise exception 'Parent sees unrelated students'; end if;
 if (select count(*) from public.school_guardians)<>1 then raise exception 'Guardian RLS failed'; end if;
 result:=public.school_exam_state(current_setting('test.part2.attempt')::uuid);
 if (result->'questions'->0->'content') ?| array['answer','explanation'] then raise exception 'Parent answer key leaked'; end if;
 begin perform public.school_exam_start('d3000000-0000-4000-8000-000000000008'); raise exception 'Parent took child exam'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
do $$ begin
 if jsonb_array_length(public.school_catalog('students'))<>0 then raise exception 'Unlinked parent sees students'; end if;
 begin perform public.school_exam_state(current_setting('test.part2.attempt')::uuid); raise exception 'Unlinked parent sees attempt'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000005',true);
do $$ begin
 if jsonb_array_length(public.school_question_bank(current_setting('test.part2.bank')::uuid)->'items')<>0 then raise exception 'Cross-tenant question leak'; end if;
 begin perform public.school_exam_state(current_setting('test.part2.attempt')::uuid); raise exception 'Cross-tenant attempt leak'; exception when insufficient_privilege then null; end;
 begin perform public.school_attendance_close(current_setting('test.part2.session')::uuid); raise exception 'Cross-tenant session closed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
do $$ declare result jsonb; begin
 perform public.school_attendance_close(current_setting('test.part2.session')::uuid);
 result:=public.school_device_manage('create','{"name":"Fixture reader","mode":"RFID"}');
 perform set_config('test.part2.device',result->>'id',true); perform set_config('test.part2.device_secret',result->>'secret',true);
 perform public.school_device_manage('bind',jsonb_build_object('device_id',result->>'id','student_id','d3000000-0000-4000-8000-000000000004','external_id','fixture-card-1'));
 result:=public.school_attendance_open('d3000000-0000-4000-8000-000000000003','RFID',15,5);
 perform set_config('test.part2.rfid_session',result->>'id',true);
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare result jsonb; begin
 begin perform public.school_context(); raise exception 'Anonymous context accepted'; exception when insufficient_privilege then null; end;
 begin perform public.school_submit_assessment(jsonb_build_object('answers',(select jsonb_agg(3) from generate_series(1,20)),'school_name','No consent school','contact_name','Test Contact','email','no-consent@school.invalid','phone','0800000000','student_count',50)); raise exception 'Missing consent accepted'; exception when invalid_parameter_value then null; end;
 result:=public.school_submit_assessment(jsonb_build_object('answers',(select jsonb_agg(3) from generate_series(1,20)),'school_name','Assessment school','contact_name','Test Contact','email','assessment@school.invalid','phone','0800000000','student_count',50,'consent',true));
 if result->>'score'<>'50' or result->>'plan'<>'ELEVATE' then raise exception 'Assessment scoring failed'; end if;
 begin select to_jsonb(l) into result from public.school_leads l limit 1; raise exception 'Anonymous lead list accepted'; exception when insufficient_privilege then null; end;
 result:=public.school_device_event(current_setting('test.part2.device')::uuid,current_setting('test.part2.device_secret'),current_setting('test.part2.rfid_session')::uuid,'d4000000-0000-4000-8000-000000000002','fixture-card-1',now());
 if result->>'status'<>'PRESENT' then raise exception 'Reader check-in failed'; end if;
 begin perform public.school_device_event(current_setting('test.part2.device')::uuid,repeat('0',64),current_setting('test.part2.rfid_session')::uuid,'d4000000-0000-4000-8000-000000000003','fixture-card-1',now()); raise exception 'Wrong device key accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.students set enrollment_status='GRADUATED' where id='d3000000-0000-4000-8000-000000000004';
do $$ begin
 if (select count(*) from public.school_alumni where student_id='d3000000-0000-4000-8000-000000000004')<>1 then raise exception 'Graduation did not create alumni'; end if;
 if (select count(*) from public.attendance_records where student_id='d3000000-0000-4000-8000-000000000004')<>1 then raise exception 'Check-in retry duplicated attendance'; end if;
end $$;
rollback;
