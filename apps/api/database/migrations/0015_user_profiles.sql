-- Phase 09: self-service user profile and contact information.
alter table public.users
  add column if not exists avatar_url text,
  add column if not exists phone text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

alter table public.users
  add constraint users_avatar_url_https check (avatar_url is null or avatar_url ~ '^https://') not valid;

alter table public.users validate constraint users_avatar_url_https;

-- Existing self-profile policy remains the only browser access path. Server API
-- is responsible for Auth metadata synchronization and input validation.
