-- ============================================================
-- SEKOLA AI
-- Core Database Foundation
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Shared timestamp helper
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
