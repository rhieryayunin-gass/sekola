-- ============================================================
-- SEKOLA AI
-- User → User Level
-- ============================================================

alter table public.users
add column user_level_id uuid;

alter table public.users
add constraint users_user_level_id_fkey
foreign key (user_level_id)
references public.user_levels(id)
on delete restrict;

create index users_user_level_id_idx
  on public.users(user_level_id);
