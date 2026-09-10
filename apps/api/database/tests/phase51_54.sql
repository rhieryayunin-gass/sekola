\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'Assertion failed: %',message; end if;
end $$;

do $$
declare a uuid:='20000000-0000-4000-8000-000000000001'; approver uuid:='20000000-0000-4000-8000-000000000002';
 b uuid:='20000000-0000-4000-8000-000000000003'; tenant uuid:='10000000-0000-4000-8000-000000000001';
 room uuid:='30000000-0000-4000-8000-000000000001'; result jsonb; request uuid; target uuid; events bigint; requests bigint;
 year_id uuid; semester_id uuid; classroom_id uuid; subject_id uuid; teacher_id uuid; course_id uuid; lesson_id uuid; student_id uuid;
 category_id uuid; account_id uuid; bill_id uuid; payment_id uuid; balance numeric;
 exam_id uuid; project_key uuid; task_id uuid; invoice_id uuid; notification_count bigint;
begin
  perform pg_temp.assert_true((select count(*)=2 from public.rooms),'Phase 50 fixtures preserved');
  perform pg_temp.assert_true(jsonb_array_length(public.list_operational_approvers(a))=2,'Approver directory is tenant scoped');
  perform pg_temp.assert_true(not has_function_privilege('authenticated','public.submit_operational_request(uuid,text,jsonb,uuid[])','EXECUTE'),'RPC is server only');
  perform pg_temp.assert_true(not has_table_privilege('authenticated','public.leave_requests','SELECT'),'Direct sensitive record access denied');
  select count(*) into requests from public.room_bookings;
  begin
    perform public.submit_operational_request(a,'ROOM_BOOKING',jsonb_build_object('room_id',room,'title','Invalid approver','starts_at','2027-01-01T09:00:00Z','ends_at','2027-01-01T10:00:00Z'),array[b]);
    raise exception 'Cross tenant approver accepted';
  exception when check_violation then null; end;
  perform pg_temp.assert_true((select count(*)=requests from public.room_bookings),'Invalid approval rolled back booking');
  result:=public.submit_operational_request(a,'ROOM_BOOKING',jsonb_build_object('room_id',room,'title','Atomic booking','starts_at','2027-01-01T09:00:00Z','ends_at','2027-01-01T10:00:00Z'),array[approver,a]);
  request:=(result->>'approval_request_id')::uuid; target:=(result->>'id')::uuid;
  begin
    perform public.submit_operational_request(a,'ROOM_BOOKING',jsonb_build_object('room_id',room,'title','Overlapping booking','starts_at','2027-01-01T09:30:00Z','ends_at','2027-01-01T10:30:00Z'),array[approver]);
    raise exception 'Room overlap accepted';
  exception when exclusion_violation then null; end;
  begin perform public.decide_operational_request(a,request,'APPROVED'); raise exception 'Out of order decision accepted'; exception when insufficient_privilege then null; end;
  result:=public.decide_operational_request(approver,request,'APPROVED');
  perform pg_temp.assert_true(result->>'status'='PENDING' and result->>'current_step'='2','Sequential approval advances exactly one step');
  result:=public.decide_operational_request(a,request,'APPROVED');
  perform pg_temp.assert_true(result->>'status'='APPROVED','Final approval committed');
  perform pg_temp.assert_true((select calendar_event_id is not null and status='APPROVED' from public.room_bookings where id=target),'Calendar and booking committed');
  begin perform public.decide_operational_request(a,request,'REJECTED'); raise exception 'Repeated decision accepted'; exception when serialization_failure then null; end;
  perform pg_temp.assert_true((select count(*)=1 from public.calendar_events where source_table='room_bookings' and source_id=target),'Only one approved event');
  begin
    perform public.submit_operational_request(a,'GENERIC',jsonb_build_object('resource_type','ROOM_BOOKING','resource_id',target,'title','Forged approval'),array[a]);
    raise exception 'Reserved resource type accepted';
  exception when check_violation then null; end;
  perform pg_temp.assert_true(jsonb_array_length(public.list_my_approvals(b))=0,'Other tenant cannot read approvals');
  result:=public.submit_operational_request(a,'LEAVE_REQUEST','{"leave_type":"SICK","starts_on":"2027-01-04","ends_on":"2027-01-05","reason":"Private reason"}',array[approver]);
  request:=(result->>'approval_request_id')::uuid; target:=(result->>'id')::uuid;
  perform public.decide_operational_request(approver,request,'REJECTED');
  perform pg_temp.assert_true((select calendar_event_id is null and status='REJECTED' from public.leave_requests where id=target),'Rejected leave has no calendar event');
  perform pg_temp.assert_true(not exists(select 1 from public.notifications where body like '%Private reason%'),'Medical reason not in notification previews');
  result:=public.submit_operational_request(a,'LEAVE_REQUEST','{"leave_type":"ANNUAL","starts_on":"2027-01-07","ends_on":"2027-01-08","reason":"Holiday"}',array[approver]);
  perform public.decide_operational_request(a,(result->>'approval_request_id')::uuid,'CANCELLED');
  perform pg_temp.assert_true((select status='CANCELLED' from public.leave_requests where id=(result->>'id')::uuid),'Cancellation updates linked request');
  begin
    insert into public.room_bookings(tenant_id,room_id,requester_user_id,title,starts_at,ends_at) values(tenant,'30000000-0000-4000-8000-000000000002',a,'Wrong tenant','2027-03-01','2027-03-02');
    raise exception 'Cross tenant foreign key accepted';
  exception when foreign_key_violation then null; end;
  begin update public.rooms set tenant_id='10000000-0000-4000-8000-000000000002' where id=room; raise exception 'Tenant reassignment accepted'; exception when check_violation then null; end;
  begin perform public.mutate_tenant_record(a,'subjects',null,'CREATE',jsonb_build_object('id',gen_random_uuid(),'code','BAD','name','Bad'),'ACADEMIC'); raise exception 'Identity override accepted'; exception when check_violation then null; end;

  result:=public.mutate_tenant_record(a,'academic_years',null,'CREATE','{"name":"2027 Test","starts_on":"2027-01-01","ends_on":"2027-12-31","is_active":true}','ACADEMIC'); year_id:=(result->>'id')::uuid;
  perform pg_temp.assert_true((select count(*)=2 from public.calendar_events where source_table='academic_years' and source_id=year_id),'Academic calendar distributed to permitted tenant users');
  result:=public.mutate_tenant_record(a,'semesters',null,'CREATE',jsonb_build_object('name','Term One','academic_year_id',year_id,'starts_on','2027-01-01','ends_on','2027-06-30'),'ACADEMIC'); semester_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'classrooms',null,'CREATE',jsonb_build_object('name','Class A','academic_year_id',year_id),'ACADEMIC'); classroom_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'subjects',null,'CREATE','{"code":"MATH","name":"Mathematics"}','ACADEMIC'); subject_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'teachers',null,'CREATE',jsonb_build_object('user_id',a),'PEOPLE'); teacher_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'courses',null,'CREATE',jsonb_build_object('name','Math Class A','subject_id',subject_id,'teacher_id',teacher_id,'classroom_id',classroom_id,'academic_year_id',year_id,'semester_id',semester_id),'LEARNING'); course_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'lessons',null,'CREATE',jsonb_build_object('title','Fractions','course_id',course_id,'scheduled_at','2027-02-01T09:00:00Z','is_published',true),'LEARNING'); lesson_id:=(result->>'id')::uuid;
  select count(*) into events from public.calendar_events where source_table='lessons' and source_id=lesson_id;
  perform pg_temp.assert_true(events=1,'Learning calendar integration');
  perform public.mutate_tenant_record(a,'lessons',lesson_id,'UPDATE','{"scheduled_at":"2027-02-02T09:00:00Z"}','LEARNING');
  perform pg_temp.assert_true((select count(*)=events from public.calendar_events where source_table='lessons' and source_id=lesson_id),'Updating source does not duplicate events');
  perform public.mutate_tenant_record(a,'lessons',lesson_id,'UPDATE','{"is_published":false}','LEARNING');
  perform pg_temp.assert_true(not exists(select 1 from public.calendar_events where source_table='lessons' and source_id=lesson_id),'Unpublishing removes linked event');
  perform pg_temp.assert_true(not exists(select 1 from public.notifications where tenant_id='10000000-0000-4000-8000-000000000002'),'No cross tenant notifications');

  result:=public.mutate_tenant_record(a,'students',null,'CREATE',jsonb_build_object('student_number','CI-01','user_id',approver),'PEOPLE'); student_id:=(result->>'id')::uuid;
  perform public.mutate_tenant_record(a,'student_assignments',null,'CREATE',jsonb_build_object('student_id',student_id,'classroom_id',classroom_id,'academic_year_id',year_id,'semester_id',semester_id),'PEOPLE');
  perform pg_temp.assert_true(jsonb_array_length(public.list_student_learning(approver,'lessons'))=0,'Unpublished lessons are hidden');
  perform public.mutate_tenant_record(a,'lessons',lesson_id,'UPDATE','{"is_published":true}','LEARNING');
  perform pg_temp.assert_true(jsonb_array_length(public.list_student_learning(approver,'lessons'))=1,'Enrolled student sees published lesson');
  perform pg_temp.assert_true(jsonb_array_length(public.list_student_learning(b,'lessons'))=0,'Other tenant sees no lessons');
  perform pg_temp.assert_true((select count(*)=2 from public.calendar_events where source_table='lessons' and source_id=lesson_id),'Teacher and enrolled student receive the event');
  select count(*) into notification_count from public.notifications where user_id=approver;
  perform public.mutate_tenant_record(a,'attendance_records',null,'CREATE',jsonb_build_object('student_id',student_id,'classroom_id',classroom_id,'attendance_date','2027-01-10','status','ABSENT'),'ATTENDANCE');
  perform pg_temp.assert_true((select count(*)>notification_count from public.notifications where user_id=approver),'Attendance notification reaches student');
  result:=public.mutate_tenant_record(a,'exams',null,'CREATE',jsonb_build_object('course_id',course_id,'title','Math exam','starts_at','2027-04-01T09:00:00Z','ends_at','2027-04-01T10:00:00Z','status','PUBLISHED'),'ASSESSMENT'); exam_id:=(result->>'id')::uuid;
  perform pg_temp.assert_true((select count(*)=2 from public.calendar_events where source_table='exams' and source_id=exam_id),'Published exam calendar integration');
  begin
    insert into public.exam_questions(tenant_id,subject_id,question_type,prompt,source) values(tenant,subject_id,'ESSAY','Unchecked AI question','AI_DRAFT');
    raise exception 'Unreviewed approved AI question accepted';
  exception when check_violation then null; end;

  insert into public.team_projects(tenant_id,code,name,owner_user_id,created_by_user_id,due_on) values(tenant,'CI-PROJECT','CI project',a,a,'2027-06-01') returning id into project_key;
  insert into public.team_project_settings(tenant_id,project_id) values(tenant,project_key);
  perform pg_temp.assert_true(jsonb_array_length(public.list_visible_projects(approver))=0,'Private project hidden from unrelated tenant member');
  insert into public.team_project_members(tenant_id,project_id,user_id,member_role) values(tenant,project_key,approver,'VIEWER');
  perform pg_temp.assert_true(jsonb_array_length(public.list_visible_projects(approver))=1,'Project member can see private project');
  perform pg_temp.assert_true(jsonb_array_length(public.list_visible_projects(b))=0,'Other tenant cannot see project');
  insert into public.team_tasks(tenant_id,project_id,title,assignee_user_id,reporter_user_id,due_date) values(tenant,project_key,'CI task',approver,a,'2027-05-01') returning id into task_id;
  perform pg_temp.assert_true((select count(*)=2 from public.calendar_events where source_table='team_tasks' and source_id=task_id),'Task deadline reaches owner and assignee');
  select count(*) into notification_count from public.notifications where resource_type='team_tasks';
  update public.team_project_settings set notifications_enabled=false where project_id=project_key;
  update public.team_tasks set title='CI task changed' where id=task_id;
  perform pg_temp.assert_true((select count(*)=notification_count from public.notifications where resource_type='team_tasks'),'Project notification preference is honored');
  update public.team_tasks set status='DONE' where id=task_id;
  perform pg_temp.assert_true(not exists(select 1 from public.calendar_events where source_table='team_tasks' and source_id=task_id),'Completed task deadline removed');
  insert into public.team_project_invoices(tenant_id,project_id,invoice_number,amount,due_date) values(tenant,project_key,'CI-TEAM-INV',100,'2027-06-01') returning id into invoice_id;
  insert into public.team_project_payments(tenant_id,project_id,project_invoice_id,receipt_number,amount) values(tenant,project_key,invoice_id,'CI-TEAM-PAY',40);
  perform pg_temp.assert_true((select outstanding_amount=60 from public.team_project_finance_summary f where f.project_id=project_key),'Project partial payment is reflected in finance');
  result:=public.mutate_tenant_record(a,'finance_categories',null,'CREATE','{"name":"Tuition","category_type":"INCOME"}','FINANCE'); category_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'finance_accounts',null,'CREATE','{"name":"Bank","account_type":"BANK"}','FINANCE'); account_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'student_bills',null,'CREATE',jsonb_build_object('student_id',student_id,'category_id',category_id,'invoice_number','TEST-INV','amount',100,'due_date','2027-06-01'),'FINANCE'); bill_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'payments',null,'CREATE',jsonb_build_object('student_bill_id',bill_id,'account_id',account_id,'receipt_number','TEST-PAY','amount',40),'FINANCE'); payment_id:=(result->>'id')::uuid;
  select outstanding_amount into balance from public.finance_analytics where tenant_id=tenant;
  perform pg_temp.assert_true(balance=60,'Partial payment subtracts from outstanding');
  perform pg_temp.assert_true((select outstanding_amount=60 from public.finance_dashboard where tenant_id=tenant),'Finance dashboard agrees with analytics');
  perform pg_temp.assert_true((select status='PARTIAL' from public.student_bills where id=bill_id),'Invoice status derived atomically');
  begin update public.student_bills set amount=20 where id=bill_id; raise exception 'Invoice reduced below confirmed payments'; exception when check_violation then null; end;
  begin update public.student_bills set status='VOID' where id=bill_id; raise exception 'Paid invoice voided without refund'; exception when check_violation then null; end;
  begin perform public.mutate_tenant_record(a,'payments',null,'CREATE',jsonb_build_object('student_bill_id',bill_id,'account_id',account_id,'receipt_number','OVERPAY','amount',70),'FINANCE'); raise exception 'Overpayment accepted'; exception when check_violation then null; end;
  perform public.mutate_tenant_record(a,'payments',payment_id,'UPDATE','{"status":"REFUNDED"}','FINANCE');
  perform pg_temp.assert_true((select outstanding_amount=100 from public.finance_analytics where tenant_id=tenant),'Refund restores outstanding');
  perform pg_temp.assert_true((select count(*)>10 from public.audit_logs where actor_user_id=a),'Actor audit written for mutations');
end $$;
-- Exercise RLS as a real authenticated role, not only as the database owner.
grant select on public.calendars,public.calendar_events to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(not exists(select 1 from public.calendars where integration_managed and owner_user_id<>auth.uid()),'RLS hides other recipients integrated calendars');
reset role;
rollback;
