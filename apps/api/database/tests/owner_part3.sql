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
do $$ declare created jsonb; invoice jsonb; repeated jsonb; receipt jsonb; summary jsonb; partner uuid; begin
 created:=public.school_owner_save('tenant','{"name":"Added school","code":"OWNER-P3-NEW","contact_email":"office@school.invalid","timezone":"Asia/Jakarta","locale":"en-US"}');
 if created->>'code'<>'OWNER-P3-NEW' then raise exception 'Tenant creation failed'; end if;
 perform public.school_owner_save('tenant','{"address":"Edited address"}',(created->>'id')::uuid);
 if not exists(select 1 from jsonb_array_elements(public.school_owner_list('tenants','{"query":"OWNER-P3-NEW"}')->'items')x where x->>'address'='Edited address') then raise exception 'Profile edit not returned'; end if;
 begin perform public.school_owner_save('tenant','{"is_active":false}','e1000000-0000-4000-8000-000000000001'); raise exception 'Self tenant deactivated'; exception when invalid_parameter_value then null; end;
 begin perform public.school_owner_save('tenant','{"created_at":"2000-01-01"}',(created->>'id')::uuid); raise exception 'Protected column accepted'; exception when invalid_parameter_value then null; end;
 perform public.school_owner_save('contract','{"onboarded_on":"2026-01-01","expires_on":"2026-12-31","billing_period":"MONTHLY","annual_amount":12000000,"period_amount":1000000}','e1000000-0000-4000-8000-000000000002');
 invoice:=public.school_owner_save('invoice','{"request_id":"e4000000-0000-4000-8000-000000000001","tenant_id":"e1000000-0000-4000-8000-000000000002","period_start":"2026-01-01","period_end":"2026-01-31","due_on":"2026-01-10","amount":1000000}');
 perform set_config('test.owner.invoice',invoice->>'id',true);
 repeated:=public.school_owner_save('invoice','{"request_id":"e4000000-0000-4000-8000-000000000001","tenant_id":"e1000000-0000-4000-8000-000000000002","period_start":"2026-01-01","period_end":"2026-01-31","due_on":"2026-01-10","amount":1000000}');
 if invoice->>'id'<>repeated->>'id' then raise exception 'Invoice retry created a duplicate'; end if;
 begin perform public.school_owner_save('invoice','{"request_id":"e4000000-0000-4000-8000-000000000001","tenant_id":"e1000000-0000-4000-8000-000000000002","period_start":"2026-01-01","period_end":"2026-01-31","due_on":"2026-01-10","amount":2000000}'); raise exception 'Conflicting request retry accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.school_owner_save('invoice','{"request_id":"e4000000-0000-4000-8000-000000000002","tenant_id":"e1000000-0000-4000-8000-000000000002","period_start":"2026-01-15","period_end":"2026-02-15","due_on":"2026-01-20","amount":1000000}'); raise exception 'Overlapping invoice accepted'; exception when unique_violation then null; end;
 begin perform public.school_owner_save('receipt','{"amount":1000001,"reference":"too-much","paid_on":"2026-01-01"}',(invoice->>'id')::uuid); raise exception 'Overpayment accepted'; exception when invalid_parameter_value then null; end;
 receipt:=public.school_owner_save('receipt','{"amount":400000,"reference":"P3-PARTIAL","paid_on":"2026-01-05"}',(invoice->>'id')::uuid);
 repeated:=public.school_owner_save('receipt','{"amount":400000,"reference":"P3-PARTIAL","paid_on":"2026-01-05"}',(invoice->>'id')::uuid);
 if receipt->>'id'<>repeated->>'id' then raise exception 'Receipt retry duplicated money'; end if;
 summary:=public.school_owner_summary();
 if (summary->>'income')::numeric<>400000 or (summary->>'receivables')::numeric<>600000 then raise exception 'Financial totals wrong: %',summary; end if;
 perform public.school_owner_save('receipt','{"amount":600000,"reference":"P3-FINAL","paid_on":"2026-01-06"}',(invoice->>'id')::uuid);
 if public.school_owner_list('invoices','{"query":"Tenant school fixture"}')->'items'->0->>'status'<>'PAID' then raise exception 'Invoice not paid'; end if;
 perform public.school_owner_save('expense','{"amount":100000,"reference":"P3-EXPENSE","description":"Hosting fixture","paid_on":"2026-01-06"}');
 if (public.school_owner_summary()->>'expenses')::numeric<>100000 then raise exception 'Expense missing'; end if;
 partner:=(public.school_owner_save('partner','{"name":"Partner fixture","user_id":"e2000000-0000-4000-8000-000000000003","referral_code":"PARTNER-P3","domicile":"Jakarta","phone":"0800000000","bank_name":"Fixture","bank_account_name":"Fixture","bank_account_number":"0000","payment_url":"https://payments.example.test/fixture"}')->>'id')::uuid;
 perform set_config('test.owner.partner',partner::text,true);
 begin perform public.school_owner_payment_link(partner); raise exception 'Gateway opened without unpaid fee'; exception when invalid_parameter_value then null; end;
 begin perform public.school_owner_save('partner','{"payment_url":"javascript:alert(1)"}',partner); raise exception 'Unsafe payment URL accepted'; exception when check_violation then null; end;
end $$;
reset role;
-- A single invoice retry must create exactly one admin notification, never student notices.
do $$ begin
 if (select count(*) from public.notifications where resource_id=current_setting('test.owner.invoice')::uuid)<>1 then raise exception 'Invoice notification duplicated or wrong audience'; end if;
 if not exists(select 1 from public.notifications where resource_id=current_setting('test.owner.invoice')::uuid and user_id='e2000000-0000-4000-8000-000000000002') then raise exception 'Principal notification missing'; end if;
end $$;
insert into public.school_leads(id,partner_id,school_name,contact_name,email,phone,student_count,answers,assessment_version,score,recommended_plan,stage)
values('e5000000-0000-4000-8000-000000000001',current_setting('test.owner.partner')::uuid,'Won lead','Fixture','fixture@school.invalid','0800000000',100,'[]',1,50,'ELEVATE','WON');
set local role authenticated;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
do $$ declare fee uuid; begin
 fee:=(public.school_owner_save('commission',jsonb_build_object('partner_id',current_setting('test.owner.partner'),'lead_id','e5000000-0000-4000-8000-000000000001','amount',250000))->>'id')::uuid;
 if public.school_owner_payment_link(current_setting('test.owner.partner')::uuid)<>'https://payments.example.test/fixture' then raise exception 'Gateway link wrong'; end if;
 if (public.school_owner_list('partners','{"query":"Partner fixture"}')->'items'->0->>'unpaid')::numeric<>250000 then raise exception 'Opening gateway changed payment status'; end if;
 perform public.school_owner_save('commission_paid','{"reference":"GATEWAY-FIXTURE"}',fee);
 if (public.school_owner_list('partners','{"query":"Partner fixture"}')->'items'->0->>'unpaid')::numeric<>0 then raise exception 'Fee payment missing'; end if;
 if (public.school_owner_summary()->>'expenses')::numeric<>350000 then raise exception 'Partner expenses omitted'; end if;
end $$;
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000002',true);
do $$ begin
 if jsonb_array_length(public.school_subscription()->'invoices')<>1 then raise exception 'Tenant invoice unavailable'; end if;
 begin perform public.school_owner_list('users'); raise exception 'Principal read global users'; exception when insufficient_privilege then null; end;
 begin perform public.school_owner_save('module','{"module":"core","enabled":false}','e1000000-0000-4000-8000-000000000001'); raise exception 'Principal changed global module'; exception when insufficient_privilege then null; end;
 begin perform public.owner_user_action('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000004','ARCHIVE'); raise exception 'Browser invoked privileged user RPC'; exception when insufficient_privilege then null; end;
end $$;
-- Each switch denies server module checks for the affected school only.
select set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
do $$ declare module text; begin
 foreach module in array array['core','academic','attendance','connect','learning','exams','finance','team'] loop
  perform public.school_owner_save('module',jsonb_build_object('module',module,'enabled',false),'e1000000-0000-4000-8000-000000000002');
  perform set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000003',true);
  if school_private.module_enabled(module) then raise exception 'Disabled module allowed: %',module; end if;
  if module='connect' then begin perform public.oconnect_context(); raise exception 'Disabled Connect allowed'; exception when insufficient_privilege then null; end; end if;
  if module='learning' then begin perform public.school_catalog('courses'); raise exception 'Disabled learning catalog allowed'; exception when insufficient_privilege then null; end; end if;
  perform set_config('request.jwt.claim.sub','e2000000-0000-4000-8000-000000000001',true);
  if not school_private.module_enabled(module) then raise exception 'Other tenant module was disabled: %',module; end if;
  perform public.school_owner_save('module',jsonb_build_object('module',module,'enabled',true),'e1000000-0000-4000-8000-000000000002');
 end loop;
end $$;
reset role;
set local role service_role;
do $$ begin
 begin perform public.owner_user_action('e2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000004','ARCHIVE'); raise exception 'Non-owner managed user'; exception when insufficient_privilege then null; end;
 begin perform public.owner_user_action('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','ARCHIVE'); raise exception 'Owner archived self'; exception when invalid_parameter_value then null; end;
 perform public.owner_user_action('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000004','UPDATE','{"full_name":"Edited student","role":"PARENT"}');
 perform public.owner_user_action('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000004','ARCHIVE');
 if public.app_module_enabled('e2000000-0000-4000-8000-000000000004','core') then raise exception 'Archived user retained access'; end if;
 begin update public.users set is_active=true where id='e2000000-0000-4000-8000-000000000004'; raise exception 'Legacy status update bypassed archive'; exception when check_violation then null; end;
 perform public.owner_user_action('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000004','RESTORE');
 if not public.app_module_enabled('e2000000-0000-4000-8000-000000000004','core') then raise exception 'Restore did not restore access'; end if;
end $$;
reset role;
rollback;
