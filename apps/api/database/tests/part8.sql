-- Disposable PostgreSQL only: all fixtures, invoices, and receipts roll back.
begin;
insert into public.tenants(id,name,code) values
 ('e1000000-0000-4000-8000-000000000001','Owner platform fixture','OWNER-P3-A'),
 ('e1000000-0000-4000-8000-000000000002','Tenant school fixture','OWNER-P3-B');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select ('e2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'owner-p3-'||n||'@school.invalid',jsonb_build_object('tenant_id',case when n=1 then 'e1000000-0000-4000-8000-000000000001' else 'e1000000-0000-4000-8000-000000000002' end),jsonb_build_object('full_name','Owner P3 fixture '||n) from generate_series(1,4)n;
insert into public.user_roles(user_id,role_id) select ('e2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,r.id from generate_series(1,4)n join public.roles r on r.code=case n when 1 then 'OWNER' when 2 then 'PRINCIPAL' when 3 then 'TEACHER' else 'STUDENT' end;
set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);

do $$declare a jsonb;b jsonb;app uuid;items jsonb;begin
 a:=public.school_owner_save('settlement_account','{"tenant_id":"e1000000-0000-4000-8000-000000000002","bank_name":"Fixture bank","account_name":"Fixture school","account_number":"123456789","is_active":true}');
 b:=public.school_owner_save('settlement_account','{"tenant_id":"e1000000-0000-4000-8000-000000000002","bank_name":"Fixture bank","account_name":"Fixture school","account_number":"987654321","is_active":true}');
 items:=public.school_owner_list('settlement_accounts','{"tenant_id":"e1000000-0000-4000-8000-000000000002"}')->'items';
 if (select count(*) from jsonb_array_elements(items)v where (v->>'is_active')::boolean)<>1 then raise exception 'Multiple active settlement accounts';end if;
 if not exists(select 1 from jsonb_array_elements(items)v where v->>'id'=a->>'id' and not (v->>'is_active')::boolean) then raise exception 'Previous account not deactivated';end if;
 perform set_config('test.part8.account',b->>'id',true);
 perform public.school_owner_save('settlement_account','{"is_active":false}',(b->>'id')::uuid);
 if exists(select 1 from jsonb_array_elements(public.school_owner_list('settlement_accounts','{"tenant_id":"e1000000-0000-4000-8000-000000000002"}')->'items')v where (v->>'is_active')::boolean) then raise exception 'Deactivation failed';end if;
end$$;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000002',true);
do $$begin
 begin perform public.school_owner_save('settlement_account','{"is_active":true}',current_setting('test.part8.account')::uuid);raise exception 'School changed settlement account';exception when insufficient_privilege then null;end;
 begin perform public.school_owner_list('applications');raise exception 'School read applications';exception when insufficient_privilege then null;end;
 begin perform public.school_partner_document(gen_random_uuid());raise exception 'School downloaded CV';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$declare r jsonb;begin
 r:=public.school_partner_apply('{"name":"Fixture Applicant","nik":"0000000000000008","phone":"628000000000","domicile":"Fixture City","occupation":"Fixture activity","school_count":3,"contacts":"Fixture teacher","photo_confirmed":true,"consent":true,"cv_name":"fixture.pdf","is_active":true}',encode(convert_to('%PDF-fixture','UTF8'),'base64'));
 if r->>'status'<>'NEW' then raise exception 'Unexpected application status';end if;
 perform set_config('test.part8.application',r->>'id',true);
 begin perform 1 from public.school_partner_applications;raise exception 'Anonymous read personal data';exception when insufficient_privilege then null;end;
 begin perform public.school_partner_apply('{"name":"Fixture Applicant","nik":"0000000000000008","phone":"628000000000","domicile":"Fixture City","occupation":"Fixture activity","school_count":3,"contacts":"Fixture teacher","photo_confirmed":true,"consent":true,"cv_name":"fixture.pdf"}',encode(convert_to('%PDF-fixture','UTF8'),'base64'));raise exception 'Duplicate application accepted' using errcode='23514';exception when sqlstate 'P0001' then null;end;
end$$;
reset role;set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
do $$declare r jsonb;begin
 r:=public.school_owner_list('applications')->'items'->0;
 if r ? 'nik' or r ? 'cv' then raise exception 'List exposed full sensitive data';end if;
 if (r->>'is_active')::boolean then raise exception 'Applicant activated themselves';end if;
 perform public.school_owner_save('application','{"status":"INTERVIEW","referral_schools":"Fixture school","bank_name":"Fixture bank","bank_account_name":"Fixture Applicant","bank_account_number":"1234567"}',current_setting('test.part8.application')::uuid);
 r:=public.school_partner_document(current_setting('test.part8.application')::uuid);
 if r->>'nik'<>'0000000000000008' or r->>'data' is null then raise exception 'Owner cannot review submitted documents';end if;
end$$;
rollback;
