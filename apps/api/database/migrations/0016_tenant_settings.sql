-- Phase 10: tenant-owned school settings. These are configuration only;
-- academic, calendar, notification, and localization modules remain separate.
alter table public.tenants
  add column if not exists legal_name text,
  add column if not exists address text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website_url text,
  add column if not exists academic_year_label text,
  add column if not exists week_starts_on smallint not null default 1,
  add column if not exists notifications_email_enabled boolean not null default true,
  add column if not exists notifications_in_app_enabled boolean not null default true,
  add column if not exists timezone text not null default 'Asia/Jakarta',
  add column if not exists locale text not null default 'id-ID';

alter table public.tenants
  add constraint tenants_week_starts_on_check check (week_starts_on between 0 and 6),
  add constraint tenants_website_url_https check (website_url is null or website_url ~ '^https://') not valid;
alter table public.tenants validate constraint tenants_website_url_https;

-- Existing RLS policy and column grant intentionally continue to permit only
-- self-tenant updates through the service-role API authorization path.
