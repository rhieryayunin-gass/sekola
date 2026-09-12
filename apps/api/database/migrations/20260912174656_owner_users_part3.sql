-- Authentication credentials remain in Supabase Auth, administered only by NestJS.
-- This service-role-only RPC makes profile, role, status, and audit changes atomic.
create function public.owner_user_action(actor_id uuid,target_id uuid,operation text,payload jsonb default '{}',validate_only boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare actor_tenant uuid:=public.app_tenant(actor_id); previous jsonb; result jsonb; chosen_role uuid; begin
 if not public.app_has_permission(actor_id,'tenants.update_all') or not exists(select 1 from public.roles r where r.is_active and r.code='OWNER' and r.id in(select role_id from public.user_roles where user_id=actor_id union select lr.role_id from public.user_level_roles lr join public.users u on u.user_level_id=lr.user_level_id where u.id=actor_id)) then raise exception 'Platform owner required' using errcode='42501'; end if;
 if operation not in ('CREATE','UPDATE','STATUS','ARCHIVE','RESTORE','PASSWORD_RESET') then raise exception 'Unsupported user operation' using errcode='22023'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>3000 or exists(select 1 from jsonb_object_keys(payload)k where k not in ('tenant_id','full_name','email','phone','role','is_active')) then raise exception 'Invalid user profile' using errcode='22023'; end if;
 if operation='CREATE' and not exists(select 1 from public.tenants where id=(payload->>'tenant_id')::uuid and is_active) then raise exception 'Active tenant required' using errcode='22023'; end if;
 if operation<>'CREATE' then
  select to_jsonb(u) into previous from public.users u where id=target_id for update;
  if previous is null then raise exception 'User not found' using errcode='P0002'; end if;
  if target_id=actor_id and (operation in ('ARCHIVE','STATUS') or payload ? 'role') then raise exception 'Cannot remove your own administration access' using errcode='22023'; end if;
  if operation not in ('RESTORE','ARCHIVE') and previous->>'deleted_at' is not null then raise exception 'Restore the archived account first' using errcode='22023'; end if;
 end if;
 if payload ? 'role' then
  if payload->>'role' not in ('OWNER','PRINCIPAL','STAFF','TEACHER','STUDENT','PARENT') then raise exception 'Unknown role' using errcode='22023'; end if;
  select id into chosen_role from public.roles where code=payload->>'role' and is_active;
  if chosen_role is null then raise exception 'Role unavailable' using errcode='22023'; end if;
 end if;
 if validate_only then return coalesce(previous,'{}'); end if;
 if operation in ('CREATE','UPDATE') then
  update public.users set full_name=coalesce(payload->>'full_name',full_name),email=coalesce(payload->>'email',email),phone=case when payload ? 'phone' then payload->>'phone' else phone end,
   user_level_id=case when chosen_role is not null then null else user_level_id end
  where id=target_id and (operation<>'CREATE' or tenant_id=(payload->>'tenant_id')::uuid) returning to_jsonb(users.*) into result;
  if result is null then raise exception 'User profile unavailable' using errcode='P0002'; end if;
  if chosen_role is not null then
   delete from public.user_roles where user_id=target_id;
   insert into public.user_roles(user_id,role_id) values(target_id,chosen_role);
  end if;
 elsif operation='STATUS' then
  if jsonb_typeof(payload->'is_active') is distinct from 'boolean' then raise exception 'Boolean status required' using errcode='22023'; end if;
  update public.users set is_active=(payload->>'is_active')::boolean where id=target_id returning to_jsonb(users.*) into result;
 elsif operation='ARCHIVE' then
  update public.users set is_active=false,deleted_at=coalesce(deleted_at,now()) where id=target_id returning to_jsonb(users.*) into result;
 elsif operation='RESTORE' then
  update public.users set is_active=true,deleted_at=null where id=target_id returning to_jsonb(users.*) into result;
 else result:=previous; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,before_state,after_state)
 values(actor_tenant,actor_id,'OWNER_USER_'||operation,'PLATFORM','users',target_id,
 case when operation='PASSWORD_RESET' then null else previous end,case when operation='PASSWORD_RESET' then null else result end);
 return jsonb_build_object('id',target_id,'operation',operation);
end $$;
revoke all on function public.owner_user_action(uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.owner_user_action(uuid,uuid,text,jsonb,boolean) to service_role;
