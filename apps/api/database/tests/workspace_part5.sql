-- Disposable database only. All fixtures and effects are rolled back.
begin;
do $$begin
 if exists(select 1 from public.school_marketing,jsonb_array_elements(questions) q where length(q->>'prompt_en')<10 or q->>'category_en' is null or jsonb_array_length(q->'options_en') is distinct from jsonb_array_length(q->'options')) then raise exception 'English assessment incomplete';end if;
end $$;
insert into public.tenants(id,name,code) values
 ('d1000000-0000-4000-8000-000000000001','Part 5 school A','PART5-WORKSPACE-TEST-A'),
 ('d1000000-0000-4000-8000-000000000002','Part 5 school B','PART5-WORKSPACE-TEST-B');
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
insert into public.user_roles(user_id,role_id) select 'd2000000-0000-4000-8000-000000000007',id from public.roles where code='STAFF';
insert into public.student_assignments(tenant_id,student_id,classroom_id,academic_year_id,semester_id) values('d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000014','d3000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002');
delete from public.user_roles where user_id='d2000000-0000-4000-8000-000000000007' and role_id=(select id from public.roles where code='PARENT');
insert into public.school_guardians(tenant_id,parent_user_id,student_id) values('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000004');
insert into public.assignments(id,tenant_id,course_id,title,is_published) values('d4000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000007','Published task',true),('d4000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000007','Private task',false);
insert into public.submissions(tenant_id,assignment_id,student_id,score,feedback) values('d1000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000004',99,'Private unreviewed feedback');
insert into public.finance_accounts(id,tenant_id,name,account_type) values('d4000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','Gateway ledger','BANK');
insert into public.finance_categories(id,tenant_id,name,category_type) values('d4000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','Tuition','INCOME');
insert into public.student_bills(id,tenant_id,student_id,category_id,invoice_number,amount,due_date) values('d4000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000004','P5-TUITION',125000,current_date);
insert into public.student_bills(id,tenant_id,student_id,category_id,invoice_number,amount,due_date) values('d4000000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000004','P5-BACKUP',125000,current_date);
set local role authenticated;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
do $$ declare r jsonb;begin
 begin perform public.school_family_report('academic','d3000000-0000-4000-8000-000000000004');raise exception 'Student Academic still available after Part10';exception when insufficient_privilege then null;end;
 begin perform public.school_family_report('academic','d3000000-0000-4000-8000-000000000014');raise exception 'Other student data leaked';exception when insufficient_privilege then null;end;
 begin perform public.school_finance_report('bills',current_date-1,current_date+1);raise exception 'Student finance allowed';exception when insufficient_privilege then null;end;
 begin perform public.school_face_directory();raise exception 'Student face management allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000004',true);
do $$ declare r jsonb;begin
 r:=public.school_family_report('learning','d3000000-0000-4000-8000-000000000004');if jsonb_array_length(r->'rows')<>1 or r->'rows'->0->>'feedback' is not null or r->'rows'->0->>'score' is not null then raise exception 'Parent draft data leaked';end if;
 perform public.school_family_report('exams','d3000000-0000-4000-8000-000000000004');
 begin perform public.school_family_report('learning','d3000000-0000-4000-8000-000000000014');raise exception 'Unlinked child leaked';exception when insufficient_privilege then null;end;
 r:=public.school_finance_report('bills',current_date-1,current_date+1);if (r->>'count')::integer<>2 then raise exception 'Parent bills missing';end if;
 begin perform public.school_payment_config_status();raise exception 'Parent gateway keys allowed';exception when insufficient_privilege then null;end;
 begin perform public.school_payment_record(gen_random_uuid(),'{"status":"PAID"}');raise exception 'Forged browser payment accepted';exception when insufficient_privilege then null;end;
 begin perform 1 from public.school_face_enrollments;raise exception 'Face templates exposed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000002',true);
do $$ declare r jsonb;begin
 begin perform public.school_finance_report('bills',current_date-1,current_date+1);raise exception 'Teacher finance allowed';exception when insufficient_privilege then null;end;
 r:=public.school_face_directory();if exists(select 1 from jsonb_array_elements(r)v where v->>'id' in ('d2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000005')) then raise exception 'Excluded face target listed';end if;
 begin perform public.school_face_challenge('d2000000-0000-4000-8000-000000000005','ENROLL');raise exception 'Foreign face enrolled';exception when insufficient_privilege then null;end;
 perform public.school_role_dashboard();
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
do $$ declare v jsonb; samples jsonb; r jsonb; c uuid;begin
 select jsonb_agg(case when n=1 then 1 else 0 end order by n) into v from generate_series(1,256)n;samples:=jsonb_build_array(v,v,v);
 c:=(public.school_face_challenge('d2000000-0000-4000-8000-000000000003','ENROLL')->>'id')::uuid;
 r:=public.school_face_scan(c,samples,true);if r->>'enrolled'<>'true' then raise exception 'Enrollment failed';end if;
 begin perform public.school_face_scan(c,samples,true);raise exception 'Face challenge replay allowed';exception when insufficient_privilege then null;end;
 c:=(public.school_face_challenge('d2000000-0000-4000-8000-000000000003','VERIFY')->>'id')::uuid;
 r:=public.school_face_scan(c,samples,true);if r->>'matched'<>'true' then raise exception 'Rescan failed';end if;
 c:=(public.school_face_challenge('d2000000-0000-4000-8000-000000000003','CHECKIN','d3000000-0000-4000-8000-000000000003')->>'id')::uuid;
 r:=public.school_face_scan(c,samples,true);if r->>'matched'<>'true' then raise exception 'Face checkin failed';end if;
 select jsonb_agg(case when n=2 then 1 else 0 end order by n) into v from generate_series(1,256)n;samples:=jsonb_build_array(v,v,v);
 c:=(public.school_face_challenge('d2000000-0000-4000-8000-000000000003','VERIFY')->>'id')::uuid;
 r:=public.school_face_scan(c,samples,true);if r->>'matched'<>'false' then raise exception 'Wrong face matched';end if;
 perform public.school_face_delete('d2000000-0000-4000-8000-000000000003');
 perform public.school_payment_configure('{"provider":"XENDIT","secret":"test-key-only-not-real","webhook_secret":"test-hook-only-not-real","account_id":"d4000000-0000-4000-8000-000000000003","is_live":false,"enabled":true}');
 perform public.school_payment_configure('{"provider":"MIDTRANS","secret":"test-backup-not-real","account_id":"d4000000-0000-4000-8000-000000000003","is_live":false,"enabled":true}');
 r:=public.school_payment_config_status();if r::text like '%test-key%' or r::text like '%test-hook%' then raise exception 'Gateway secret returned';end if;
 if not osekola_private.can_write_media('tenant-media','d1000000-0000-4000-8000-000000000001/gallery/event.png') then raise exception 'Staff gallery denied';end if;
 c:=(public.school_admission_save('cycle',jsonb_build_object('name','SPMB test','opens_at',now()-interval '1 day','closes_at',now()+interval '1 day','fee_amount',50000,'exam_at',now()+interval '2 days','exam_location','Room A','is_published',true))->>'id')::uuid;
 perform set_config('test.p5.cycle',c::text,true);
end $$;
reset role;
do $$ begin if not exists(select 1 from public.attendance_records where student_id='d3000000-0000-4000-8000-000000000004' and status='PRESENT') then raise exception 'Face attendance not persisted';end if;end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$ declare r jsonb;begin
 r:=public.school_admission_register(current_setting('test.p5.cycle')::uuid,jsonb_build_object('full_name','Synthetic applicant','birth_date','2015-01-01','guardian_name','Synthetic guardian','email','p5-applicant@school.invalid','phone','0800000001','consent',true));
 perform set_config('test.p5.application',r->>'id',true);perform set_config('test.p5.token',r->>'access_token',true);
 r:=public.school_admission_portal((r->>'id')::uuid,r->>'access_token');if r->>'payment_status'<>'UNPAID' then raise exception 'Registration fee missing';end if;
 begin perform public.school_admission_portal(current_setting('test.p5.application')::uuid,repeat('0',64));raise exception 'Wrong application token accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ declare a jsonb;b jsonb;begin
 a:=public.school_payment_reserve('d2000000-0000-4000-8000-000000000004','bill','d4000000-0000-4000-8000-000000000005');
 b:=public.school_payment_reserve('d2000000-0000-4000-8000-000000000004','bill','d4000000-0000-4000-8000-000000000005');
 if public.school_payment_credentials((a->>'id')::uuid)->>'secret'<>'test-key-only-not-real' then raise exception 'Service credentials unavailable';end if;
 if a->>'id'<>b->>'id' or b->>'create'<>'false' then raise exception 'Duplicate checkout created';end if;
 begin update public.student_bills set amount=1 where id='d4000000-0000-4000-8000-000000000005';raise exception 'Pending amount changed';exception when raise_exception then if sqlerrm='Pending amount changed' then raise;end if;end;
 begin perform public.school_payment_record((a->>'id')::uuid,'{"status":"PAID","amount":1,"currency":"IDR","payment_id":"forged"}');raise exception 'Wrong provider amount accepted';exception when raise_exception then if sqlerrm='Wrong provider amount accepted' then raise;end if;end;
 perform public.school_payment_record((a->>'id')::uuid,'{"status":"PAID","amount":125000,"currency":"IDR","payment_id":"test-provider-id"}');
 perform public.school_payment_record((a->>'id')::uuid,'{"status":"EXPIRED"}');
 a:=public.school_payment_reserve('d2000000-0000-4000-8000-000000000004','bill','d4000000-0000-4000-8000-000000000006');
 perform public.school_payment_record((a->>'id')::uuid,'{"status":"UNKNOWN"}');
 begin perform public.school_payment_fallback((a->>'id')::uuid);raise exception 'Ambiguous fallback accepted';exception when raise_exception then if sqlerrm='Ambiguous fallback accepted' then raise;end if;end;
 perform public.school_payment_record((a->>'id')::uuid,'{"status":"FAILED"}');
 b:=public.school_payment_fallback((a->>'id')::uuid);if b->>'provider'<>'MIDTRANS' then raise exception 'Backup unavailable';end if;
 perform public.school_payment_record((b->>'id')::uuid,'{"status":"PAID","amount":125000,"currency":"IDR","payment_id":"backup-paid"}');
 begin perform public.school_payment_fallback((a->>'id')::uuid);raise exception 'Repeated fallback charged again';exception when raise_exception then if sqlerrm='Repeated fallback charged again' then raise;end if;end;
 a:=public.school_payment_reserve(null,'admission',current_setting('test.p5.application')::uuid,current_setting('test.p5.token'));
 perform public.school_payment_record((a->>'id')::uuid,'{"status":"PAID","amount":50000,"currency":"IDR","payment_id":"test-admission-id"}');
end $$;
reset role;
do $$begin if (select count(*) from public.payments where student_bill_id='d4000000-0000-4000-8000-000000000005')<>1 or (select status from public.student_bills where id='d4000000-0000-4000-8000-000000000005')<>'PAID' then raise exception 'Payment ledger/idempotency failed';end if;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
do $$ declare a uuid:=current_setting('test.p5.application')::uuid;r jsonb;begin
 perform public.school_admission_save('selection','{"status":"ELIGIBLE","note":"Private selection","publish":false}',a);
 r:=public.school_admission_portal(a,current_setting('test.p5.token'));if r->>'selection_status'<>'PENDING' or r->>'selection_note'<>'' then raise exception 'Draft admission decision leaked';end if;
 perform public.school_admission_save('selection','{"status":"ELIGIBLE","note":"Eligible","publish":true}',a);
 perform public.school_admission_save('card','{}',a);
 perform public.school_admission_save('final','{"status":"PASSED","note":"Welcome","publish":true}',a);
 r:=public.school_admission_portal(a,current_setting('test.p5.token'));if r->>'final_status'<>'PASSED' or r->>'exam_card_issued_at' is null then raise exception 'Admission flow incomplete';end if;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000001',true);
do $$ declare r jsonb;begin
 perform public.school_staff_teacher_roles('d2000000-0000-4000-8000-000000000007',array['STAFF','TEACHER']);
 r:=public.school_product_save('{"code":"ESSENTIAL","name":"Essential test","price_monthly":10000,"discount_percent":10,"custom_pricing":true,"features":["Fitur satu"],"features_en":["Feature one"]}');if r->>'discount_percent'<>'10.00' then raise exception 'Product discount failed';end if;
 perform public.school_tenant_archive('d1000000-0000-4000-8000-000000000002','Part 5 school B');
 perform public.school_tenant_archive('d1000000-0000-4000-8000-000000000002','Part 5 school B',true);
end $$;
reset role;
rollback;
