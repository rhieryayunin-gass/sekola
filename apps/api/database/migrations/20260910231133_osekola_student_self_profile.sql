-- Student submissions require a student identifier. Return only the caller's
-- active profile; do not grant browser access to the student master table.
create function public.my_student_id() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select s.id
  from public.students s
  join public.users u on u.id = s.user_id and u.tenant_id = s.tenant_id
  join public.tenants t on t.id = u.tenant_id
  where u.id = (select auth.uid())
    and u.is_active and t.is_active and s.enrollment_status = 'ACTIVE'
  limit 1;
$$;
revoke all on function public.my_student_id() from public, anon;
grant execute on function public.my_student_id() to authenticated;
