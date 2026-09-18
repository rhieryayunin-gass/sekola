-- Disposable database only. All fixtures and effects are rolled back.
begin;
insert into public.tenants(id,name,code) values
 ('b1000000-0000-4000-8000-000000000001','Part 7 school A','PART7-TEST-A'),
 ('b1000000-0000-4000-8000-000000000002','Part 7 school B','PART7-TEST-B');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select ('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'part7-test-'||n||'@school.invalid',jsonb_build_object('tenant_id',case when n=5 then 'b1000000-0000-4000-8000-000000000002' else 'b1000000-0000-4000-8000-000000000001' end),jsonb_build_object('full_name','Part7 Person '||n) from generate_series(1,8)n;
insert into public.user_roles(user_id,role_id) select ('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,r.id from generate_series(1,8)n join public.roles r on r.code=case n when 1 then 'OWNER' when 2 then 'TEACHER' when 3 then 'STUDENT' when 4 then 'PARENT' when 5 then 'OWNER' when 6 then 'STUDENT' when 7 then 'PARENT' else 'STAFF' end;
insert into public.academic_years(id,tenant_id,name,starts_on,ends_on,is_active) values('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Part7 year','2026-07-01','2027-06-30',true);
insert into public.semesters(id,tenant_id,academic_year_id,name,starts_on,ends_on,is_active) values('b3000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','Semester','2026-07-01','2026-12-31',true);
insert into public.classrooms(id,tenant_id,academic_year_id,name,homeroom_teacher_user_id) values('b3000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','Part7 class','b2000000-0000-4000-8000-000000000002');
insert into public.students(id,tenant_id,user_id,student_number) values('b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','P7-S1');
insert into public.students(id,tenant_id,user_id,student_number) values('b3000000-0000-4000-8000-000000000014','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000006','P7-S2');
insert into public.student_assignments(tenant_id,student_id,classroom_id,academic_year_id,semester_id) values('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002');
insert into public.subjects(id,tenant_id,code,name) values('b3000000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-000000000001','MATH','Mathematics');
insert into public.teachers(id,tenant_id,user_id) values('b3000000-0000-4000-8000-000000000006','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002');
insert into public.courses(id,tenant_id,subject_id,teacher_id,classroom_id,academic_year_id,semester_id,name) values('b3000000-0000-4000-8000-000000000007','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000005','b3000000-0000-4000-8000-000000000006','b3000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002','Numbers');
insert into public.exams(id,tenant_id,course_id,title,starts_at,ends_at) values('b3000000-0000-4000-8000-000000000008','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000007','Practice exam',now()-interval '1 minute',now()+interval '1 hour');
insert into public.student_assignments(tenant_id,student_id,classroom_id,academic_year_id,semester_id) values('b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000014','b3000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000002');
insert into public.school_guardians(tenant_id,parent_user_id,student_id) values('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000004','b3000000-0000-4000-8000-000000000004');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values('b2000000-0000-4000-8000-000000000009','part7-principal@school.invalid','{"tenant_id":"b1000000-0000-4000-8000-000000000001"}','{"full_name":"Part7 Principal"}');
insert into public.user_roles(user_id,role_id) select 'b2000000-0000-4000-8000-000000000009',id from public.roles where code='PRINCIPAL';
insert into public.school_guardians(tenant_id,parent_user_id,student_id) values('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000007','b3000000-0000-4000-8000-000000000014');
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000008',true);
do $$ declare r jsonb; n integer; program uuid; stage uuid; subj uuid; goal uuid; begin
 r:=public.school_setup_state();
 if (r->>'blockers')::int=0 then raise exception 'Incomplete setup marked ready'; end if;
 r:=public.school_setup_action('preferences','{"revision":0,"mode":"IMPORT","operations":{"hours":"07:00–15:00","units":["Academic office"]}}');
 begin perform public.school_setup_action('preferences','{"revision":0}');raise exception 'Stale setup accepted';exception when serialization_failure then null;end;
 begin perform public.school_setup_action('launch');raise exception 'Incomplete launch accepted';exception when check_violation then null;end;
 r:=public.school_setup_records('subjects','[{"code":"P7-PREVIEW","name":"Preview"}]',true);
 if not (r->>'valid')::boolean or (r->>'committed')::boolean then raise exception 'Preview failed: %',r; end if;
 if exists(select 1 from jsonb_array_elements(public.school_catalog('subjects')) s where s->>'code'='P7-PREVIEW') then raise exception 'Preview persisted records';end if;
 r:=public.school_setup_records('subjects','[{"code":"P7-ROLLBACK","name":"Valid row"},{"code":"P7-BAD","name":"Invalid","tenant_id":"b1000000-0000-4000-8000-000000000002"}]',false);
 if (r->>'valid')::boolean or exists(select 1 from jsonb_array_elements(public.school_catalog('subjects')) s where s->>'code'='P7-ROLLBACK') then raise exception 'Partial invalid import committed';end if;
 r:=public.school_setup_records('subjects','[{"code":"P7-OK","name":"Committed"}]',false);
 if not (r->>'committed')::boolean then raise exception 'Valid import failed: %',r;end if;
 begin perform public.school_setup_action('identity','{}');raise exception 'Staff gained tenant identity permission';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
 r:=public.school_owner_save('tenant','{"name":"Part7 ready school","address":"School test address","contact_email":"office@school.invalid","timezone":"Asia/Jakarta","locale":"id-ID"}','b1000000-0000-4000-8000-000000000001');
 perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000008',true);
 r:=public.school_setup_records('school_assets','[{"name":"Learning studio","category":"CLASSROOM","capacity":30}]',false);
 if not (r->>'valid')::boolean then raise exception 'Facility setup failed: %',r;end if;
 program:=(public.school_curriculum_create_program('{"academic_year_id":"b3000000-0000-4000-8000-000000000001","name":"Merdeka programme","framework":"MERDEKA","version":"2026","language":"id"}','[{"code":"C","name":"Fase C","grade_from":5,"grade_to":6}]')->>'id')::uuid;
 stage:=(public.school_curriculum_list('stages',0,program)->0->>'id')::uuid;
 subj:=(public.school_curriculum_save('subjects',jsonb_build_object('program_id',program,'stage_id',stage,'subject_id','b3000000-0000-4000-8000-000000000005','name','Number reasoning'))->>'id')::uuid;
 perform public.school_curriculum_save('enrollments',jsonb_build_object('program_id',program,'stage_id',stage,'classroom_id','b3000000-0000-4000-8000-000000000003'));
 perform public.school_curriculum_save('course_links',jsonb_build_object('program_id',program,'course_id','b3000000-0000-4000-8000-000000000007','curriculum_subject_id',subj));
 goal:=(public.school_curriculum_save('outcomes',jsonb_build_object('program_id',program,'curriculum_subject_id',subj,'code','TP-1','name','Explain addition','kind','TP','description','School-approved learning goal','sequence',1))->>'id')::uuid;
 perform set_config('test.p7.goal',goal::text,true);
 perform public.school_curriculum_save('scales',jsonb_build_object('program_id',program,'name','Learning descriptors','kind','DESCRIPTOR','labels',jsonb_build_array('Developing','Secure'),'criteria','Explain with evidence'));
 r:=public.school_setup_records('teacher_assignments','[{"academic_year_id":"b3000000-0000-4000-8000-000000000001","semester_id":"b3000000-0000-4000-8000-000000000002","classroom_id":"b3000000-0000-4000-8000-000000000003","subject_id":"b3000000-0000-4000-8000-000000000005","teacher_id":"b3000000-0000-4000-8000-000000000006"}]',false);
 if not (r->>'valid')::boolean then raise exception 'Teaching allocation failed: %',r;end if;
 r:=public.school_setup_records('classrooms','[{"record_id":"b3000000-0000-4000-8000-000000000003","capacity":30,"grade_level":"5","campus":"Main campus"}]',false);if not (r->>'valid')::boolean then raise exception 'Class architecture failed: %',r;end if;
 r:=public.school_setup_state();if (r->>'blockers')::int>0 then raise exception 'Readiness blockers: %',r->'checks';end if;
 r:=public.school_setup_action('launch');if (r->>'score')::int<>100 or r->'setup'->>'launched_at' is null then raise exception 'Ready school could not launch: %',r;end if;
 r:=public.school_setup_profile('students','b2000000-0000-4000-8000-000000000003','P7-S1');if not (r->>'reused')::boolean then raise exception 'Resumed profile duplicated';end if;
 begin perform public.school_setup_suggestion('reserve','b7000000-0000-4000-8000-000000000001');raise exception 'Removed setup assistant callable';exception when insufficient_privilege then null;end;

end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
do $$ declare r jsonb; unit uuid; lesson uuid; assignment uuid; begin
 perform public.school_studio('home');
 unit:=(public.school_studio('unit','{"course_id":"b3000000-0000-4000-8000-000000000007","title":"Targeted learning","published":true,"student_ids":["b3000000-0000-4000-8000-000000000004"]}')->>'id')::uuid;
 perform set_config('test.p7.unit',unit::text,true);
 lesson:=(public.school_studio('lesson',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','unit_id',unit,'title','Reading one','scheduled_at',now()+interval '1 day','material','Read and reflect','blocks',jsonb_build_array(jsonb_build_object('type','REFLECTION','text','What did you learn?')),'is_published',true))->>'id')::uuid;
 perform set_config('test.p7.lesson',lesson::text,true);
 assignment:=(public.school_studio('assignment',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','unit_id',unit,'title','Explain your reasoning','is_published',true,'max_score',100,'rubric','Clear explanation'))->>'id')::uuid;
 perform set_config('test.p7.assignment',assignment::text,true);
 perform public.school_studio('space','{"course_id":"b3000000-0000-4000-8000-000000000007","status":"LIVE"}');
 begin perform public.school_studio('lesson',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','id',lesson,'title','Unsafe edit'));raise exception 'Published material overwritten';exception when raise_exception then if sqlerrm='Published material overwritten' then raise;end if;end;
 perform public.school_studio('lesson',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','id',lesson,'unit_id',unit,'title','Reading revised','scheduled_at',now()+interval '1 day','material','Revised reading','is_published',true,'version_action','NEW_VERSION'));
 r:=public.school_studio('state','{"course_id":"b3000000-0000-4000-8000-000000000007"}');
 if jsonb_array_length(r->'roster')<>2 then raise exception 'Teacher roster failed';end if;
 begin perform public.school_setup_records('subjects','[{"code":"P7-NO","name":"Teacher creation"}]',false);raise exception 'Teacher changed setup';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000006',true);
do $$ declare r jsonb;begin
 r:=public.school_studio('state','{"course_id":"b3000000-0000-4000-8000-000000000007"}');
 if jsonb_array_length(r->'lessons')<>0 or jsonb_array_length(r->'units')<>0 or jsonb_array_length(r->'assignments')<>0 then raise exception 'Targeted learning leaked';end if;
 if jsonb_array_length(public.school_family_report('learning','b3000000-0000-4000-8000-000000000014')->'rows')<>0 then raise exception 'Peer family report leaked targeted assignment';end if;
 if exists(select 1 from jsonb_array_elements(public.school_calendar_context(now(),now()+interval '2 days')->'events') ev where ev->>'source_id'=current_setting('test.p7.lesson')) then raise exception 'Peer calendar leaked targeted lesson';end if;
 if jsonb_array_length(public.school_catalog('lessons'))<>0 then raise exception 'Legacy catalog leaked targeted lesson';end if;
 begin perform public.school_studio('submit',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','assignment_id',current_setting('test.p7.assignment'),'revision',0,'content','forged'));raise exception 'Untargeted learner submitted';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000003',true);
do $$ declare r jsonb;begin
 r:=public.school_studio('state','{"course_id":"b3000000-0000-4000-8000-000000000007"}');
 if jsonb_array_length(r->'lessons')<>1 or jsonb_array_length(r->'roster')<>0 then raise exception 'Student learning scope failed';end if;
 perform public.school_studio('progress',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','id',current_setting('test.p7.lesson'),'complete',true));
 r:=public.school_studio('submit',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','assignment_id',current_setting('test.p7.assignment'),'revision',0,'content','My draft','submit',false));
 perform set_config('test.p7.submission',r->>'id',true);
 begin perform public.school_studio('submit',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','assignment_id',current_setting('test.p7.assignment'),'revision',0,'content','Stale','submit',true));raise exception 'Stale submission accepted';exception when serialization_failure then null;end;
 perform public.school_studio('submit',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','assignment_id',current_setting('test.p7.assignment'),'revision',1,'content','My answer','submit',true));
 begin perform public.school_studio('submit',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','assignment_id',current_setting('test.p7.assignment'),'revision',2,'content','Changed after submit'));raise exception 'Submitted work unlocked';exception when raise_exception then if sqlerrm='Submitted work unlocked' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
select public.school_studio('review',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','id',current_setting('test.p7.submission'),'score',75,'feedback','Private draft','decision','CHANGES_REQUESTED'));
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000003',true);
do $$ declare r jsonb;begin
 r:=public.school_studio('state','{"course_id":"b3000000-0000-4000-8000-000000000007"}');
 if r->'submissions'->0->>'score' is not null or r->'submissions'->0->>'draft_feedback' is not null or r->'submissions'->0->>'feedback' is not null then raise exception 'Review draft leaked';end if;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
select public.school_studio('release',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','id',current_setting('test.p7.submission')));
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000003',true);
do $$ declare r jsonb;begin
 r:=public.school_studio('state','{"course_id":"b3000000-0000-4000-8000-000000000007"}');
 if r->'submissions'->0->>'workflow_status'<>'CHANGES_REQUESTED' or (r->'submissions'->0->>'score')::numeric<>75 then raise exception 'Released revision request not visible';end if;
 perform public.school_studio('submit',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','assignment_id',current_setting('test.p7.assignment'),'revision',2,'content','My revised answer','submit',true));
 r:=public.school_studio('history',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','id',current_setting('test.p7.submission')));
 if jsonb_array_length(r)<>3 then raise exception 'Revision history lost';end if;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
do $$ declare r jsonb; eid uuid;bank uuid;question uuid;begin
 r:=public.school_assessment('save',jsonb_build_object('course_id','b3000000-0000-4000-8000-000000000007','unit_id',current_setting('test.p7.unit'),'title','Focused assessment','blueprint',jsonb_build_array(jsonb_build_object('outcome_id',current_setting('test.p7.goal'),'count',1,'weight',100)),'duration_minutes',20,'starts_at',now()-interval '1 minute','ends_at',now()+interval '1 hour','result_mode','FEEDBACK'));
 eid:=(r->>'id')::uuid;perform set_config('test.p7.exam',eid::text,true);
 bank:=(public.school_question_save('set','{"course_id":"b3000000-0000-4000-8000-000000000007","title":"Part7 bank","grade_level":5,"usage_scope":"PRACTICE"}')->>'id')::uuid;
 question:=(public.school_question_save('item',jsonb_build_object('set_id',bank,'question_type','MULTIPLE_CHOICE','prompt','What is 2 + 2?','options','["3","4","5","6"]'::jsonb,'answer','4','difficulty','EASY','explanation','Two pairs make four.','review_status','APPROVED'))->>'id')::uuid;
 perform public.school_exam_manage('questions',eid,jsonb_build_array(question));
 r:=public.school_assessment('check',jsonb_build_object('exam_id',eid));if jsonb_array_length(r->'issues')=0 then raise exception 'Unmapped question passed blueprint';end if;
 perform public.school_assessment('map_question',jsonb_build_object('exam_id',eid,'item_id',r->'items'->0->>'id','outcome_id',current_setting('test.p7.goal')));
 r:=public.school_assessment('check',jsonb_build_object('exam_id',eid));
 if jsonb_array_length(r->'issues')<>0 then raise exception 'Valid assessment not ready: %',r->'issues';end if;
 perform public.school_exam_manage('publish',eid);
 r:=public.school_assessment('live',jsonb_build_object('exam_id',eid));
 if jsonb_array_length(r)<>1 or r->0->>'status'<>'NOT_STARTED' then raise exception 'Participant snapshot failed: %',r;end if;
 perform public.school_assessment('accommodation',jsonb_build_object('exam_id',eid,'student_id','b3000000-0000-4000-8000-000000000004','extra_minutes',10,'reason','Individual support'));
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000006',true);
do $$ begin
 begin perform public.school_exam_start(current_setting('test.p7.exam')::uuid);raise exception 'Untargeted learner started exam';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000003',true);
do $$ declare r jsonb; q uuid; aid uuid;begin
 r:=public.school_assessment('ready',jsonb_build_object('exam_id',current_setting('test.p7.exam')));
 if r->'attempt'->>'id' is not null then raise exception 'Ready check started timer';end if;
 r:=public.school_exam_start(current_setting('test.p7.exam')::uuid);aid:=(r->'attempt'->>'id')::uuid;perform set_config('test.p7.attempt',aid::text,true);
 if (r->>'ends_at')::timestamptz not between now()+interval '29 minutes' and now()+interval '31 minutes' then raise exception 'Personal deadline incorrect: %',r;end if;
 if (public.school_exam_start(current_setting('test.p7.exam')::uuid)->'attempt'->>'id')::uuid<>aid then raise exception 'Resume created another attempt';end if;
 q:=(r->'questions'->0->>'id')::uuid;
 if r->'questions'->0->'content' ? 'answer' then raise exception 'Answer key leaked';end if;
 r:=public.school_exam_save(aid,0,jsonb_build_object(q::text,'4'),true);
 if r->>'score' is not null or r->>'receipt' is null or r->>'submitted_at' is null then raise exception 'Submission receipt/score privacy failed: %',r;end if;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.school_assessment('release',jsonb_build_object('exam_id',current_setting('test.p7.exam'),'attempt_id',current_setting('test.p7.attempt')));raise exception 'Unreviewed result released';exception when raise_exception then if sqlerrm='Unreviewed result released' then raise;end if;end;
 perform public.school_exam_grade(current_setting('test.p7.attempt')::uuid,95,'Reviewed feedback');
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000003',true);
do $$ begin if public.school_exam_state(current_setting('test.p7.attempt')::uuid)->'attempt'->>'score' is not null then raise exception 'Reviewed draft leaked';end if;end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
select public.school_assessment('release',jsonb_build_object('exam_id',current_setting('test.p7.exam'),'attempt_id',current_setting('test.p7.attempt')));
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000003',true);
do $$ declare r jsonb;begin
 r:=public.school_exam_state(current_setting('test.p7.attempt')::uuid);
 if (r->'attempt'->>'score')::numeric<>95 or r->'attempt'->>'feedback'<>'Reviewed feedback' or r->'questions'->0->'content' ? 'answer' then raise exception 'Release policy incorrect';end if;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true);
do $$ declare r jsonb;begin
 r:=public.school_assessment('remedial',jsonb_build_object('exam_id',current_setting('test.p7.exam'),'student_ids',jsonb_build_array('b3000000-0000-4000-8000-000000000004'),'title','Remedial draft','description','Review the learning gap'));
 r:=public.school_assessment('retake',jsonb_build_object('exam_id',current_setting('test.p7.exam')));
 if r->>'id'=current_setting('test.p7.exam') then raise exception 'Retake replaced original exam';end if;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000007',true);
do $$ begin if jsonb_array_length(public.school_family_report('exams','b3000000-0000-4000-8000-000000000014')->'rows')<>0 then raise exception 'Peer parent saw restricted exam';end if;end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000004',true);
do $$ begin
 if (public.school_family_report('exams','b3000000-0000-4000-8000-000000000004')->'rows'->0->>'score')::numeric<>95 then raise exception 'Parent released result missing';end if;
 begin perform public.school_studio('state','{"course_id":"b3000000-0000-4000-8000-000000000007"}');raise exception 'Parent opened teacher workspace';exception when insufficient_privilege then null;end;
 begin perform public.school_assessment('live',jsonb_build_object('exam_id',current_setting('test.p7.exam')));raise exception 'Parent opened live participants';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000005',true);
do $$ begin
 begin perform public.school_exam_state(current_setting('test.p7.attempt')::uuid);raise exception 'Cross-school attempt leaked';exception when insufficient_privilege then null;end;
end $$;
rollback;
