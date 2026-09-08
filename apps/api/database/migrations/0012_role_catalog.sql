-- ============================================================
-- atsekola
-- Canonical Role Catalog
-- ============================================================
-- Phase 06 owns the six fixed role identities only. Permission assignment,
-- user-role assignment, and access scope remain in their scheduled phases.
-- Existing legacy roles are preserved; this migration never deletes or renames
-- records that current authorization may still reference.

insert into public.roles (code, name, description)
values
  ('OWNER', 'Owner', 'School ownership and top-level accountability'),
  ('PRINCIPAL', 'Principal', 'School leadership and academic operations'),
  ('STAFF', 'Staff', 'School administration and operational support'),
  ('TEACHER', 'Teacher', 'Teaching and classroom operations'),
  ('STUDENT', 'Student', 'Student learning access'),
  ('PARENT', 'Parent', 'Parent and guardian access')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = timezone('utc', now());

comment on table public.roles is
  'Canonical atsekola role catalog. Phase 06 fixes its six identities; permission and assignment management follow in later phases.';

do $$
declare
  missing_codes text[];
begin
  select array_agg(required.code order by required.code)
  into missing_codes
  from (
    values
      ('OWNER'),
      ('PRINCIPAL'),
      ('STAFF'),
      ('TEACHER'),
      ('STUDENT'),
      ('PARENT')
  ) as required(code)
  where not exists (
    select 1
    from public.roles as role
    where role.code = required.code
      and role.is_active = true
  );

  if missing_codes is not null then
    raise exception 'Canonical active roles are missing: %', missing_codes;
  end if;
end;
$$;
