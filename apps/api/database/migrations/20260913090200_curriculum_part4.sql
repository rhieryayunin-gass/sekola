-- Versioned school programmes. No single curriculum flag on tenants or students.
create table public.school_curriculum_programs (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 academic_year_id uuid not null references public.academic_years(id),
 name text not null check(length(trim(name)) between 2 and 160),framework text not null check(framework in ('MERDEKA','K13','CAMBRIDGE','IB_PYP','IB_MYP','IB_DP','IB_CP','EDEXCEL','IPC','IMYC','MONTESSORI','SINGAPORE','US_STANDARDS','AP','AUSTRALIAN','MADRASAH','SCHOOL')),
 version text not null check(length(trim(version)) between 1 and 120),language text not null default 'id' check(length(language) between 2 and 40),
 source_url text check(source_url is null or (source_url ~ '^https://' and length(source_url)<=2000)),
 description text check(length(description)<=10000),is_active boolean not null default true,
 created_at timestamptz not null default now(),unique(tenant_id,academic_year_id,name,version)
);
create table public.school_curriculum_stages (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),program_id uuid not null references public.school_curriculum_programs(id),
 code text not null check(length(trim(code)) between 1 and 40),name text not null check(length(trim(name)) between 1 and 160),
 grade_from integer check(grade_from between 0 and 20),grade_to integer check(grade_to between 0 and 20),
 is_active boolean not null default true,created_at timestamptz not null default now(),unique(program_id,code),check(grade_to>=grade_from)
);
create table public.school_curriculum_subjects (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),program_id uuid not null references public.school_curriculum_programs(id),
 stage_id uuid not null references public.school_curriculum_stages(id),subject_id uuid not null references public.subjects(id),
 name text not null check(length(trim(name)) between 1 and 160),syllabus_code text check(length(syllabus_code)<=80),syllabus_version text check(length(syllabus_version)<=120),
 level text check(length(level)<=80),is_active boolean not null default true,created_at timestamptz not null default now(),unique(program_id,stage_id,subject_id,name)
);
create table public.school_curriculum_enrollments (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),program_id uuid not null references public.school_curriculum_programs(id),stage_id uuid not null references public.school_curriculum_stages(id),
 classroom_id uuid not null references public.classrooms(id),student_id uuid references public.students(id),
 is_active boolean not null default true,created_at timestamptz not null default now(),unique nulls not distinct(program_id,stage_id,classroom_id,student_id)
);
create table public.school_curriculum_outcomes (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),program_id uuid not null references public.school_curriculum_programs(id),curriculum_subject_id uuid not null references public.school_curriculum_subjects(id),
 parent_id uuid references public.school_curriculum_outcomes(id),code text not null check(length(trim(code)) between 1 and 80),name text not null check(length(trim(name)) between 2 and 200),
 kind text not null check(kind in ('CP','TP','KI','KD','LEARNING_OBJECTIVE','ASSESSMENT_OBJECTIVE','STANDARD','INQUIRY','COMPETENCY','PERSONAL','INTERNATIONAL','OTHER')),
 strand text check(length(strand)<=160),description text not null check(length(trim(description)) between 2 and 10000),sequence integer not null default 1 check(sequence between 1 and 10000),
 activity_type text not null default 'INTRACURRICULAR' check(activity_type in ('INTRACURRICULAR','COCURRICULAR','EXTRACURRICULAR')),
 is_active boolean not null default true,created_at timestamptz not null default now(),unique(curriculum_subject_id,code),check(parent_id<>id)
);
create table public.school_curriculum_scales (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),program_id uuid not null references public.school_curriculum_programs(id),
 name text not null check(length(trim(name)) between 2 and 160),kind text not null check(kind in ('NUMERIC','DESCRIPTOR','LETTER','RUBRIC')),
 minimum numeric(10,2),maximum numeric(10,2),labels text[] not null default '{}',criteria text check(length(criteria)<=10000),
 is_active boolean not null default true,created_at timestamptz not null default now(),unique(program_id,name),
 check(cardinality(labels)<=30),check(minimum::text not in ('NaN','Infinity','-Infinity') and maximum::text not in ('NaN','Infinity','-Infinity')),check((kind in ('NUMERIC','RUBRIC') and minimum is not null and maximum is not null and maximum>minimum) or (kind in ('DESCRIPTOR','LETTER') and minimum is null and maximum is null and cardinality(labels)>0))
);
create table public.school_curriculum_course_links (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),program_id uuid not null references public.school_curriculum_programs(id),
 course_id uuid not null references public.courses(id),curriculum_subject_id uuid not null references public.school_curriculum_subjects(id),
 is_active boolean not null default true,created_at timestamptz not null default now(),unique(course_id,curriculum_subject_id)
);
create table public.school_curriculum_alignments (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),course_id uuid not null references public.courses(id),outcome_id uuid not null references public.school_curriculum_outcomes(id),
 lesson_id uuid references public.lessons(id),assignment_id uuid references public.assignments(id),question_set_id uuid references public.school_question_sets(id),exam_id uuid references public.exams(id),
 purpose text not null check(purpose in ('TEACH','PRACTICE','ASSESS')),notes text check(length(notes)<=3000),
 created_at timestamptz not null default now(),check(num_nonnulls(lesson_id,assignment_id,question_set_id,exam_id)<=1),
 unique nulls not distinct(course_id,outcome_id,lesson_id,assignment_id,question_set_id,exam_id,purpose)
);
create table public.school_curriculum_evidence (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),course_id uuid not null references public.courses(id),student_id uuid not null references public.students(id),
 outcome_id uuid not null references public.school_curriculum_outcomes(id),scale_id uuid not null references public.school_curriculum_scales(id),
 assignment_id uuid references public.assignments(id),exam_id uuid references public.exams(id),
 score numeric(10,2),descriptor text check(length(descriptor)<=160),feedback text not null check(length(trim(feedback)) between 1 and 10000),
 status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED')),assessed_at date not null default current_date,
 assessment_context jsonb not null default '{}',assessed_by uuid not null references public.users(id),created_at timestamptz not null default now(),check(num_nonnulls(assignment_id,exam_id)<=1)
);
create index curriculum_evidence_student on public.school_curriculum_evidence(tenant_id,student_id,assessed_at desc,id);
create index curriculum_evidence_course on public.school_curriculum_evidence(course_id,outcome_id);
create index curriculum_alignments_course on public.school_curriculum_alignments(course_id,outcome_id);
create index curriculum_enrollments_class on public.school_curriculum_enrollments(classroom_id,program_id,stage_id) where is_active;
create index curriculum_links_course on public.school_curriculum_course_links(course_id,curriculum_subject_id) where is_active;

create function school_private.curriculum_course(course uuid,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select (school_private.module_enabled('learning') or school_private.module_enabled('exams')) and exists(
 select 1 from public.courses c where c.id=course and c.tenant_id=school_private.tenant() and (
 (school_private.role(array['TEACHER']) and school_private.teaches(c.id)) or
 (not writing and school_private.role(array['STUDENT']) and exists(select 1 from public.student_assignments a join public.students s on s.id=a.student_id
 where a.classroom_id=c.classroom_id and a.semester_id=c.semester_id and a.is_active and s.user_id=auth.uid() and s.enrollment_status='ACTIVE'))))
$$;
create function school_private.curriculum_enrolled(course uuid,subject uuid,student uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses c join public.school_curriculum_subjects cs on cs.id=subject and cs.subject_id=c.subject_id
 join public.school_curriculum_programs p on p.id=cs.program_id and p.academic_year_id=c.academic_year_id and p.is_active
 join public.school_curriculum_stages st on st.id=cs.stage_id and st.is_active
 join public.school_curriculum_enrollments e on e.program_id=p.id and e.stage_id=cs.stage_id and e.classroom_id=c.classroom_id and e.is_active
 where c.id=course and cs.is_active and (student is null or e.student_id is null or e.student_id=student))
$$;
-- Constraint triggers also protect privileged API writes; references cannot be reparented.
create function school_private.curriculum_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare data jsonb:=to_jsonb(new); previous jsonb; k text; p uuid:=(data->>'program_id')::uuid; cs public.school_curriculum_subjects; o public.school_curriculum_outcomes; sc public.school_curriculum_scales; course public.courses;
begin
 if tg_op='UPDATE' then
 previous:=to_jsonb(old);
 foreach k in array array['program_id','academic_year_id','stage_id','subject_id','curriculum_subject_id','course_id','outcome_id','student_id','classroom_id','scale_id','parent_id','assessed_by'] loop
 if data ? k and data->k is distinct from previous->k then raise exception 'Create a new mapping when changing its identity' using errcode='23514'; end if;
 end loop;
 -- Published evaluations remain interpretable after later school configuration changes.
 if tg_table_name='school_curriculum_scales' and (data->'kind' is distinct from previous->'kind' or data->'minimum' is distinct from previous->'minimum' or data->'maximum' is distinct from previous->'maximum' or data->'labels' is distinct from previous->'labels')
 and exists(select 1 from public.school_curriculum_evidence where scale_id=new.id) then raise exception 'Create a new scale version after recording evidence' using errcode='23514'; end if;
 end if;
 if data->>'stage_id' is not null and not exists(select 1 from public.school_curriculum_stages where id=(data->>'stage_id')::uuid and program_id=p) then raise exception 'Stage must belong to the programme' using errcode='23514'; end if;
 if data->>'curriculum_subject_id' is not null then
 select * into cs from public.school_curriculum_subjects where id=(data->>'curriculum_subject_id')::uuid;
 if cs.program_id is distinct from p then raise exception 'Subject must belong to the programme' using errcode='23514'; end if;
 end if;
 if tg_table_name='school_curriculum_enrollments' then
 if not exists(select 1 from public.classrooms c join public.school_curriculum_programs cp on cp.academic_year_id=c.academic_year_id where c.id=new.classroom_id and cp.id=p) then raise exception 'Class and programme academic years must match' using errcode='23514'; end if;
 if new.student_id is not null and not exists(select 1 from public.student_assignments a where a.student_id=new.student_id and a.classroom_id=new.classroom_id and a.is_active) then raise exception 'Student must be assigned to this class' using errcode='23514'; end if;
 end if;
 if tg_table_name='school_curriculum_outcomes' and data->>'parent_id' is not null then
 -- Parents are immutable; the new child cannot already be an ancestor.
 if not exists(select 1 from public.school_curriculum_outcomes where id=new.parent_id and curriculum_subject_id=new.curriculum_subject_id) then raise exception 'Parent outcome must belong to the same programme subject' using errcode='23514'; end if;
 end if;
 if tg_table_name='school_curriculum_scales' then
 if exists(select 1 from unnest(new.labels) l where l is null or length(trim(l)) not between 1 and 160) or (select count(distinct l) from unnest(new.labels) l)<>cardinality(new.labels) then raise exception 'Scale labels must be unique and between 1 and 160 characters' using errcode='23514'; end if;
 end if;
 if data->>'course_id' is not null then
 select * into course from public.courses where id=(data->>'course_id')::uuid;
 if tg_table_name='school_curriculum_course_links' and not school_private.curriculum_enrolled(course.id,cs.id) then raise exception 'Assign the programme stage to this class before linking the course; subject and year must match' using errcode='23514'; end if;
 foreach k in array array['lesson_id','assignment_id','question_set_id','exam_id'] loop
 if data->>k is not null then
 if k='lesson_id' and not exists(select 1 from public.lessons where id=(data->>k)::uuid and course_id=course.id) or
 k='assignment_id' and not exists(select 1 from public.assignments where id=(data->>k)::uuid and course_id=course.id) or
 k='question_set_id' and not exists(select 1 from public.school_question_sets where id=(data->>k)::uuid and course_id=course.id) or
 k='exam_id' and not exists(select 1 from public.exams where id=(data->>k)::uuid and course_id=course.id) then raise exception 'Learning or assessment resource must belong to the course' using errcode='23514'; end if;
 end if;
 end loop;
 end if;
 if data->>'outcome_id' is not null then
 select * into o from public.school_curriculum_outcomes where id=(data->>'outcome_id')::uuid and is_active;
 if o.id is null or not exists(select 1 from public.school_curriculum_course_links l where l.course_id=course.id and l.curriculum_subject_id=o.curriculum_subject_id and l.is_active)
 or not school_private.curriculum_enrolled(course.id,o.curriculum_subject_id,(data->>'student_id')::uuid) then raise exception 'Outcome must be in an active programme linked to this course and student' using errcode='23514'; end if;
 end if;
 if tg_table_name='school_curriculum_evidence' then
 if not exists(select 1 from public.student_assignments a join public.students s on s.id=a.student_id where a.student_id=new.student_id and a.classroom_id=course.classroom_id and a.semester_id=course.semester_id and a.is_active and s.enrollment_status='ACTIVE') then raise exception 'Student must be enrolled in this course' using errcode='23514'; end if;
 select * into sc from public.school_curriculum_scales where id=new.scale_id and is_active;
 if sc.id is null or sc.program_id is distinct from o.program_id then raise exception 'Scale must belong to the outcome programme' using errcode='23514'; end if;
 if sc.kind in ('NUMERIC','RUBRIC') then
 if new.score is null or new.score<sc.minimum or new.score>sc.maximum or new.score::text in ('NaN','Infinity','-Infinity') then raise exception 'Score is outside the programme scale' using errcode='23514'; end if;
 elsif new.score is not null or new.descriptor is null or not new.descriptor=any(sc.labels) then raise exception 'Choose a descriptor from the programme scale' using errcode='23514'; end if;
 if tg_op='INSERT' then
 new.assessment_context:=jsonb_build_object('outcome',o,'scale',sc,'program',(select to_jsonb(cp) from public.school_curriculum_programs cp where cp.id=o.program_id),'subject',(select to_jsonb(s) from public.school_curriculum_subjects s where id=o.curriculum_subject_id));
 else new.assessment_context:=old.assessment_context; end if;
 end if;
 return new;
end $$;

do $$ declare t text; maps jsonb; begin
 foreach t in array array['school_curriculum_programs','school_curriculum_stages','school_curriculum_subjects','school_curriculum_enrollments','school_curriculum_outcomes','school_curriculum_scales','school_curriculum_course_links','school_curriculum_alignments','school_curriculum_evidence'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create index on public.%I(tenant_id)',t);
 select jsonb_object_agg(a.attname,ft.relname) into maps from pg_constraint c join pg_class ft on ft.oid=c.confrelid join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
 where c.conrelid=('public.'||t)::regclass and c.contype='f' and a.attname<>'tenant_id' and exists(select 1 from pg_attribute ta where ta.attrelid=ft.oid and ta.attname='tenant_id');
 execute format('create trigger tenant_integrity before insert or update on public.%I for each row execute function public.enforce_tenant_relations(%L)',t,coalesce(maps,'{}')::text);
 execute format('create trigger curriculum_integrity before insert or update on public.%I for each row execute function school_private.curriculum_integrity()',t);
 -- Browser uses bounded RPC projections; no raw table grant or permissive policy.
 end loop;
end $$;

create function school_private.curriculum_list(resource text,page_offset integer default 0,program_uuid uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; extra text:=''; begin
 perform school_private.require_module('academic');
 if resource not in ('programs','stages','subjects','enrollments','outcomes','scales','course_links') then raise exception 'Unsupported curriculum catalog' using errcode='42501'; end if;
 if resource='enrollments' then extra:=',(select c.name from public.classrooms c where c.id=r.classroom_id)||'' · ''||(select s.name from public.school_curriculum_stages s where s.id=r.stage_id)||'' · ''||coalesce((select u.full_name from public.students s join public.users u on u.id=s.user_id where s.id=r.student_id),''Whole class / Seluruh kelas'') as name';
 elsif resource='course_links' then extra:=',(select c.name from public.courses c where c.id=r.course_id)||'' → ''||(select s.name from public.school_curriculum_subjects s where s.id=r.curriculum_subject_id) as name'; end if;
 execute format('select coalesce(jsonb_agg(to_jsonb(q)),''[]'') from (select r.*%s from public.%I r where r.tenant_id=$1 and ($3 is null or %s=$3) order by r.created_at desc,r.id limit 500 offset $2)q',extra,'school_curriculum_'||resource,case when resource='programs' then 'r.id' else 'r.program_id' end) into result using school_private.tenant(),greatest(0,least(coalesce(page_offset,0),100000)),program_uuid;
 return result;
end $$;
create function school_private.curriculum_save(resource text,payload jsonb,record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); table_name text; cols text; vals text; result jsonb; previous jsonb; course uuid;
begin
 if resource in ('alignments','evidence') then
 course:=(payload->>'course_id')::uuid;
 if record_id is not null then
 execute format('select to_jsonb(r) from public.%I r where id=$1 and tenant_id=$2 for update','school_curriculum_'||resource) into previous using record_id,t;
 course:=(previous->>'course_id')::uuid;
 end if;
 if course is null or not school_private.curriculum_course(course,true) then raise exception 'Course teacher access required' using errcode='42501'; end if;
 if previous->>'exam_id' is not null then perform school_private.require_module('exams'); end if;
 if (payload->>'exam_id') is not null then perform school_private.require_module('exams'); else perform school_private.require_module('learning'); end if;
 else
 perform school_private.require_module('academic');
 if resource not in ('programs','stages','subjects','enrollments','outcomes','scales','course_links') then raise exception 'Unsupported curriculum resource' using errcode='42501'; end if;
 end if;
 if jsonb_typeof(payload) is distinct from 'object' or payload='{}'::jsonb or payload ?| array['id','tenant_id','created_at','assessed_by','assessment_context'] then raise exception 'Invalid curriculum payload' using errcode='23514'; end if;
 table_name:='school_curriculum_'||resource;
 if exists(select 1 from jsonb_object_keys(payload) k where not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=('public.'||table_name)::regclass and a.attname=k and a.attnum>0 and not a.attisdropped)) then raise exception 'Unsupported curriculum field' using errcode='23514'; end if;
 if record_id is null then
 payload:=payload||jsonb_build_object('tenant_id',t);
 if resource='evidence' then payload:=payload||jsonb_build_object('assessed_by',auth.uid()); end if;
 select string_agg(format('%I',k),','),string_agg(format('r.%I',k),',') into cols,vals from jsonb_object_keys(payload)k;
 execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1)r returning to_jsonb(%I.*)',table_name,cols,vals,table_name,table_name) into result using payload;
 else
 select string_agg(format('%I=r.%I',k,k),',') into vals from jsonb_object_keys(payload)k;
 execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1)r where t.id=$2 and t.tenant_id=$3 returning to_jsonb(t.*)',table_name,vals,table_name) into result using payload,record_id,t;
 if result is null then raise exception 'Curriculum record not found' using errcode='P0002'; end if;
 end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(t,auth.uid(),case when record_id is null then 'CREATE' else 'UPDATE' end,'curriculum',table_name,(result->>'id')::uuid,jsonb_build_object('id',result->'id'));
 return result;
end $$;

-- Catalog for academic course mapping exposes labels, not Learning content.
create function school_private.curriculum_catalog(resource text,page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform school_private.require_module('academic');
 if resource='courses' then
 return coalesce((select jsonb_agg(to_jsonb(q)) from (select c.id,c.name,c.academic_year_id,c.classroom_id,c.subject_id from public.courses c where c.tenant_id=school_private.tenant() order by c.name,c.id limit 500 offset greatest(page_offset,0))q),'[]');
 end if;
 return school_private.curriculum_list(resource,page_offset);
end $$;

-- Minimal context for authorized course participants; students never open Academic.
create function school_private.curriculum_learning(course_uuid uuid,exam_mode boolean default false,evidence_offset integer default 0,evidence_student uuid default null,evidence_program uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t uuid:=school_private.tenant(); teacher boolean; student uuid; subject_ids uuid[]; result jsonb;
begin
 perform school_private.require_module(case when exam_mode then 'exams' else 'learning' end);
 if not school_private.curriculum_course(course_uuid) then raise exception 'Course participant access required' using errcode='42501'; end if;
 teacher:=school_private.curriculum_course(course_uuid,true);
 select id into student from public.students where user_id=auth.uid() and tenant_id=t;
 select coalesce(array_agg(l.curriculum_subject_id),'{}') into subject_ids from public.school_curriculum_course_links l where l.course_id=course_uuid and l.is_active
 and school_private.curriculum_enrolled(course_uuid,l.curriculum_subject_id,case when teacher then null else student end);
 return jsonb_build_object('can_manage',teacher,
 'programs',coalesce((select jsonb_agg(to_jsonb(p)) from public.school_curriculum_programs p where p.id in(select cs.program_id from public.school_curriculum_subjects cs where cs.id=any(subject_ids))),'[]'),
 'subjects',coalesce((select jsonb_agg(to_jsonb(cs)) from public.school_curriculum_subjects cs where cs.id=any(subject_ids)),'[]'),
 'outcomes',coalesce((select jsonb_agg(to_jsonb(o) order by o.sequence,o.code,o.id) from public.school_curriculum_outcomes o where o.curriculum_subject_id=any(subject_ids) and o.is_active),'[]'),
 'scales',coalesce((select jsonb_agg(to_jsonb(s)) from public.school_curriculum_scales s where s.is_active and s.program_id in(select cs.program_id from public.school_curriculum_subjects cs where cs.id=any(subject_ids))),'[]'),
 'students',case when teacher then coalesce((select jsonb_agg(to_jsonb(q)) from (select distinct s.id,u.full_name as name from public.students s join public.users u on u.id=s.user_id join public.student_assignments a on a.student_id=s.id join public.courses c on c.classroom_id=a.classroom_id and c.semester_id=a.semester_id where c.id=course_uuid and a.is_active and s.enrollment_status='ACTIVE')q),'[]') else '[]'::jsonb end,
 'lessons',case when exam_mode then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',title)) from public.lessons where course_id=course_uuid and (teacher or is_published)),'[]') end,
 'assignments',case when exam_mode then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',title)) from public.assignments where course_id=course_uuid and (teacher or is_published)),'[]') end,
 'question_sets',case when teacher and not exam_mode then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',title)) from public.school_question_sets where course_id=course_uuid),'[]') else '[]'::jsonb end,
 'exams',case when exam_mode then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',title)) from public.exams where course_id=course_uuid and (teacher or status<>'DRAFT')),'[]') else '[]'::jsonb end,
 'alignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.school_curriculum_alignments a join public.school_curriculum_outcomes o on o.id=a.outcome_id where a.course_id=course_uuid and o.curriculum_subject_id=any(subject_ids)
 and (exam_mode=(a.exam_id is not null)) and (teacher or (a.question_set_id is null and (a.lesson_id is null or exists(select 1 from public.lessons where id=a.lesson_id and is_published)) and (a.assignment_id is null or exists(select 1 from public.assignments where id=a.assignment_id and is_published)) and (a.exam_id is null or exists(select 1 from public.exams where id=a.exam_id and status<>'DRAFT'))))),'[]'),
 'evidence',coalesce((select jsonb_agg(to_jsonb(q)) from (select e.* from public.school_curriculum_evidence e where e.course_id=course_uuid and (exam_mode=(e.exam_id is not null)) and (teacher or (e.student_id=student and e.status='PUBLISHED')) and (evidence_student is null or e.student_id=evidence_student) and (evidence_program is null or e.assessment_context->'program'->>'id'=evidence_program::text) order by e.assessed_at desc,e.id limit 100 offset greatest(0,least(coalesce(evidence_offset,0),100000)))q),'[]'));
end $$;

create function public.school_curriculum_list(resource text,page_offset integer default 0,program_uuid uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.curriculum_list(resource,page_offset,program_uuid) $$;
create function public.school_curriculum_save(resource text,payload jsonb,record_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.curriculum_save(resource,payload,record_id) $$;
create function public.school_curriculum_catalog(resource text,page_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select school_private.curriculum_catalog(resource,page_offset) $$;
create function public.school_curriculum_learning(course_uuid uuid,exam_mode boolean default false,evidence_offset integer default 0,evidence_student uuid default null,evidence_program uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.curriculum_learning(course_uuid,exam_mode,evidence_offset,evidence_student,evidence_program) $$;
revoke all on function school_private.curriculum_course(uuid,boolean),school_private.curriculum_enrolled(uuid,uuid,uuid),school_private.curriculum_integrity(),school_private.curriculum_list(text,integer,uuid),school_private.curriculum_save(text,jsonb,uuid),school_private.curriculum_catalog(text,integer),school_private.curriculum_learning(uuid,boolean,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function school_private.curriculum_list(text,integer,uuid),school_private.curriculum_save(text,jsonb,uuid),school_private.curriculum_catalog(text,integer),school_private.curriculum_learning(uuid,boolean,integer,uuid,uuid) to authenticated;
revoke all on function public.school_curriculum_list(text,integer,uuid),public.school_curriculum_save(text,jsonb,uuid),public.school_curriculum_catalog(text,integer),public.school_curriculum_learning(uuid,boolean,integer,uuid,uuid) from public,anon;
grant execute on function public.school_curriculum_list(text,integer,uuid),public.school_curriculum_save(text,jsonb,uuid),public.school_curriculum_catalog(text,integer),public.school_curriculum_learning(uuid,boolean,integer,uuid,uuid) to authenticated;

create function public.school_curriculum_courses(exam_mode boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$ begin return school_private.curriculum_courses(exam_mode); end $$;
create function school_private.curriculum_courses(exam_mode boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform school_private.require_module(case when exam_mode then 'exams' else 'learning' end);
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.courses where tenant_id=school_private.tenant() and school_private.curriculum_course(id)),'[]');
end $$;
revoke all on function public.school_curriculum_courses(boolean),school_private.curriculum_courses(boolean) from public,anon;
grant execute on function public.school_curriculum_courses(boolean),school_private.curriculum_courses(boolean) to authenticated;
-- Atomic programme + starter stages. Values are editable school configuration.
create function school_private.curriculum_create_program(payload jsonb,stages jsonb default '[]') returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; stage jsonb; begin
 perform school_private.require_module('academic');
 if jsonb_typeof(stages) is distinct from 'array' or jsonb_array_length(stages)>32 then raise exception 'Invalid starter stages' using errcode='23514'; end if;
 p:=school_private.curriculum_save('programs',payload);
 for stage in select value from jsonb_array_elements(stages) loop
 if jsonb_typeof(stage) is distinct from 'object' or exists(select 1 from jsonb_object_keys(stage) k where k not in ('code','name','grade_from','grade_to')) then raise exception 'Invalid starter stage' using errcode='23514'; end if;
 perform school_private.curriculum_save('stages',stage||jsonb_build_object('program_id',p->>'id'));
 end loop;
 return p;
end $$;
create function public.school_curriculum_create_program(payload jsonb,stages jsonb default '[]') returns jsonb language sql security invoker set search_path='' as $$ select school_private.curriculum_create_program(payload,stages) $$;
revoke all on function public.school_curriculum_create_program(jsonb,jsonb),school_private.curriculum_create_program(jsonb,jsonb) from public,anon;
grant execute on function public.school_curriculum_create_program(jsonb,jsonb),school_private.curriculum_create_program(jsonb,jsonb) to authenticated;
create function school_private.curriculum_unlink(alignment_uuid uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.school_curriculum_alignments; begin
 select * into a from public.school_curriculum_alignments where id=alignment_uuid and tenant_id=school_private.tenant() for update;
 if a.id is null or not school_private.curriculum_course(a.course_id,true) then raise exception 'Course teacher access required' using errcode='42501'; end if;
 perform school_private.require_module(case when a.exam_id is null then 'learning' else 'exams' end);
 delete from public.school_curriculum_alignments where id=a.id;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id) values(a.tenant_id,auth.uid(),'DELETE','curriculum','school_curriculum_alignments',a.id);
end $$;
create function public.school_curriculum_unlink(alignment_uuid uuid) returns void language sql security invoker set search_path='' as $$ select school_private.curriculum_unlink(alignment_uuid) $$;
revoke all on function public.school_curriculum_unlink(uuid),school_private.curriculum_unlink(uuid) from public,anon;
grant execute on function public.school_curriculum_unlink(uuid),school_private.curriculum_unlink(uuid) to authenticated;
-- Early years and vocational grade 13 are valid school stages too.
alter table public.school_question_sets drop constraint school_question_sets_grade_level_check;
alter table public.school_question_sets add constraint school_question_sets_grade_level_check check(grade_level between 0 and 20);
-- Existing AI requests already include the server reservation context. Add only
-- aligned objectives; no student names, marks or feedback enter the prompt.
alter function school_private.ai_reserve(uuid,uuid,integer) rename to ai_reserve_before_curriculum;
revoke all on function school_private.ai_reserve_before_curriculum(uuid,uuid,integer) from public,anon,authenticated;
create function school_private.ai_reserve(request_id uuid,set_uuid uuid,question_count integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; context jsonb; bank public.school_question_sets; begin
 result:=school_private.ai_reserve_before_curriculum(request_id,set_uuid,question_count);
 select * into bank from public.school_question_sets where id=set_uuid and tenant_id=school_private.tenant();
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into context from (
 select distinct p.name as programme,p.framework,p.version,p.language,cs.syllabus_code,cs.syllabus_version,cs.level,o.code,o.kind,o.name,o.sequence,left(o.description,2000) as description
 from public.school_curriculum_alignments a join public.school_curriculum_outcomes o on o.id=a.outcome_id and o.is_active
 join public.school_curriculum_subjects cs on cs.id=o.curriculum_subject_id
 join public.school_curriculum_programs p on p.id=o.program_id and p.is_active
 join public.school_curriculum_course_links l on l.course_id=bank.course_id and l.curriculum_subject_id=cs.id and l.is_active
 where a.course_id=bank.course_id and school_private.curriculum_enrolled(bank.course_id,cs.id)
 and (a.question_set_id=bank.id or a.lesson_id=bank.lesson_id or a.assignment_id=bank.assignment_id or num_nonnulls(a.question_set_id,a.lesson_id,a.assignment_id,a.exam_id)=0)
 order by p.name,o.sequence,o.code limit 40)q;
 return result||jsonb_build_object('curriculum_alignment',context);
end $$;
revoke all on function school_private.ai_reserve(uuid,uuid,integer) from public,anon;
grant execute on function school_private.ai_reserve(uuid,uuid,integer) to authenticated;
