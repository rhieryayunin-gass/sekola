-- OSEKOLA Enhancement Part 1. Tenant media never uses public URLs.
create schema if not exists osekola_private;
revoke all on schema osekola_private from public, anon;
grant usage on schema osekola_private to authenticated;

-- Read authoritative database roles, not user-editable JWT metadata.
create function osekola_private.media_context() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'user_id',u.id,'tenant_id',t.id,'tenant_name',t.name,
    'is_owner',exists(select 1 from public.roles r where r.is_active and r.code='OWNER' and r.id in(
      select ur.role_id from public.user_roles ur where ur.user_id=u.id
      union select lr.role_id from public.user_level_roles lr where lr.user_level_id=u.user_level_id)),
    'is_platform_admin',exists(select 1 from public.user_levels l where l.id=u.user_level_id and l.code='platform_admin' and l.is_active),
    'can_upload_learning',exists(select 1 from public.roles r where r.is_active and r.code in('OWNER','TEACHER') and r.id in(
      select ur.role_id from public.user_roles ur where ur.user_id=u.id
      union select lr.role_id from public.user_level_roles lr where lr.user_level_id=u.user_level_id)))
  from public.users u left join public.tenants t on t.id=u.tenant_id and t.is_active
  where auth.uid() is not null and u.id=auth.uid() and u.is_active;
$$;
revoke all on function osekola_private.media_context() from public,anon;
grant execute on function osekola_private.media_context() to authenticated;
create function public.media_context() returns jsonb
language sql stable security invoker set search_path='' as $$ select osekola_private.media_context() $$;
revoke all on function public.media_context() from public,anon;
grant execute on function public.media_context() to authenticated;

create function osekola_private.can_write_media(bucket text, path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare ctx jsonb:=osekola_private.media_context(); parts text[]:=string_to_array(path,'/');
begin
  if auth.uid() is null or ctx is null then return false; end if;
  if bucket='platform-media' then
    return path='brand/osekola-logo' and coalesce((ctx->>'is_platform_admin')::boolean,false);
  end if;
  if ctx->>'tenant_id' is null or parts[1] is distinct from ctx->>'tenant_id' then return false; end if;
  if bucket='tenant-media' then
    if parts[2]='logos' then return cardinality(parts)=3 and parts[3]='logo' and (ctx->>'is_owner')::boolean; end if;
    if parts[2]='avatars' then
      return cardinality(parts)=3 and (parts[3]=ctx->>'user_id' or (ctx->>'is_owner')::boolean)
        and exists(select 1 from public.users u where u.id::text=parts[3] and u.tenant_id::text=ctx->>'tenant_id' and u.is_active);
    end if;
    if parts[2]='gallery' then return cardinality(parts)=3 and parts[3] ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$' and (ctx->>'is_owner')::boolean; end if;
  end if;
  if bucket='tenant-learning' then
    return cardinality(parts)=4 and parts[2]='learning' and parts[4] ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$'
      and ((ctx->>'is_owner')::boolean or ((ctx->>'can_upload_learning')::boolean and parts[3]=ctx->>'user_id'))
      and exists(select 1 from public.users u where u.id::text=parts[3] and u.tenant_id::text=ctx->>'tenant_id' and u.is_active);
  end if;
  return false;
end $$;
revoke all on function osekola_private.can_write_media(text,text) from public,anon;
grant execute on function osekola_private.can_write_media(text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('platform-media','platform-media',true,5242880,array['image/png','image/jpeg','image/webp']),
 ('tenant-media','tenant-media',false,5242880,array['image/png','image/jpeg','image/webp']),
 ('tenant-learning','tenant-learning',false,20971520,array['image/png','image/jpeg','image/webp','application/pdf','video/mp4'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy osekola_media_read on storage.objects for select to authenticated using(
 (bucket_id='platform-media' and name='brand/osekola-logo') or
 (bucket_id in('tenant-media','tenant-learning') and split_part(name,'/',1)=(select osekola_private.media_context()->>'tenant_id'))
);
create policy osekola_media_insert on storage.objects for insert to authenticated
 with check(osekola_private.can_write_media(bucket_id,name));
create policy osekola_media_update on storage.objects for update to authenticated
 using(osekola_private.can_write_media(bucket_id,name)) with check(osekola_private.can_write_media(bucket_id,name));
create policy osekola_media_delete on storage.objects for delete to authenticated
 using(osekola_private.can_write_media(bucket_id,name));

-- The existing Nest endpoint checks this permission. Restrict its mapping too.
delete from public.role_permissions rp using public.roles r,public.permissions p
 where rp.role_id=r.id and rp.permission_id=p.id and p.code='tenants.update_own' and r.code<>'OWNER';
drop policy if exists tenants_update_own on public.tenants;
create policy tenants_update_own on public.tenants for update to authenticated
 using(id=public.current_tenant_id() and is_active and coalesce((select osekola_private.media_context()->>'is_owner')::boolean,false))
 with check(id=public.current_tenant_id() and is_active and coalesce((select osekola_private.media_context()->>'is_owner')::boolean,false));
