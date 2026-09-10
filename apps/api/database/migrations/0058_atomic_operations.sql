-- Phase 52: one transaction per request, decision, or cancellation.
-- Minimal approver directory for requesters who cannot access user administration.
create function public.list_operational_approvers(actor_id uuid, page_offset integer default 0, page_limit integer default 50) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(q),'[]'::jsonb) from (
    select u.id,u.full_name from public.users u where u.tenant_id=public.app_tenant(actor_id) and u.is_active
      and public.app_has_permission(actor_id,'approvals.read') and public.app_has_permission(u.id,'approvals.decide')
    order by u.full_name,u.id offset greatest(page_offset,0) limit least(greatest(page_limit,1),100)
  ) q;
$$;
revoke all on function public.list_operational_approvers(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.list_operational_approvers(uuid,integer,integer) to service_role;

alter table public.approval_requests add column metadata jsonb not null default '{}'::jsonb;
create unique index approval_source_unique on public.approval_requests(tenant_id,resource_type,resource_id);

create function public.submit_operational_request(actor_id uuid, kind text, payload jsonb, approvers uuid[]) returns jsonb
language plpgsql set search_path='' as $$
declare tenant uuid := public.app_tenant(actor_id); target uuid; request uuid; result jsonb;
  approver uuid; idx integer := 0; title text; table_name text; permission_prefix text;
begin
  permission_prefix := case kind when 'ROOM_BOOKING' then 'room_bookings' when 'LEAVE_REQUEST' then 'leave_requests' when 'SCHEDULE_CHANGE' then 'schedule_changes' when 'GENERIC' then 'approvals' end;
  if permission_prefix is null or not public.app_has_permission(actor_id,permission_prefix||'.create') then raise exception 'Missing permission' using errcode='42501'; end if;
  if coalesce(cardinality(approvers),0) not between 1 and 10 or cardinality(approvers)<>(select count(distinct x) from unnest(approvers) x) then raise exception 'Choose 1 to 10 unique approvers' using errcode='23514'; end if;
  foreach approver in array approvers loop
    if not exists(select 1 from public.users where id=approver and tenant_id=tenant and is_active) or not public.app_has_permission(approver,'approvals.decide') then raise exception 'Invalid tenant approver' using errcode='23514'; end if;
  end loop;
  if kind='ROOM_BOOKING' then
    if not exists(select 1 from public.rooms where id=(payload->>'room_id')::uuid and tenant_id=tenant and is_active) then raise exception 'Active room required' using errcode='23514'; end if;
    insert into public.room_bookings(tenant_id,room_id,requester_user_id,title,purpose,starts_at,ends_at)
      values(tenant,(payload->>'room_id')::uuid,actor_id,payload->>'title',payload->>'purpose',(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz) returning to_jsonb(room_bookings.*) into result;
    table_name:='room_bookings'; title:=payload->>'title';
  elsif kind='LEAVE_REQUEST' then
    insert into public.leave_requests(tenant_id,requester_user_id,leave_type,starts_on,ends_on,reason)
      values(tenant,actor_id,payload->>'leave_type',(payload->>'starts_on')::date,(payload->>'ends_on')::date,payload->>'reason') returning to_jsonb(leave_requests.*) into result;
    table_name:='leave_requests'; title:='Leave request';
  elsif kind='SCHEDULE_CHANGE' then
    -- Only the owner may propose a move. Managed events must be changed at source.
    if not exists(select 1 from public.calendar_events e join public.calendars c on c.id=e.calendar_id where e.id=(payload->>'calendar_event_id')::uuid and c.tenant_id=tenant and c.owner_user_id=actor_id and e.source_id is null)
      or exists(select 1 from public.room_bookings where calendar_event_id=(payload->>'calendar_event_id')::uuid)
      or exists(select 1 from public.leave_requests where calendar_event_id=(payload->>'calendar_event_id')::uuid)
    then raise exception 'Only owned, unmanaged events may be rescheduled' using errcode='42501'; end if;
    insert into public.schedule_change_requests(tenant_id,requester_user_id,calendar_event_id,proposed_starts_at,proposed_ends_at,reason)
      values(tenant,actor_id,(payload->>'calendar_event_id')::uuid,(payload->>'proposed_starts_at')::timestamptz,(payload->>'proposed_ends_at')::timestamptz,payload->>'reason') returning to_jsonb(schedule_change_requests.*) into result;
    table_name:='schedule_change_requests'; title:='Schedule change request';
  else
    if payload->>'resource_type' in('ROOM_BOOKING','LEAVE_REQUEST','SCHEDULE_CHANGE') then raise exception 'Reserved resource type' using errcode='23514'; end if;
    target:=(payload->>'resource_id')::uuid; title:=payload->>'title';
  end if;
  target:=coalesce(target,(result->>'id')::uuid);
  insert into public.approval_requests(tenant_id,requester_user_id,resource_type,resource_id,title,metadata)
    values(tenant,actor_id,case when kind='GENERIC' then payload->>'resource_type' else kind end,target,title,coalesce(payload->'metadata','{}'::jsonb)) returning id into request;
  foreach approver in array approvers loop
    idx:=idx+1;
    insert into public.approval_steps(tenant_id,approval_request_id,approver_user_id,sequence) values(tenant,request,approver,idx);
  end loop;
  if table_name is not null then execute format('update public.%I set approval_request_id=$1 where id=$2 and tenant_id=$3',table_name) using request,target,tenant;
  else select to_jsonb(a) into result from public.approval_requests a where a.id=request; end if;
  insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id)
    values(tenant,approvers[1],'ACTION_REQUIRED','Approval required','A request is awaiting your decision.','approval_request',request);
  insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state)
    values(tenant,actor_id,'CREATE','OPERATIONS','approval_requests',request,jsonb_build_object('resource_type',kind,'status','PENDING'));
  return result || jsonb_build_object('approval_request_id',request);
end $$;

create function public.decide_operational_request(actor_id uuid, request_id uuid, decision text, note text default null) returns jsonb
language plpgsql set search_path='' as $$
declare tenant uuid := public.app_tenant(actor_id); request public.approval_requests; step public.approval_steps;
  next_step public.approval_steps; table_name text; resource jsonb; cal uuid; event uuid;
begin
  if decision not in('APPROVED','REJECTED','CANCELLED') or length(coalesce(note,''))>4000 then raise exception 'Invalid decision' using errcode='23514'; end if;
  select * into request from public.approval_requests where id=request_id and tenant_id=tenant for update;
  if not found then raise exception 'Request not found' using errcode='P0002'; end if;
  if request.status <> 'PENDING' then raise exception 'Request already decided' using errcode='40001'; end if;
  select * into step from public.approval_steps where approval_request_id=request.id and sequence=request.current_step and tenant_id=tenant for update;
  if decision='CANCELLED' then
    if request.requester_user_id<>actor_id then raise exception 'Only requester may cancel' using errcode='42501'; end if;
  else
    if step.id is null or step.status<>'PENDING' or step.approver_user_id<>actor_id or not public.app_has_permission(actor_id,'approvals.decide') then raise exception 'Not assigned to this step' using errcode='42501'; end if;
    update public.approval_steps set status=decision,decided_at=now(),note=decide_operational_request.note where id=step.id;
    if decision='APPROVED' then
      select * into next_step from public.approval_steps where approval_request_id=request.id and sequence=request.current_step+1 and tenant_id=tenant;
      if found then
        update public.approval_requests set current_step=next_step.sequence where id=request.id returning * into request;
        insert into public.notifications(tenant_id,user_id,type,title,resource_type,resource_id) values(tenant,next_step.approver_user_id,'ACTION_REQUIRED','Approval required','approval_request',request.id);
        insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state) values(tenant,actor_id,'APPROVE_STEP','OPERATIONS','approval_requests',request.id,jsonb_build_object('step',step.sequence));
        return to_jsonb(request);
      end if;
    end if;
  end if;
  table_name:=case request.resource_type when 'ROOM_BOOKING' then 'room_bookings' when 'LEAVE_REQUEST' then 'leave_requests' when 'SCHEDULE_CHANGE' then 'schedule_change_requests' end;
  if table_name is not null then
    execute format('select to_jsonb(r) from public.%I r where id=$1 and tenant_id=$2 and approval_request_id=$3 for update',table_name) into resource using request.resource_id,tenant,request.id;
    if resource is null or resource->>'status'<>'PENDING' then raise exception 'Request linkage changed' using errcode='40001'; end if;
    if decision='APPROVED' then
      if request.resource_type='SCHEDULE_CHANGE' then
        perform e.id from public.calendar_events e join public.calendars c on c.id=e.calendar_id where e.id=(resource->>'calendar_event_id')::uuid and c.tenant_id=tenant and c.owner_user_id=request.requester_user_id and e.source_id is null for update of e;
        if not found then raise exception 'Event no longer available' using errcode='40001'; end if;
        update public.calendar_events set starts_at=(resource->>'proposed_starts_at')::timestamptz,ends_at=(resource->>'proposed_ends_at')::timestamptz where id=(resource->>'calendar_event_id')::uuid;
      else
        insert into public.calendars(tenant_id,owner_user_id,name,integration_managed) values(tenant,request.requester_user_id,'atsekola integrated calendar',true)
          on conflict(tenant_id,owner_user_id) where integration_managed do update set is_active=true returning id into cal;
        insert into public.calendar_events(calendar_id,title,starts_at,ends_at,is_all_day,event_type,source_table,source_id)
          values(cal,case when request.resource_type='LEAVE_REQUEST' then 'Approved leave' else resource->>'title' end,
            case when request.resource_type='LEAVE_REQUEST' then (resource->>'starts_on')::date else (resource->>'starts_at')::timestamptz end,
            case when request.resource_type='LEAVE_REQUEST' then (resource->>'ends_on')::date+1 else (resource->>'ends_at')::timestamptz end,
            request.resource_type='LEAVE_REQUEST','GENERAL',table_name,request.resource_id) returning id into event;
        execute format('update public.%I set calendar_event_id=$1 where id=$2 and tenant_id=$3',table_name) using event,request.resource_id,tenant;
      end if;
    end if;
    execute format('update public.%I set status=$1,updated_at=now() where id=$2 and tenant_id=$3',table_name) using decision,request.resource_id,tenant;
  end if;
  update public.approval_requests set status=decision,decided_at=now() where id=request.id returning * into request;
  update public.approval_steps set status='SKIPPED',decided_at=now() where approval_request_id=request.id and status='PENDING';
  insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id)
    values(tenant,case when decision='CANCELLED' then step.approver_user_id else request.requester_user_id end,'INFO','Request '||lower(decision),'Open approvals for details.','approval_request',request.id);
  insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,after_state)
    values(tenant,actor_id,decision,'OPERATIONS','approval_requests',request.id,jsonb_build_object('status',decision));
  return to_jsonb(request);
end $$;
revoke all on function public.submit_operational_request(uuid,text,jsonb,uuid[]), public.decide_operational_request(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_operational_request(uuid,text,jsonb,uuid[]), public.decide_operational_request(uuid,uuid,text,text) to service_role;

create function public.list_my_approvals(actor_id uuid, page_offset integer default 0, page_limit integer default 50) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(row_data),'[]'::jsonb) from (
    select to_jsonb(a)||jsonb_build_object('approval_steps',coalesce((select jsonb_agg(s order by s.sequence) from public.approval_steps s where s.approval_request_id=a.id and s.tenant_id=a.tenant_id),'[]'::jsonb)) as row_data
    from public.approval_requests a where a.tenant_id=public.app_tenant(actor_id)
      and (a.requester_user_id=actor_id or exists(select 1 from public.approval_steps s where s.approval_request_id=a.id and s.tenant_id=a.tenant_id and s.approver_user_id=actor_id))
    order by a.created_at desc,a.id offset greatest(page_offset,0) limit least(greatest(page_limit,1),100)
  ) page;
$$;
revoke all on function public.list_my_approvals(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.list_my_approvals(uuid,integer,integer) to service_role;

insert into public.permissions(code,name,description) values('approvals.read_all','Read all tenant approvals','Administrative oversight of tenant operational requests') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code in('OWNER','PRINCIPAL') and p.code='approvals.read_all' on conflict do nothing;
