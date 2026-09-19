-- Pure roles, two tenants, all 72 directional pairs, legacy conversations and groups.
begin;
insert into public.tenants(id,name,code) values ('b1000000-0000-4000-8000-000000000001','Part4 A','P4-MATRIX-A'),('b1000000-0000-4000-8000-000000000002','Part4 B','P4-MATRIX-B');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
select ('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'p4-matrix-'||n||'@school.invalid',jsonb_build_object('tenant_id',case when n>12 then 'b1000000-0000-4000-8000-000000000002' else 'b1000000-0000-4000-8000-000000000001' end),jsonb_build_object('full_name','P4 matrix '||n) from generate_series(1,18)n;
insert into public.user_roles(user_id,role_id) select ('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,r.id from generate_series(1,18)n join public.roles r on r.code=(array['OWNER','PRINCIPAL','STAFF','TEACHER','STUDENT','PARENT'])[(n-1)%6+1];
-- Deliberately model old conversations which predate today's permissions.
insert into public.oconnect_conversations(id,tenant_id,kind,title,created_by,direct_key)
select ('b3000000-0000-4000-8000-'||lpad((a*100+b)::text,12,'0'))::uuid,case when b>12 then 'b1000000-0000-4000-8000-000000000002'::uuid else 'b1000000-0000-4000-8000-000000000001'::uuid end,'DIRECT','Legacy pair',('b2000000-0000-4000-8000-'||lpad(a::text,12,'0'))::uuid,
 'b2000000-0000-4000-8000-'||lpad(a::text,12,'0')||':b2000000-0000-4000-8000-'||lpad(b::text,12,'0') from generate_series(1,6)a cross join generate_series(7,18)b;
insert into public.oconnect_members(tenant_id,conversation_id,user_id)
select c.tenant_id,c.id,u.id from public.oconnect_conversations c join public.users u on u.id::text=any(string_to_array(c.direct_key,':')) where c.title='Legacy pair';
-- Literal product matrix, independent of implementation predicates.
create temporary table expected(sender integer,recipient integer,allowed boolean);
insert into expected select a,b,case a when 1 then true when 2 then b in(3,4) when 3 then b in(2,4,6) when 4 then true when 5 then b in(4,5) when 6 then b in(3,4) end from generate_series(1,6)a cross join generate_series(1,6)b;
grant select on expected to authenticated;
set local role authenticated;
do $$ declare a integer;b integer; actor uuid; other uuid; cid uuid; expected_access boolean; contacts jsonb; count_pairs integer:=0; mid uuid; begin
 for a in 1..6 loop
 actor:=('b2000000-0000-4000-8000-'||lpad(a::text,12,'0'))::uuid;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if school_private.module_enabled('academic') is distinct from (a=3) or school_private.module_enabled('learning') is distinct from (a in(4,5)) or school_private.module_enabled('exams') is distinct from (a in(4,5)) then raise exception 'Module role matrix mismatch for %',a; end if;
 if a not in(3,4) then begin perform public.school_catalog('subjects'); raise exception 'Forbidden Academic catalog'; exception when insufficient_privilege then null; end; end if;
 if a not in(4,5) then
 begin perform public.school_exam_list(); raise exception 'Forbidden Exam RPC'; exception when insufficient_privilege then null; end;
 begin perform public.school_exam_attempts(gen_random_uuid()); raise exception 'Forbidden attempt RPC'; exception when insufficient_privilege then null; end;
 begin perform public.school_catalog('courses'); raise exception 'Forbidden Learning catalog'; exception when insufficient_privilege then null; end;
 end if;
 contacts:=public.oconnect_contacts();
 for b in 7..18 loop
 other:=('b2000000-0000-4000-8000-'||lpad(b::text,12,'0'))::uuid;
 select allowed and (b<=12 or a=1) into expected_access from expected where sender=a and recipient=(b-1)%6+1;
 if exists(select 1 from jsonb_array_elements(contacts) c where c->>'id'=other::text) is distinct from expected_access then raise exception 'Contact visibility mismatch %, %',a,b; end if;
 cid:=('b3000000-0000-4000-8000-'||lpad((a*100+b)::text,12,'0'))::uuid;
 if expected_access then
 if public.oconnect_create('DIRECT','',array[other])<>cid then raise exception 'Legacy direct duplicate'; end if;
 mid:=gen_random_uuid(); perform public.oconnect_send(cid,mid,'Matrix allowed');
 perform set_config('request.jwt.claim.sub',other::text,true);
 if not exists(select 1 from public.oconnect_messages where id=mid) then raise exception 'Recipient did not receive permitted message %, %',a,b; end if;
 if jsonb_array_length(public.oconnect_thread(cid)->'messages')<>1 then raise exception 'Recipient thread missing'; end if;
 perform public.oconnect_mark_read(cid,9223372036854775807);
 perform public.oconnect_options(cid,true,false);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 else
 begin perform public.oconnect_create('DIRECT','',array[other]); raise exception 'Forbidden direct created %, %',a,b; exception when insufficient_privilege then null; end;
 begin perform public.oconnect_send(cid,gen_random_uuid(),'Must not send'); raise exception 'Legacy conversation bypass %, %',a,b; exception when insufficient_privilege then null; end;
 end if;
 count_pairs:=count_pairs+1;
 end loop;
 end loop;
 if count_pairs<>72 then raise exception 'Incomplete matrix coverage'; end if;
end $$;
-- A mixed audience never creates a Student->Parent or Parent->Student bridge.
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000004',true);
do $$ declare c uuid; begin
 c:=public.oconnect_create('GROUP','Mixed audience',array['b2000000-0000-4000-8000-000000000005'::uuid,'b2000000-0000-4000-8000-000000000006'::uuid]);
 perform set_config('test.p4.group',c::text,true);
 perform public.oconnect_send(c,gen_random_uuid(),'Teacher announcement');
 perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000005',true);
 if (public.oconnect_thread(c)->>'can_send')::boolean then raise exception 'Student group send enabled'; end if;
 begin perform public.oconnect_send(c,gen_random_uuid(),'Student to parent'); raise exception 'Group bridge'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000006',true);
 begin perform public.oconnect_send(c,gen_random_uuid(),'Parent to student'); raise exception 'Reverse group bridge'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.oconnect_messages(tenant_id,conversation_id,sender_id,body) values('b1000000-0000-4000-8000-000000000001',current_setting('test.p4.group')::uuid,'b2000000-0000-4000-8000-000000000006','Old disallowed parent message');
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000005',true);
do $$ begin
 if exists(select 1 from public.oconnect_messages where body='Old disallowed parent message') or jsonb_array_length(public.oconnect_thread(current_setting('test.p4.group')::uuid)->'messages')<>1 then raise exception 'Legacy group message leak'; end if;
end $$;
reset role;
-- Tenant switch and deactivation still intersect with OWNER's cross-tenant powers.
update public.users set is_active=false where id='b2000000-0000-4000-8000-000000000013';
set local role authenticated;
select set_config('request.jwt.claim.sub','b2000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin perform public.oconnect_create('DIRECT','',array['b2000000-0000-4000-8000-000000000013'::uuid]); raise exception 'Inactive recipient allowed'; exception when insufficient_privilege then null; end;
 begin perform public.oconnect_create('GROUP','Cross group',array['b2000000-0000-4000-8000-000000000014'::uuid]); raise exception 'Cross-tenant member directory bridge'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
