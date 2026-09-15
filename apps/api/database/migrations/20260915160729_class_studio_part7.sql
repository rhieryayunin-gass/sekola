create table public.school_learning_spaces (
 course_id uuid primary key references public.courses(id),tenant_id uuid not null references public.tenants(id),
 status text not null default 'DRAFT' check(status in ('DRAFT','LIVE')),is_template boolean not null default false,created_at timestamptz not null default now()
);
create table public.school_learning_units (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),course_id uuid not null references public.courses(id),
 title text not null check(length(trim(title)) between 2 and 160),description text check(length(description)<=10000),position integer not null default 1 check(position between 1 and 1000),
 week integer check(week between 1 and 60),outcome_ids uuid[] not null default '{}',student_ids uuid[] not null default '{}',
 published boolean not null default false,source_exam_id uuid references public.exams(id),created_at timestamptz not null default now()
);
alter table public.lessons add column unit_id uuid references public.school_learning_units(id),add column blocks jsonb not null default '[]' check(jsonb_typeof(blocks)='array' and octet_length(blocks::text)<=100000),add column content_version integer not null default 1;
alter table public.assignments add column unit_id uuid references public.school_learning_units(id),add column studio_managed boolean not null default false,add column rubric text check(length(rubric)<=10000);
create table public.school_learning_progress (
 tenant_id uuid not null references public.tenants(id),lesson_id uuid not null references public.lessons(id),student_id uuid not null references public.students(id),
 opened_at timestamptz not null default now(),completed_at timestamptz,primary key(lesson_id,student_id)
);
create table public.school_submission_workflow (
 submission_id uuid primary key references public.submissions(id) on delete cascade,tenant_id uuid not null references public.tenants(id),
 revision integer not null default 0,status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','CHANGES_REQUESTED','COMPLETED')),
 draft_score numeric(8,2),draft_feedback text check(length(draft_feedback)<=10000),draft_decision text check(draft_decision in ('CHANGES_REQUESTED','COMPLETED')),
 reviewed_at timestamptz,released_at timestamptz
);
create table public.school_submission_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),submission_id uuid not null references public.submissions(id) on delete cascade,
 revision integer not null,content text,attachment_url text,submitted_at timestamptz,feedback text,score numeric(8,2),created_at timestamptz not null default now(),unique(submission_id,revision)
);
create table public.school_lesson_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),lesson_id uuid not null references public.lessons(id),
 version integer not null,title text not null,material text,blocks jsonb not null,created_at timestamptz not null default now(),unique(lesson_id,version)
);

do $$ declare t text; maps jsonb; begin
 foreach t in array array['school_learning_spaces','school_learning_units','school_learning_progress','school_submission_workflow','school_submission_versions','school_lesson_versions'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);execute format('create index on public.%I(tenant_id)',t);
 select jsonb_object_agg(a.attname,ft.relname) into maps from pg_constraint c join pg_class ft on ft.oid=c.confrelid join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.conrelid=('public.'||t)::regclass and c.contype='f' and a.attname<>'tenant_id' and exists(select 1 from pg_attribute ta where ta.attrelid=ft.oid and ta.attname='tenant_id');
 execute format('create trigger tenant_integrity before insert or update on public.%I for each row execute function public.enforce_tenant_relations(%L)',t,coalesce(maps,'{}')::text);
 end loop;
end $$;
create index school_units_course_position on public.school_learning_units(course_id,position);
create index lessons_unit on public.lessons(unit_id);
create index assignments_unit on public.assignments(unit_id);

-- One visibility rule is reused by Studio, legacy catalogs, REST and family reports.
create function school_private.studio_visible(resource text,record_uuid uuid,student uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare course public.courses; unit public.school_learning_units; unit_uuid uuid; pub boolean:=true; begin
 if resource='courses' then select * into course from public.courses where id=record_uuid;
 elsif resource='units' then select * into unit from public.school_learning_units where id=record_uuid; select * into course from public.courses where id=unit.course_id;unit_uuid:=unit.id;
 elsif resource='lessons' then select course_id,unit_id,is_published into course.id,unit_uuid,pub from public.lessons where id=record_uuid;select * into course from public.courses where id=course.id;
 elsif resource='assignments' then select course_id,unit_id,is_published into course.id,unit_uuid,pub from public.assignments where id=record_uuid;select * into course from public.courses where id=course.id;
 else return false; end if;
 if course.id is null or not course.is_active or not pub or not exists(select 1 from public.students s join public.student_assignments a on a.student_id=s.id where s.id=student and s.tenant_id=course.tenant_id and s.enrollment_status='ACTIVE' and a.classroom_id=course.classroom_id and a.semester_id=course.semester_id and a.is_active) or exists(select 1 from public.school_learning_spaces where course_id=course.id and status<>'LIVE') then return false; end if;
 if unit_uuid is not null then
 select * into unit from public.school_learning_units where id=unit_uuid;
 if unit.course_id<>course.id or not unit.published or (cardinality(unit.student_ids)>0 and not student=any(unit.student_ids)) then return false; end if;
 if cardinality(unit.outcome_ids)>0 and not exists(select 1 from public.school_curriculum_outcomes o where o.id=any(unit.outcome_ids) and school_private.curriculum_enrolled(course.id,o.curriculum_subject_id,student)) then return false; end if;
 end if;
 return true;
end $$;

create function school_private.studio_context(course_uuid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); student uuid; manages boolean:=school_private.teaches(course_uuid); result jsonb; begin
 select id into student from public.students where user_id=auth.uid() and tenant_id=t;
 if not manages and not school_private.studio_visible('courses',course_uuid,student) then raise exception 'Class access denied' using errcode='42501'; end if;
 select to_jsonb(q) into result from (select c.*,ay.name as academic_year,se.name as term,cl.name as classroom,su.name as subject,
 coalesce(sp.status,'LIVE') as studio_status,coalesce(sp.is_template,false) as is_template,manages as can_manage,student as student_id,
 (select count(*) from public.student_assignments a join public.students s on s.id=a.student_id where a.classroom_id=c.classroom_id and a.semester_id=c.semester_id and a.is_active and s.enrollment_status='ACTIVE') as participants
 from public.courses c join public.academic_years ay on ay.id=c.academic_year_id join public.semesters se on se.id=c.semester_id join public.classrooms cl on cl.id=c.classroom_id join public.subjects su on su.id=c.subject_id left join public.school_learning_spaces sp on sp.course_id=c.id where c.id=course_uuid and c.tenant_id=t)q;
 return result;
end $$;

create function school_private.studio(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); cid uuid:=(payload->>'course_id')::uuid; rid uuid:=(payload->>'id')::uuid; sid uuid; ctx jsonb; manages boolean; result jsonb; item jsonb; uid uuid; old_unit uuid; unit public.school_learning_units; lesson public.lessons; assignment public.assignments; sub public.submissions; wf public.school_submission_workflow; previous public.school_submission_workflow; source public.courses; key uuid; dest uuid; begin
 perform school_private.require_module('learning');
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>200000 then raise exception 'Invalid learning data'; end if;
 select id into sid from public.students where user_id=auth.uid() and tenant_id=t and enrollment_status='ACTIVE';
 if action='home' then
 return jsonb_build_object('today',school_private.studio_today(),'courses',coalesce((select jsonb_agg(school_private.studio_context(c.id) order by c.name) from public.courses c where c.tenant_id=t and (school_private.teaches(c.id) or school_private.studio_visible('courses',c.id,sid))),'[]'),
 'templates',case when school_private.role(array['TEACHER']) then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'academic_year',y.name,'is_template',true,'can_manage',false)) from public.school_learning_spaces sp join public.courses c on c.id=sp.course_id join public.academic_years y on y.id=c.academic_year_id where sp.tenant_id=t and sp.is_template and not school_private.teaches(c.id)),'[]') else '[]'::jsonb end,
 'candidates',case when school_private.role(array['TEACHER']) then coalesce((select jsonb_agg(to_jsonb(q)) from (select a.id,a.classroom_id,a.subject_id,a.academic_year_id,a.semester_id,s.name as subject,c.name as classroom,y.name as academic_year,se.name as term from public.teacher_assignments a join public.teachers te on te.id=a.teacher_id join public.classrooms c on c.id=a.classroom_id join public.subjects s on s.id=a.subject_id join public.academic_years y on y.id=a.academic_year_id join public.semesters se on se.id=a.semester_id where a.tenant_id=t and te.user_id=auth.uid() and te.employment_status='ACTIVE' and a.is_active and not exists(select 1 from public.courses co where co.teacher_id=a.teacher_id and co.subject_id=a.subject_id and co.classroom_id=a.classroom_id and co.semester_id=a.semester_id) order by s.name,c.name limit 500)q),'[]') else '[]'::jsonb end);
 elsif action='prepare' then
 if not school_private.role(array['TEACHER']) then raise exception 'Teacher required' using errcode='42501'; end if;
 insert into public.courses(tenant_id,subject_id,teacher_id,classroom_id,academic_year_id,semester_id,name)
 select t,a.subject_id,a.teacher_id,a.classroom_id,a.academic_year_id,a.semester_id,s.name||' · '||c.name from public.teacher_assignments a join public.teachers te on te.id=a.teacher_id join public.subjects s on s.id=a.subject_id join public.classrooms c on c.id=a.classroom_id where a.id=rid and a.tenant_id=t and te.user_id=auth.uid() and a.is_active and te.employment_status='ACTIVE'
 on conflict(tenant_id,subject_id,teacher_id,classroom_id,semester_id) do update set name=public.courses.name returning id into cid;
 if cid is null then raise exception 'Active Academic assignment required' using errcode='42501'; end if;
 insert into public.school_learning_spaces(tenant_id,course_id) values(t,cid) on conflict do nothing;
 return school_private.studio_context(cid);
 end if;
 ctx:=school_private.studio_context(cid);manages:=(ctx->>'can_manage')::boolean;
 if action='state' then
 return jsonb_build_object('context',ctx,
 'units',coalesce((select jsonb_agg(to_jsonb(u) order by position,id) from public.school_learning_units u where u.course_id=cid and (manages or school_private.studio_visible('units',u.id,sid))),'[]'),
 'lessons',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('opened_at',p.opened_at,'completed_at',p.completed_at) order by l.scheduled_at nulls last,l.created_at) from public.lessons l left join public.school_learning_progress p on p.lesson_id=l.id and p.student_id=sid where l.course_id=cid and (manages or school_private.studio_visible('lessons',l.id,sid))),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.due_at nulls last,a.created_at) from public.assignments a where a.course_id=cid and (manages or school_private.studio_visible('assignments',a.id,sid))),'[]'),
 'submissions',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('student_name',u.full_name,'revision',coalesce(w.revision,0),'workflow_status',coalesce(w.status,case when s.reviewed_at is not null then 'COMPLETED' when s.submitted_at is not null then 'SUBMITTED' else 'DRAFT' end),'draft_score',case when manages then w.draft_score end,'draft_feedback',case when manages then w.draft_feedback end,'draft_decision',case when manages then w.draft_decision end)) from public.submissions s join public.assignments a on a.id=s.assignment_id join public.students st on st.id=s.student_id join public.users u on u.id=st.user_id left join public.school_submission_workflow w on w.submission_id=s.id where a.course_id=cid and (manages or (s.student_id=sid and school_private.studio_visible('assignments',a.id,sid)))),'[]'),
 'roster',case when manages then coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',u.full_name)) from public.student_assignments a join public.students s on s.id=a.student_id join public.users u on u.id=s.user_id where a.classroom_id=(ctx->>'classroom_id')::uuid and a.semester_id=(ctx->>'semester_id')::uuid and a.is_active and s.enrollment_status='ACTIVE'),'[]') else '[]'::jsonb end,
 'outcomes',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('program',p.name)) from public.school_curriculum_outcomes o join public.school_curriculum_programs p on p.id=o.program_id where o.tenant_id=t and o.is_active and exists(select 1 from public.school_curriculum_course_links l where l.course_id=cid and l.curriculum_subject_id=o.curriculum_subject_id and l.is_active) and (manages or school_private.curriculum_enrolled(cid,o.curriculum_subject_id,sid))),'[]'));
 elsif action='progress' then
 if manages or not school_private.studio_visible('lessons',rid,sid) then raise exception 'Assigned learner required' using errcode='42501'; end if;
 insert into public.school_learning_progress(tenant_id,lesson_id,student_id,completed_at) values(t,rid,sid,case when (payload->>'complete')::boolean then now() end) on conflict(lesson_id,student_id) do update set completed_at=coalesce(public.school_learning_progress.completed_at,excluded.completed_at);
 return jsonb_build_object('id',rid);
 elsif action='submit' then
 select * into assignment from public.assignments where id=(payload->>'assignment_id')::uuid and course_id=cid and tenant_id=t;
 if manages or assignment.id is null or not school_private.studio_visible('assignments',assignment.id,sid) then raise exception 'Assigned learner required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(assignment.id::text||sid::text,771));
 select * into sub from public.submissions where assignment_id=assignment.id and student_id=sid;
 if sub.id is null then insert into public.submissions(tenant_id,assignment_id,student_id) values(t,assignment.id,sid) returning * into sub; end if;
 insert into public.school_submission_workflow(submission_id,tenant_id) values(sub.id,t) on conflict do nothing;
 select * into wf from public.school_submission_workflow where submission_id=sub.id for update;
 if wf.revision is distinct from (payload->>'revision')::integer then raise exception 'Another version was saved. Refresh before continuing.' using errcode='40001'; end if;
 if wf.status not in ('DRAFT','CHANGES_REQUESTED') then raise exception 'This work is locked until the teacher requests a revision'; end if;
 if ((payload->>'submit')::boolean and length(trim(coalesce(payload->>'content','')))=0 and coalesce(payload->>'attachment_url','')='') or length(payload->>'content')>20000 or length(payload->>'attachment_url')>2000 or (coalesce(payload->>'attachment_url','')<>'' and payload->>'attachment_url' !~ '^/api/media/file\?') then raise exception 'Use valid content and a school media attachment'; end if;
 insert into public.school_submission_versions(tenant_id,submission_id,revision,content,attachment_url,submitted_at,feedback,score) values(t,sub.id,wf.revision,sub.content,sub.attachment_url,sub.submitted_at,sub.feedback,sub.score);
 perform set_config('school.studio_write','true',true);
 update public.submissions set score=null,feedback=null,reviewed_at=null,reviewed_by_teacher_id=null,content=payload->>'content',attachment_url=nullif(payload->>'attachment_url',''),submitted_at=case when (payload->>'submit')::boolean then now() end where id=sub.id;
 update public.school_submission_workflow set revision=revision+1,status=case when (payload->>'submit')::boolean then 'SUBMITTED' else 'DRAFT' end,draft_score=null,draft_feedback=null,draft_decision=null,reviewed_at=null where submission_id=sub.id returning * into wf;
 return jsonb_build_object('id',sub.id,'revision',wf.revision,'status',wf.status);
 elsif action='history' then
 select s.* into sub from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=rid and a.course_id=cid and s.tenant_id=t;
 if sub.id is null or not (manages or sub.student_id=sid) then raise exception 'Submission access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(v) order by revision desc) from public.school_submission_versions v where submission_id=rid),'[]');
 end if;
 if not manages then raise exception 'Course teacher required' using errcode='42501'; end if;
 if action='space' then
 if payload->>'status'='LIVE' and not exists(select 1 from public.lessons l where l.course_id=cid and l.is_published) and not exists(select 1 from public.assignments a where a.course_id=cid and a.is_published) then raise exception 'Publish at least one activity first'; end if;
 insert into public.school_learning_spaces(tenant_id,course_id,status,is_template) values(t,cid,coalesce(payload->>'status','DRAFT'),coalesce((payload->>'is_template')::boolean,false)) on conflict(course_id) do update set status=excluded.status,is_template=excluded.is_template;
 elsif action='unit' then
 uid:=coalesce(rid,gen_random_uuid());
 if rid is not null and not exists(select 1 from public.school_learning_units where id=rid and course_id=cid) then raise exception 'Unit access denied' using errcode='42501'; end if;
 for key in select value::uuid from jsonb_array_elements_text(coalesce(payload->'outcome_ids','[]')) loop
 if not exists(select 1 from public.school_curriculum_outcomes o join public.school_curriculum_course_links l on l.curriculum_subject_id=o.curriculum_subject_id where o.id=key and o.is_active and l.course_id=cid and l.is_active) then raise exception 'Choose outcomes mapped in Academic'; end if; end loop;
 for key in select value::uuid from jsonb_array_elements_text(coalesce(payload->'student_ids','[]')) loop
 if not exists(select 1 from public.student_assignments a where a.student_id=key and a.classroom_id=(ctx->>'classroom_id')::uuid and a.semester_id=(ctx->>'semester_id')::uuid and a.is_active) then raise exception 'Choose students from this class'; end if; end loop;
 insert into public.school_learning_units(id,tenant_id,course_id,title,description,position,week,outcome_ids,student_ids,published)
 values(uid,t,cid,payload->>'title',payload->>'description',coalesce((payload->>'position')::integer,1),(payload->>'week')::integer,array(select value::uuid from jsonb_array_elements_text(coalesce(payload->'outcome_ids','[]'))),array(select value::uuid from jsonb_array_elements_text(coalesce(payload->'student_ids','[]'))),coalesce((payload->>'published')::boolean,false))
 on conflict(id) do update set title=excluded.title,description=excluded.description,position=excluded.position,week=excluded.week,outcome_ids=excluded.outcome_ids,student_ids=excluded.student_ids,published=excluded.published;
 rid:=uid;
 elsif action in ('lesson','assignment') then
 uid:=(payload->>'unit_id')::uuid;
 if uid is not null and not exists(select 1 from public.school_learning_units where id=uid and course_id=cid and tenant_id=t) then raise exception 'Choose a unit in this class'; end if;
 if action='lesson' then
 if jsonb_typeof(coalesce(payload->'blocks','[]'))<>'array' or jsonb_array_length(coalesce(payload->'blocks','[]'))>50 then raise exception 'Use at most 50 content blocks'; end if;
 for item in select value from jsonb_array_elements(coalesce(payload->'blocks','[]')) loop
 if item->>'type' is null or item->>'type' not in ('TEXT','REFLECTION','LIBRARY') or length(item->>'text')>10000 then raise exception 'Invalid content block'; end if;
 if item->>'type'='LIBRARY' and not exists(select 1 from public.school_library where id=(item->>'library_id')::uuid and tenant_id=t) then raise exception 'Choose a school library resource'; end if;
 end loop;
 if rid is null then insert into public.lessons(tenant_id,course_id,unit_id,title,material,blocks,scheduled_at,is_published) values(t,cid,uid,payload->>'title',payload->>'material',coalesce(payload->'blocks','[]'),(payload->>'scheduled_at')::timestamptz,coalesce((payload->>'is_published')::boolean,false)) returning id into rid;
 else
 select * into lesson from public.lessons where id=rid and course_id=cid and tenant_id=t for update;
 if lesson.id is null then raise exception 'Lesson access denied' using errcode='42501'; end if;
 if lesson.is_published and payload->>'version_action' is distinct from 'NEW_VERSION' then raise exception 'Choose a new version before changing a published lesson'; end if;
 insert into public.school_lesson_versions(tenant_id,lesson_id,version,title,material,blocks) values(t,rid,lesson.content_version,lesson.title,lesson.material,lesson.blocks) on conflict do nothing;
 update public.lessons set title=payload->>'title',unit_id=uid,material=payload->>'material',blocks=coalesce(payload->'blocks','[]'),scheduled_at=(payload->>'scheduled_at')::timestamptz,is_published=coalesce((payload->>'is_published')::boolean,false),content_version=content_version+1 where id=rid;
 end if;
 else
 if rid is null then insert into public.assignments(tenant_id,course_id,unit_id,title,instructions,due_at,max_score,is_published,studio_managed,rubric) values(t,cid,uid,payload->>'title',payload->>'instructions',(payload->>'due_at')::timestamptz,coalesce((payload->>'max_score')::numeric,100),coalesce((payload->>'is_published')::boolean,false),true,payload->>'rubric') returning id into rid;
 else
 if not exists(select 1 from public.assignments where id=rid and course_id=cid and tenant_id=t) then raise exception 'Assignment access denied' using errcode='42501'; end if;
 update public.assignments set title=payload->>'title',instructions=payload->>'instructions',due_at=(payload->>'due_at')::timestamptz,rubric=payload->>'rubric',is_published=coalesce((payload->>'is_published')::boolean,false) where id=rid;
 end if;
 end if;
 elsif action in ('review','release') then
 select s.* into sub from public.submissions s join public.assignments a on a.id=s.assignment_id where s.id=rid and a.course_id=cid and s.tenant_id=t for update of s;
 if sub.id is null or sub.submitted_at is null then raise exception 'A submitted assignment is required'; end if;
 select * into assignment from public.assignments where id=sub.assignment_id;
 insert into public.school_submission_workflow(submission_id,tenant_id,status) values(rid,t,'SUBMITTED') on conflict do nothing;
 select * into wf from public.school_submission_workflow where submission_id=rid for update;
 if action='review' then
 if wf.status not in ('SUBMITTED','COMPLETED') or payload->>'score' is null or payload->>'decision' not in ('COMPLETED','CHANGES_REQUESTED') or (payload->>'score')::numeric not between 0 and assignment.max_score or (payload->>'score')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid review score'; end if;
 update public.school_submission_workflow set draft_score=(payload->>'score')::numeric,draft_feedback=payload->>'feedback',draft_decision=payload->>'decision',reviewed_at=now() where submission_id=rid;
 else
 if wf.reviewed_at is null or wf.draft_decision is null then raise exception 'Review before releasing feedback'; end if;
 perform set_config('school.studio_write','true',true);
 update public.submissions set score=wf.draft_score,feedback=wf.draft_feedback,reviewed_at=now(),reviewed_by_teacher_id=(select teacher_id from public.courses where id=cid) where id=rid;
 update public.school_submission_workflow set status=wf.draft_decision,released_at=now(),reviewed_at=null where submission_id=rid;
 end if;
 elsif action='copy' then
 perform pg_advisory_xact_lock(hashtextextended(cid::text,771));
 select * into source from public.courses where id=(payload->>'source_course_id')::uuid and tenant_id=t;
 if source.id is null or source.id=cid or not (school_private.teaches(source.id) or exists(select 1 from public.school_learning_spaces where course_id=source.id and is_template)) then raise exception 'Choose your prior course or a school template' using errcode='42501'; end if;
 if exists(select 1 from public.school_learning_units where course_id=cid) then raise exception 'Copy into an empty space to avoid duplicate units'; end if;
 for unit in select * from public.school_learning_units where course_id=source.id order by position loop
 old_unit:=unit.id;uid:=gen_random_uuid();
 insert into public.school_learning_units(id,tenant_id,course_id,title,description,position,week) values(uid,t,cid,unit.title,unit.description,unit.position,unit.week);
 insert into public.lessons(tenant_id,course_id,unit_id,title,material,blocks,is_published) select t,cid,uid,title,material,blocks,false from public.lessons where unit_id=old_unit;
 insert into public.assignments(tenant_id,course_id,unit_id,title,instructions,max_score,rubric,is_published,studio_managed) select t,cid,uid,title,instructions,max_score,rubric,false,true from public.assignments where unit_id=old_unit;
 end loop;
 if exists(select 1 from public.lessons where course_id=source.id and unit_id is null) or exists(select 1 from public.assignments where course_id=source.id and unit_id is null) then
 insert into public.school_learning_units(tenant_id,course_id,title,position) values(t,cid,left(source.name,160),coalesce((select max(position)+1 from public.school_learning_units where course_id=cid),1)) returning id into uid;
 insert into public.lessons(tenant_id,course_id,unit_id,title,material,blocks,is_published) select t,cid,uid,title,material,blocks,false from public.lessons where course_id=source.id and unit_id is null;
 insert into public.assignments(tenant_id,course_id,unit_id,title,instructions,max_score,rubric,is_published,studio_managed) select t,cid,uid,title,instructions,max_score,rubric,false,true from public.assignments where course_id=source.id and unit_id is null;
 end if;
 -- Dates, participants, outcomes from the old programme, attempts and scores never copy.
 else raise exception 'Unknown studio action'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(t,auth.uid(),upper(action),'learning','class_studio',coalesce(rid,cid),jsonb_build_object('course_id',cid));
 return jsonb_build_object('id',coalesce(rid,cid));
end $$;
create function public.school_studio(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select school_private.studio(action,payload) $$;

-- Prevent older administrative endpoints from bypassing the managed submission lifecycle.
create function school_private.submission_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.assignments where id=new.assignment_id and studio_managed) and coalesce(current_setting('school.studio_write',true),'')<>'true' and (tg_op='UPDATE' or new.content is not null or new.submitted_at is not null or new.score is not null or new.feedback is not null) then raise exception 'Use Class Studio to submit and release managed work' using errcode='42501'; end if;
 return new;
end $$;
create trigger studio_submission_guard before insert or update on public.submissions for each row execute function school_private.submission_guard();
revoke all on function school_private.studio_visible(text,uuid,uuid),school_private.studio_context(uuid),school_private.studio(text,jsonb),school_private.submission_guard(),public.school_studio(text,jsonb) from public,anon,authenticated;
grant execute on function school_private.studio(text,jsonb),public.school_studio(text,jsonb) to authenticated;
grant execute on function school_private.studio_visible(text,uuid,uuid) to service_role;

-- An Academic teaching allocation provisions one draft space without duplicating courses.
create function school_private.provision_learning_space() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;begin
 if not new.is_active then return new;end if;
 insert into public.courses(tenant_id,subject_id,teacher_id,classroom_id,academic_year_id,semester_id,name)
 select new.tenant_id,new.subject_id,new.teacher_id,new.classroom_id,new.academic_year_id,new.semester_id,s.name||' · '||c.name from public.subjects s,public.classrooms c,public.teachers te where s.id=new.subject_id and c.id=new.classroom_id and te.id=new.teacher_id and te.employment_status='ACTIVE'
 on conflict(tenant_id,subject_id,teacher_id,classroom_id,semester_id) do nothing returning id into cid;
 if cid is not null then insert into public.school_learning_spaces(tenant_id,course_id) values(new.tenant_id,cid);end if;
 return new;
end $$;
create trigger academic_learning_space after insert or update on public.teacher_assignments for each row execute function school_private.provision_learning_space();
revoke all on function school_private.provision_learning_space() from public,anon,authenticated;

create function school_private.studio_today() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t uuid:=school_private.tenant();sid uuid;begin
 perform school_private.require_module('learning');select id into sid from public.students where tenant_id=t and user_id=auth.uid();
 return coalesce((select jsonb_agg(to_jsonb(q)) from (
 select a.id,c.id as course_id,c.name as course,a.title,'TASK' as kind,a.due_at as date,1 as priority from public.assignments a join public.courses c on c.id=a.course_id where a.tenant_id=t and school_private.studio_visible('assignments',a.id,sid) and not exists(select 1 from public.submissions s left join public.school_submission_workflow w on w.submission_id=s.id where s.assignment_id=a.id and s.student_id=sid and coalesce(w.status,case when s.reviewed_at is not null then 'COMPLETED' when s.submitted_at is not null then 'SUBMITTED' else 'DRAFT' end) in ('SUBMITTED','COMPLETED'))
 union all select l.id,c.id,c.name,l.title,'CONTINUE',l.scheduled_at,2 from public.lessons l join public.courses c on c.id=l.course_id join public.school_learning_progress p on p.lesson_id=l.id and p.student_id=sid where l.tenant_id=t and p.completed_at is null and school_private.studio_visible('lessons',l.id,sid)
 union all select a.id,c.id,c.name,a.title,'FEEDBACK',s.reviewed_at,3 from public.submissions s join public.assignments a on a.id=s.assignment_id join public.courses c on c.id=a.course_id where s.student_id=sid and s.tenant_id=t and s.reviewed_at is not null and school_private.studio_visible('assignments',a.id,sid)
 union all select s.id,c.id,c.name,a.title,'REVIEW',s.submitted_at,0 from public.submissions s join public.assignments a on a.id=s.assignment_id join public.courses c on c.id=a.course_id left join public.school_submission_workflow w on w.submission_id=s.id where s.tenant_id=t and school_private.teaches(c.id) and coalesce(w.status,case when s.reviewed_at is not null then 'COMPLETED' when s.submitted_at is not null then 'SUBMITTED' else 'DRAFT' end)='SUBMITTED'
 order by priority,date nulls last,id limit 12)q),'[]');
end $$;
revoke all on function school_private.studio_today() from public,anon,authenticated;
