-- Provider keys are encrypted by Supabase Vault; only the payment Edge Function
-- can retrieve them. Browser RPCs expose configured flags, never key values.
create table public.school_payment_config (
 tenant_id uuid not null references public.tenants(id),provider text not null check(provider in ('XENDIT','MIDTRANS')),secret_id uuid not null,
 webhook_secret_id uuid,account_id uuid not null references public.finance_accounts(id),is_live boolean not null default false,
 enabled boolean not null default true,updated_at timestamptz not null default now(),primary key(tenant_id,provider)
);
create table public.school_payment_intents (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),bill_id uuid references public.student_bills(id),application_id uuid references public.school_admission_applications(id),
 actor_id uuid references public.users(id),provider text not null check(provider in ('XENDIT','MIDTRANS')),account_id uuid not null references public.finance_accounts(id),
 amount numeric(14,0) not null check(amount>0),currency text not null default 'IDR' check(currency='IDR'),
 status text not null default 'CREATING' check(status in ('CREATING','OPEN','UNKNOWN','FAILED','PAID','EXPIRED')),
 fallback_of uuid unique references public.school_payment_intents(id),provider_id text,checkout_url text,provider_payment_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(num_nonnulls(bill_id,application_id)=1),unique(provider,provider_id)
);
create unique index payment_open_bill on public.school_payment_intents(bill_id) where status in ('CREATING','OPEN','UNKNOWN');
create unique index payment_open_admission on public.school_payment_intents(application_id) where status in ('CREATING','OPEN','UNKNOWN');
create index payment_intents_tenant on public.school_payment_intents(tenant_id,created_at desc);
alter table public.school_payment_config enable row level security;
alter table public.school_payment_intents enable row level security;
revoke all on public.school_payment_config,public.school_payment_intents from anon,authenticated;
create function school_private.payment_config_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform school_private.require_module('finance');
 if not school_private.role(array['STAFF']) then raise exception 'Staff required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'account_id',account_id,'is_live',is_live,'enabled',enabled,'updated_at',updated_at)) from public.school_payment_config where tenant_id=school_private.tenant()),'[]');
end $$;
create function school_private.payment_configure(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); c public.school_payment_config; keyid uuid; hookid uuid; begin
 perform school_private.require_module('finance');
 if not school_private.role(array['STAFF']) or not public.app_has_permission(auth.uid(),'finance_accounts.update') then raise exception 'Staff Finance administrator required' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>5000 or payload->>'provider' not in ('XENDIT','MIDTRANS') or not exists(select 1 from public.finance_accounts where id=(payload->>'account_id')::uuid and tenant_id=tenant and is_active) then raise exception 'Invalid payment configuration'; end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,726));
 if exists(select 1 from public.school_payment_intents where tenant_id=tenant and provider=payload->>'provider' and status in ('CREATING','OPEN','UNKNOWN')) then raise exception 'Resolve pending checkouts before changing merchant settings'; end if;
 select * into c from public.school_payment_config where tenant_id=tenant and provider=payload->>'provider' for update;
 keyid:=c.secret_id;hookid:=c.webhook_secret_id;
 if nullif(payload->>'secret','') is not null then
 if length(payload->>'secret') not between 8 and 2000 then raise exception 'Invalid server key'; end if;
 if keyid is null then select vault.create_secret(payload->>'secret') into keyid;else perform vault.update_secret(keyid,payload->>'secret');end if;
 end if;
 if nullif(payload->>'webhook_secret','') is not null then
 if length(payload->>'webhook_secret') not between 8 and 1000 then raise exception 'Invalid webhook token'; end if;
 if hookid is null then select vault.create_secret(payload->>'webhook_secret') into hookid;else perform vault.update_secret(hookid,payload->>'webhook_secret');end if;
 end if;
 if keyid is null or (payload->>'provider'='XENDIT' and hookid is null) then raise exception 'Server key and Xendit webhook token required'; end if;
 insert into public.school_payment_config(tenant_id,provider,secret_id,webhook_secret_id,account_id,is_live,enabled) values(tenant,payload->>'provider',keyid,hookid,(payload->>'account_id')::uuid,(payload->>'is_live')::boolean,(payload->>'enabled')::boolean)
 on conflict(tenant_id,provider) do update set secret_id=excluded.secret_id,webhook_secret_id=excluded.webhook_secret_id,account_id=excluded.account_id,is_live=excluded.is_live,enabled=excluded.enabled,updated_at=now();
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,after_state) values(tenant,auth.uid(),'CONFIGURE','finance','payment_gateway',jsonb_build_object('provider',payload->>'provider','enabled',payload->'enabled','is_live',payload->'is_live'));
 return school_private.payment_config_status();
end $$;
-- Service-only endpoint: actor comes from verified Supabase Auth, or a 256-bit
-- application receipt token. All tenant/amount/provider choices are server-side.
create function public.school_payment_reserve(actor uuid,kind text,target uuid,access_token text default '') returns jsonb language plpgsql set search_path='' as $$
declare tenant uuid; b public.student_bills; a public.school_admission_applications; c public.school_payment_config; i public.school_payment_intents; due numeric; begin
 if kind='bill' then
 select * into b from public.student_bills where id=target for update;tenant:=b.tenant_id;
 if b.id is null or not exists(select 1 from public.users u join public.tenants t on t.id=u.tenant_id left join public.school_settings s on s.tenant_id=t.id where u.id=actor and u.tenant_id=tenant and u.is_active and u.deleted_at is null and t.is_active and coalesce(s.modules->'finance','true'::jsonb)='true'::jsonb) or not(public.app_role_in(actor,array['STAFF']) and public.app_tenant(actor)=tenant or public.app_role_in(actor,array['PARENT']) and exists(select 1 from public.school_guardians where parent_user_id=actor and student_id=b.student_id and tenant_id=tenant)) then raise exception 'Bill access denied' using errcode='42501'; end if;
 if b.status not in ('OPEN','PARTIAL','OVERDUE') then raise exception 'Bill is not payable'; end if;
 select b.amount-coalesce(sum(amount),0) into due from public.payments where student_bill_id=b.id and status='CONFIRMED';
 elsif kind='admission' then
 select * into a from public.school_admission_applications where id=target for update;tenant:=a.tenant_id;due:=a.fee_amount;
 if a.id is null or not(coalesce(a.applicant_user_id=actor,false) or (length(access_token)=64 and a.access_hash=encode(sha256(convert_to(access_token,'UTF8')),'hex')) or (public.app_tenant(actor)=tenant and public.app_role_in(actor,array['STAFF']))) then raise exception 'Application access denied' using errcode='42501'; end if;
 if a.payment_status='PAID' then raise exception 'Application already paid'; end if;
 else raise exception 'Invalid payment kind';end if;
 if not exists(select 1 from public.tenants where id=tenant and is_active) or due is null or due<=0 or due<>trunc(due) then raise exception 'Invalid payment amount or inactive school'; end if;
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,726));
 select * into i from public.school_payment_intents where (bill_id=b.id or application_id=a.id) and status in ('CREATING','OPEN','UNKNOWN') order by created_at desc limit 1;
 if i.id is not null then return to_jsonb(i)||jsonb_build_object('create',false);end if;
 -- Xendit is preferred. Midtrans is used only when Xendit is not enabled/configured;
 -- ambiguous network failures never create a second charge at the backup gateway.
 select * into c from public.school_payment_config where tenant_id=tenant and enabled order by case when provider='XENDIT' then 0 else 1 end limit 1;
 if c.secret_id is null then raise exception 'PAYMENT_NOT_CONFIGURED'; end if;
 insert into public.school_payment_intents(tenant_id,bill_id,application_id,actor_id,provider,account_id,amount) values(tenant,b.id,a.id,actor,c.provider,c.account_id,due) returning * into i;
 return to_jsonb(i)||jsonb_build_object('create',true);
end $$;
create function school_private.payment_credentials(intent uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('secret',s.decrypted_secret,'webhook_secret',w.decrypted_secret,'is_live',c.is_live,'provider',i.provider,'provider_id',i.provider_id,'amount',i.amount,'status',i.status,'tenant_id',i.tenant_id)
 from public.school_payment_intents i join public.school_payment_config c on c.tenant_id=i.tenant_id and c.provider=i.provider join vault.decrypted_secrets s on s.id=c.secret_id left join vault.decrypted_secrets w on w.id=c.webhook_secret_id where i.id=intent
$$;
create function public.school_payment_credentials(intent uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select school_private.payment_credentials(intent) $$;
revoke all on function school_private.payment_credentials(uuid) from public,anon,authenticated;
grant usage on schema school_private to service_role;
grant execute on function school_private.payment_credentials(uuid) to service_role;
create function public.school_payment_record(intent uuid,payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare i public.school_payment_intents; remaining numeric; begin
 select * into i from public.school_payment_intents where id=intent;
 if i.id is null then raise exception 'Payment intent not found'; end if;
 -- Consistent lock order: payable target, tenant configuration, then intent.
 if i.bill_id is not null then perform 1 from public.student_bills where id=i.bill_id for update;
 else perform 1 from public.school_admission_applications where id=i.application_id for update;end if;
 perform pg_advisory_xact_lock(hashtextextended(i.tenant_id::text,726));
 select * into i from public.school_payment_intents where id=intent for update;
 if payload->>'status' not in ('OPEN','UNKNOWN','FAILED','PAID','EXPIRED') then raise exception 'Invalid provider status'; end if;
 if i.status='PAID' then return jsonb_build_object('status','PAID');end if;
 if payload->>'status'='PAID' then
 if (payload->>'amount')::numeric is distinct from i.amount or payload->>'currency' is distinct from 'IDR' or length(coalesce(payload->>'payment_id',''))<3 then raise exception 'Provider amount or currency mismatch'; end if;
 -- Release this intent's pending lock within the same transaction before
 -- recording its receipt. Any failure rolls both state and accounting back.
 update public.school_payment_intents set status='PAID' where id=i.id;
 if i.bill_id is not null then
 perform 1 from public.student_bills where id=i.bill_id for update;
 insert into public.payments(tenant_id,student_bill_id,account_id,receipt_number,amount,status,reference) values(i.tenant_id,i.bill_id,i.account_id,'PG-'||i.id::text,i.amount,'CONFIRMED',i.provider||':'||(payload->>'payment_id')) on conflict(tenant_id,receipt_number) do nothing;
 select b.amount-coalesce(p.paid,0) into remaining from public.student_bills b left join lateral(select sum(amount) paid from public.payments where student_bill_id=b.id and status='CONFIRMED')p on true where b.id=i.bill_id;
 update public.student_bills set status=case when remaining<=0 then 'PAID' else 'PARTIAL' end where id=i.bill_id and status<>'VOID';
 else
 perform 1 from public.school_admission_applications where id=i.application_id for update;
 insert into public.school_admission_receipts(tenant_id,application_id,amount,reference,paid_at) values(i.tenant_id,i.application_id,i.amount,i.provider||':'||(payload->>'payment_id'),now()) on conflict(application_id) do nothing;
 update public.school_admission_applications set payment_status='PAID' where id=i.application_id;
 end if;
 end if;
 update public.school_payment_intents set status=payload->>'status',provider_id=coalesce(payload->>'provider_id',provider_id),checkout_url=coalesce(payload->>'checkout_url',checkout_url),provider_payment_id=coalesce(payload->>'payment_id',provider_payment_id),updated_at=now() where id=i.id;
 insert into public.audit_logs(tenant_id,action,module,resource_type,resource_id,after_state) values(i.tenant_id,'PROVIDER_PAYMENT','finance','school_payment_intents',i.id,jsonb_build_object('provider',i.provider,'status',payload->>'status','amount',i.amount));
 return jsonb_build_object('status',payload->>'status');
end $$;
revoke all on function public.school_payment_reserve(uuid,text,uuid,text),public.school_payment_credentials(uuid),public.school_payment_record(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.school_payment_reserve(uuid,text,uuid,text),public.school_payment_credentials(uuid),public.school_payment_record(uuid,jsonb) to service_role;
create function public.school_payment_config_status() returns jsonb language sql security invoker set search_path='' as $$ select school_private.payment_config_status() $$;
create function public.school_payment_configure(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select school_private.payment_configure(payload) $$;
revoke all on function public.school_payment_config_status(),public.school_payment_configure(jsonb),school_private.payment_config_status(),school_private.payment_configure(jsonb) from public,anon,authenticated;
grant execute on function public.school_payment_config_status(),public.school_payment_configure(jsonb),school_private.payment_config_status(),school_private.payment_configure(jsonb) to authenticated;
create function public.school_payment_fallback(failed_intent uuid) returns jsonb language plpgsql set search_path='' as $$
declare old public.school_payment_intents; next public.school_payment_intents; c public.school_payment_config; due numeric;begin
 select * into old from public.school_payment_intents where id=failed_intent;
 if old.id is null then raise exception 'Payment intent not found';end if;
 if old.bill_id is not null then
 perform 1 from public.student_bills where id=old.bill_id for update;
 select b.amount-coalesce((select sum(amount) from public.payments where student_bill_id=b.id and status='CONFIRMED'),0) into due from public.student_bills b where b.id=old.bill_id and b.status in ('OPEN','PARTIAL','OVERDUE');
 else
 perform 1 from public.school_admission_applications where id=old.application_id for update;
 select fee_amount into due from public.school_admission_applications where id=old.application_id and payment_status='UNPAID';end if;
 perform pg_advisory_xact_lock(hashtextextended(old.tenant_id::text,726));
 select * into old from public.school_payment_intents where id=failed_intent for update;
 if due is distinct from old.amount or exists(select 1 from public.school_payment_intents where fallback_of=old.id or ((bill_id=old.bill_id or application_id=old.application_id) and status in ('CREATING','OPEN','UNKNOWN'))) then raise exception 'Fallback already resolved or payment amount changed';end if;
 if old.id is null or old.provider<>'XENDIT' or old.status<>'FAILED' or old.provider_id is not null then raise exception 'Fallback requires a definite rejected Xendit creation';end if;
 select * into c from public.school_payment_config where tenant_id=old.tenant_id and provider='MIDTRANS' and enabled;
 if c.secret_id is null then raise exception 'PAYMENT_NOT_CONFIGURED';end if;
 insert into public.school_payment_intents(tenant_id,bill_id,application_id,actor_id,provider,account_id,amount,fallback_of) values(old.tenant_id,old.bill_id,old.application_id,old.actor_id,'MIDTRANS',c.account_id,old.amount,old.id) returning * into next;
 return to_jsonb(next);
end $$;
revoke all on function public.school_payment_fallback(uuid) from public,anon,authenticated;
grant execute on function public.school_payment_fallback(uuid) to service_role;

-- An unresolved online checkout reserves the payable amount. Manual receipts,
-- voids, and amount/child changes must wait for provider reconciliation.
create function school_private.guard_pending_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid; admission boolean:=false; relevant boolean:=true;begin
 if tg_table_name='student_bills' then
 target:=old.id;
 if tg_op='UPDATE' then relevant:=(new.amount,new.status,new.student_id,new.tenant_id) is distinct from (old.amount,old.status,old.student_id,old.tenant_id);end if;
 elsif tg_table_name='payments' then
 target:=case when tg_op='DELETE' then old.student_bill_id else new.student_bill_id end;
 if tg_op='UPDATE' and old.student_bill_id is distinct from new.student_bill_id then raise exception 'Payment bill cannot be changed';end if;
 perform 1 from public.student_bills where id=target for update;
 else
 admission:=true;target:=case when tg_op='DELETE' then old.application_id else new.application_id end;
 if tg_op='UPDATE' and old.application_id is distinct from new.application_id then raise exception 'Receipt application cannot be changed';end if;
 perform 1 from public.school_admission_applications where id=target for update;
 end if;
 if relevant and exists(select 1 from public.school_payment_intents where (case when admission then application_id=target else bill_id=target end) and status in ('CREATING','OPEN','UNKNOWN')) then raise exception 'Resolve the pending online checkout before changing the bill or recording a manual payment';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function school_private.guard_pending_payment() from public,anon,authenticated;
create trigger bill_pending_checkout before update or delete on public.student_bills for each row execute function school_private.guard_pending_payment();
create trigger receipt_pending_checkout before insert or update or delete on public.payments for each row execute function school_private.guard_pending_payment();
create trigger admission_pending_checkout before insert or update or delete on public.school_admission_receipts for each row execute function school_private.guard_pending_payment();

-- Service-authenticated provider receipts invoke the existing notification trigger.
grant execute on function public.integration_recipients(text,jsonb),public.integration_recipients_before_guardians(text,jsonb) to service_role;
-- Remove encrypted material when a configuration record is explicitly removed
-- by the trusted service (e.g. disposable verification tenant cleanup).
create function school_private.payment_config_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.school_payment_intents where tenant_id=old.tenant_id and provider=old.provider and status in ('CREATING','OPEN','UNKNOWN')) then raise exception 'Resolve pending payments before removing merchant settings';end if;
 delete from vault.secrets where id in (old.secret_id,old.webhook_secret_id);
 return old;
end $$;
revoke all on function school_private.payment_config_cleanup() from public,anon,authenticated;
create trigger payment_config_cleanup before delete on public.school_payment_config for each row execute function school_private.payment_config_cleanup();
