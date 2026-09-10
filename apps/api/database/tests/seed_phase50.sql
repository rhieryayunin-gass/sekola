-- Deliberately created at migration 0055, then upgraded through 0059.
insert into public.tenants(id,name,code) values
 ('10000000-0000-4000-8000-000000000001','Test School A','CI-A'),
 ('10000000-0000-4000-8000-000000000002','Test School B','CI-B');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
 ('20000000-0000-4000-8000-000000000001','owner@school-a.test','{"tenant_id":"10000000-0000-4000-8000-000000000001"}','{"full_name":"Owner A"}'),
 ('20000000-0000-4000-8000-000000000002','approver@school-a.test','{"tenant_id":"10000000-0000-4000-8000-000000000001"}','{"full_name":"Approver A"}'),
 ('20000000-0000-4000-8000-000000000003','owner@school-b.test','{"tenant_id":"10000000-0000-4000-8000-000000000002"}','{"full_name":"Owner B"}');
insert into public.user_roles(user_id,role_id)
 select u.id,r.id from public.users u cross join public.roles r where r.code='OWNER';
insert into public.rooms(id,tenant_id,code,name,capacity) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','LAB-A','Lab A',20),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','LAB-B','Lab B',20);
