-- Only for disposable CI PostgreSQL; never execute against Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(
  id uuid primary key,
  email text,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema public,auth to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
-- Minimal Storage API schema fixture for migration/RLS tests only.
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,service_role;
grant select,insert,update,delete on storage.objects to authenticated,service_role;

-- Supabase Vault test double. Production uses installed supabase_vault encryption.
create schema if not exists vault;
create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text not null);
create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
create function vault.create_secret(value text) returns uuid language plpgsql as $$ declare key uuid;begin insert into vault.secrets(secret) values(value) returning id into key;return key;end $$;
create function vault.update_secret(key uuid,value text) returns void language sql as $$ update vault.secrets set secret=value where id=key $$;
revoke all on schema vault from public;
