-- Question review, bounded AI reservations and independently locked exam attempts.
create table public.school_question_sets (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 course_id uuid not null references public.courses(id),lesson_id uuid references public.lessons(id),assignment_id uuid references public.assignments(id),
 title text not null check(length(title) between 2 and 200),grade_level integer not null check(grade_level between 1 and 12),
 created_by uuid not null references public.users(id),created_at timestamptz not null default now()
);
create table public.school_question_items (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),set_id uuid not null references public.school_question_sets(id) on delete cascade,
 question_type text not null check(question_type in ('MULTIPLE_CHOICE','ESSAY')),prompt text not null check(length(prompt) between 5 and 10000),
 options jsonb not null default '[]' check(jsonb_typeof(options)='array'),answer text not null check(length(answer)<=10000),explanation text,
 difficulty text not null check(difficulty in ('EASY','MEDIUM','HARD')),diagram jsonb,
 source text not null default 'MANUAL' check(source in ('MANUAL','AI')),review_status text not null default 'DRAFT' check(review_status in ('DRAFT','APPROVED','REJECTED')),
 reviewed_by uuid references public.users(id),reviewed_at timestamptz,created_at timestamptz not null default now(),
 check(review_status<>'APPROVED' or (reviewed_by is not null and reviewed_at is not null)),
 check(question_type<>'MULTIPLE_CHOICE' or (jsonb_array_length(options) between 2 and 6 and options ? answer))
);
create table public.school_ai_generations (
 id uuid primary key,tenant_id uuid not null references public.tenants(id),user_id uuid not null references public.users(id),set_id uuid not null references public.school_question_sets(id),
 status text not null default 'RESERVED' check(status in ('RESERVED','COMPLETED','FAILED')),
 requested_count integer not null check(requested_count between 1 and 20),model text, input_tokens integer,output_tokens integer,
 created_at timestamptz not null default now(),completed_at timestamptz
);
create index school_generation_user_day on public.school_ai_generations(user_id,created_at desc);
create index school_generation_tenant_day on public.school_ai_generations(tenant_id,created_at desc);
create table public.school_exam_items (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),exam_id uuid not null references public.exams(id),question_id uuid not null references public.school_question_items(id),
 position integer not null check(position between 1 and 100),snapshot jsonb not null,unique(exam_id,position),unique(exam_id,question_id)
);
create table public.school_exam_attempts (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),exam_id uuid not null references public.exams(id),session_id uuid not null references public.exam_sessions(id),
 student_id uuid not null references public.students(id),user_id uuid not null references public.users(id),
 status text not null default 'IN_PROGRESS' check(status in ('IN_PROGRESS','SUBMITTED','GRADED')),
 answers jsonb not null default '{}' check(jsonb_typeof(answers)='object'),revision integer not null default 0 check(revision>=0),
 score numeric(6,2) check(score between 0 and 100),feedback text,started_at timestamptz not null default now(),saved_at timestamptz not null default now(),submitted_at timestamptz,
 unique(exam_id,student_id)
);
create index school_attempts_exam_status on public.school_exam_attempts(exam_id,status);
create index school_attempts_user on public.school_exam_attempts(user_id);
do $$ declare t text; maps jsonb; begin
 foreach t in array array['school_question_sets','school_question_items','school_ai_generations','school_exam_items','school_exam_attempts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('create index on public.%I(tenant_id)',t);
 select jsonb_object_agg(a.attname,ft.relname) into maps from pg_constraint c join pg_class ft on ft.oid=c.confrelid join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.conrelid=('public.'||t)::regclass and c.contype='f' and a.attname<>'tenant_id' and exists(select 1 from pg_attribute ta where ta.attrelid=ft.oid and ta.attname='tenant_id');
 execute format('create trigger tenant_integrity before insert or update on public.%I for each row execute function public.enforce_tenant_relations(%L)',t,coalesce(maps,'{}')::text);
 end loop; end $$;
create index school_questions_set on public.school_question_items(set_id,created_at);

create function school_private.teaches(course uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses c where c.id=course and c.tenant_id=school_private.tenant() and (school_private.staff() or exists(select 1 from public.teachers t where t.id=c.teacher_id and t.user_id=auth.uid())))
$$;
create function school_private.question_bank(set_uuid uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); begin
 perform school_private.require_module('learning');
 if not public.app_has_permission(auth.uid(),'exam_questions.read') then raise exception 'Teacher access required' using errcode='42501'; end if;
 return jsonb_build_object('sets',coalesce((select jsonb_agg(to_jsonb(s)) from public.school_question_sets s where s.tenant_id=tenant and school_private.teaches(s.course_id)),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at,q.id) from public.school_question_items q join public.school_question_sets s on s.id=q.set_id where q.set_id=set_uuid and q.tenant_id=tenant and school_private.teaches(s.course_id)),'[]'));
end $$;
create function public.school_question_bank(set_uuid uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.question_bank(set_uuid) $$;

create function school_private.question_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); course uuid; question_set uuid; result jsonb; review text; begin
 perform school_private.require_module('learning');
 if not public.app_has_permission(auth.uid(),'exam_questions.create') or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>40000 then raise exception 'Teacher access and valid question required' using errcode='42501'; end if;
 if kind='set' then
 course:=(payload->>'course_id')::uuid;
 if not school_private.teaches(course) then raise exception 'Course access denied' using errcode='42501'; end if;
 if payload->>'lesson_id' is not null and not exists(select 1 from public.lessons where id=(payload->>'lesson_id')::uuid and course_id=course) then raise exception 'Lesson belongs to another course' using errcode='23514'; end if;
 if payload->>'assignment_id' is not null and not exists(select 1 from public.assignments where id=(payload->>'assignment_id')::uuid and course_id=course) then raise exception 'Assignment belongs to another course' using errcode='23514'; end if;
 insert into public.school_question_sets(tenant_id,course_id,lesson_id,assignment_id,title,grade_level,created_by) values(tenant,course,(payload->>'lesson_id')::uuid,(payload->>'assignment_id')::uuid,payload->>'title',(payload->>'grade_level')::integer,auth.uid()) returning to_jsonb(school_question_sets.*) into result;
 elsif kind in ('item','delete') then
 if record_id is null then question_set:=(payload->>'set_id')::uuid; else select set_id into question_set from public.school_question_items where id=record_id and tenant_id=tenant; end if;
 select course_id into course from public.school_question_sets where id=question_set and tenant_id=tenant;
 if course is null or not school_private.teaches(course) then raise exception 'Question bank access denied' using errcode='42501'; end if;
 if kind='delete' then
 delete from public.school_question_items where id=record_id and tenant_id=tenant returning jsonb_build_object('id',id) into result;
 else
 review:=coalesce(payload->>'review_status','DRAFT');
 if record_id is null then
 insert into public.school_question_items(tenant_id,set_id,question_type,prompt,options,answer,explanation,difficulty,diagram,source,review_status,reviewed_by,reviewed_at)
 values(tenant,question_set,payload->>'question_type',payload->>'prompt',coalesce(payload->'options','[]'),payload->>'answer',payload->>'explanation',payload->>'difficulty',payload->'diagram',case when payload->>'source'='AI' then 'AI' else 'MANUAL' end,review,case when review='APPROVED' then auth.uid() end,case when review='APPROVED' then now() end) returning to_jsonb(school_question_items.*) into result;
 else
 update public.school_question_items set question_type=payload->>'question_type',prompt=payload->>'prompt',options=coalesce(payload->'options','[]'),answer=payload->>'answer',explanation=payload->>'explanation',difficulty=payload->>'difficulty',diagram=payload->'diagram',source=case when payload->>'source'='AI' then 'AI' else source end,review_status=review,reviewed_by=case when review='APPROVED' then auth.uid() end,reviewed_at=case when review='APPROVED' then now() end where id=record_id and tenant_id=tenant returning to_jsonb(school_question_items.*) into result;
 end if;
 end if;
 else raise exception 'Unsupported operation'; end if;
 return result;
end $$;
create function public.school_question_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.question_save(kind,payload,record_id) $$;

create function school_private.ai_reserve(request_id uuid,set_uuid uuid,question_count integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); course uuid; result jsonb; begin
 perform school_private.require_module('learning');
 select course_id into course from public.school_question_sets where id=set_uuid and tenant_id=tenant;
 if course is null or not school_private.teaches(course) or not public.app_has_permission(auth.uid(),'exam_questions.create') then raise exception 'Question bank access denied' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,938));
 if exists(select 1 from public.school_ai_generations where id=request_id) then raise exception 'Generation request already exists' using errcode='23505'; end if;
 if (select count(*) from public.school_ai_generations where tenant_id=tenant and created_at>now()-interval '1 day')>=50 or (select count(*) from public.school_ai_generations where user_id=auth.uid() and created_at>now()-interval '1 day')>=10 then raise exception 'Daily question generation limit reached' using errcode='P0001'; end if;
 insert into public.school_ai_generations(id,tenant_id,user_id,set_id,requested_count) values(request_id,tenant,auth.uid(),set_uuid,question_count);
 select jsonb_build_object('id',request_id,'title',s.title,'grade_level',s.grade_level,'course',c.name,'subject',su.name,'lesson',l.title,'material',left(coalesce(l.material,''),6000)) into result from public.school_question_sets s join public.courses c on c.id=s.course_id join public.subjects su on su.id=c.subject_id left join public.lessons l on l.id=s.lesson_id where s.id=set_uuid;
 return result;
end $$;
create function public.school_ai_reserve(request_id uuid,set_uuid uuid,question_count integer) returns jsonb language sql security invoker set search_path='' as $$ select school_private.ai_reserve(request_id,set_uuid,question_count) $$;
create function school_private.ai_finish(request_id uuid,items jsonb,usage_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare generation public.school_ai_generations; item jsonb; count integer:=0; begin
 select * into generation from public.school_ai_generations where id=request_id and tenant_id=school_private.tenant() and user_id=auth.uid() for update;
 if generation.id is null then raise exception 'Generation not found' using errcode='42501'; end if;
 if generation.status<>'RESERVED' then return jsonb_build_object('id',request_id,'status',generation.status); end if;
 if items is not null then
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)<>generation.requested_count then raise exception 'Unexpected question count'; end if;
 if usage_data->>'replace_id' is not null and (generation.requested_count<>1 or not exists(select 1 from public.school_question_items where id=(usage_data->>'replace_id')::uuid and set_id=generation.set_id and tenant_id=generation.tenant_id)) then raise exception 'Invalid question replacement'; end if;
 for item in select value from jsonb_array_elements(items) loop
 perform school_private.question_save('item',item||jsonb_build_object('set_id',generation.set_id,'source','AI','review_status','DRAFT'),(usage_data->>'replace_id')::uuid); count:=count+1;
 end loop; end if;
 update public.school_ai_generations set status=case when items is null then 'FAILED' else 'COMPLETED' end,model=left(usage_data->>'model',120),input_tokens=greatest(0,(usage_data->>'input_tokens')::integer),output_tokens=greatest(0,(usage_data->>'output_tokens')::integer),completed_at=now() where id=request_id;
 return jsonb_build_object('id',request_id,'saved',count);
end $$;
create function public.school_ai_finish(request_id uuid,items jsonb,usage_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select school_private.ai_finish(request_id,items,usage_data) $$;

create function school_private.exam_manage(action text,exam_uuid uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare exam public.exams; item jsonb; question public.school_question_items; idx integer:=0; begin
 perform school_private.require_module('exams');
 select * into exam from public.exams where id=exam_uuid and tenant_id=school_private.tenant() for update;
 if exam.id is null or not school_private.teaches(exam.course_id) or not public.app_has_permission(auth.uid(),'exams.update') then raise exception 'Exam access denied' using errcode='42501'; end if;
 if action='questions' then
 if exam.status<>'DRAFT' or exists(select 1 from public.school_exam_attempts where exam_id=exam_uuid) then raise exception 'Questions are locked after publication'; end if;
 if jsonb_typeof(payload)<>'array' or jsonb_array_length(payload) not between 1 and 100 then raise exception 'Choose 1–100 approved questions'; end if;
 delete from public.school_exam_items where exam_id=exam_uuid and tenant_id=exam.tenant_id;
 for item in select value from jsonb_array_elements(payload) loop
 select q.* into question from public.school_question_items q join public.school_question_sets s on s.id=q.set_id where q.id=(item#>>'{}')::uuid and q.tenant_id=exam.tenant_id and s.course_id=exam.course_id and q.review_status='APPROVED';
 if question.id is null then raise exception 'Select an approved question from this course'; end if;
 idx:=idx+1; insert into public.school_exam_items(tenant_id,exam_id,question_id,position,snapshot) values(exam.tenant_id,exam_uuid,question.id,idx,jsonb_build_object('question_type',question.question_type,'prompt',question.prompt,'options',question.options,'answer',question.answer,'diagram',question.diagram));
 end loop;
 elsif action='publish' then
 if exam.starts_at is null or exam.ends_at is null or exam.ends_at<=now() or not exists(select 1 from public.school_exam_items where exam_id=exam_uuid) then raise exception 'Add questions and a valid exam window first'; end if;
 if exam.status='DRAFT' then
 insert into public.exam_sessions(tenant_id,exam_id,classroom_id,starts_at,ends_at,status) select exam.tenant_id,exam.id,c.classroom_id,exam.starts_at,exam.ends_at,'OPEN' from public.courses c where c.id=exam.course_id;
 update public.exams set status='PUBLISHED' where id=exam.id;
 end if;
 elsif action='close' then update public.exams set status='CLOSED' where id=exam.id;
 else raise exception 'Unsupported action'; end if;
 return jsonb_build_object('id',exam_uuid,'action',action);
end $$;
create function public.school_exam_manage(action text,exam_uuid uuid,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select school_private.exam_manage(action,exam_uuid,payload) $$;

create function school_private.exam_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); begin
 perform school_private.require_module('exams');
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.starts_at) from (
 select e.id,e.title,e.course_id,e.starts_at,e.ends_at,e.status,school_private.teaches(e.course_id) as can_manage,
 (select count(*) from public.school_exam_items i where i.exam_id=e.id) as question_count,
 (select a.status from public.school_exam_attempts a where a.exam_id=e.id and a.user_id=auth.uid()) as attempt_status,
 exists(select 1 from public.students s where s.user_id=auth.uid() and s.tenant_id=tenant) as can_take,
 coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',u.full_name,'score',a.score)) from public.school_exam_attempts a join public.students s on s.id=a.student_id join public.users u on u.id=s.user_id where a.exam_id=e.id and a.status='GRADED' and school_private.child(a.student_id)),'[]') as child_results
 from public.exams e join public.courses c on c.id=e.course_id where e.tenant_id=tenant and (school_private.teaches(e.course_id) or (e.status in ('PUBLISHED','CLOSED') and exists(select 1 from public.student_assignments a where a.classroom_id=c.classroom_id and a.semester_id=c.semester_id and a.is_active and school_private.child(a.student_id)))) limit 200
 )q),'[]');
end $$;
create function public.school_exam_list() returns jsonb language sql security invoker set search_path='' as $$ select school_private.exam_list() $$;

create function school_private.exam_state(attempt_uuid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare attempt public.school_exam_attempts; exam public.exams; can_manage boolean; begin
 perform school_private.require_module('exams');
 select * into attempt from public.school_exam_attempts where id=attempt_uuid and tenant_id=school_private.tenant();
 select * into exam from public.exams where id=attempt.exam_id;
 can_manage:=school_private.teaches(exam.course_id);
 if attempt.id is null or not (attempt.user_id=auth.uid() or can_manage or (school_private.child(attempt.student_id) and attempt.status='GRADED')) then raise exception 'Attempt access denied' using errcode='42501'; end if;
 return jsonb_build_object('attempt',to_jsonb(attempt),'title',exam.title,'ends_at',exam.ends_at,'server_time',now(),'can_manage',can_manage,'questions',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'position',i.position,'content',case when can_manage then i.snapshot else i.snapshot-'answer'-'explanation' end) order by i.position) from public.school_exam_items i where i.exam_id=exam.id),'[]'));
end $$;
create function public.school_exam_state(attempt_uuid uuid) returns jsonb language sql security invoker set search_path='' as $$ select school_private.exam_state(attempt_uuid) $$;

create function school_private.exam_start(exam_uuid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); exam public.exams; student uuid; session uuid; attempt uuid; begin
 perform school_private.require_module('exams');
 select * into exam from public.exams where id=exam_uuid and tenant_id=tenant;
 select s.id into student from public.students s join public.student_assignments a on a.student_id=s.id join public.courses c on c.classroom_id=a.classroom_id and c.semester_id=a.semester_id where s.user_id=auth.uid() and s.tenant_id=tenant and s.enrollment_status='ACTIVE' and a.is_active and c.id=exam.course_id limit 1;
 if student is null then raise exception 'Student is not assigned to this exam' using errcode='42501'; end if;
 select id into attempt from public.school_exam_attempts where exam_id=exam_uuid and student_id=student;
 if attempt is not null then return school_private.exam_state(attempt); end if;
 if exam.status<>'PUBLISHED' or exam.starts_at>now() or exam.ends_at<=now() then raise exception 'Exam is outside its open window'; end if;
 select es.id into session from public.exam_sessions es where es.exam_id=exam_uuid and es.tenant_id=tenant and es.status='OPEN' order by es.created_at limit 1;
 if session is null or not exists(select 1 from public.school_exam_items where exam_id=exam_uuid) then raise exception 'Exam is not ready'; end if;
 insert into public.school_exam_attempts(tenant_id,exam_id,session_id,student_id,user_id) values(tenant,exam_uuid,session,student,auth.uid()) on conflict(exam_id,student_id) do nothing;
 select id into attempt from public.school_exam_attempts where exam_id=exam_uuid and student_id=student;
 return school_private.exam_state(attempt);
end $$;
create function public.school_exam_start(exam_uuid uuid) returns jsonb language sql security invoker set search_path='' as $$ select school_private.exam_start(exam_uuid) $$;

create function school_private.exam_save(attempt_uuid uuid,expected_revision integer,answer_data jsonb,submit boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.school_exam_attempts; exam public.exams; key text; correct integer; total integer; essays integer; begin
 perform school_private.require_module('exams');
 select * into attempt from public.school_exam_attempts where id=attempt_uuid and tenant_id=school_private.tenant() and user_id=auth.uid() for update;
 if attempt.id is null then raise exception 'Attempt access denied' using errcode='42501'; end if;
 if attempt.status<>'IN_PROGRESS' then return jsonb_build_object('revision',attempt.revision,'status',attempt.status,'score',attempt.score); end if;
 if attempt.revision<>expected_revision then raise exception 'Another tab saved a newer answer. Reload before continuing.' using errcode='40001'; end if;
 select * into exam from public.exams where id=attempt.exam_id;
 if jsonb_typeof(answer_data) is distinct from 'object' or octet_length(answer_data::text)>200000 then raise exception 'Invalid answers'; end if;
 for key in select jsonb_object_keys(answer_data) loop
 if not exists(select 1 from public.school_exam_items i where i.id::text=key and i.exam_id=attempt.exam_id) or jsonb_typeof(answer_data->key)<>'string' or length(answer_data->>key)>10000 then raise exception 'Invalid question answer'; end if;
 end loop;
 -- On expiry only the last successfully persisted answers are submitted.
 -- A late request cannot add or alter answers after the server deadline.
 if now()>exam.ends_at or exam.status='CLOSED' then answer_data:=attempt.answers; submit:=true; end if;
 update public.school_exam_attempts set answers=answer_data,revision=revision+1,saved_at=now() where id=attempt.id returning * into attempt;
 if submit then
 select count(*),count(*) filter(where snapshot->>'question_type'='ESSAY'),count(*) filter(where snapshot->>'question_type'='MULTIPLE_CHOICE' and snapshot->>'answer'=answer_data->>id::text) into total,essays,correct from public.school_exam_items where exam_id=attempt.exam_id;
 update public.school_exam_attempts set status=case when essays>0 then 'SUBMITTED' else 'GRADED' end,submitted_at=now(),score=case when essays=0 then round(100.0*correct/nullif(total,0),2) end where id=attempt.id returning * into attempt;
 insert into public.exam_results(tenant_id,exam_session_id,student_id,score,status,graded_at) values(attempt.tenant_id,attempt.session_id,attempt.student_id,attempt.score,case when essays>0 then 'PENDING' else 'GRADED' end,case when essays=0 then now() end) on conflict(tenant_id,exam_session_id,student_id) do update set score=excluded.score,status=excluded.status,graded_at=excluded.graded_at;
 end if;
 return jsonb_build_object('revision',attempt.revision,'status',attempt.status,'score',attempt.score,'saved_at',attempt.saved_at);
end $$;
create function public.school_exam_save(attempt_uuid uuid,expected_revision integer,answer_data jsonb,submit boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select school_private.exam_save(attempt_uuid,expected_revision,answer_data,submit) $$;

create function school_private.exam_attempts(exam_uuid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.exams e where e.id=exam_uuid and e.tenant_id=school_private.tenant() and school_private.teaches(e.course_id)) then raise exception 'Teacher access required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select a.id,a.student_id,u.full_name,a.status,a.score,a.saved_at,a.submitted_at from public.school_exam_attempts a join public.users u on u.id=a.user_id where a.exam_id=exam_uuid order by u.full_name limit 5000)q),'[]');
end $$;
create function public.school_exam_attempts(exam_uuid uuid) returns jsonb language sql security invoker set search_path='' as $$ select school_private.exam_attempts(exam_uuid) $$;
create function school_private.exam_grade(attempt_uuid uuid,final_score numeric,note text) returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.school_exam_attempts; begin
 select a.* into attempt from public.school_exam_attempts a join public.exams e on e.id=a.exam_id where a.id=attempt_uuid and a.tenant_id=school_private.tenant() and school_private.teaches(e.course_id) for update of a;
 if attempt.id is null or attempt.status='IN_PROGRESS' or not public.app_has_permission(auth.uid(),'exam_results.update') then raise exception 'Submitted attempt and grading permission required' using errcode='42501'; end if;
 if final_score is null or final_score not between 0 and 100 or length(note)>10000 then raise exception 'Invalid grade'; end if;
 update public.school_exam_attempts set score=final_score,feedback=note,status='GRADED' where id=attempt.id;
 update public.exam_results set score=final_score,status='PUBLISHED',graded_at=now() where exam_session_id=attempt.session_id and student_id=attempt.student_id and tenant_id=attempt.tenant_id;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(attempt.tenant_id,auth.uid(),'UPDATE','exams','school_exam_attempts',attempt.id,jsonb_build_object('score',final_score));
 return jsonb_build_object('id',attempt.id,'score',final_score);
end $$;
create function public.school_exam_grade(attempt_uuid uuid,final_score numeric,note text default '') returns jsonb language sql security invoker set search_path='' as $$ select school_private.exam_grade(attempt_uuid,final_score,note) $$;

-- Explicit grants: private helpers are not public RPC endpoints.
revoke all on function school_private.teaches(uuid),school_private.question_bank(uuid),school_private.question_save(text,jsonb,uuid),school_private.ai_reserve(uuid,uuid,integer),school_private.ai_finish(uuid,jsonb,jsonb),school_private.exam_manage(text,uuid,jsonb),school_private.exam_list(),school_private.exam_state(uuid),school_private.exam_start(uuid),school_private.exam_save(uuid,integer,jsonb,boolean),school_private.exam_attempts(uuid),school_private.exam_grade(uuid,numeric,text) from public,anon,authenticated;
grant execute on function school_private.question_bank(uuid),school_private.question_save(text,jsonb,uuid),school_private.ai_reserve(uuid,uuid,integer),school_private.ai_finish(uuid,jsonb,jsonb),school_private.exam_manage(text,uuid,jsonb),school_private.exam_list(),school_private.exam_state(uuid),school_private.exam_start(uuid),school_private.exam_save(uuid,integer,jsonb,boolean),school_private.exam_attempts(uuid),school_private.exam_grade(uuid,numeric,text) to authenticated;
revoke all on function public.school_question_bank(uuid),public.school_question_save(text,jsonb,uuid),public.school_ai_reserve(uuid,uuid,integer),public.school_ai_finish(uuid,jsonb,jsonb),public.school_exam_manage(text,uuid,jsonb),public.school_exam_list(),public.school_exam_state(uuid),public.school_exam_start(uuid),public.school_exam_save(uuid,integer,jsonb,boolean),public.school_exam_attempts(uuid),public.school_exam_grade(uuid,numeric,text) from public,anon;
grant execute on function public.school_question_bank(uuid),public.school_question_save(text,jsonb,uuid),public.school_ai_reserve(uuid,uuid,integer),public.school_ai_finish(uuid,jsonb,jsonb),public.school_exam_manage(text,uuid,jsonb),public.school_exam_list(),public.school_exam_state(uuid),public.school_exam_start(uuid),public.school_exam_save(uuid,integer,jsonb,boolean),public.school_exam_attempts(uuid),public.school_exam_grade(uuid,numeric,text) to authenticated;
