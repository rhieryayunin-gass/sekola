create table public.school_assessment_designs (
 exam_id uuid primary key references public.exams(id),tenant_id uuid not null references public.tenants(id),
 unit_id uuid references public.school_learning_units(id),source_exam_id uuid references public.exams(id),
 kind text not null default 'QUIZ' check(kind in ('QUIZ','DIAGNOSTIC','TEST','EXAM','RETAKE')),
 duration_minutes integer not null default 60 check(duration_minutes between 1 and 480),
 instructions text not null default '' check(length(instructions)<=10000),
 result_mode text not null default 'FEEDBACK' check(result_mode in ('SCORE','FEEDBACK','DISCUSSION')),
 blueprint jsonb not null default '[]' check(jsonb_typeof(blueprint)='array' and jsonb_array_length(blueprint)<=100),
 created_at timestamptz not null default now()
);
create table public.school_assessment_participants (
 tenant_id uuid not null references public.tenants(id),exam_id uuid not null references public.exams(id),student_id uuid not null references public.students(id),
 extra_minutes integer not null default 0 check(extra_minutes between 0 and 480),reason text check(length(reason)<=2000),primary key(exam_id,student_id)
);
alter table public.school_exam_attempts add column deadline timestamptz,add column reviewed_at timestamptz,add column released_at timestamptz;
-- Preserve previously published results; unreviewed calculations remain private.
update public.school_exam_attempts a set released_at=r.graded_at,reviewed_at=r.graded_at from public.exam_results r where r.exam_session_id=a.session_id and r.student_id=a.student_id and r.status='PUBLISHED';
alter table public.school_question_sets add column usage_scope text not null default 'RESTRICTED' check(usage_scope in ('PRACTICE','RESTRICTED'));

do $$ declare t text; begin foreach t in array array['school_assessment_designs','school_assessment_participants'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);execute format('create index on public.%I(tenant_id)',t);
 end loop;end $$;

create function school_private.exam_visible(exam_uuid uuid,student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.exams e where e.id=exam_uuid and e.status in ('PUBLISHED','CLOSED') and school_private.studio_visible('courses',e.course_id,student)
 and (not exists(select 1 from public.school_assessment_designs d where d.exam_id=e.id) or exists(select 1 from public.school_assessment_participants p where p.exam_id=e.id and p.student_id=student)))
$$;

create function school_private.assessment(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); eid uuid:=(payload->>'exam_id')::uuid; cid uuid:=(payload->>'course_id')::uuid; e public.exams; d public.school_assessment_designs; a public.school_exam_attempts; item jsonb; errors jsonb:='[]'; result jsonb; sid uuid; unit public.school_learning_units; uid uuid; total numeric; begin
 perform school_private.require_module('exams');
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>100000 then raise exception 'Invalid assessment request'; end if;
 if action='courses' then
 return coalesce((select jsonb_agg(school_private.studio_context(c.id) order by c.name) from public.courses c where c.tenant_id=t and school_private.teaches(c.id)),'[]');
 elsif action='course' then
 if not school_private.teaches(cid) then raise exception 'Course teacher required' using errcode='42501'; end if;
 return jsonb_build_object('context',school_private.studio_context(cid),
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title)) from public.school_learning_units where course_id=cid),'[]'),
 'outcomes',coalesce((select jsonb_agg(to_jsonb(o)) from public.school_curriculum_outcomes o where o.is_active and exists(select 1 from public.school_curriculum_course_links l where l.course_id=cid and l.curriculum_subject_id=o.curriculum_subject_id and l.is_active)),'[]'));
 elsif action='save' then
 if not school_private.teaches(cid) or not public.app_has_permission(auth.uid(),'exams.create') then raise exception 'Course teacher required' using errcode='42501'; end if;
 if eid is not null then select * into e from public.exams where id=eid and tenant_id=t and course_id=cid for update; if e.id is null or e.status<>'DRAFT' then raise exception 'Only a draft assessment may be edited'; end if; end if;
 if payload->>'unit_id' is not null and not exists(select 1 from public.school_learning_units where id=(payload->>'unit_id')::uuid and course_id=cid and tenant_id=t) then raise exception 'Choose a unit from this class'; end if;
 if jsonb_typeof(coalesce(payload->'blueprint','[]'))<>'array' then raise exception 'Invalid blueprint'; end if;
 for item in select value from jsonb_array_elements(coalesce(payload->'blueprint','[]')) loop
 if item->>'count' is null or item->>'weight' is null or (item->>'weight')::numeric::text in ('NaN','Infinity','-Infinity') or (item->>'count')::integer not between 1 and 100 or (item->>'weight')::numeric not between 0.01 and 100 or not exists(select 1 from public.school_curriculum_outcomes o join public.school_curriculum_course_links l on l.curriculum_subject_id=o.curriculum_subject_id where o.id=(item->>'outcome_id')::uuid and o.is_active and l.course_id=cid and l.is_active) then raise exception 'Choose mapped outcomes, question counts and positive weights'; end if;
 end loop;
 if eid is null then insert into public.exams(tenant_id,course_id,title,description,starts_at,ends_at) values(t,cid,payload->>'title',payload->>'instructions',(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz) returning id into eid;
 else update public.exams set title=payload->>'title',description=payload->>'instructions',starts_at=(payload->>'starts_at')::timestamptz,ends_at=(payload->>'ends_at')::timestamptz where id=eid; end if;
 insert into public.school_assessment_designs(exam_id,tenant_id,unit_id,kind,duration_minutes,instructions,result_mode,blueprint) values(eid,t,(payload->>'unit_id')::uuid,coalesce(payload->>'kind','QUIZ'),coalesce((payload->>'duration_minutes')::integer,60),coalesce(payload->>'instructions',''),coalesce(payload->>'result_mode','FEEDBACK'),coalesce(payload->'blueprint','[]')) on conflict(exam_id) do update set unit_id=excluded.unit_id,kind=excluded.kind,duration_minutes=excluded.duration_minutes,instructions=excluded.instructions,result_mode=excluded.result_mode,blueprint=excluded.blueprint;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id) values(t,auth.uid(),'SAVE','exams','assessment_studio',eid);
 return jsonb_build_object('id',eid);
 end if;
 select * into e from public.exams where id=eid and tenant_id=t;
 select * into d from public.school_assessment_designs where exam_id=eid;
 if e.id is null then raise exception 'Assessment not found' using errcode='42501'; end if;
 if action='ready' then
 select id into sid from public.students where user_id=auth.uid() and tenant_id=t;
 if not school_private.teaches(e.course_id) and not school_private.exam_visible(eid,sid) then raise exception 'Assessment access denied' using errcode='42501'; end if;
 return jsonb_build_object('id',e.id,'title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,'duration_minutes',coalesce(d.duration_minutes,ceil(extract(epoch from (e.ends_at-e.starts_at))/60)::integer),
 'instructions',coalesce(d.instructions,e.description,''),'result_mode',coalesce(d.result_mode,'FEEDBACK'),'extra_minutes',coalesce((select extra_minutes from public.school_assessment_participants where exam_id=eid and student_id=sid),0),'question_count',(select count(*) from public.school_exam_items where exam_id=eid),'server_time',now(),'attempt',(select jsonb_build_object('id',id,'status',status) from public.school_exam_attempts where exam_id=eid and user_id=auth.uid()));
 end if;
 if not school_private.teaches(e.course_id) then raise exception 'Course teacher required' using errcode='42501'; end if;
 if action in ('design','check') then
 if e.starts_at is null or e.ends_at is null or e.ends_at<=now() then errors:=errors||'"schedule"'::jsonb; end if;
 if not exists(select 1 from public.school_exam_items where exam_id=eid) then errors:=errors||'"questions"'::jsonb; end if;
 if exists(select 1 from public.school_learning_spaces where course_id=e.course_id and status<>'LIVE') then errors:=errors||'"class_draft"'::jsonb; end if;
 if d.unit_id is not null and not exists(select 1 from public.school_learning_units where id=d.unit_id and published) then errors:=errors||'"unit_draft"'::jsonb; end if;
 if not exists(select 1 from public.students s where s.tenant_id=t and school_private.studio_visible('courses',e.course_id,s.id) and (d.unit_id is null or school_private.studio_visible('units',d.unit_id,s.id))) then errors:=errors||'"participants"'::jsonb; end if;
 if jsonb_array_length(coalesce(d.blueprint,'[]'))>0 then
 select sum((v->>'weight')::numeric) into total from jsonb_array_elements(d.blueprint)v;
 if total is distinct from 100::numeric then errors:=errors||'"weights"'::jsonb; end if;
 for item in select value from jsonb_array_elements(d.blueprint) loop
 if (select count(*) from public.school_exam_items i where i.exam_id=eid and i.snapshot->>'outcome_id'=item->>'outcome_id') is distinct from (item->>'count')::bigint then errors:=errors||jsonb_build_array('coverage:'||(item->>'outcome_id')); end if;
 end loop;
 if exists(select 1 from public.school_exam_items i where i.exam_id=eid and not exists(select 1 from jsonb_array_elements(d.blueprint)v where v->>'outcome_id'=i.snapshot->>'outcome_id')) then errors:=errors||'"unmapped_questions"'::jsonb; end if;
 end if;
 return jsonb_build_object('exam',to_jsonb(e),'design',coalesce(to_jsonb(d),'{}'),'issues',errors,'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'question_id',question_id,'position',position,'content',snapshot) order by position) from public.school_exam_items where exam_id=eid),'[]'));
 elsif action='map_question' then
 if e.status<>'DRAFT' then raise exception 'Published questions are immutable'; end if;
 if not exists(select 1 from jsonb_array_elements(d.blueprint)v where v->>'outcome_id'=payload->>'outcome_id') then raise exception 'Select a blueprint outcome'; end if;
 update public.school_exam_items set snapshot=snapshot||jsonb_build_object('outcome_id',payload->>'outcome_id') where id=(payload->>'item_id')::uuid and exam_id=eid;
 elsif action='accommodation' then
 sid:=(payload->>'student_id')::uuid;
 if length(trim(coalesce(payload->>'reason','')))<3 or not exists(select 1 from public.school_assessment_participants where exam_id=eid and student_id=sid) then raise exception 'Select a participant and record the reason'; end if;
 update public.school_assessment_participants set extra_minutes=(payload->>'extra_minutes')::integer,reason=payload->>'reason' where exam_id=eid and student_id=sid;
 update public.school_exam_attempts set deadline=least(e.ends_at,started_at+make_interval(mins=>coalesce(d.duration_minutes,480)))+make_interval(mins=>(payload->>'extra_minutes')::integer) where exam_id=eid and student_id=sid and status='IN_PROGRESS';
 elsif action='release' then
 select * into a from public.school_exam_attempts where id=(payload->>'attempt_id')::uuid and exam_id=eid for update;
 if a.id is null or a.status<>'GRADED' or a.reviewed_at is null then raise exception 'Review this result before publication'; end if;
 if d.result_mode='DISCUSSION' and (now()<e.ends_at or exists(select 1 from public.school_exam_attempts where exam_id=eid and status='IN_PROGRESS')) then raise exception 'Discussion can be released after all attempts and the exam window have ended'; end if;
 update public.school_exam_attempts set released_at=now() where id=a.id;
 update public.exam_results set score=a.score,status='PUBLISHED',graded_at=now() where exam_session_id=a.session_id and student_id=a.student_id;
 elsif action='live' then
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select s.id as student_id,u.full_name,att.id as attempt_id,coalesce(att.status,'NOT_STARTED') as status,att.saved_at,att.submitted_at,att.deadline,att.score,att.reviewed_at,att.released_at,coalesce(p.extra_minutes,0) as extra_minutes
 from public.students s join public.users u on u.id=s.user_id left join public.school_exam_attempts att on att.student_id=s.id and att.exam_id=eid left join public.school_assessment_participants p on p.student_id=s.id and p.exam_id=eid
 where s.tenant_id=t and (p.student_id is not null or (d.exam_id is null and school_private.exam_visible(eid,s.id))) order by u.full_name limit 5000)q),'[]');
 elsif action='remedial' then
 perform school_private.require_module('learning');
 for sid in select value::uuid from jsonb_array_elements_text(payload->'student_ids') loop
 if not exists(select 1 from public.school_exam_attempts where exam_id=eid and student_id=sid and released_at is not null) then raise exception 'Choose learners with released results'; end if;end loop;
 if jsonb_array_length(coalesce(payload->'student_ids','[]'))=0 then raise exception 'Choose at least one learner'; end if;
 insert into public.school_learning_units(tenant_id,course_id,title,description,position,outcome_ids,student_ids,source_exam_id)
 values(t,e.course_id,payload->>'title',payload->>'description',coalesce((select max(position)+1 from public.school_learning_units where course_id=e.course_id),1),array(select (v->>'outcome_id')::uuid from jsonb_array_elements(coalesce(d.blueprint,'[]'))v),array(select value::uuid from jsonb_array_elements_text(payload->'student_ids')),eid) returning id into uid;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(t,auth.uid(),upper(action),'exams','assessment_studio',eid,jsonb_build_object('created_id',uid));
 return jsonb_build_object('id',uid,'course_id',e.course_id);
 elsif action='retake' then
 insert into public.exams(tenant_id,course_id,title,description) values(t,e.course_id,left(e.title||' · Retake',200),e.description) returning id into uid;
 insert into public.school_assessment_designs(exam_id,tenant_id,unit_id,source_exam_id,kind,duration_minutes,instructions,result_mode,blueprint) values(uid,t,d.unit_id,eid,'RETAKE',coalesce(d.duration_minutes,60),coalesce(d.instructions,''),coalesce(d.result_mode,'FEEDBACK'),coalesce(d.blueprint,'[]'));
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(t,auth.uid(),upper(action),'exams','assessment_studio',eid,jsonb_build_object('created_id',uid));
 return jsonb_build_object('id',uid,'course_id',e.course_id);
 else raise exception 'Unknown assessment action'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(t,auth.uid(),upper(action),'exams','assessment_studio',eid,jsonb_build_object('attempt_id',payload->'attempt_id','student_id',payload->'student_id','extra_minutes',payload->'extra_minutes','reason',payload->'reason'));
 return jsonb_build_object('id',eid);
end $$;
create function public.school_assessment(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select school_private.assessment(action,payload) $$;

alter function school_private.exam_manage(text,uuid,jsonb) rename to exam_manage_before_part7;
revoke all on function school_private.exam_manage_before_part7(text,uuid,jsonb) from public,anon,authenticated;
create function school_private.exam_manage(action text,exam_uuid uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.school_assessment_designs; e public.exams; result jsonb; begin
 perform school_private.require_module('exams');
 select * into e from public.exams where id=exam_uuid and tenant_id=school_private.tenant() for update;
 if e.id is null or not school_private.teaches(e.course_id) then raise exception 'Course teacher required' using errcode='42501'; end if;
 select * into d from public.school_assessment_designs where exam_id=exam_uuid;
 if action='questions' and d.kind='QUIZ' and exists(select 1 from jsonb_array_elements_text(payload) v join public.school_question_items qi on qi.id=v::uuid join public.school_question_sets qs on qs.id=qi.set_id where qs.usage_scope<>'PRACTICE') then raise exception 'Practice quizzes use practice question banks. Choose a restricted assessment purpose for exam banks.';end if;
 if action='publish' and e.status='DRAFT' and d.exam_id is not null then
 result:=school_private.assessment('check',jsonb_build_object('exam_id',exam_uuid));
 if jsonb_array_length(result->'issues')>0 then raise exception 'Resolve assessment readiness issues: %',result->'issues'; end if;
 insert into public.school_assessment_participants(tenant_id,exam_id,student_id)
 select e.tenant_id,e.id,s.id from public.students s where s.tenant_id=e.tenant_id and school_private.studio_visible('courses',e.course_id,s.id) and (d.unit_id is null or school_private.studio_visible('units',d.unit_id,s.id)) on conflict do nothing;
 -- Assign blueprint weights to the immutable paper, independent of bank edits.
 update public.school_exam_items i set snapshot=i.snapshot||jsonb_build_object('weight',(v->>'weight')::numeric/(v->>'count')::integer)
 from jsonb_array_elements(d.blueprint)v where i.exam_id=exam_uuid and i.snapshot->>'outcome_id'=v->>'outcome_id';
 end if;
 result:=school_private.exam_manage_before_part7(action,exam_uuid,payload);
 if action='questions' then update public.school_exam_items i set snapshot=i.snapshot||jsonb_build_object('explanation',q.explanation,'difficulty',q.difficulty) from public.school_question_items q where i.exam_id=exam_uuid and q.id=i.question_id;end if;
 return result;
end $$;

create or replace function school_private.exam_state(attempt_uuid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.school_exam_attempts; e public.exams; d public.school_assessment_designs; manages boolean; disclose boolean; visible_result boolean; begin
 perform school_private.require_module('exams');
 select * into a from public.school_exam_attempts where id=attempt_uuid and tenant_id=school_private.tenant();select * into e from public.exams where id=a.exam_id;select * into d from public.school_assessment_designs where exam_id=e.id;
 manages:=school_private.teaches(e.course_id);
 if a.id is null or not (manages or (a.user_id=auth.uid() and school_private.exam_visible(e.id,a.student_id))) then raise exception 'Attempt access denied' using errcode='42501'; end if;
 visible_result:=manages or a.released_at is not null;
 disclose:=manages or (a.released_at is not null and d.result_mode='DISCUSSION' and now()>=e.ends_at and not exists(select 1 from public.school_exam_attempts where exam_id=e.id and status='IN_PROGRESS'));
 return jsonb_build_object('attempt',to_jsonb(a)||jsonb_build_object('score',case when visible_result then a.score end,'feedback',case when manages or (visible_result and coalesce(d.result_mode,'FEEDBACK')<>'SCORE') then a.feedback end,'reviewed_at',case when manages then a.reviewed_at end),
 'title',e.title,'ends_at',coalesce(a.deadline,e.ends_at),'server_time',now(),'can_manage',manages,'result_released',a.released_at is not null,
 'questions',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'position',i.position,'content',case when disclose then i.snapshot else i.snapshot-'answer'-'explanation' end) order by i.position) from public.school_exam_items i where i.exam_id=e.id),'[]'));
end $$;

create or replace function school_private.exam_start(exam_uuid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); e public.exams; d public.school_assessment_designs; sid uuid; aid uuid; es uuid; extra integer:=0; begin
 perform school_private.require_module('exams');
 select * into e from public.exams where id=exam_uuid and tenant_id=t;select * into d from public.school_assessment_designs where exam_id=exam_uuid;
 select id into sid from public.students where user_id=auth.uid() and tenant_id=t and enrollment_status='ACTIVE';
 if sid is null or not school_private.exam_visible(exam_uuid,sid) then raise exception 'Student is not assigned to this exam' using errcode='42501'; end if;
 select id into aid from public.school_exam_attempts where exam_id=exam_uuid and student_id=sid;
 if aid is not null then return school_private.exam_state(aid); end if;
 if e.status<>'PUBLISHED' or e.starts_at>now() or e.ends_at<=now() then raise exception 'Exam is outside its open window'; end if;
 select id into es from public.exam_sessions where exam_id=exam_uuid and tenant_id=t and status='OPEN' order by created_at limit 1;
 if es is null then raise exception 'Exam is not ready'; end if;
 select coalesce(extra_minutes,0) into extra from public.school_assessment_participants where exam_id=exam_uuid and student_id=sid;
 insert into public.school_exam_attempts(tenant_id,exam_id,session_id,student_id,user_id,deadline) values(t,exam_uuid,es,sid,auth.uid(),case when d.exam_id is not null then least(e.ends_at,now()+make_interval(mins=>d.duration_minutes))+make_interval(mins=>coalesce(extra,0)) else e.ends_at end) on conflict(exam_id,student_id) do nothing;
 select id into aid from public.school_exam_attempts where exam_id=exam_uuid and student_id=sid;
 return school_private.exam_state(aid);
end $$;

create or replace function school_private.exam_save(attempt_uuid uuid,expected_revision integer,answer_data jsonb,submit boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.school_exam_attempts; e public.exams; key text; correct numeric; total numeric; essays integer; begin
 perform school_private.require_module('exams');
 select * into a from public.school_exam_attempts where id=attempt_uuid and tenant_id=school_private.tenant() and user_id=auth.uid() for update;
 if a.id is null then raise exception 'Attempt access denied' using errcode='42501'; end if;
 if a.status='IN_PROGRESS' then
 if a.revision is distinct from expected_revision then raise exception 'Another tab saved a newer answer. Reload before continuing.' using errcode='40001'; end if;
 select * into e from public.exams where id=a.exam_id;
 if jsonb_typeof(answer_data) is distinct from 'object' or octet_length(answer_data::text)>200000 then raise exception 'Invalid answers'; end if;
 for key in select jsonb_object_keys(answer_data) loop if not exists(select 1 from public.school_exam_items where id::text=key and exam_id=a.exam_id) or jsonb_typeof(answer_data->key)<>'string' or length(answer_data->>key)>10000 then raise exception 'Invalid question answer'; end if;end loop;
 if now()>coalesce(a.deadline,e.ends_at) or e.status='CLOSED' then answer_data:=a.answers;submit:=true;end if;
 update public.school_exam_attempts set answers=answer_data,revision=revision+1,saved_at=now() where id=a.id returning * into a;
 if submit then
 select sum(coalesce((snapshot->>'weight')::numeric,1)),count(*) filter(where snapshot->>'question_type'='ESSAY'),coalesce(sum(coalesce((snapshot->>'weight')::numeric,1)) filter(where snapshot->>'question_type'='MULTIPLE_CHOICE' and snapshot->>'answer'=answer_data->>id::text),0) into total,essays,correct from public.school_exam_items where exam_id=a.exam_id;
 update public.school_exam_attempts set status=case when essays>0 then 'SUBMITTED' else 'GRADED' end,submitted_at=now(),score=case when essays=0 then round(100*correct/nullif(total,0),2) end where id=a.id returning * into a;
 insert into public.exam_results(tenant_id,exam_session_id,student_id,score,status,graded_at) values(a.tenant_id,a.session_id,a.student_id,a.score,case when essays>0 then 'PENDING' else 'GRADED' end,case when essays=0 then now() end) on conflict(tenant_id,exam_session_id,student_id) do update set score=excluded.score,status=excluded.status,graded_at=excluded.graded_at;
 end if;end if;
 return jsonb_build_object('revision',a.revision,'status',a.status,'score',case when a.released_at is not null then a.score end,'saved_at',a.saved_at,'submitted_at',a.submitted_at,'receipt',case when a.submitted_at is not null then a.id end,'released_at',a.released_at,'deadline',a.deadline,'server_time',now());
end $$;

create or replace function school_private.exam_grade(attempt_uuid uuid,final_score numeric,note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.school_exam_attempts; begin
 perform school_private.require_module('exams');
 select s.* into a from public.school_exam_attempts s join public.exams e on e.id=s.exam_id where s.id=attempt_uuid and s.tenant_id=school_private.tenant() and school_private.teaches(e.course_id) for update of s;
 if a.id is null or a.status='IN_PROGRESS' or not public.app_has_permission(auth.uid(),'exam_results.update') then raise exception 'Submitted attempt and grading permission required' using errcode='42501'; end if;
 if final_score is null or final_score not between 0 and 100 or final_score::text in ('NaN','Infinity','-Infinity') or length(note)>10000 then raise exception 'Invalid grade'; end if;
 update public.school_exam_attempts set score=final_score,feedback=note,status='GRADED',reviewed_at=now(),released_at=null where id=a.id;
 update public.exam_results set score=final_score,status='GRADED',graded_at=now() where exam_session_id=a.session_id and student_id=a.student_id;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(a.tenant_id,auth.uid(),'REVIEW','exams','school_exam_attempts',a.id,jsonb_build_object('score',final_score));
 return jsonb_build_object('id',a.id,'score',final_score,'released',false);
end $$;

create or replace function school_private.exam_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); sid uuid; begin
 perform school_private.require_module('exams');select id into sid from public.students where user_id=auth.uid() and tenant_id=t;
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.starts_at nulls last) from (
 select e.id,e.title,e.course_id,e.starts_at,e.ends_at,e.status,school_private.teaches(e.course_id) as can_manage,d.unit_id,d.kind,d.duration_minutes,
 (select count(*) from public.school_exam_items i where i.exam_id=e.id) as question_count,
 (select a.status from public.school_exam_attempts a where a.exam_id=e.id and a.user_id=auth.uid()) as attempt_status,
 sid is not null as can_take,
 coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',u.full_name,'score',a.score)) from public.school_exam_attempts a join public.users u on u.id=a.user_id where a.exam_id=e.id and a.released_at is not null and a.student_id=sid),'[]') as child_results
 from public.exams e left join public.school_assessment_designs d on d.exam_id=e.id where e.tenant_id=t and (school_private.teaches(e.course_id) or school_private.exam_visible(e.id,sid)) order by e.created_at desc limit 500)q),'[]');
end $$;

-- Apply audience restrictions to older paths, not only the new screens.
alter function school_private.catalog(text,integer) rename to catalog_before_part7;
revoke all on function school_private.catalog_before_part7(text,integer) from public,anon,authenticated;
create function school_private.catalog(resource text,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; sid uuid; begin
 if resource in ('courses','lessons','assignments') and not school_private.role(array['TEACHER','STAFF','PRINCIPAL','OWNER']) then
 perform school_private.catalog_before_part7(resource,0);
 execute format('select coalesce(jsonb_agg(q),''[]'') from (select r.* from public.%I r where r.tenant_id=$1 and exists(select 1 from public.students st where st.tenant_id=$1 and school_private.child(st.id) and school_private.studio_visible($2,r.id,st.id)) order by r.id limit 500 offset $3)q',resource) into result using school_private.tenant(),resource,greatest(page_offset,0);
 else result:=school_private.catalog_before_part7(resource,page_offset);end if;return result;
end $$;
create or replace function public.list_student_learning(actor_id uuid,resource text,page_offset integer default 0,page_limit integer default 50) returns jsonb language plpgsql stable set search_path='' as $$
declare t uuid:=public.app_tenant(actor_id); sid uuid; result jsonb; begin
 if resource not in ('courses','lessons','assignments') or not public.app_has_permission(actor_id,resource||'.read') then raise exception 'Missing permission' using errcode='42501'; end if;
 select id into sid from public.students where user_id=actor_id and tenant_id=t;
 execute format('select coalesce(jsonb_agg(q),''[]'') from (select r.* from public.%I r where r.tenant_id=$1 and school_private.studio_visible($2,r.id,$3) order by r.created_at desc,r.id offset $4 limit $5)q',resource) into result using t,resource,sid,greatest(page_offset,0),least(greatest(page_limit,1),100);
 return result;
end $$;

revoke all on function school_private.exam_visible(uuid,uuid),school_private.assessment(text,jsonb),public.school_assessment(text,jsonb),school_private.exam_manage(text,uuid,jsonb),school_private.catalog(text,integer) from public,anon,authenticated;
grant execute on function school_private.assessment(text,jsonb),public.school_assessment(text,jsonb),school_private.exam_manage(text,uuid,jsonb),school_private.catalog(text,integer) to authenticated;

-- Narrow read projections: no additional administrative REST grants for families.
create or replace function school_private.family_report(kind text,student uuid,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); result jsonb; begin
 if kind not in ('academic','learning','exams') or page_offset<0 or page_offset>100000 then raise exception 'Invalid report'; end if;
 if not school_private.role(array['STUDENT','PARENT']) or not school_private.child(student) or not exists(select 1 from public.students where id=student and tenant_id=tenant)
 or (kind='academic' and not school_private.role(array['STUDENT']))
 or not exists(select 1 from public.tenants t left join public.school_settings s on s.tenant_id=t.id where t.id=tenant and t.is_active and coalesce(s.modules->kind,'true'::jsonb)='true'::jsonb)
 then raise exception 'Family report access denied' using errcode='42501'; end if;
 if kind='academic' then
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
 select c.id,c.name as title,cl.name as classroom,ay.name as academic_year,se.name as semester,su.name as subject,
 coalesce((select jsonb_agg(jsonb_build_object('name',p.name,'version',p.version,'framework',p.framework)) from public.school_curriculum_course_links l join public.school_curriculum_programs p on p.id=l.program_id where l.course_id=c.id and l.is_active and p.is_active and school_private.curriculum_enrolled(c.id,l.curriculum_subject_id,student)),'[]') as programmes
 from public.courses c join public.classrooms cl on cl.id=c.classroom_id join public.academic_years ay on ay.id=c.academic_year_id join public.semesters se on se.id=c.semester_id join public.subjects su on su.id=c.subject_id
 where c.tenant_id=tenant and c.is_active and exists(select 1 from public.student_assignments a where a.student_id=student and a.tenant_id=tenant and a.classroom_id=c.classroom_id and a.semester_id=c.semester_id and a.is_active)
 order by c.name,c.id limit 100 offset page_offset)q;
 elsif kind='learning' then
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
 select a.id,a.title,c.name as course,a.due_at,s.submitted_at,case when s.reviewed_at is not null then s.score else null end as score,
 a.max_score,case when s.reviewed_at is not null then s.feedback else null end as feedback,
 case when s.reviewed_at is not null then 'REVIEWED' when s.submitted_at is not null then 'SUBMITTED' else 'PENDING' end as status
 from public.assignments a join public.courses c on c.id=a.course_id left join public.submissions s on s.assignment_id=a.id and s.student_id=student and s.tenant_id=tenant
 where a.tenant_id=tenant and school_private.studio_visible('assignments',a.id,student) and exists(select 1 from public.student_assignments sa where sa.student_id=student and sa.classroom_id=c.classroom_id and sa.semester_id=c.semester_id and sa.tenant_id=tenant and sa.is_active)
 order by a.due_at desc nulls last,a.id limit 100 offset page_offset)q;
 else
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
 select es.id,e.title,c.name as course,es.starts_at,es.ends_at,es.status,
 case when r.status='PUBLISHED' then r.score else null end as score,case when r.status='PUBLISHED' then 'PUBLISHED' else 'PENDING' end as result_status
 from public.exam_sessions es join public.exams e on e.id=es.exam_id join public.courses c on c.id=e.course_id left join public.exam_results r on r.exam_session_id=es.id and r.student_id=student and r.tenant_id=tenant
 where es.tenant_id=tenant and school_private.exam_visible(e.id,student) and (es.student_id is null or es.student_id=student) and exists(select 1 from public.student_assignments sa where sa.student_id=student and sa.classroom_id=es.classroom_id and sa.semester_id=c.semester_id and sa.tenant_id=tenant and sa.is_active)
 order by es.starts_at desc,es.id limit 100 offset page_offset)q;
 end if;
 return jsonb_build_object('rows',result,'student',(select jsonb_build_object('id',s.id,'name',u.full_name,'number',s.student_number) from public.students s join public.users u on u.id=s.user_id where s.id=student and s.tenant_id=tenant),'school',(select name from public.tenants where id=tenant));
end $$;

-- Audience-aware notifications and the same shared Calendar Center.
alter function public.integration_recipients(text,jsonb) rename to integration_recipients_before_part7;
revoke all on function public.integration_recipients_before_part7(text,jsonb) from public,anon,authenticated;
create function public.integration_recipients(source text,row_data jsonb) returns setof uuid language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=(row_data->>'tenant_id')::uuid; cid uuid:=(row_data->>'course_id')::uuid; eid uuid; sid uuid:=(row_data->>'student_id')::uuid; aid uuid; begin
 if source not in ('courses','lessons','assignments','submissions','exams','exam_sessions','exam_results') then return query select public.integration_recipients_before_part7(source,row_data);return;end if;
 if source='courses' then cid:=(row_data->>'id')::uuid;end if;
 if source='submissions' then aid:=(row_data->>'assignment_id')::uuid; select course_id into cid from public.assignments where id=aid;end if;
 if source='exams' then eid:=(row_data->>'id')::uuid;end if;
 if source='exam_sessions' then eid:=(row_data->>'exam_id')::uuid;select course_id into cid from public.exams where id=eid;
 -- A Studio assessment has one calendar event, keyed by its exam, not a second session event.
 if exists(select 1 from public.school_assessment_designs where exam_id=eid) then return;end if;end if;
 if source='exam_results' then select es.exam_id,e.course_id into eid,cid from public.exam_sessions es join public.exams e on e.id=es.exam_id where es.id=(row_data->>'exam_session_id')::uuid;end if;
 -- Teachers receive operational changes; students and parents see published work only.
 return query select te.user_id from public.courses c join public.teachers te on te.id=c.teacher_id join public.users u on u.id=te.user_id where c.id=cid and c.tenant_id=tenant and u.is_active and (source<>'submissions' or row_data->>'submitted_at' is not null);
 if source='submissions' and row_data->>'reviewed_at' is null then return;end if;
 if source='exam_results' and row_data->>'status'<>'PUBLISHED' then return;end if;
 return query select distinct audience.user_id from public.students st cross join lateral (
 select st.user_id union select g.parent_user_id from public.school_guardians g where g.student_id=st.id and g.tenant_id=tenant
 ) audience join public.users u on u.id=audience.user_id and u.is_active and u.tenant_id=tenant
 where st.tenant_id=tenant and (sid is null or st.id=sid) and case
 when source in ('courses','lessons','assignments') then school_private.studio_visible(source,(row_data->>'id')::uuid,st.id)
 when source='submissions' then school_private.studio_visible('assignments',aid,st.id)
 else school_private.exam_visible(eid,st.id) end;
end $$;
revoke all on function public.integration_recipients(text,jsonb) from public,anon,authenticated;
grant execute on function public.integration_recipients(text,jsonb),public.integration_recipients_before_part7(text,jsonb) to service_role;

-- Reconcile activity visibility when a class/unit is published, paused or retargeted.
-- No broadcast is sent by this reconciliation; normal activity changes notify their audience.
create function school_private.studio_sync_audience() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid:=new.course_id; rec record; recipient uuid; cal uuid; source_data jsonb; starts timestamptz; ends timestamptz;begin
 for rec in
 select 'courses' as source,to_jsonb(c) as data from public.courses c where c.id=cid
 union all select 'lessons',to_jsonb(l) from public.lessons l where l.course_id=cid
 union all select 'assignments',to_jsonb(a) from public.assignments a where a.course_id=cid
 union all select 'exams',to_jsonb(e) from public.exams e where e.course_id=cid
 loop
 source_data:=rec.data;
 starts:=case rec.source when 'lessons' then (source_data->>'scheduled_at')::timestamptz when 'assignments' then (source_data->>'due_at')::timestamptz else (source_data->>'starts_at')::timestamptz end;
 ends:=case when rec.source='exams' then (source_data->>'ends_at')::timestamptz else starts end;
 delete from public.calendar_events ev using public.calendars c where ev.calendar_id=c.id and ev.source_table=rec.source and ev.source_id=(source_data->>'id')::uuid and c.owner_user_id not in(select public.integration_recipients(rec.source,source_data));
 delete from public.notifications n where n.resource_type=rec.source and n.resource_id=(source_data->>'id')::uuid and n.user_id not in(select public.integration_recipients(rec.source,source_data));
 if starts is not null and (case when rec.source='exams' then source_data->>'status'='PUBLISHED' else (source_data->>'is_published')::boolean end) then
 for recipient in select public.integration_recipients(rec.source,source_data) loop
 insert into public.calendars(tenant_id,owner_user_id,name,integration_managed) values(new.tenant_id,recipient,'osekola integrated calendar',true) on conflict(tenant_id,owner_user_id) where integration_managed do update set is_active=true returning id into cal;
 insert into public.calendar_events(calendar_id,title,starts_at,ends_at,event_type,source_table,source_id) values(cal,source_data->>'title',starts,ends,'DEADLINE',rec.source,(source_data->>'id')::uuid) on conflict(calendar_id,source_table,source_id) do update set title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at;
 end loop;end if;
 end loop;return new;
end $$;
create trigger studio_space_audience after insert or update on public.school_learning_spaces for each row execute function school_private.studio_sync_audience();
create trigger studio_unit_audience after insert or update on public.school_learning_units for each row execute function school_private.studio_sync_audience();
revoke all on function school_private.studio_sync_audience() from public,anon,authenticated;

-- Classify reusable practice banks separately from restricted assessment banks.
alter function school_private.question_save(text,jsonb,uuid) rename to question_save_before_part7;
revoke all on function school_private.question_save_before_part7(text,jsonb,uuid) from public,anon,authenticated;
create function school_private.question_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if kind='scope' then
 perform school_private.require_module('learning');
 if payload->>'usage_scope' not in ('PRACTICE','RESTRICTED') or not exists(select 1 from public.school_question_sets s where s.id=record_id and s.tenant_id=school_private.tenant() and school_private.teaches(s.course_id)) then raise exception 'Course teacher and valid bank usage required' using errcode='42501';end if;
 update public.school_question_sets set usage_scope=payload->>'usage_scope' where id=record_id returning to_jsonb(school_question_sets.*) into result;
 else
 result:=school_private.question_save_before_part7(kind,payload-'usage_scope',record_id);
 if kind='set' then update public.school_question_sets set usage_scope=coalesce(payload->>'usage_scope','RESTRICTED') where id=(result->>'id')::uuid returning to_jsonb(school_question_sets.*) into result;end if;
 end if;return result;
end $$;
revoke all on function school_private.question_save(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function school_private.question_save(text,jsonb,uuid) to authenticated;

create or replace function school_private.role_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); broad boolean:=school_private.role(array['PRINCIPAL','STAFF']); result jsonb; begin
 result:=school_private.dashboard();
 return result || jsonb_build_object('attendance_trend',coalesce((select jsonb_agg(to_jsonb(q)) from (
 select d::date as day,count(r.id) filter(where r.status in ('PRESENT','LATE')) as present,count(r.id) as recorded
 from generate_series((now() at time zone 'Asia/Jakarta')::date-6,(now() at time zone 'Asia/Jakarta')::date,interval '1 day')d
 left join public.attendance_records r on r.attendance_date=d::date and r.tenant_id=tenant and (broad or school_private.class_teaches(r.classroom_id) or school_private.child(r.student_id))
 group by d order by d)q),'[]'),
 'teaching_courses',(select count(*) from public.courses c where c.tenant_id=tenant and c.is_active and school_private.teaches(c.id)),
 'assignments_to_review',(select count(*) from public.submissions s join public.assignments a on a.id=s.assignment_id where s.tenant_id=tenant and s.submitted_at is not null and s.reviewed_at is null and school_private.teaches(a.course_id)),
 'family_tasks',(select count(*) from public.assignments a join public.courses c on c.id=a.course_id where a.tenant_id=tenant and a.is_published and exists(select 1 from public.student_assignments sa where sa.classroom_id=c.classroom_id and sa.semester_id=c.semester_id and sa.is_active and school_private.child(sa.student_id) and school_private.studio_visible('assignments',a.id,sa.student_id) and not exists(select 1 from public.submissions su where su.assignment_id=a.id and su.student_id=sa.student_id and su.submitted_at is not null))),
 'family_balance',case when school_private.role(array['PARENT']) then (select coalesce(sum(greatest(0,b.amount-coalesce(p.paid,0))),0) from public.student_bills b left join lateral(select sum(amount) paid from public.payments where student_bill_id=b.id and status='CONFIRMED')p on true where b.tenant_id=tenant and b.status not in ('VOID','DRAFT') and school_private.child(b.student_id)) else null end);
end $$;

-- Recheck source visibility at read time as enrolments may change after an event was created.
alter function school_private.calendar_context(timestamptz,timestamptz) rename to calendar_context_before_part7;
revoke all on function school_private.calendar_context_before_part7(timestamptz,timestamptz) from public,anon,authenticated;
create function school_private.calendar_context(starts timestamptz,ends timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:=school_private.calendar_context_before_part7(starts,ends);ev jsonb;source_data jsonb;visible jsonb:='[]';begin
 for ev in select value from jsonb_array_elements(result->'events') loop
 if ev->>'source_table' in ('courses','lessons','assignments','submissions','exams','exam_sessions','exam_results') then
 execute format('select to_jsonb(r) from public.%I r where r.id=$1',ev->>'source_table') into source_data using (ev->>'source_id')::uuid;
 if source_data is null or not exists(select 1 from public.integration_recipients(ev->>'source_table',source_data) u where u=auth.uid()) then continue;end if;
 end if;
 visible:=visible||jsonb_build_array(ev);
 end loop;
 return jsonb_set(result,'{events}',visible);
end $$;
revoke all on function school_private.calendar_context(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function school_private.calendar_context(timestamptz,timestamptz) to authenticated;
