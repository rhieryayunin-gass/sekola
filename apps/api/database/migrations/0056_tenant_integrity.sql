-- Phase 52/53: fail closed on existing cross-tenant references; never repair silently.
create function public.enforce_tenant_relations() returns trigger
language plpgsql set search_path = '' as $$
declare pair record; target_tenant uuid; row_data jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' and (new.tenant_id is distinct from old.tenant_id or row_data->'id' is distinct from to_jsonb(old)->'id') then
    raise exception 'Record identity and tenant are immutable' using errcode = '23514';
  end if;
  for pair in select * from jsonb_each_text(tg_argv[0]::jsonb) loop
    if row_data->>pair.key is not null then
      execute format('select tenant_id from public.%I where id = $1 for key share', pair.value)
        into target_tenant using (row_data->>pair.key)::uuid;
      if target_tenant is distinct from new.tenant_id then
        raise exception 'Related record must belong to the same tenant' using errcode = '23503';
      end if;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.enforce_tenant_relations() from public, anon, authenticated;

do $$
declare t record; fk record; relation_map jsonb; invalid boolean;
begin
  for t in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
    and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
  loop
    relation_map := '{}'::jsonb;
    for fk in select a.attname, target.relname from pg_constraint c
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      join pg_class target on target.oid=c.confrelid
      join pg_namespace ns on ns.oid=target.relnamespace
      where c.contype='f' and c.conrelid=t.oid and array_length(c.conkey,1)=1 and ns.nspname='public'
        and exists(select 1 from pg_attribute x where x.attrelid=target.oid and x.attname='tenant_id' and not x.attisdropped)
    loop
      execute format('select exists(select 1 from public.%I s join public.%I r on r.id=s.%I where s.tenant_id is distinct from r.tenant_id)', t.relname, fk.relname, fk.attname) into invalid;
      if invalid then raise exception 'Cross-tenant reference detected in %.%; investigate before migration', t.relname, fk.attname; end if;
      relation_map := relation_map || jsonb_build_object(fk.attname, fk.relname);
    end loop;
    execute format('create trigger tenant_integrity before insert or update on public.%I for each row execute function public.enforce_tenant_relations(%L)', t.relname, relation_map::text);
  end loop;
end $$;

alter table public.attendance_records add constraint attendance_exactly_one_person check(num_nonnulls(student_id, teacher_id)=1);
alter table public.exam_questions add constraint ai_review_requires_reviewer
  check(source <> 'AI_DRAFT' or review_status <> 'APPROVED' or (reviewed_by_user_id is not null and reviewed_at is not null));
create extension if not exists btree_gist;
alter table public.room_bookings add constraint room_booking_no_overlap
  exclude using gist(room_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where(status in('PENDING','APPROVED'));

create function public.app_tenant(actor_id uuid) returns uuid language plpgsql stable set search_path='' as $$
declare result uuid;
begin
  select u.tenant_id into result from public.users u join public.tenants t on t.id=u.tenant_id where u.id=actor_id and u.is_active and t.is_active;
  if result is null then raise exception 'Active tenant account required' using errcode='42501'; end if;
  return result;
end $$;
create function public.app_has_permission(actor_id uuid, permission_code text) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from public.users u
    join public.role_permissions rp on rp.role_id in (
      select ur.role_id from public.user_roles ur where ur.user_id=u.id
      union select lr.role_id from public.user_level_roles lr where lr.user_level_id=u.user_level_id)
    join public.permissions p on p.id=rp.permission_id
    where u.id=actor_id and u.is_active and p.code=permission_code);
$$;
revoke all on function public.app_tenant(uuid), public.app_has_permission(uuid,text) from public, anon, authenticated;
grant execute on function public.app_tenant(uuid), public.app_has_permission(uuid,text) to service_role;

-- An RPC provides the transaction boundary for record, integration, and actor audit.
create function public.mutate_tenant_record(actor_id uuid, resource text, record_id uuid, operation text, payload jsonb, module_name text)
returns jsonb language plpgsql set search_path='' as $$
declare tenant uuid := public.app_tenant(actor_id); previous jsonb; result jsonb; cols text; vals text; permission_prefix text;
begin
  if resource <> all(array['academic_years','semesters','classrooms','subjects','teachers','students','teacher_assignments','student_assignments','courses','lessons','assignments','submissions','attendance_records','attendance_qr_sessions','exams','exam_questions','exam_sessions','exam_results','finance_accounts','finance_categories','finance_periods','student_bills','payments'])
    or operation not in('CREATE','UPDATE','DELETE') then raise exception 'Unsupported mutation' using errcode='42501'; end if;
  permission_prefix := case resource when 'attendance_records' then 'attendance' when 'attendance_qr_sessions' then 'attendance_qr' when 'student_bills' then 'billing' else resource end;
  if not public.app_has_permission(actor_id, permission_prefix || '.' || lower(operation)) then raise exception 'Missing permission' using errcode='42501'; end if;
  if jsonb_typeof(payload) <> 'object' or payload ?| array['id','tenant_id','created_at','updated_at'] then raise exception 'Protected fields' using errcode='23514'; end if;
  if operation <> 'CREATE' then
    execute format('select to_jsonb(r) from public.%I r where id=$1 and tenant_id=$2 for update',resource) into previous using record_id,tenant;
    if previous is null then raise exception 'Record not found' using errcode='P0002'; end if;
  end if;
  if operation='DELETE' then
    execute format('delete from public.%I where id=$1 and tenant_id=$2',resource) using record_id,tenant;
    result := jsonb_build_object('success',true,'id',record_id);
  else
    if payload='{}'::jsonb then raise exception 'Empty mutation' using errcode='23514'; end if;
    if operation='CREATE' then
      payload := payload || jsonb_build_object('tenant_id',tenant);
      select string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') into cols,vals from jsonb_object_keys(payload) as x(key);
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',resource,cols,vals,resource,resource) into result using payload;
    else
      select string_agg(format('%I=r.%I',key,key),',') into vals from jsonb_object_keys(payload) as x(key);
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 and t.tenant_id=$3 returning to_jsonb(t.*)',resource,vals,resource) into result using payload,record_id,tenant;
    end if;
  end if;
  insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,before_state,after_state)
    values(tenant,actor_id,operation,module_name,resource,coalesce(record_id,(result->>'id')::uuid),
      case when previous is null then null else jsonb_build_object('id',previous->'id','status',previous->'status') end,
      jsonb_build_object('id',result->'id','status',result->'status','changed_fields',(select jsonb_agg(key) from jsonb_object_keys(payload) x(key))));
  return result;
end $$;
revoke all on function public.mutate_tenant_record(uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.mutate_tenant_record(uuid,text,uuid,text,jsonb,text) to service_role;
