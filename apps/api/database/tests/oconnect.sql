-- Runs against disposable PostgreSQL in CI. Every fixture is rolled back.
begin;
insert into public.tenants(id,name,code) values
 ('f1000000-0000-4000-8000-000000000001','O-Connect test school A','CONNECT-TEST-A'),
 ('f1000000-0000-4000-8000-000000000002','O-Connect test school B','CONNECT-TEST-B');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select ('f2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'connect-test-'||n||'@school.invalid',
 jsonb_build_object('tenant_id',case when n=5 then 'f1000000-0000-4000-8000-000000000002' else 'f1000000-0000-4000-8000-000000000001' end),
 jsonb_build_object('full_name','Connect test '||n)
from generate_series(1,6)n;
insert into public.user_roles(user_id,role_id)
select ('f2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,r.id from generate_series(1,6)n join public.roles r on r.code=case n when 1 then 'OWNER' when 2 then 'TEACHER' when 3 then 'STUDENT' when 4 then 'PARENT' when 5 then 'OWNER' else 'STUDENT' end;
insert into public.academic_years(id,tenant_id,name,starts_on,ends_on,is_active) values('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Connect year','2026-07-01','2027-06-30',true);
insert into public.semesters(id,tenant_id,academic_year_id,name,starts_on,ends_on,is_active) values('f3000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','Connect semester','2026-07-01','2026-12-31',true);
insert into public.classrooms(id,tenant_id,academic_year_id,name,homeroom_teacher_user_id) values('f3000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','Connect class','f2000000-0000-4000-8000-000000000002');
insert into public.students(id,tenant_id,user_id,student_number) values('f3000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000003','CONNECT-S1');
insert into public.student_assignments(id,tenant_id,student_id,classroom_id,academic_year_id,semester_id) values('f3000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000004','f3000000-0000-4000-8000-000000000003','f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002');
insert into public.team_projects(id,tenant_id,code,name,status,owner_user_id,created_by_user_id) values('f3000000-0000-4000-8000-000000000006','f1000000-0000-4000-8000-000000000001','CONNECT-P1','Connect project','ACTIVE','f2000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001');
insert into public.team_project_members(tenant_id,project_id,user_id) values('f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000006','f2000000-0000-4000-8000-000000000002');
insert into public.team_tasks(id,tenant_id,project_id,title,reporter_user_id) values('f3000000-0000-4000-8000-000000000007','f1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000006','Connect task','f2000000-0000-4000-8000-000000000001');
insert into public.calendars(id,tenant_id,name,owner_user_id) values('f3000000-0000-4000-8000-000000000008','f1000000-0000-4000-8000-000000000001','Connect calendar','f2000000-0000-4000-8000-000000000001');
insert into public.calendar_events(id,calendar_id,title,starts_at) values('f3000000-0000-4000-8000-000000000009','f3000000-0000-4000-8000-000000000008','Connect event',now()+interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
do $$ declare direct uuid; group_id uuid; class_id uuid; project_id uuid; first_message jsonb; retry jsonb; begin
 if not (public.oconnect_context()->>'can_manage')::boolean then raise exception 'Owner cannot manage'; end if;
 direct:=public.oconnect_create('DIRECT','',array['f2000000-0000-4000-8000-000000000002'::uuid]);
 if public.oconnect_create('DIRECT','',array['f2000000-0000-4000-8000-000000000002'::uuid])<>direct then raise exception 'Duplicate direct conversation'; end if;
 perform set_config('test.connect.direct',direct::text,true);
 group_id:=public.oconnect_create('GROUP','Connect discussion',array['f2000000-0000-4000-8000-000000000002'::uuid,'f2000000-0000-4000-8000-000000000004'::uuid]);
 perform set_config('test.connect.group',group_id::text,true);
 class_id:=public.oconnect_create('CLASS','', '{}','f3000000-0000-4000-8000-000000000003');
 perform set_config('test.connect.class',class_id::text,true);
 project_id:=public.oconnect_create('PROJECT','', '{}','f3000000-0000-4000-8000-000000000006');
 perform set_config('test.connect.project',project_id::text,true);
 first_message:=public.oconnect_send(direct,'f4000000-0000-4000-8000-000000000001','Hello O-Connect');
 retry:=public.oconnect_send(direct,'f4000000-0000-4000-8000-000000000001','Hello O-Connect');
 if first_message->>'seq'<>retry->>'seq' then raise exception 'Retry duplicated message'; end if;
 perform public.oconnect_send(direct,'f4000000-0000-4000-8000-000000000002','Reply', 'f4000000-0000-4000-8000-000000000001');
 if jsonb_array_length(public.oconnect_thread(direct,null,'Hello')->'messages')<>1 then raise exception 'Message search mismatch'; end if;
 if jsonb_array_length(public.oconnect_thread(direct,(first_message->>'seq')::bigint)->'messages')<>0 then raise exception 'History cursor includes boundary'; end if;
 perform public.oconnect_send(group_id,'f4000000-0000-4000-8000-000000000003','Calendar',null,null,'calendar','f3000000-0000-4000-8000-000000000009');
 if public.oconnect_resource('f4000000-0000-4000-8000-000000000003')->>'name'<>'Connect event' then raise exception 'Calendar integration failed'; end if;
 perform public.oconnect_send(project_id,'f4000000-0000-4000-8000-000000000004','Task',null,null,'task','f3000000-0000-4000-8000-000000000007');
 perform public.oconnect_send(class_id,'f4000000-0000-4000-8000-000000000005','Class message');
 perform public.oconnect_preferences(20);
 if public.oconnect_context()->>'font_size'<>'20' then raise exception 'Font preference not persisted'; end if;
 begin perform public.oconnect_preferences(99); raise exception 'Invalid font accepted'; exception when raise_exception then if sqlerrm<>'CONNECT_INVALID' then raise; end if; end;
 begin perform public.oconnect_create('DIRECT','',array['f2000000-0000-4000-8000-000000000005'::uuid]); raise exception 'Cross-tenant direct accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.oconnect_messages(conversation_id,tenant_id,sender_id,body) values(direct,'f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002','Forged'); raise exception 'Direct insert accepted'; exception when insufficient_privilege then null; end;
 begin perform public.oconnect_send(direct,gen_random_uuid(),'Wrong reply','f4000000-0000-4000-8000-000000000005'); raise exception 'Cross-thread reply accepted'; exception when raise_exception then if sqlerrm<>'CONNECT_INVALID' then raise; end if; end;
end $$;
-- Upload object then send it through the authenticated RPC. Metadata originates
-- from Storage in production; this is the disposable Storage schema fixture.
insert into storage.objects(bucket_id,name,metadata) values('oconnect-attachments','f1000000-0000-4000-8000-000000000001/'||current_setting('test.connect.direct')||'/f2000000-0000-4000-8000-000000000001/test.pdf','{"size":512,"mimetype":"application/pdf"}');
select public.oconnect_send(current_setting('test.connect.direct')::uuid,'f4000000-0000-4000-8000-000000000006','',null,jsonb_build_object('name','test.pdf','path','f1000000-0000-4000-8000-000000000001/'||current_setting('test.connect.direct')||'/f2000000-0000-4000-8000-000000000001/test.pdf'));
do $$ declare n integer; begin
 delete from storage.objects where bucket_id='oconnect-attachments'; get diagnostics n=row_count;
 if n<>0 then raise exception 'Attached file deleted directly'; end if;
 begin insert into storage.objects(bucket_id,name) values('oconnect-attachments','f1000000-0000-4000-8000-000000000002/'||current_setting('test.connect.direct')||'/f2000000-0000-4000-8000-000000000001/attack.pdf'); raise exception 'Cross tenant upload accepted'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000002',true);
do $$ declare direct uuid:=current_setting('test.connect.direct')::uuid; latest bigint; begin
 if public.oconnect_context()->>'font_size'<>'16' then raise exception 'Other user font leaked'; end if;
 if jsonb_array_length(public.oconnect_thread(direct)->'messages')<>3 then raise exception 'Recipient missing messages'; end if;
 if (select count(*) from public.notifications where resource_type='oconnect' and resource_id=direct and read_at is null)<>1 then raise exception 'Notifications not deduplicated'; end if;
 if not exists(select 1 from storage.objects where bucket_id='oconnect-attachments') then raise exception 'Recipient attachment missing'; end if;
 select max(seq) into latest from public.oconnect_messages where conversation_id=direct;
 perform public.oconnect_mark_read(direct,latest);
 if exists(select 1 from public.notifications where resource_type='oconnect' and resource_id=direct and read_at is null) then raise exception 'Read notification remained unread'; end if;
 perform public.oconnect_options(direct,true,true);
 if not exists(select 1 from public.oconnect_members where conversation_id=direct and user_id=auth.uid() and muted and archived and last_read_seq=latest) then raise exception 'Preferences/receipt lost'; end if;
 begin perform public.oconnect_delete_message('f4000000-0000-4000-8000-000000000001'); raise exception 'Deleted someone else message'; exception when insufficient_privilege then null; end;
 begin perform public.oconnect_manage_member(current_setting('test.connect.group')::uuid,'f2000000-0000-4000-8000-000000000003'); raise exception 'Non-manager added member'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000003',true);
do $$ begin
 if (public.oconnect_context()->>'can_manage')::boolean then raise exception 'Student can manage'; end if;
 if jsonb_array_length(public.oconnect_thread(current_setting('test.connect.class')::uuid)->'messages')<>1 then raise exception 'Student class integration missing'; end if;
 begin perform public.oconnect_thread(current_setting('test.connect.direct')::uuid); raise exception 'Non-member read direct'; exception when insufficient_privilege then null; end;
 begin perform public.oconnect_send(current_setting('test.connect.direct')::uuid,gen_random_uuid(),'Forbidden'); raise exception 'Non-member sent direct'; exception when insufficient_privilege then null; end;
 begin perform public.oconnect_create('DIRECT','',array['f2000000-0000-4000-8000-000000000006'::uuid]); raise exception 'Student contacted arbitrary student'; exception when insufficient_privilege then null; end;
 begin perform public.oconnect_create('GROUP','Student group',array['f2000000-0000-4000-8000-000000000002'::uuid]); raise exception 'Student created group'; exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where bucket_id='oconnect-attachments') then raise exception 'Non-member saw attachment'; end if;
end $$;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000004',true);
do $$ begin
 perform public.oconnect_thread(current_setting('test.connect.group')::uuid);
 if public.oconnect_resource('f4000000-0000-4000-8000-000000000003')->>'name'<>'Connect event' then raise exception 'Parent calendar access failed'; end if;
 begin perform public.oconnect_thread(current_setting('test.connect.class')::uuid); raise exception 'Parent guessed class access'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000005',true);
do $$ begin
 if exists(select 1 from public.oconnect_messages) or exists(select 1 from public.oconnect_conversations) then raise exception 'Cross tenant RLS leak'; end if;
 begin perform public.oconnect_thread(current_setting('test.connect.group')::uuid); raise exception 'Cross tenant RPC leak'; exception when insufficient_privilege then null; end;
end $$;
-- Group removal, class reassignment and project removal revoke access immediately.
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000001',true);
select public.oconnect_manage_member(current_setting('test.connect.group')::uuid,'f2000000-0000-4000-8000-000000000004',true);
select public.oconnect_manage_member(current_setting('test.connect.group')::uuid,'f2000000-0000-4000-8000-000000000003',false);
select public.oconnect_delete_message('f4000000-0000-4000-8000-000000000001');
do $$ begin
 if exists(select 1 from public.oconnect_messages where id='f4000000-0000-4000-8000-000000000001' and (body<>'' or deleted_at is null)) then raise exception 'Deletion did not redact'; end if;
 perform public.oconnect_send(current_setting('test.connect.direct')::uuid,gen_random_uuid(),'Muted recipient');
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.notifications where user_id='f2000000-0000-4000-8000-000000000002' and resource_type='oconnect' and resource_id=current_setting('test.connect.direct')::uuid and read_at is null) then raise exception 'Muted notification emitted'; end if;
end $$;
update public.student_assignments set is_active=false where id='f3000000-0000-4000-8000-000000000005';
delete from public.team_project_members where project_id='f3000000-0000-4000-8000-000000000006' and user_id='f2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000004',true);
do $$ begin begin perform public.oconnect_thread(current_setting('test.connect.group')::uuid); raise exception 'Removed group member retained access'; exception when insufficient_privilege then null; end; end $$;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000003',true);
do $$ begin
 begin perform public.oconnect_thread(current_setting('test.connect.class')::uuid); raise exception 'Former student retained class access'; exception when insufficient_privilege then null; end;
 perform public.oconnect_thread(current_setting('test.connect.group')::uuid);
end $$;
select set_config('request.jwt.claim.sub','f2000000-0000-4000-8000-000000000002',true);
do $$ begin begin perform public.oconnect_thread(current_setting('test.connect.project')::uuid); raise exception 'Removed project member retained access'; exception when insufficient_privilege then null; end; end $$;
reset role;
update public.users set is_active=false where id='f2000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ begin
 if exists(select 1 from public.oconnect_messages) then raise exception 'Inactive account RLS leak'; end if;
 begin perform public.oconnect_context(); raise exception 'Inactive account connected'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform public.oconnect_context(); raise exception 'Anonymous RPC access'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
