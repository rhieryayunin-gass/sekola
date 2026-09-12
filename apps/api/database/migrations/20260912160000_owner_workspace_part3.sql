-- Part 3: platform operations are separate from each school's Finance+ ledger.
-- No historical invoices, balances, payments, or contracts are fabricated.
-- The Part 3 brief explicitly assigns cross-tenant platform administration to OWNER.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='OWNER' and r.is_active and p.code in ('tenants.read_all','tenants.create','tenants.update_all','tenants.deactivate')
on conflict do nothing;

alter table public.users add column deleted_at timestamptz;
alter table public.school_partners
  add column domicile text not null default '',
  add column phone text not null default '',
  add column bank_name text not null default '',
  add column bank_account_name text not null default '',
  add column bank_account_number text not null default '',
  add column payment_url text,
  add constraint partner_payment_https check(payment_url is null or (length(payment_url)<=2048 and payment_url ~ '^https://[^/@[:space:]]+(/|$)'));

create table public.owner_contracts (
  tenant_id uuid primary key references public.tenants(id),
  onboarded_on date not null,
  expires_on date not null,
  billing_period text not null check(billing_period in ('MONTHLY','QUARTERLY','YEARLY')),
  annual_amount numeric(16,2) not null check(annual_amount>=0),
  period_amount numeric(16,2) not null check(period_amount>=0),
  updated_at timestamptz not null default now(),
  check(expires_on>=onboarded_on)
);
create table public.owner_invoices (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  tenant_id uuid not null references public.tenants(id),
  number text not null unique,
  period_start date not null,
  period_end date not null,
  due_on date not null,
  amount numeric(16,2) not null check(amount>0),
  notes text not null default '',
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique(tenant_id,period_start,period_end),
  check(period_end>=period_start)
);
create table public.owner_receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.owner_invoices(id),
  amount numeric(16,2) not null check(amount>0),
  reference text not null check(length(trim(reference)) between 3 and 200),
  paid_on date not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique(invoice_id,reference)
);
create table public.owner_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check(length(trim(description)) between 3 and 500),
  amount numeric(16,2) not null check(amount>0),
  reference text not null unique check(length(trim(reference)) between 3 and 200),
  paid_on date not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index owner_invoices_tenant_created on public.owner_invoices(tenant_id,created_at desc);
create index owner_invoices_due on public.owner_invoices(due_on);
create index owner_receipts_invoice on public.owner_receipts(invoice_id);
create index owner_receipts_date on public.owner_receipts(paid_on);
create index owner_expenses_date on public.owner_expenses(paid_on);
do $$ declare tab text; begin
  foreach tab in array array['owner_contracts','owner_invoices','owner_receipts','owner_expenses'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from anon,authenticated',tab);
  end loop;
end $$;

create function school_private.require_owner() returns void language plpgsql stable security definer set search_path='' as $$
begin
  perform school_private.tenant();
  if not school_private.owner() then raise exception 'Platform owner required' using errcode='42501'; end if;
end $$;

create view school_private.owner_invoice_rows with (security_invoker=true) as
select i.*,t.name as tenant_name,coalesce(p.paid,0) as paid_amount,
  i.amount-coalesce(p.paid,0) as balance,
  case when coalesce(p.paid,0)>=i.amount then 'PAID' when i.due_on<current_date then 'OVERDUE' else 'OPEN' end as status
from public.owner_invoices i join public.tenants t on t.id=i.tenant_id
left join lateral (select sum(amount) as paid from public.owner_receipts where invoice_id=i.id)p on true;

create view school_private.owner_tenant_rows with (security_invoker=true) as
select t.*,coalesce(s.plan_code,'ESSENTIAL') as plan_code,
 coalesce(s.modules,'{"core":true,"academic":true,"attendance":true,"connect":true,"learning":true,"exams":true,"finance":true,"team":true}'::jsonb) as modules,
 c.onboarded_on,c.expires_on,c.billing_period,c.annual_amount,c.period_amount,
 latest.id as invoice_id,coalesce(latest.status,'NONE') as invoice_status,latest.number as invoice_number,latest.period_end as invoice_period_end,
 (select count(*) from public.users u where u.tenant_id=t.id and u.deleted_at is null) as user_count,
 case when t.is_active then 'ACTIVE' else 'INACTIVE' end as status
from public.tenants t left join public.school_settings s on s.tenant_id=t.id
left join public.owner_contracts c on c.tenant_id=t.id
left join lateral (select * from school_private.owner_invoice_rows i where i.tenant_id=t.id order by i.created_at desc,i.id desc limit 1)latest on true;

create view school_private.owner_partner_rows with (security_invoker=true) as
select p.*,u.email,coalesce(l.leads,0) as leads,coalesce(l.closings,0) as closings,
 case when coalesce(l.leads,0)>0 then round(l.closings::numeric*100/l.leads,1) else 0 end as success_rate,
 coalesce(c.earned,0) as earned,coalesce(c.paid,0) as paid,coalesce(c.unpaid,0) as unpaid,
 case when p.is_active then 'ACTIVE' else 'INACTIVE' end as status
from public.school_partners p join public.users u on u.id=p.user_id
left join lateral (select count(*) as leads,count(*) filter(where stage='WON') as closings from public.school_leads where partner_id=p.id)l on true
left join lateral (select sum(amount) as earned,sum(amount) filter(where status='RECEIVED') as paid,sum(amount) filter(where status='PENDING') as unpaid from public.school_commissions where partner_id=p.id)c on true;

create view school_private.owner_user_rows with (security_invoker=true) as
select u.id,u.tenant_id,u.full_name,u.email,u.phone,u.is_active,u.deleted_at,u.created_at,u.user_level_id,
 t.name as tenant_name,t.is_active as tenant_active,
 coalesce((select jsonb_agg(distinct r.code order by r.code) from public.roles r where r.is_active and r.id in (
 select role_id from public.user_roles where user_id=u.id union select role_id from public.user_level_roles where user_level_id=u.user_level_id)),'[]') as roles,
 case when u.deleted_at is not null then 'DELETED' when u.is_active then 'ACTIVE' else 'INACTIVE' end as status
from public.users u join public.tenants t on t.id=u.tenant_id;

create view school_private.owner_receipt_rows with (security_invoker=true) as
select r.*,i.number as invoice_number,t.name as tenant_name from public.owner_receipts r join public.owner_invoices i on i.id=r.invoice_id join public.tenants t on t.id=i.tenant_id;

create function school_private.owner_list(kind text,filters jsonb default '{}',page_number integer default 1,page_size integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare source text; predicate text; result jsonb; total bigint; query_text text:=trim(coalesce(filters->>'query','')); begin
 perform school_private.require_owner();
 if page_number<1 or page_size not between 1 and 100 or length(query_text)>160 then raise exception 'Invalid pagination or search' using errcode='22023'; end if;
 source:=case kind when 'tenants' then 'school_private.owner_tenant_rows' when 'finance' then 'school_private.owner_tenant_rows'
 when 'partners' then 'school_private.owner_partner_rows' when 'users' then 'school_private.owner_user_rows'
 when 'invoices' then 'school_private.owner_invoice_rows' when 'expenses' then 'public.owner_expenses'
 when 'receipts' then 'school_private.owner_receipt_rows' when 'commissions' then 'public.school_commissions'
 when 'leads' then 'public.school_leads' end;
 if source is null then raise exception 'Unsupported list' using errcode='22023'; end if;
 -- Identifiers come exclusively from the allowlist above; all filters are bound values.
 predicate:='($1='''' or strpos(lower(coalesce(to_jsonb(r)->>''name'',to_jsonb(r)->>''full_name'',to_jsonb(r)->>''tenant_name'',to_jsonb(r)->>''school_name'',to_jsonb(r)->>''description'','''')||'' ''||coalesce(to_jsonb(r)->>''email'','''')||'' ''||coalesce(to_jsonb(r)->>''code'','''')||'' ''||coalesce(to_jsonb(r)->>''number'','''')),lower($1))>0)
 and (coalesce($2->>''id'','''')='''' or r.id::text=$2->>''id'')
 and (coalesce($2->>''status'','''')='''' or to_jsonb(r)->>''status''=$2->>''status'')
 and (coalesce($2->>''plan'','''')='''' or to_jsonb(r)->>''plan_code''=$2->>''plan'')
 and (coalesce($2->>''invoice_status'','''')='''' or to_jsonb(r)->>''invoice_status''=$2->>''invoice_status'')
 and (coalesce($2->>''tenant_id'','''')='''' or to_jsonb(r)->>''tenant_id''=$2->>''tenant_id'')
 and (coalesce($2->>''partner_id'','''')='''' or to_jsonb(r)->>''partner_id''=$2->>''partner_id'')
 and (coalesce($2->>''invoice_id'','''')='''' or to_jsonb(r)->>''invoice_id''=$2->>''invoice_id'')
 and (coalesce($2->>''role'','''')='''' or (to_jsonb(r)->''roles'') ? ($2->>''role''))';
 if kind='users' and coalesce(filters->>'status','')<>'DELETED' then predicate:=predicate||' and r.deleted_at is null'; end if;
 execute 'select count(*) from '||source||' r where '||predicate into total using query_text,filters;
 execute 'select coalesce(jsonb_agg(to_jsonb(q)),''[]'') from (select r.* from '||source||' r where '||predicate||' order by r.created_at desc,r.id limit $3 offset $4)q'
 into result using query_text,filters,page_size,(page_number-1)::bigint*page_size;
 return jsonb_build_object('items',result,'total',total,'page',page_number,'page_size',page_size);
end $$;

create function school_private.owner_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform school_private.require_owner();
 return jsonb_build_object('tenants',(select count(*) from public.tenants),
 'active_tenants',(select count(*) from public.tenants where is_active),
 'users',(select count(*) from public.users where deleted_at is null),
 'active_users',(select count(*) from public.users where is_active and deleted_at is null),
 'partners',(select count(*) from public.school_partners),
 'active_partners',(select count(*) from public.school_partners where is_active),
 'income',coalesce((select sum(amount) from public.owner_receipts),0),
 'expenses',coalesce((select sum(amount) from public.owner_expenses),0)+coalesce((select sum(amount) from public.school_commissions where status='RECEIVED'),0),
 'receivables',coalesce((select sum(balance) from school_private.owner_invoice_rows),0),
 'overdue',coalesce((select sum(balance) from school_private.owner_invoice_rows where status='OVERDUE'),0));
end $$;

create function school_private.owner_save(kind text,payload jsonb,record_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; previous jsonb; target text; allowed text[]; columns text; actor_tenant uuid; tenant uuid; row_id uuid; invoice school_private.owner_invoice_rows; before_paid numeric; begin
 perform school_private.require_owner(); actor_tenant:=school_private.tenant();
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>16000 then raise exception 'Invalid payload' using errcode='22023'; end if;
 if kind='tenant' then
  target:='tenants'; allowed:=array['name','code','is_active','legal_name','address','contact_email','contact_phone','website_url','academic_year_label','week_starts_on','notifications_email_enabled','notifications_in_app_enabled','timezone','locale'];
  if record_id=actor_tenant and payload->'is_active'='false'::jsonb then raise exception 'Cannot deactivate your current tenant' using errcode='22023'; end if;
  if payload ? 'name' and length(trim(payload->>'name')) not between 2 and 160 then raise exception 'Invalid tenant name' using errcode='22023'; end if;
  if payload ? 'code' and payload->>'code' !~ '^[A-Za-z0-9_-]{2,32}$' then raise exception 'Invalid tenant code' using errcode='22023'; end if;
  if payload ? 'contact_email' and coalesce(payload->>'contact_email','')<>'' and payload->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email' using errcode='22023'; end if;
  if payload ? 'locale' and payload->>'locale' not in ('id-ID','en-US') then raise exception 'Invalid locale' using errcode='22023'; end if;
  if payload ? 'timezone' and not exists(select 1 from pg_timezone_names where name=payload->>'timezone') then raise exception 'Invalid time zone' using errcode='22023'; end if;
 elsif kind='partner' then
  target:='school_partners'; allowed:=array['name','user_id','referral_code','is_active','domicile','phone','bank_name','bank_account_name','bank_account_number','payment_url'];
  if record_id is not null and payload ? 'user_id' then raise exception 'Partner account cannot be reassigned' using errcode='22023'; end if;
  if payload ? 'name' and length(trim(payload->>'name')) not between 2 and 160 then raise exception 'Invalid partner name' using errcode='22023'; end if;
 elsif kind='contract' then
  if record_id is null then raise exception 'Choose a tenant' using errcode='22023'; end if;
  select to_jsonb(c) into previous from public.owner_contracts c where tenant_id=record_id;
  insert into public.owner_contracts(tenant_id,onboarded_on,expires_on,billing_period,annual_amount,period_amount)
  values(record_id,(payload->>'onboarded_on')::date,(payload->>'expires_on')::date,payload->>'billing_period',(payload->>'annual_amount')::numeric,(payload->>'period_amount')::numeric)
  on conflict(tenant_id) do update set onboarded_on=excluded.onboarded_on,expires_on=excluded.expires_on,billing_period=excluded.billing_period,annual_amount=excluded.annual_amount,period_amount=excluded.period_amount,updated_at=now()
  returning to_jsonb(owner_contracts.*) into result;
 elsif kind='module' then
  if record_id is null or payload->>'module' not in ('core','academic','attendance','connect','learning','exams','finance','team') or jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise exception 'Invalid module switch' using errcode='22023'; end if;
  insert into public.school_settings(tenant_id) values(record_id) on conflict do nothing;
  select to_jsonb(s) into previous from public.school_settings s where tenant_id=record_id for update;
  update public.school_settings set modules=jsonb_set(modules,array[payload->>'module'],payload->'enabled'),updated_at=now() where tenant_id=record_id returning to_jsonb(school_settings.*) into result;
 elsif kind='plan' then
  insert into public.school_settings(tenant_id,plan_code) values(record_id,payload->>'plan_code') on conflict(tenant_id) do update set plan_code=excluded.plan_code,updated_at=now() returning to_jsonb(school_settings.*) into result;
 elsif kind='invoice' then
  tenant:=(payload->>'tenant_id')::uuid;
  perform 1 from public.owner_contracts where tenant_id=tenant for update;
  if not found then raise exception 'Save the contract before creating an invoice' using errcode='22023'; end if;
  select to_jsonb(i) into result from public.owner_invoices i where request_id=(payload->>'request_id')::uuid;
  if result is not null then return result; end if;
  if not exists(select 1 from public.owner_contracts where tenant_id=tenant and (payload->>'period_start')::date>=onboarded_on and (payload->>'period_end')::date<=expires_on) then raise exception 'Invoice period must be within the contract' using errcode='22023'; end if;
  if exists(select 1 from public.owner_invoices where tenant_id=tenant and daterange(period_start,period_end,'[]') && daterange((payload->>'period_start')::date,(payload->>'period_end')::date,'[]')) then raise exception 'An invoice already covers this period' using errcode='23505'; end if;
  row_id:=gen_random_uuid();
  insert into public.owner_invoices(id,request_id,tenant_id,number,period_start,period_end,due_on,amount,notes,created_by)
  values(row_id,(payload->>'request_id')::uuid,tenant,'OSE-'||to_char(current_date,'YYYYMM')||'-'||upper(substr(replace(row_id::text,'-',''),1,12)),(payload->>'period_start')::date,(payload->>'period_end')::date,(payload->>'due_on')::date,(payload->>'amount')::numeric,coalesce(payload->>'notes',''),auth.uid()) returning to_jsonb(owner_invoices.*) into result;
  insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id,metadata)
  select tenant,u.id,'ACTION_REQUIRED',case when t.locale='id-ID' then 'Invoice langganan OSEKOLA' else 'OSEKOLA subscription invoice' end,
   (result->>'number')||' · IDR '||(result->>'amount')||' · '||(result->>'due_on'),'owner_invoice',row_id,jsonb_build_object('href','/dashboard/subscription')
  from public.users u join public.tenants t on t.id=u.tenant_id where u.tenant_id=tenant and u.is_active and exists(select 1 from public.roles r where r.code in ('OWNER','PRINCIPAL','STAFF') and r.is_active and r.id in(select role_id from public.user_roles where user_id=u.id union select role_id from public.user_level_roles where user_level_id=u.user_level_id));
 elsif kind='receipt' then
  perform 1 from public.owner_invoices where id=record_id for update;
  select * into invoice from school_private.owner_invoice_rows where id=record_id;
  if invoice.id is null then raise exception 'Invoice not found' using errcode='P0002'; end if;
  select to_jsonb(r) into result from public.owner_receipts r where invoice_id=record_id and reference=payload->>'reference';
  if result is not null then return result; end if;
  if (payload->>'amount')::numeric>invoice.balance then raise exception 'Receipt exceeds the outstanding balance' using errcode='22023'; end if;
  insert into public.owner_receipts(invoice_id,amount,reference,paid_on,created_by) values(record_id,(payload->>'amount')::numeric,payload->>'reference',(payload->>'paid_on')::date,auth.uid()) returning to_jsonb(owner_receipts.*) into result;
 elsif kind='expense' then
  insert into public.owner_expenses(description,amount,reference,paid_on,created_by) values(payload->>'description',(payload->>'amount')::numeric,payload->>'reference',(payload->>'paid_on')::date,auth.uid()) returning to_jsonb(owner_expenses.*) into result;
 elsif kind='commission' then
  if not exists(select 1 from public.school_leads where id=(payload->>'lead_id')::uuid and partner_id=(payload->>'partner_id')::uuid and stage='WON') then raise exception 'Choose a won lead for this partner' using errcode='22023'; end if;
  insert into public.school_commissions(partner_id,lead_id,amount,status) values((payload->>'partner_id')::uuid,(payload->>'lead_id')::uuid,(payload->>'amount')::numeric,'PENDING') returning to_jsonb(school_commissions.*) into result;
 elsif kind='commission_paid' then
  if length(trim(coalesce(payload->>'reference','')))<3 then raise exception 'Payment reference required' using errcode='22023'; end if;
  select to_jsonb(c) into previous from public.school_commissions c where id=record_id for update;
  update public.school_commissions set status='RECEIVED',reference=payload->>'reference',received_at=now() where id=record_id and status='PENDING' returning to_jsonb(school_commissions.*) into result;
 else raise exception 'Unsupported operation' using errcode='22023'; end if;
 if target is not null then
  if payload='{}'::jsonb or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed))) then raise exception 'Unsupported fields' using errcode='22023'; end if;
  select string_agg(format('%I',k),',' order by k) into columns from jsonb_object_keys(payload)k;
  if record_id is null then
   execute format('insert into public.%1$I(%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) returning to_jsonb(%1$I.*)',target,columns) into result using payload;
  else
   execute format('select to_jsonb(t) from public.%I t where id=$1 for update',target) into previous using record_id;
   execute format('update public.%1$I set (%2$s)=(select %2$s from jsonb_populate_record(null::public.%1$I,$1)) where id=$2 returning to_jsonb(%1$I.*)',target,columns) into result using payload,record_id;
  end if;
 end if;
 if result is null then raise exception 'Record not found or already processed' using errcode='P0002'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id,before_state,after_state)
 values(actor_tenant,auth.uid(),'OWNER_SAVE','PLATFORM',kind,coalesce(record_id,(result->>'id')::uuid),previous,result);
 return result;
end $$;

create function school_private.owner_payment_link(partner_id uuid) returns text language plpgsql security definer set search_path='' as $$
declare destination text; begin
 perform school_private.require_owner();
 select payment_url into destination from school_private.owner_partner_rows where id=partner_id and is_active and unpaid>0;
 if destination is null then raise exception 'An unpaid fee and configured gateway URL are required' using errcode='22023'; end if;
 insert into public.audit_logs(tenant_id,actor_user_id,action,module,resource_type,resource_id) values(school_private.tenant(),auth.uid(),'OPEN_PAYMENT_GATEWAY','PLATFORM','partner',partner_id);
 -- Opening a provider page never marks a commission paid or transfers money.
 return destination;
end $$;

create function school_private.subscription() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid:=school_private.tenant(); begin
 if not school_private.staff() then raise exception 'School administration required' using errcode='42501'; end if;
 return jsonb_build_object('contract',(select to_jsonb(c) from public.owner_contracts c where tenant_id=tenant),
 'invoices',coalesce((select jsonb_agg(to_jsonb(i) order by created_at desc) from school_private.owner_invoice_rows i where tenant_id=tenant),'[]'));
end $$;

create function public.school_owner_list(kind text,filters jsonb default '{}',page_number integer default 1,page_size integer default 20) returns jsonb language sql security invoker set search_path='' as $$ select school_private.owner_list(kind,filters,page_number,page_size) $$;
create function public.school_owner_summary() returns jsonb language sql security invoker set search_path='' as $$ select school_private.owner_summary() $$;
create function public.school_owner_save(kind text,payload jsonb,record_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select school_private.owner_save(kind,payload,record_id) $$;
create function public.school_owner_payment_link(partner_id uuid) returns text language sql security invoker set search_path='' as $$ select school_private.owner_payment_link(partner_id) $$;
create function public.school_subscription() returns jsonb language sql security invoker set search_path='' as $$ select school_private.subscription() $$;

revoke all on function school_private.require_owner(),school_private.owner_list(text,jsonb,integer,integer),school_private.owner_summary(),school_private.owner_save(text,jsonb,uuid),school_private.owner_payment_link(uuid),school_private.subscription(),public.school_owner_list(text,jsonb,integer,integer),public.school_owner_summary(),public.school_owner_save(text,jsonb,uuid),public.school_owner_payment_link(uuid),public.school_subscription() from public,anon,authenticated;
grant execute on function school_private.owner_list(text,jsonb,integer,integer),school_private.owner_summary(),school_private.owner_save(text,jsonb,uuid),school_private.owner_payment_link(uuid),school_private.subscription(),public.school_owner_list(text,jsonb,integer,integer),public.school_owner_summary(),public.school_owner_save(text,jsonb,uuid),public.school_owner_payment_link(uuid),public.school_subscription() to authenticated;

-- Owner may manage only the fixed school logo across tenants, not their private files.
create function school_private.owner_logo(bucket text,path text) returns boolean language sql stable security definer set search_path='' as $$
 select bucket='tenant-media' and school_private.owner()
 and exists(select 1 from public.users u join public.tenants t on t.id=u.tenant_id where u.id=auth.uid() and u.is_active and t.is_active)
 and exists(select 1 from public.tenants where path=id::text||'/logos/logo')
$$;
revoke all on function school_private.owner_logo(text,text) from public,anon;
grant execute on function school_private.owner_logo(text,text) to authenticated;
create policy owner_logo_read on storage.objects for select to authenticated using(school_private.owner_logo(bucket_id,name));
create policy owner_logo_insert on storage.objects for insert to authenticated with check(school_private.owner_logo(bucket_id,name));
create policy owner_logo_update on storage.objects for update to authenticated using(school_private.owner_logo(bucket_id,name)) with check(school_private.owner_logo(bucket_id,name));
create policy owner_logo_delete on storage.objects for delete to authenticated using(school_private.owner_logo(bucket_id,name));
