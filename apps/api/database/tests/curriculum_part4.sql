-- Disposable database only. All fixtures and effects are rolled back.
begin;
insert into public.tenants(id,name,code) values
 ('d1000000-0000-4000-8000-000000000001','Part 4 curriculum school A','PART4-CURRICULUM-TEST-A'),
 ('d1000000-0000-4000-8000-000000000002','Part 4 curriculum school B','PART4-CURRICULUM-TEST-B');
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
set local role authenticated;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
do $$ declare p jsonb; a uuid; b uuid; sa uuid; sb uuid; suba uuid; subb uuid; cp uuid; tp uuid; ao uuid; scalea uuid; scaleb uuid; evidence uuid; bank uuid; course uuid:='d3000000-0000-4000-8000-000000000007'; result jsonb; begin
 p:=public.school_curriculum_create_program('{"academic_year_id":"d3000000-0000-4000-8000-000000000001","name":"Merdeka programme","framework":"MERDEKA","version":"2025","language":"id"}','[{"code":"C","name":"Fase C","grade_from":5,"grade_to":6}]');a:=(p->>'id')::uuid;
 p:=public.school_curriculum_create_program('{"academic_year_id":"d3000000-0000-4000-8000-000000000001","name":"Cambridge programme","framework":"CAMBRIDGE","version":"2025–2027","language":"en"}','[{"code":"PRIMARY","name":"Primary"}]');b:=(p->>'id')::uuid;
 sa:=(public.school_curriculum_list('stages',0,a)->0->>'id')::uuid;sb:=(public.school_curriculum_list('stages',0,b)->0->>'id')::uuid;
 suba:=(public.school_curriculum_save('subjects',jsonb_build_object('program_id',a,'stage_id',sa,'subject_id','d3000000-0000-4000-8000-000000000005','name','Matematika fase C'))->>'id')::uuid;
 subb:=(public.school_curriculum_save('subjects',jsonb_build_object('program_id',b,'stage_id',sb,'subject_id','d3000000-0000-4000-8000-000000000005','name','Mathematics Primary','syllabus_code','0096','syllabus_version','School-approved edition'))->>'id')::uuid;
 begin perform public.school_curriculum_save('subjects',jsonb_build_object('program_id',a,'stage_id',sb,'subject_id','d3000000-0000-4000-8000-000000000005','name','Wrong programme')); raise exception 'Cross-programme stage accepted'; exception when check_violation then null; end;
 begin perform public.school_curriculum_save('course_links',jsonb_build_object('program_id',a,'course_id',course,'curriculum_subject_id',suba)); raise exception 'Course linked before class enrolment'; exception when check_violation then null; end;
 perform public.school_curriculum_save('enrollments',jsonb_build_object('program_id',a,'stage_id',sa,'classroom_id','d3000000-0000-4000-8000-000000000003'));
 perform public.school_curriculum_save('enrollments',jsonb_build_object('program_id',b,'stage_id',sb,'classroom_id','d3000000-0000-4000-8000-000000000003','student_id','d3000000-0000-4000-8000-000000000004'));
 perform public.school_curriculum_save('course_links',jsonb_build_object('program_id',a,'course_id',course,'curriculum_subject_id',suba));
 perform public.school_curriculum_save('course_links',jsonb_build_object('program_id',b,'course_id',course,'curriculum_subject_id',subb));
 cp:=(public.school_curriculum_save('outcomes',jsonb_build_object('program_id',a,'curriculum_subject_id',suba,'code','CP-C','name','School reference CP','kind','CP','description','School-approved phase outcome','sequence',1))->>'id')::uuid;
 tp:=(public.school_curriculum_save('outcomes',jsonb_build_object('program_id',a,'curriculum_subject_id',suba,'parent_id',cp,'code','TP-C-1','name','Number reasoning','kind','TP','description','Explain a number strategy with evidence','sequence',2))->>'id')::uuid;
 ao:=(public.school_curriculum_save('outcomes',jsonb_build_object('program_id',b,'curriculum_subject_id',subb,'code','LO-1','name','Reasoning objective','kind','LEARNING_OBJECTIVE','description','School-entered syllabus objective','sequence',1))->>'id')::uuid;
 begin perform public.school_curriculum_save('outcomes',jsonb_build_object('program_id',a,'curriculum_subject_id',suba,'parent_id',ao,'code','BAD','name','Wrong parent','kind','TP','description','Wrong programme parent','sequence',3)); raise exception 'Cross-programme outcome parent'; exception when check_violation then null; end;
 scalea:=(public.school_curriculum_save('scales',jsonb_build_object('program_id',a,'name','School descriptors v1','kind','DESCRIPTOR','labels',jsonb_build_array('Developing','Secure'),'criteria','Explain and demonstrate the learning goal'))->>'id')::uuid;
 scaleb:=(public.school_curriculum_save('scales',jsonb_build_object('program_id',b,'name','School rubric v1','rubric_dimensions',jsonb_build_array('Reasoning','Communication'),'kind','RUBRIC','minimum',0,'maximum',8,'criteria','School assessment rubric; no external grade conversion'))->>'id')::uuid;
 perform set_config('test.curriculum.a',a::text,true);perform set_config('test.curriculum.b',b::text,true);perform set_config('test.curriculum.tp',tp::text,true);perform set_config('test.curriculum.ao',ao::text,true);perform set_config('test.curriculum.scale',scaleb::text,true);
 begin perform public.school_curriculum_learning(course); raise exception 'Staff accessed Learning'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000002',true);
 result:=public.school_curriculum_learning(course);
 if jsonb_array_length(result->'programs')<>2 or jsonb_array_length(result->'outcomes')<>3 then raise exception 'Teacher multi-curriculum context missing'; end if;
 perform public.school_curriculum_save('alignments',jsonb_build_object('course_id',course,'outcome_id',tp,'purpose','TEACH'));
 bank:=(public.school_question_save('set',jsonb_build_object('course_id',course,'title','Curriculum aligned bank','grade_level',0))->>'id')::uuid;
 begin perform public.school_ai_reserve(gen_random_uuid(),bank,1); raise exception 'Removed generation callable'; exception when insufficient_privilege then null;end;
 
 perform public.school_curriculum_save('alignments',jsonb_build_object('course_id',course,'outcome_id',ao,'purpose','ASSESS','exam_id','d3000000-0000-4000-8000-000000000008'));
 perform public.school_curriculum_save('evidence',jsonb_build_object('course_id',course,'outcome_id',tp,'student_id','d3000000-0000-4000-8000-000000000004','scale_id',scalea,'descriptor','Secure','feedback','Draft teacher feedback'));
 evidence:=(public.school_curriculum_save('evidence',jsonb_build_object('course_id',course,'outcome_id',ao,'student_id','d3000000-0000-4000-8000-000000000004','scale_id',scaleb,'score',6,'feedback','Published rubric evidence','rubric_results',jsonb_build_object('Reasoning',6,'Communication',5),'status','PUBLISHED'))->>'id')::uuid;
 perform set_config('test.curriculum.evidence',evidence::text,true);
 begin perform public.school_curriculum_save('evidence',jsonb_build_object('rubric_results',jsonb_build_object('Reasoning',null,'Communication',5)),evidence);raise exception 'Null published rubric accepted' using errcode='23514';exception when sqlstate 'P0001' then null;end;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
 begin perform public.school_curriculum_save('scales','{"rubric_dimensions":["Changed"]}',scaleb);raise exception 'Used rubric dimensions changed' using errcode='23514';exception when sqlstate 'P0001' then null;end;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000002',true);

 begin perform public.school_curriculum_save('evidence',jsonb_build_object('course_id',course,'outcome_id',ao,'student_id','d3000000-0000-4000-8000-000000000014','scale_id',scaleb,'score',5,'feedback','Wrong individual programme')); raise exception 'Individual enrolment bypass'; exception when check_violation then null; end;
 begin perform public.school_curriculum_save('evidence',jsonb_build_object('course_id',course,'outcome_id',tp,'student_id','d3000000-0000-4000-8000-000000000004','scale_id',scaleb,'score',5,'feedback','Wrong programme scale')); raise exception 'Cross-programme scale accepted'; exception when check_violation then null; end;
 begin perform public.school_curriculum_save('evidence',jsonb_build_object('course_id',course,'outcome_id',ao,'student_id','d3000000-0000-4000-8000-000000000004','scale_id',scaleb,'score',99,'feedback','Out of range')); raise exception 'Scale range not enforced'; exception when check_violation then null; end;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
 begin perform public.school_curriculum_save('scales','{"maximum":100}',scaleb); raise exception 'Used scale changed historical meaning'; exception when check_violation then null; end;
 perform public.school_curriculum_save('programs','{"version":"Next school revision"}',b);
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000002',true);

 result:=public.school_curriculum_learning(course);
 if not exists(select 1 from jsonb_array_elements(result->'evidence') e where e->>'id'=evidence::text and e->'assessment_context'->'program'->>'version'='2025–2027' and e->'assessment_context'->'scale'->>'maximum'='8.00') then raise exception 'Assessment version snapshot missing'; end if;-- Part 8 elective overrides and historical evidence.
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
 p:=public.school_curriculum_save('enrollments',jsonb_build_object('program_id',a,'stage_id',sa,'classroom_id','d3000000-0000-4000-8000-000000000003','student_id','d3000000-0000-4000-8000-000000000004','participation','EXCLUDE','valid_from',current_date,'subject_ids',jsonb_build_array(suba)));
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
 if exists(select 1 from jsonb_array_elements(public.school_curriculum_learning(course)->'programs')v where v->>'id'=a::text) then raise exception 'Individual exclusion did not override the whole class';end if;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000006',true);
 if not exists(select 1 from jsonb_array_elements(public.school_curriculum_learning(course)->'programs')v where v->>'id'=a::text) then raise exception 'Exclusion affected another student';end if;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
 perform public.school_curriculum_save('enrollments',jsonb_build_object('valid_until',current_date-1,'valid_from',current_date-10),(p->>'id')::uuid);
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
 if not exists(select 1 from jsonb_array_elements(public.school_curriculum_learning(course)->'programs')v where v->>'id'=a::text) then raise exception 'Expired exclusion remains effective';end if;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
 begin perform public.school_curriculum_save('enrollments',jsonb_build_object('subject_ids',jsonb_build_array(subb)),(p->>'id')::uuid);raise exception 'Cross-program elective accepted';exception when check_violation then null;end;


 -- Future programmes can be prepared without granting learners early access.
 perform public.school_curriculum_save('programs',jsonb_build_object('valid_from',current_date+30),b);
 perform public.school_curriculum_save('course_links',jsonb_build_object('is_active',false), (public.school_curriculum_list('course_links',0,b)->0->>'id')::uuid);
 perform public.school_curriculum_save('course_links',jsonb_build_object('is_active',true), (public.school_curriculum_list('course_links',0,b)->0->>'id')::uuid);
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
 if exists(select 1 from jsonb_array_elements(public.school_curriculum_learning(course)->'programs')v where v->>'id'=b::text) then raise exception 'Future programme visible to student before effective date';end if;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
 perform public.school_curriculum_save('programs','{"valid_from":null}',b);
 -- Official qualifications preserve source values and isolate drafts/other children.
 p:=public.school_qualifications('save',jsonb_build_object('program_id',b,'student_id','d3000000-0000-4000-8000-000000000004','specification','Fixture specification','pathway','MODULAR','session_name','June 2026','ums',80,'raw_score',63,'qualification_grade','A','official_reference','Synthetic source'));
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
 if jsonb_array_length(public.school_qualifications('list','{"student_id":"d3000000-0000-4000-8000-000000000004"}'))<>0 then raise exception 'Draft qualification leaked';end if;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);
 result:=public.school_qualifications('save',jsonb_build_object('program_id',b,'student_id','d3000000-0000-4000-8000-000000000004','specification','Fixture specification','pathway','MODULAR','session_name','June 2026','ums',80,'raw_score',63,'qualification_grade','A','official_reference','Synthetic published source','supersedes_id',p->>'id','status','PUBLISHED'));
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
 result:=public.school_qualifications('list','{"student_id":"d3000000-0000-4000-8000-000000000004"}');
 if jsonb_array_length(result)<>1 or (result->0->>'ums')::numeric<>80 or (result->0->>'raw_score')::numeric<>63 then raise exception 'Published original qualification values missing';end if;
 begin perform public.school_qualifications('list','{"student_id":"d3000000-0000-4000-8000-000000000014"}');raise exception 'Other student qualification accessible';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000007',true);

end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000003',true);
do $$ declare result jsonb; begin
 result:=public.school_curriculum_learning('d3000000-0000-4000-8000-000000000007');
 if jsonb_array_length(result->'programs')<>2 or jsonb_array_length(result->'evidence')<>1 or (result->>'can_manage')::boolean then raise exception 'Student published multi-programme projection wrong'; end if;
 if result->'evidence'->0->>'feedback'<>'Published rubric evidence' then raise exception 'Draft feedback leaked'; end if;
 if jsonb_array_length(public.school_curriculum_learning('d3000000-0000-4000-8000-000000000007',true)->'alignments')<>0 then raise exception 'Draft exam alignment leaked'; end if;
 begin perform public.school_curriculum_list('programs'); raise exception 'Student opened Academic'; exception when insufficient_privilege then null; end;
 begin perform public.school_curriculum_save('evidence','{"status":"PUBLISHED"}',current_setting('test.curriculum.evidence')::uuid); raise exception 'Student changed evidence'; exception when insufficient_privilege then null; end;
 begin perform 1 from public.school_curriculum_evidence; raise exception 'Student bypassed projection'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000006',true);
do $$ declare result jsonb; begin
 result:=public.school_curriculum_learning('d3000000-0000-4000-8000-000000000007');
 if jsonb_array_length(result->'programs')<>1 or jsonb_array_length(result->'evidence')<>0 then raise exception 'Other student programme or grade leaked'; end if;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000008',true);
do $$ begin
 begin perform public.school_curriculum_learning('d3000000-0000-4000-8000-000000000007'); raise exception 'Unassigned teacher read progress'; exception when insufficient_privilege then null; end;
 begin perform public.school_curriculum_save('evidence','{"status":"PUBLISHED"}',current_setting('test.curriculum.evidence')::uuid); raise exception 'Unassigned teacher graded'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','d2000000-0000-4000-8000-000000000005',true);
do $$ begin
 begin perform public.school_curriculum_list('programs'); raise exception 'Owner opened Academic'; exception when insufficient_privilege then null; end;
 begin perform public.school_curriculum_learning('d3000000-0000-4000-8000-000000000007'); raise exception 'Other tenant read learning'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
