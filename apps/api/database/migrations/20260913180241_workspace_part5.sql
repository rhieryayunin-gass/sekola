-- Part 5: school role boundaries, products and reversible tenant deletion.
-- Existing administrative Academic/Learning/Exam APIs retain Part 4 restrictions.
-- Student Academic and Parent Learning/Exam use dedicated family projections.
create or replace function public.app_module_enabled(actor_id uuid,module_code text) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.users u join public.tenants t on t.id=u.tenant_id
 left join public.school_settings s on s.tenant_id=t.id
 where u.id=actor_id and u.is_active and u.deleted_at is null and t.is_active
 and (module_code is null or (module_code in ('core','academic','attendance','connect','learning','exams','finance','team') and coalesce(s.modules->module_code,'true'::jsonb)='true'::jsonb))
 and case when module_code='academic' then public.app_role_in(actor_id,array['STAFF','TEACHER'])
 when module_code in ('learning','exams') then public.app_role_in(actor_id,array['TEACHER','STUDENT']) when module_code='finance' then public.app_role_in(actor_id,array['STAFF']) else true end)
$$;

alter table public.tenants add column deleted_at timestamptz;
alter table public.tenants add constraint archived_tenant_inactive check(deleted_at is null or not is_active);
-- Existing SELECT * view columns are fixed when created. Append archive metadata
-- without changing the established column order used by Owner list projections.
do $$ declare definition text;begin
 definition:=rtrim(pg_get_viewdef('school_private.owner_tenant_rows'::regclass,true),';');
 execute 'create or replace view school_private.owner_tenant_rows with (security_invoker=true) as select previous.*, t.deleted_at from ('||definition||') previous join public.tenants t on t.id=previous.id';
end $$;
alter table public.school_plans add column features_en jsonb not null default '[]' check(jsonb_typeof(features_en)='array'),
 add column offer_note_en text not null default '', add column discount_percent numeric(5,2) not null default 0 check(discount_percent between 0 and 100),
 add column custom_pricing boolean not null default false;
create function school_private.product_save(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 perform school_private.require_owner();
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>20000 or length(trim(payload->>'name')) not between 2 and 100
 or jsonb_typeof(payload->'features') is distinct from 'array' or jsonb_typeof(payload->'features_en') is distinct from 'array'
 or jsonb_array_length(payload->'features') not between 1 and 30 or jsonb_array_length(payload->'features_en')<>jsonb_array_length(payload->'features')
 or exists(select 1 from jsonb_array_elements((payload->'features')||(payload->'features_en')) f where jsonb_typeof(f)<>'string' or length(f#>>'{}') not between 1 and 300)
 then raise exception 'Enter a name and matching Indonesian/English feature lists' using errcode='22023'; end if;
 update public.school_plans set name=trim(payload->>'name'),price_monthly=(payload->>'price_monthly')::integer,features=payload->'features',features_en=payload->'features_en',
 offer_note=left(coalesce(payload->>'offer_note',''),1000),offer_note_en=left(coalesce(payload->>'offer_note_en',''),1000),discount_percent=(payload->>'discount_percent')::numeric,custom_pricing=(payload->>'custom_pricing')::boolean,updated_at=now()
 where code=payload->>'code' returning to_jsonb(school_plans.*) into result;
 if result is null then raise exception 'Product not found'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,after_state) values(school_private.tenant(),auth.uid(),'UPDATE','PLATFORM','school_plans',result);
 return result;
end $$;
create function school_private.tenant_archive(target uuid,confirmation text,restore boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous jsonb; begin
 perform school_private.require_owner();
 select to_jsonb(t) into previous from public.tenants t where t.id=target for update;
 if previous is null or previous->>'name' is distinct from confirmation then raise exception 'Type the exact school name'; end if;
 if target=school_private.tenant() then raise exception 'Cannot archive the active owner tenant'; end if;
 update public.tenants set deleted_at=case when restore then null else coalesce(deleted_at,now()) end,is_active=restore where id=target;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,before_state,after_state) values(school_private.tenant(),auth.uid(),case when restore then 'RESTORE' else 'ARCHIVE' end,'PLATFORM','tenants',target,previous,jsonb_build_object('restored',restore));
 return jsonb_build_object('id',target,'restored',restore);
end $$;
create function school_private.staff_teacher_roles(target uuid,codes text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users; before_roles jsonb; begin
 perform school_private.require_owner();
 select * into u from public.users where id=target and is_active and deleted_at is null for update;
 if u.id is null or target=auth.uid() or not public.app_role_in(target,array['STAFF','TEACHER'])
 or public.app_role_in(target,array['OWNER','PRINCIPAL','STUDENT','PARENT']) or codes is null or cardinality(codes) not between 1 and 2
 or not codes <@ array['STAFF','TEACHER']::text[] or array_position(codes,null) is not null
 then raise exception 'Choose Staff, Teacher, or both for an active Staff/Teacher account' using errcode='42501'; end if;
 select roles into before_roles from school_private.owner_user_rows where id=target;
 update public.users set user_level_id=null where id=target;
 delete from public.user_roles where user_id=target;
 insert into public.user_roles(user_id,role_id) select target,id from public.roles where code=any(codes) and is_active;
 if 'TEACHER'=any(codes) then insert into public.teachers(tenant_id,user_id,employment_status) values(u.tenant_id,target,'ACTIVE') on conflict(tenant_id,user_id) do update set employment_status='ACTIVE'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,before_state,after_state) values(school_private.tenant(),auth.uid(),'UPDATE_ROLES','PLATFORM','users',target,jsonb_build_object('roles',before_roles),jsonb_build_object('roles',codes));
 return jsonb_build_object('id',target,'roles',codes);
end $$;
create or replace function school_private.finance_report(resource text,date_from date,date_to date,query text default '',status_filter text default '',page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); admin boolean:=school_private.role(array['STAFF']) and public.app_has_permission(auth.uid(),'finance_reports.read'); result jsonb; begin
 -- Parents use only this child-scoped projection; administrative Finance APIs
 -- require Staff even when an old role grant is overly broad.
 if not exists(select 1 from public.tenants t left join public.school_settings s on s.tenant_id=t.id where t.id=tenant and t.is_active and coalesce(s.modules->'finance','true'::jsonb)='true'::jsonb) then raise exception 'Finance unavailable' using errcode='42501';end if;
 if date_from is null or date_to is null or date_to<date_from or date_to-date_from>3660 or length(query)>200 then raise exception 'Choose a valid report range'; end if;
 if not admin and not school_private.role(array['PARENT']) then raise exception 'Finance access required' using errcode='42501'; end if;
 if resource='bills' then
 with matching as (select b.id,b.invoice_number,u.full_name as student_name,b.amount,b.due_date,b.status,coalesce(p.paid,0) as paid_amount,b.amount-coalesce(p.paid,0) as outstanding_amount from public.student_bills b join public.students s on s.id=b.student_id join public.users u on u.id=s.user_id left join lateral(select sum(amount) as paid from public.payments where student_bill_id=b.id and status='CONFIRMED')p on true where b.tenant_id=tenant and (admin or school_private.child(s.id) and b.status<>'DRAFT') and b.due_date between date_from and date_to and (status_filter='' or b.status=status_filter) and (query='' or b.invoice_number ilike '%'||query||'%' or u.full_name ilike '%'||query||'%'))
 select jsonb_build_object('count',(select count(*) from matching),'total',(select coalesce(sum(amount) filter(where status<>'VOID'),0) from matching),'paid',(select coalesce(sum(paid_amount),0) from matching),'outstanding',(select coalesce(sum(outstanding_amount) filter(where status not in ('VOID','DRAFT')),0) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(q)) from (select * from matching order by due_date desc,id limit 100 offset greatest(page_offset,0))q),'[]')) into result;
 elsif resource='payments' then
 with matching as (select p.id,p.receipt_number,b.invoice_number,u.full_name as student_name,p.amount,p.paid_at,p.status,p.reference from public.payments p join public.student_bills b on b.id=p.student_bill_id join public.students s on s.id=b.student_id join public.users u on u.id=s.user_id where p.tenant_id=tenant and (admin or school_private.child(s.id)) and (p.paid_at at time zone 'Asia/Jakarta')::date between date_from and date_to and (status_filter='' or p.status=status_filter) and (query='' or p.receipt_number ilike '%'||query||'%' or b.invoice_number ilike '%'||query||'%' or u.full_name ilike '%'||query||'%'))
 select jsonb_build_object('count',(select count(*) from matching),'total',(select coalesce(sum(amount) filter(where status='CONFIRMED'),0) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(q)) from (select * from matching order by paid_at desc,id limit 100 offset greatest(page_offset,0))q),'[]')) into result;
 else raise exception 'Unsupported report'; end if;
 return result;
end $$;

create or replace function osekola_private.can_write_media(bucket text, path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare ctx jsonb:=osekola_private.media_context(); parts text[]:=string_to_array(path,'/');
begin
  if auth.uid() is null or ctx is null then return false; end if;
  if bucket='platform-media' then
    return path='brand/osekola-logo' and coalesce((ctx->>'is_platform_admin')::boolean,false);
  end if;
  if ctx->>'tenant_id' is null or parts[1] is distinct from ctx->>'tenant_id' then return false; end if;
  if bucket='tenant-media' then
    if parts[2]='logos' then return cardinality(parts)=3 and parts[3]='logo' and (ctx->>'can_manage_media')::boolean; end if;
    if parts[2]='avatars' then
      return cardinality(parts)=3 and (parts[3]=ctx->>'user_id' or (ctx->>'can_manage_media')::boolean)
        and exists(select 1 from public.users u where u.id::text=parts[3] and u.tenant_id::text=ctx->>'tenant_id' and u.is_active);
    end if;
    if parts[2]='gallery' then return cardinality(parts)=3 and parts[3] ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$' and school_private.role(array['STAFF']) and public.app_module_enabled(auth.uid(),'core'); end if;
  end if;
  if bucket='tenant-learning' then
    return cardinality(parts)=4 and parts[2]='learning' and parts[4] ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$'
      and ((ctx->>'can_manage_media')::boolean or ((ctx->>'can_upload_learning')::boolean and parts[3]=ctx->>'user_id'))
      and exists(select 1 from public.users u where u.id::text=parts[3] and u.tenant_id::text=ctx->>'tenant_id' and u.is_active);
  end if;
  return false;
end $$;

create function public.school_product_save(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select school_private.product_save(payload) $$;
revoke all on function school_private.product_save(jsonb),public.school_product_save(jsonb) from public,anon,authenticated;
grant execute on function school_private.product_save(jsonb),public.school_product_save(jsonb) to authenticated;
create function public.school_tenant_archive(target uuid,confirmation text,restore boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select school_private.tenant_archive(target,confirmation,restore) $$;
revoke all on function school_private.tenant_archive(uuid,text,boolean),public.school_tenant_archive(uuid,text,boolean) from public,anon,authenticated;
grant execute on function school_private.tenant_archive(uuid,text,boolean),public.school_tenant_archive(uuid,text,boolean) to authenticated;
create function public.school_staff_teacher_roles(target uuid,codes text[]) returns jsonb language sql security invoker set search_path='' as $$ select school_private.staff_teacher_roles(target,codes) $$;
revoke all on function school_private.staff_teacher_roles(uuid,text[]),public.school_staff_teacher_roles(uuid,text[]) from public,anon,authenticated;
grant execute on function school_private.staff_teacher_roles(uuid,text[]),public.school_staff_teacher_roles(uuid,text[]) to authenticated;
