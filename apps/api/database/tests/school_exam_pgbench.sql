-- 2,000 virtual students distributed across a bounded pool of 64 connections.
-- Each client owns a disjoint subset, so concurrency tests distinct students.
\set actor 1 + :client_id + 64 * random(0, 30)
begin;
select set_config('request.jwt.claim.sub','d6000000-0000-4000-8000-'||lpad(:actor::text,12,'0'),true);
set local role authenticated;
select public.school_exam_save(
 ('d8000000-0000-4000-8000-'||lpad(:actor::text,12,'0'))::uuid,
 (public.school_exam_state(('d8000000-0000-4000-8000-'||lpad(:actor::text,12,'0'))::uuid)->'attempt'->>'revision')::integer,
 '{"d9000000-0000-4000-8000-000000000001":"4"}',false);
commit;
