-- Part 11: scoped project boards, completion evidence and finance workspace.
-- Additive changes preserve legacy tasks, receipts, permissions and APIs.
alter table public.team_tasks drop constraint team_tasks_status_check;
alter table public.team_tasks add constraint team_tasks_status_check check(status in('BACKLOG','TODO','IN_PROGRESS','REVIEW','BLOCKED','DONE'));
alter table public.team_task_transitions drop constraint team_task_transitions_from_status_check;
alter table public.team_task_transitions drop constraint team_task_transitions_to_status_check;
alter table public.team_task_transitions add check(from_status is null or from_status in('BACKLOG','TODO','IN_PROGRESS','REVIEW','BLOCKED','DONE'));
alter table public.team_task_transitions add check(to_status in('BACKLOG','TODO','IN_PROGRESS','REVIEW','BLOCKED','DONE'));
create table public.school_task_assignees(task_id uuid not null references public.team_tasks on delete cascade,user_id uuid not null references public.users on delete cascade,tenant_id uuid not null references public.tenants,primary key(task_id,user_id));
create index school_task_assignees_user on public.school_task_assignees(user_id,task_id);
alter table public.school_task_assignees enable row level security;
revoke all on public.school_task_assignees from public,anon,authenticated;
grant all on public.school_task_assignees to service_role;
create trigger tenant_integrity before insert or update on public.school_task_assignees for each row execute function public.enforce_tenant_relations('{"task_id":"team_tasks","user_id":"users"}');
insert into public.school_task_assignees(task_id,user_id,tenant_id) select id,assignee_user_id,tenant_id from public.team_tasks where assignee_user_id is not null;

-- Atomic optional settlement account during tenant creation. The existing account
-- editor remains the authority for subsequent replacements and activation.
alter function school_private.owner_save(text,jsonb,uuid) rename to owner_save_before_part11;
revoke all on function school_private.owner_save_before_part11(text,jsonb,uuid) from public,anon,authenticated;
create function school_private.owner_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform school_private.require_owner();
 result:=school_private.owner_save_before_part11(kind,payload-'settlement_account',record_id);
 if kind='tenant' and record_id is null and payload ? 'settlement_account' and payload->'settlement_account'<>'null'::jsonb then
 perform school_private.owner_save_before_part11('settlement_account',payload->'settlement_account'||jsonb_build_object('tenant_id',result->>'id','is_active',true),null);
 end if;return result;
end $$;
revoke all on function school_private.owner_save(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function school_private.owner_save(text,jsonb,uuid) to authenticated;

create function school_private.project11_access(project uuid,manage boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.users u join public.team_projects p on p.id=project join public.tenants t on t.id=p.tenant_id left join public.school_settings s on s.tenant_id=t.id
 where u.id=auth.uid() and u.is_active and u.deleted_at is null and t.is_active and t.deleted_at is null and coalesce(s.modules->'team','true')='true'::jsonb and (
 (p.tenant_id=u.tenant_id and (p.owner_user_id=u.id or exists(select 1 from public.team_project_members m where m.project_id=p.id and m.user_id=u.id and (not manage or m.member_role in('OWNER','MANAGER'))) or not manage and exists(select 1 from public.school_task_assignees a join public.team_tasks k on k.id=a.task_id where k.project_id=p.id and a.user_id=u.id)))
 or not manage and school_private.role(array['PRINCIPAL']) and (
 (not school_private.foundation_principal(u.id) and p.tenant_id=u.tenant_id) or exists(select 1 from public.school_group_principals g where g.user_id=u.id and g.group_id=t.group_id))
 ));
$$;
revoke all on function school_private.project11_access(uuid,boolean) from public,anon,authenticated;

-- Family navigation uses only the narrow new RPC; no legacy API grants change.
alter table public.team_project_members add column assignment_only boolean not null default false;

create function school_private.project11_assignment_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare project uuid;recipient uuid;tenant uuid;label text;begin
 if tg_table_name='school_task_assignees' then
 select project_id,title into project,label from public.team_tasks where id=new.task_id;recipient:=new.user_id;tenant:=new.tenant_id;
 else project:=new.project_id;recipient:=new.user_id;tenant:=new.tenant_id;select name into label from public.team_projects where id=project;end if;
 insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id) values(tenant,recipient,'INFO','O-Team assignment / Penugasan O-Team',label,'team_project',project);
 return new;end $$;
revoke all on function school_private.project11_assignment_notice() from public,anon,authenticated;
create trigger p11_member_notice after insert on public.team_project_members for each row execute function school_private.project11_assignment_notice();
create trigger p11_task_notice after insert on public.school_task_assignees for each row execute function school_private.project11_assignment_notice();

create function school_private.project11_complete(project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.team_tasks where project_id=project) and not exists(select 1 from public.team_tasks where project_id=project and status<>'DONE')
$$;
revoke all on function school_private.project11_complete(uuid) from public,anon,authenticated;

create function school_private.project11(action text default 'list',project_uuid uuid default null,payload jsonb default '{}',record_id uuid default null,page_offset integer default 0,target_tenant uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();project_row public.team_projects;task public.team_tasks;result jsonb;member uuid;parent uuid;ids uuid[];old_status text;can_manage boolean;begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid() and is_active and deleted_at is null) then raise exception 'Authentication required' using errcode='42501';end if;
 if page_offset<0 or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>30000 then raise exception 'Invalid project request';end if;
 if action='list' then
 if target_tenant is not null and school_private.role(array['PRINCIPAL']) then tenant:=school_private.principal_scope(target_tenant);elsif target_tenant is not null and target_tenant<>tenant then raise exception 'School outside your access' using errcode='42501';end if;
 return jsonb_build_object('can_create',public.app_has_permission(auth.uid(),'team_projects.create') and tenant=school_private.tenant(),'count',(select count(*) from public.team_projects p where p.tenant_id=tenant and school_private.project11_access(p.id)),
 'projects',coalesce((select jsonb_agg(to_jsonb(x)) from(select p.*,school_private.project11_access(p.id,true) can_manage,(select count(*) from public.team_tasks k where k.project_id=p.id) task_count,(select count(*) from public.team_tasks k where k.project_id=p.id and k.status='DONE') done_count from public.team_projects p where p.tenant_id=tenant and school_private.project11_access(p.id) order by p.created_at desc,p.id limit 50 offset page_offset)x),'[]'));
 end if;
 if not school_private.project11_access(project_uuid) then raise exception 'Project access required' using errcode='42501';end if;
 select * into project_row from public.team_projects where id=project_uuid;
 tenant:=project_row.tenant_id;can_manage:=school_private.project11_access(project_uuid,true);
 if action='read' then
 return jsonb_build_object('project',to_jsonb(project_row),'can_manage',can_manage,'complete',school_private.project11_complete(project_uuid),'task_count',(select count(*) from public.team_tasks where project_id=project_uuid),
 'tasks',coalesce((select jsonb_agg(to_jsonb(k)||jsonb_build_object('assignees',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.full_name)) from public.school_task_assignees a join public.users u on u.id=a.user_id where a.task_id=k.id),'[]'),'can_edit',can_manage or exists(select 1 from public.school_task_assignees a where a.task_id=k.id and a.user_id=auth.uid()))) from(select * from public.team_tasks where project_id=project_uuid order by created_at,id limit 100 offset page_offset)k),'[]'),
 'committee',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'user_id',c.user_id,'name',u.full_name,'position',c.position)) from public.school_project_committees c join public.users u on u.id=c.user_id where c.project_id=project_uuid),'[]'),
 'invoices',coalesce((select jsonb_agg(to_jsonb(i)) from public.team_project_invoices i where i.project_id=project_uuid),'[]'),
 'payments',coalesce((select jsonb_agg(to_jsonb(i)) from public.team_project_payments i where i.project_id=project_uuid),'[]'),
 'comments',coalesce((select jsonb_agg(to_jsonb(c)) from(select c.id,c.task_id,c.body,c.created_at,u.full_name name from public.team_task_comments c join public.users u on u.id=c.author_user_id where c.project_id=project_uuid order by c.created_at desc limit 100)c),'[]'));
 end if;
 if action='people' then
 if not can_manage then raise exception 'Project manager required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(u)) from(select id,full_name name from public.users where tenant_id=tenant and is_active and deleted_at is null order by full_name,id limit 500 offset page_offset)u),'[]');end if;
 -- Serialize completion, task changes, and evidence uploads against the project.
 perform 1 from public.team_projects where id=project_uuid for update;
 if action='move' then
 select * into task from public.team_tasks where id=record_id and project_id=project_uuid for update;
 if task.id is null or not(can_manage or exists(select 1 from public.school_task_assignees where task_id=task.id and user_id=auth.uid())) then raise exception 'Task assignment required' using errcode='42501';end if;
 if payload->>'status' not in('TODO','IN_PROGRESS','BLOCKED','DONE') or payload->>'status' is null then raise exception 'Invalid status';end if;
 if payload->>'status'='DONE' and exists(select 1 from public.team_tasks where parent_task_id=task.id and status<>'DONE') then raise exception 'Complete all subtasks first';end if;
 old_status:=task.status;
 update public.team_tasks set status=payload->>'status',updated_at=now() where id=task.id returning to_jsonb(team_tasks.*) into result;
 if payload->>'status'<>'DONE' and task.parent_task_id is not null then update public.team_tasks set status='IN_PROGRESS' where id=task.parent_task_id and status='DONE';end if;
 if payload->>'status'<>'DONE' then update public.team_projects set status='ACTIVE' where id=project_uuid and status='COMPLETED';end if;
 insert into public.team_task_transitions(tenant_id,project_id,task_id,from_status,to_status,moved_by_user_id) values(tenant,project_uuid,task.id,old_status,payload->>'status',auth.uid());
 elsif action='comment' then
 if not exists(select 1 from public.team_tasks where id=record_id and project_id=project_uuid) then raise exception 'Task unavailable';end if;
 insert into public.team_task_comments(tenant_id,project_id,task_id,author_user_id,body) values(tenant,project_uuid,record_id,auth.uid(),trim(payload->>'body')) returning to_jsonb(team_task_comments.*) into result;
 else
 if not can_manage then raise exception 'Project manager required' using errcode='42501';end if;
 if action='task' then
 parent:=nullif(payload->>'parent_task_id','')::uuid;
 if parent is not null and (parent=record_id or not exists(select 1 from public.team_tasks where id=parent and project_id=project_uuid and parent_task_id is null) or exists(select 1 from public.team_tasks where parent_task_id=record_id)) then raise exception 'Choose a top-level task in this project';end if;
 if jsonb_typeof(payload->'assignees') is distinct from 'array' or jsonb_array_length(payload->'assignees')>50 then raise exception 'Select up to 50 people';end if;
 select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(payload->'assignees');
 if exists(select 1 from unnest(ids)u where not exists(select 1 from public.users where id=u and tenant_id=tenant and is_active and deleted_at is null)) then raise exception 'Choose active users from this school';end if;
 if payload->>'status' not in('TODO','IN_PROGRESS','BLOCKED','DONE') or payload->>'status' is null then raise exception 'Invalid status';end if;
 if payload->>'status'='DONE' and exists(select 1 from public.team_tasks where parent_task_id=record_id and status<>'DONE') then raise exception 'Complete all subtasks first';end if;
 foreach member in array ids loop insert into public.team_project_members(tenant_id,project_id,user_id,member_role,assignment_only) values(tenant,project_uuid,member,'MEMBER',true) on conflict do nothing;end loop;
 if record_id is null then
 insert into public.team_tasks(tenant_id,project_id,title,description,status,priority,reporter_user_id,assignee_user_id,starts_on,due_date,parent_task_id) values(tenant,project_uuid,trim(payload->>'title'),payload->>'description',payload->>'status',coalesce(payload->>'priority','MEDIUM'),auth.uid(),ids[1],nullif(payload->>'starts_on','')::date,nullif(payload->>'due_date','')::date,parent) returning * into task;
 else
 update public.team_tasks set title=trim(payload->>'title'),description=payload->>'description',status=payload->>'status',priority=coalesce(payload->>'priority',priority),assignee_user_id=ids[1],starts_on=nullif(payload->>'starts_on','')::date,due_date=nullif(payload->>'due_date','')::date,parent_task_id=parent,updated_at=now() where id=record_id and project_id=project_uuid returning * into task;
 end if;
 if task.id is null then raise exception 'Task unavailable';end if;
 delete from public.school_task_assignees where task_id=task.id and not(user_id=any(ids));
 insert into public.school_task_assignees(task_id,user_id,tenant_id) select task.id,unnest(ids),tenant on conflict do nothing;
 delete from public.team_project_members m where m.project_id=project_uuid and m.assignment_only and not exists(select 1 from public.school_task_assignees a join public.team_tasks k on k.id=a.task_id where k.project_id=project_uuid and a.user_id=m.user_id) and not exists(select 1 from public.school_project_committees c where c.project_id=project_uuid and c.user_id=m.user_id);
 if task.status<>'DONE' then
 update public.team_tasks set status='IN_PROGRESS' where id=parent and status='DONE';
 update public.team_projects set status='ACTIVE' where id=project_uuid and status='COMPLETED';end if;
 result:=to_jsonb(task);
 elsif action='member' then
 member:=(payload->>'user_id')::uuid;
 if not exists(select 1 from public.users where id=member and tenant_id=tenant and is_active and deleted_at is null) or coalesce(payload->>'position','') not in('MEMBER','COORDINATOR') then raise exception 'Choose a school user and position';end if;
 insert into public.school_project_committees(tenant_id,project_id,user_id,position) values(tenant,project_uuid,member,payload->>'position') on conflict do nothing;
 insert into public.team_project_members(tenant_id,project_id,user_id,member_role) values(tenant,project_uuid,member,'MEMBER') on conflict(project_id,user_id) do update set assignment_only=false;result:=jsonb_build_object('id',member);
 elsif action='project' then
 if payload->>'status'='COMPLETED' and not school_private.project11_complete(project_uuid) then raise exception 'Complete all tasks and subtasks first';end if;
 update public.team_projects set starts_on=nullif(payload->>'starts_on','')::date,due_on=nullif(payload->>'due_on','')::date,status=coalesce(payload->>'status',status) where id=project_uuid returning to_jsonb(team_projects.*) into result;
 elsif action='invoice' then
 insert into public.team_project_invoices(tenant_id,project_id,invoice_number,description,amount,due_date) values(tenant,project_uuid,payload->>'invoice_number',payload->>'description',(payload->>'amount')::numeric,(payload->>'due_date')::date) returning to_jsonb(team_project_invoices.*) into result;
 elsif action='payment' then
 if not exists(select 1 from public.team_project_invoices where id=(payload->>'project_invoice_id')::uuid and project_id=project_uuid) then raise exception 'Invoice unavailable';end if;
 insert into public.team_project_payments(tenant_id,project_id,project_invoice_id,receipt_number,amount,status) values(tenant,project_uuid,(payload->>'project_invoice_id')::uuid,payload->>'receipt_number',(payload->>'amount')::numeric,'CONFIRMED') returning to_jsonb(team_project_payments.*) into result;
 else raise exception 'Unknown project action';end if;
 end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,auth.uid(),upper(action),'TEAM','team_projects',project_uuid,jsonb_build_object('id',result->>'id','status',result->>'status'));
 return result;
end $$;
create function public.school_project11(action text default 'list',project_uuid uuid default null,payload jsonb default '{}',record_id uuid default null,page_offset integer default 0,target_tenant uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.project11(action,project_uuid,payload,record_id,page_offset,target_tenant) $$;
revoke all on function public.school_project11(text,uuid,jsonb,uuid,integer,uuid),school_private.project11(text,uuid,jsonb,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.school_project11(text,uuid,jsonb,uuid,integer,uuid),school_private.project11(text,uuid,jsonb,uuid,integer,uuid) to authenticated;

-- Backfill legacy single PICs and mirror future legacy-created tasks.
create function school_private.project11_legacy_pic() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.assignee_user_id is not null then insert into public.school_task_assignees(task_id,user_id,tenant_id) values(new.id,new.assignee_user_id,new.tenant_id) on conflict do nothing;end if;return new;end $$;
revoke all on function school_private.project11_legacy_pic() from public,anon,authenticated;
create trigger p11_legacy_pic after insert or update of assignee_user_id on public.team_tasks for each row execute function school_private.project11_legacy_pic();

-- Private project evidence: only the project audience can retrieve it. Uploads
-- require a manager and a fully completed task tree at the time of insertion.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('project-evidence','project-evidence',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
create function school_private.project11_media(path text,writing boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
declare parts text[]:=string_to_array(path,'/');project uuid;begin
 if cardinality(parts)<>3 then return false;end if;
 begin project:=parts[2]::uuid;exception when invalid_text_representation then return false;end;
 if not exists(select 1 from public.team_projects where id=project and tenant_id::text=parts[1]) or not school_private.project11_access(project,writing) then return false;end if;
 if writing then perform 1 from public.team_projects where id=project for update;return school_private.project11_complete(project);end if;return true;end $$;
revoke all on function school_private.project11_media(text,boolean) from public,anon,authenticated;
grant execute on function school_private.project11_media(text,boolean) to authenticated;
create policy project_evidence_read on storage.objects for select to authenticated using(bucket_id='project-evidence' and school_private.project11_media(name));
create policy project_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='project-evidence' and school_private.project11_media(name,true));
create policy project_evidence_delete on storage.objects for delete to authenticated using(bucket_id='project-evidence' and school_private.project11_media(name,true));
notify pgrst,'reload schema';

-- Finance projections use exact invoice balances. Parent/student access stays
-- child-scoped; Principal scope is checked against current foundation membership.
create function school_private.finance11(resource text default 'overview',page_offset integer default 0,filters jsonb default '{}',target_tenant uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();admin boolean:=school_private.role(array['STAFF','PRINCIPAL']);today date;result jsonb;q text:=coalesce(filters->>'query','');begin
 if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid() and is_active and deleted_at is null) then raise exception 'Authentication required' using errcode='42501';end if;
 if school_private.role(array['PRINCIPAL']) then tenant:=school_private.principal_scope(target_tenant);elsif target_tenant is not null and target_tenant<>tenant then raise exception 'School outside your access' using errcode='42501';end if;
 if not admin and not school_private.role(array['PARENT','STUDENT']) then raise exception 'Finance access required' using errcode='42501';end if;
 if not exists(select 1 from public.tenants t left join public.school_settings s on s.tenant_id=t.id where t.id=tenant and t.is_active and t.deleted_at is null and coalesce(s.modules->'finance','true')='true'::jsonb) then raise exception 'Finance unavailable' using errcode='42501';end if;
 if page_offset<0 or length(q)>200 or jsonb_typeof(filters) is distinct from 'object' then raise exception 'Invalid filters';end if;
 select (now() at time zone timezone)::date into today from public.tenants where id=tenant;
if resource='overview' then
with bills as(select b.*,u.full_name student_name,coalesce(pay.paid,0) paid_amount,greatest(0,b.amount-coalesce(pay.paid,0)) outstanding_amount from public.student_bills b join public.students st on st.id=b.student_id join public.users u on u.id=st.user_id left join lateral(select sum(amount)paid from public.payments where student_bill_id=b.id and status='CONFIRMED')pay on true where b.tenant_id=tenant and (admin or school_private.child(st.id) and b.status not in('DRAFT','VOID'))), visible as(select * from bills where (q='' or strpos(lower(student_name||' '||invoice_number),lower(q))>0) and (coalesce(filters->>'student_id','')='' or student_id=(filters->>'student_id')::uuid) and (coalesce(filters->>'from','')='' or due_date>=(filters->>'from')::date) and (coalesce(filters->>'to','')='' or due_date<=(filters->>'to')::date)) 
 select jsonb_build_object('today',today,'can_manage',school_private.role(array['STAFF']),'billed',coalesce(sum(amount)filter(where status not in('DRAFT','VOID')),0),'collected',coalesce(sum(paid_amount)filter(where status not in('DRAFT','VOID')),0),'outstanding',coalesce(sum(outstanding_amount)filter(where status not in('DRAFT','VOID')),0),'overdue',coalesce(sum(outstanding_amount)filter(where status not in('DRAFT','VOID') and due_date<today),0),'due_soon',coalesce(sum(outstanding_amount)filter(where status not in('DRAFT','VOID') and due_date between today and today+7),0),
 'aging',jsonb_build_array(coalesce(sum(outstanding_amount)filter(where status not in('DRAFT','VOID') and due_date>=today),0),coalesce(sum(outstanding_amount)filter(where status not in('DRAFT','VOID') and today-due_date between 1 and 30),0),coalesce(sum(outstanding_amount)filter(where status not in('DRAFT','VOID') and today-due_date between 31 and 60),0),coalesce(sum(outstanding_amount)filter(where status not in('DRAFT','VOID') and today-due_date between 61 and 90),0),coalesce(sum(outstanding_amount)filter(where status not in('DRAFT','VOID') and today-due_date>90),0)),
 'students',(select count(distinct student_id) from visible),'pending_payments',(select count(*) from public.payments p join bills b on b.id=p.student_bill_id where p.status='PENDING')) into result from visible;
 return result;
 elsif resource in('bills','collections','students') then
with bills as(select b.*,u.full_name student_name,coalesce(pay.paid,0) paid_amount,greatest(0,b.amount-coalesce(pay.paid,0)) outstanding_amount from public.student_bills b join public.students st on st.id=b.student_id join public.users u on u.id=st.user_id left join lateral(select sum(amount)paid from public.payments where student_bill_id=b.id and status='CONFIRMED')pay on true where b.tenant_id=tenant and (admin or school_private.child(st.id) and b.status not in('DRAFT','VOID'))), visible as(select * from bills where (q='' or strpos(lower(student_name||' '||invoice_number),lower(q))>0) and (coalesce(filters->>'student_id','')='' or student_id=(filters->>'student_id')::uuid) and (coalesce(filters->>'from','')='' or due_date>=(filters->>'from')::date) and (coalesce(filters->>'to','')='' or due_date<=(filters->>'to')::date)) , matching as(select * from visible where (resource<>'collections' or status not in('DRAFT','VOID') and outstanding_amount>0 and due_date<today) and (coalesce(filters->>'status','')='' or status=filters->>'status'))
 select jsonb_build_object('count',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,student_id,invoice_number,student_name,amount,due_date,status,paid_amount,outstanding_amount,greatest(0,today-due_date) days_overdue from matching order by due_date,id limit 100 offset page_offset)x),'[]')) into result;return result;
 elsif resource='payments' then
 with matching as(select p.id,p.receipt_number,p.amount,p.paid_at,p.status,p.reference,b.invoice_number,u.full_name student_name from public.payments p join public.student_bills b on b.id=p.student_bill_id join public.students st on st.id=b.student_id join public.users u on u.id=st.user_id where p.tenant_id=tenant and (admin or school_private.child(st.id)) and (q='' or strpos(lower(u.full_name||' '||p.receipt_number),lower(q))>0) and (coalesce(filters->>'student_id','')='' or b.student_id=(filters->>'student_id')::uuid) and (coalesce(filters->>'status','')='' or p.status=filters->>'status') and (coalesce(filters->>'from','')='' or p.paid_at::date>=(filters->>'from')::date) and (coalesce(filters->>'to','')='' or p.paid_at::date<=(filters->>'to')::date))
 select jsonb_build_object('count',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from matching order by paid_at desc,id limit 100 offset page_offset)x),'[]')) into result;return result;
 elsif resource='reconciliation' and admin then
 with matching as(select i.id,i.provider,i.provider_id,i.amount,i.status,i.created_at,b.invoice_number from public.school_payment_intents i left join public.student_bills b on b.id=i.bill_id where i.tenant_id=tenant and (coalesce(filters->>'status','')='' or i.status=filters->>'status'))
 select jsonb_build_object('count',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from matching order by created_at desc limit 100 offset page_offset)x),'[]')) into result;return result;
 elsif resource='cash' and admin then
 with flows as(select id,entry_date,kind,amount,description,voided_at,created_at from public.school_cash_entries where tenant_id=tenant)
 select jsonb_build_object('count',(select count(*) from flows),'rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from flows order by entry_date desc,created_at desc limit 100 offset page_offset)x),'[]'),'balance',(select coalesce(sum(case when kind='EXPENSE' then -amount else amount end),0) from flows where voided_at is null)+(select coalesce(sum(amount),0) from public.payments where tenant_id=tenant and status='CONFIRMED')) into result;return result;
 else raise exception 'Finance resource unavailable' using errcode='42501';end if;
end $$;
create function public.school_finance11(resource text default 'overview',page_offset integer default 0,filters jsonb default '{}',target_tenant uuid default null) returns jsonb language sql security invoker set search_path='' as $$select school_private.finance11(resource,page_offset,filters,target_tenant)$$;
revoke all on function school_private.finance11(text,integer,jsonb,uuid),public.school_finance11(text,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function school_private.finance11(text,integer,jsonb,uuid),public.school_finance11(text,integer,jsonb,uuid) to authenticated;

create table public.school_billing_plans(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants,request_key uuid not null,name text not null,category_id uuid not null references public.finance_categories,amount numeric(14,2) not null,discount numeric(14,2) not null default 0,occurrences integer not null,first_due date not null,created_by uuid not null references public.users,created_at timestamptz not null default now(),unique(tenant_id,request_key));
alter table public.school_billing_plans enable row level security;revoke all on public.school_billing_plans from public,anon,authenticated;grant all on public.school_billing_plans to service_role;
create function school_private.billing11(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant();plan uuid;student uuid;students uuid[];bill uuid;occ integer;idx integer;price numeric;discount numeric;due date;result jsonb;begin
 perform school_private.require_module('finance');
 if not school_private.role(array['STAFF']) or not public.app_has_permission(auth.uid(),'billing.create') then raise exception 'Billing permission required' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>100000 or jsonb_typeof(payload->'students') is distinct from 'array' or jsonb_array_length(payload->'students') not between 1 and 1000 then raise exception 'Select between 1 and 1000 students';end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text||coalesce(payload->>'request_key',''),111));
 select id into plan from public.school_billing_plans where tenant_id=tenant and request_key=(payload->>'request_key')::uuid;if plan is not null then return jsonb_build_object('id',plan,'already_published',true);end if;
 price:=(payload->>'amount')::numeric;discount:=coalesce((payload->>'discount')::numeric,0);occ:=(payload->>'occurrences')::integer;due:=(payload->>'first_due')::date;
 if price is null or price<=0 or price<>trunc(price) or discount<0 or discount>=price or discount<>trunc(discount) or occ is null or occ not between 1 and 36 or due is null or length(trim(payload->>'name')) not between 2 and 160 then raise exception 'Invalid billing plan';end if;
 if not exists(select 1 from public.finance_categories where id=(payload->>'category_id')::uuid and tenant_id=tenant and is_active and category_type='INCOME') then raise exception 'Choose an active income category';end if;
 select array_agg(distinct value::uuid) into students from jsonb_array_elements_text(payload->'students');
 if exists(select 1 from unnest(students)s where not exists(select 1 from public.students st join public.users u on u.id=st.user_id where st.id=s and st.tenant_id=tenant and u.is_active and u.deleted_at is null)) then raise exception 'Choose active students in this school';end if;
 insert into public.school_billing_plans(tenant_id,request_key,name,category_id,amount,discount,occurrences,first_due,created_by) values(tenant,(payload->>'request_key')::uuid,trim(payload->>'name'),(payload->>'category_id')::uuid,price,discount,occ,due,auth.uid()) returning id into plan;
 foreach student in array students loop
 for idx in 0..occ-1 loop
 insert into public.student_bills(tenant_id,student_id,category_id,invoice_number,amount,due_date,status) values(tenant,student,(payload->>'category_id')::uuid,'BP-'||substr(plan::text,1,8)||'-'||student::text||'-'||idx,price-discount,(due+make_interval(months=>idx))::date,'OPEN') returning id into bill;
 end loop;end loop;
 result:=jsonb_build_object('id',plan,'invoices',cardinality(students)*occ,'total',(price-discount)*cardinality(students)*occ);
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,auth.uid(),'PUBLISH','FINANCE','school_billing_plans',plan,result);return result;
end $$;
create function public.school_billing11(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select school_private.billing11(payload)$$;
revoke all on function public.school_billing11(jsonb),school_private.billing11(jsonb) from public,anon,authenticated;grant execute on function public.school_billing11(jsonb),school_private.billing11(jsonb) to authenticated;
notify pgrst,'reload schema';
