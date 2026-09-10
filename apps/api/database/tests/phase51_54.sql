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
begin
  perform pg_temp.assert_true((select count(*)=2 from public.rooms),'Phase 50 fixtures preserved');
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
  result:=public.mutate_tenant_record(a,'finance_categories',null,'CREATE','{"name":"Tuition","category_type":"INCOME"}','FINANCE'); category_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'finance_accounts',null,'CREATE','{"name":"Bank","account_type":"BANK"}','FINANCE'); account_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'student_bills',null,'CREATE',jsonb_build_object('student_id',student_id,'category_id',category_id,'invoice_number','TEST-INV','amount',100,'due_date','2027-06-01'),'FINANCE'); bill_id:=(result->>'id')::uuid;
  result:=public.mutate_tenant_record(a,'payments',null,'CREATE',jsonb_build_object('student_bill_id',bill_id,'account_id',account_id,'receipt_number','TEST-PAY','amount',40),'FINANCE'); payment_id:=(result->>'id')::uuid;
  select outstanding_amount into balance from public.finance_analytics where tenant_id=tenant;
  perform pg_temp.assert_true(balance=60,'Partial payment subtracts from outstanding');
  perform pg_temp.assert_true((select status='PARTIAL' from public.student_bills where id=bill_id),'Invoice status derived atomically');
  begin perform public.mutate_tenant_record(a,'payments',null,'CREATE',jsonb_build_object('student_bill_id',bill_id,'account_id',account_id,'receipt_number','OVERPAY','amount',70),'FINANCE'); raise exception 'Overpayment accepted'; exception when check_violation then null; end;
  perform public.mutate_tenant_record(a,'payments',payment_id,'UPDATE','{"status":"REFUNDED"}','FINANCE');
  perform pg_temp.assert_true((select outstanding_amount=100 from public.finance_analytics where tenant_id=tenant),'Refund restores outstanding');
  perform pg_temp.assert_true((select count(*)>10 from public.audit_logs where actor_user_id=a),'Actor audit written for mutations');
end $$;
rollback;
