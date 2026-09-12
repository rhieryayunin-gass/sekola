-- Exercise Storage RLS as authenticated callers, including cross-tenant moves.
begin;
insert into auth.users(id,email,raw_app_meta_data) values
 ('20000000-0000-4000-8000-000000000004','student-media@school-a.test','{"tenant_id":"10000000-0000-4000-8000-000000000001"}');
insert into public.user_roles(user_id,role_id) select '20000000-0000-4000-8000-000000000004',id from public.roles where code='STUDENT';
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
insert into storage.objects(bucket_id,name) values('tenant-media','10000000-0000-4000-8000-000000000001/logos/logo');
update storage.objects set metadata='{"mimetype":"image/png"}' where name='10000000-0000-4000-8000-000000000001/logos/logo';
do $$ begin
  if not (public.media_context()->>'is_owner')::boolean then raise exception 'Owner context missing'; end if;
  -- Part 3 grants platform OWNER access to fixed tenant logos only.
  insert into storage.objects(bucket_id,name) values('tenant-media','10000000-0000-4000-8000-000000000002/logos/logo');
  delete from storage.objects where name='10000000-0000-4000-8000-000000000002/logos/logo';
  begin
    insert into storage.objects(bucket_id,name) values('tenant-media','10000000-0000-4000-8000-000000000002/gallery/private.png');
    raise exception 'Cross-tenant private upload allowed';
  exception when insufficient_privilege then null; end;
  begin
    update storage.objects set name='10000000-0000-4000-8000-000000000002/avatars/20000000-0000-4000-8000-000000000003' where bucket_id='tenant-media';
    raise exception 'Cross-tenant move allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values('platform-media','brand/osekola-logo');
    raise exception 'School Owner changed platform brand';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from storage.objects where name not like '%/logos/logo') then raise exception 'Cross-tenant private media visible'; end if;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000004',true);
insert into storage.objects(bucket_id,name) values('tenant-media','10000000-0000-4000-8000-000000000001/avatars/20000000-0000-4000-8000-000000000004');
do $$ declare affected integer; begin
  if not exists(select 1 from storage.objects where name like '%/logos/logo') then raise exception 'Own school logo unavailable'; end if;
  if (public.media_context()->>'is_owner')::boolean then raise exception 'Student is not Owner'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('tenant-media','10000000-0000-4000-8000-000000000001/gallery/forbidden.png');
    raise exception 'Student gallery upload allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values('tenant-media','10000000-0000-4000-8000-000000000001/avatars/20000000-0000-4000-8000-000000000001');
    raise exception 'Student changed another avatar';
  exception when insufficient_privilege then null; end;
  update public.tenants set name='Not allowed' where id='10000000-0000-4000-8000-000000000001';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Student changed tenant settings'; end if;
  delete from storage.objects where name like '%/logos/logo';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Student deleted logo'; end if;
end $$;
reset role;
update public.users set is_active=false where id='20000000-0000-4000-8000-000000000004';
set local role authenticated;
do $$ begin
  if public.media_context() is not null or exists(select 1 from storage.objects where bucket_id<>'platform-media') then raise exception 'Inactive account accessed media'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where p.code='tenants.update_own' and r.code<>'OWNER') then raise exception 'Non-Owner tenant settings permission'; end if;
end $$;
rollback;
