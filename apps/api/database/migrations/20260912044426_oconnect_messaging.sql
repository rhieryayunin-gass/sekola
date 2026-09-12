-- O-Connect: authenticated, tenant- and membership-scoped communication.
-- The private RPC implementation is the transaction boundary. No service key
-- is needed by the web application, and JWT user_metadata never grants access.
create schema oconnect_private;
revoke all on schema oconnect_private from public, anon;
grant usage on schema oconnect_private to authenticated;
alter default privileges in schema oconnect_private revoke execute on functions from public;

insert into public.permissions(code,name,description) values
 ('connect.read','Use O-Connect','Read and send messages in permitted conversations'),
 ('connect.manage','Manage O-Connect groups','Create and maintain school communication groups')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.is_active and ((p.code='connect.read' and r.code in('OWNER','PRINCIPAL','STAFF','TEACHER','STUDENT','PARENT'))
 or (p.code='connect.manage' and r.code in('OWNER','PRINCIPAL','STAFF','TEACHER')))
on conflict do nothing;

create table public.oconnect_conversations (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete restrict,
 kind text not null check(kind in('DIRECT','GROUP','CLASS','PROJECT')),
 title text not null check(char_length(trim(title)) between 1 and 120),
 created_by uuid not null references public.users(id) on delete restrict,
 direct_key text,
 classroom_id uuid references public.classrooms(id) on delete restrict,
 project_id uuid references public.team_projects(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(tenant_id,id), unique(tenant_id,direct_key), unique(classroom_id), unique(project_id),
 check((kind='DIRECT' and direct_key is not null and classroom_id is null and project_id is null)
   or (kind='GROUP' and direct_key is null and classroom_id is null and project_id is null)
   or (kind='CLASS' and classroom_id is not null and direct_key is null and project_id is null)
   or (kind='PROJECT' and project_id is not null and direct_key is null and classroom_id is null))
);
create index oconnect_conversations_tenant_updated_idx on public.oconnect_conversations(tenant_id,updated_at desc,id);
create table public.oconnect_members (
 conversation_id uuid not null, tenant_id uuid not null,
 user_id uuid not null references public.users(id) on delete cascade,
 is_manager boolean not null default false, last_read_seq bigint not null default 0,
 muted boolean not null default false, archived boolean not null default false,
 joined_at timestamptz not null default now(),
 primary key(conversation_id,user_id),
 foreign key(tenant_id,conversation_id) references public.oconnect_conversations(tenant_id,id) on delete cascade
);
create index oconnect_members_user_idx on public.oconnect_members(user_id,conversation_id);
create table public.oconnect_messages (
 id uuid primary key default gen_random_uuid(), seq bigint generated always as identity unique,
 conversation_id uuid not null, tenant_id uuid not null,
 sender_id uuid not null references public.users(id) on delete restrict,
 body text not null default '' check(char_length(body)<=6000),
 reply_to uuid, attachment_path text, attachment_name text, attachment_type text,
 attachment_size integer check(attachment_size between 1 and 10485760),
 resource_type text check(resource_type in('calendar','course','task')), resource_id uuid,
 created_at timestamptz not null default now(), deleted_at timestamptz,
 unique(conversation_id,id), unique(attachment_path),
 foreign key(tenant_id,conversation_id) references public.oconnect_conversations(tenant_id,id) on delete cascade,
 foreign key(conversation_id,reply_to) references public.oconnect_messages(conversation_id,id),
 check((resource_type is null)=(resource_id is null)),
 check(deleted_at is not null or char_length(trim(body))>0 or attachment_path is not null or resource_id is not null)
);
create index oconnect_messages_conversation_seq_idx on public.oconnect_messages(conversation_id,seq desc);
create index oconnect_messages_sender_created_idx on public.oconnect_messages(sender_id,created_at desc);
create index oconnect_messages_reply_idx on public.oconnect_messages(reply_to) where reply_to is not null;
create table public.oconnect_preferences (
 user_id uuid primary key references public.users(id) on delete cascade,
 font_size integer not null default 16 check(font_size in(14,16,18,20)),
 updated_at timestamptz not null default now()
);

create function oconnect_private.active_user(who uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.users u join public.tenants t on t.id=u.tenant_id
 where u.id=who and u.is_active and t.is_active and public.app_has_permission(u.id,'connect.read'));
$$;
create function oconnect_private.tenant() returns uuid
language sql stable security definer set search_path='' as $$
 select tenant_id from public.users where id=auth.uid() and oconnect_private.active_user(id);
$$;
create function oconnect_private.staff(who uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and oconnect_private.active_user(who) and public.app_has_permission(who,'connect.manage');
$$;
create function oconnect_private.class_member(class_id uuid,who uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.classrooms c join public.users u on u.id=who and u.tenant_id=c.tenant_id
 where c.id=class_id and c.is_active and oconnect_private.active_user(who) and (
 c.homeroom_teacher_user_id=who
 or (public.app_has_permission(who,'classrooms.update') and oconnect_private.staff(who))
 or exists(select 1 from public.teacher_assignments a join public.teachers t on t.id=a.teacher_id
   where a.classroom_id=c.id and a.tenant_id=c.tenant_id and a.is_active and t.user_id=who and t.employment_status='ACTIVE')
 or exists(select 1 from public.student_assignments a join public.students s on s.id=a.student_id
   where a.classroom_id=c.id and a.tenant_id=c.tenant_id and a.is_active and s.user_id=who and s.enrollment_status='ACTIVE')));
$$;
create function oconnect_private.project_member(project uuid,who uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.team_projects p join public.users u on u.id=who and u.tenant_id=p.tenant_id
 where p.id=project and p.status<>'ARCHIVED' and oconnect_private.active_user(who) and
 (p.owner_user_id=who or exists(select 1 from public.team_project_members m where m.project_id=p.id and m.user_id=who and m.tenant_id=p.tenant_id)));
$$;
create function oconnect_private.can_access(conversation uuid,who uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and oconnect_private.active_user(who) and exists(
 select 1 from public.oconnect_conversations c join public.users u on u.id=who and u.tenant_id=c.tenant_id
 where c.id=conversation and c.tenant_id=oconnect_private.tenant() and case c.kind
 when 'CLASS' then oconnect_private.class_member(c.classroom_id,who)
 when 'PROJECT' then oconnect_private.project_member(c.project_id,who)
 else exists(select 1 from public.oconnect_members m where m.conversation_id=c.id and m.user_id=who) end);
$$;

alter table public.oconnect_conversations enable row level security;
alter table public.oconnect_members enable row level security;
alter table public.oconnect_messages enable row level security;
alter table public.oconnect_preferences enable row level security;
revoke all on public.oconnect_conversations,public.oconnect_members,public.oconnect_messages,public.oconnect_preferences from anon,authenticated;
grant select on public.oconnect_conversations,public.oconnect_members,public.oconnect_messages,public.oconnect_preferences to authenticated;
grant all on public.oconnect_conversations,public.oconnect_members,public.oconnect_messages,public.oconnect_preferences to service_role;
create policy oconnect_conversations_read on public.oconnect_conversations for select to authenticated using(oconnect_private.can_access(id));
create policy oconnect_members_read on public.oconnect_members for select to authenticated using(oconnect_private.can_access(conversation_id));
create policy oconnect_messages_read on public.oconnect_messages for select to authenticated using(oconnect_private.can_access(conversation_id));
create policy oconnect_preferences_read on public.oconnect_preferences for select to authenticated using(user_id=(select auth.uid()) and oconnect_private.tenant() is not null);

create function oconnect_private.context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=oconnect_private.tenant(); result jsonb;
begin
 if t is null then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 select jsonb_build_object('user_id',u.id,'tenant_id',t,'full_name',u.full_name,
 'can_manage',oconnect_private.staff(u.id),'font_size',coalesce(p.font_size,16)) into result
 from public.users u left join public.oconnect_preferences p on p.user_id=u.id where u.id=auth.uid();
 return result;
end $$;

create function oconnect_private.contacts(search text default '',for_group boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=oconnect_private.tenant();
begin
 if t is null then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select u.id,coalesce(nullif(u.full_name,''),'Pengguna OSEKOLA') full_name,oconnect_private.staff(u.id) is_staff
 from public.users u where u.tenant_id=t and u.id<>auth.uid() and oconnect_private.active_user(u.id)
 and (oconnect_private.staff(auth.uid()) or oconnect_private.staff(u.id))
 and position(lower(left(coalesce(search,''),80)) in lower(coalesce(u.full_name,'')))>0
 order by u.full_name,u.id limit 50) x),'[]'::jsonb);
end $$;

create function oconnect_private.sources() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=oconnect_private.tenant();
begin
 if t is null then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object(
 'classes',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name from public.classrooms where tenant_id=t and oconnect_private.class_member(id,auth.uid()) order by name limit 200)x),'[]'::jsonb),
 'projects',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name from public.team_projects where tenant_id=t and oconnect_private.project_member(id,auth.uid()) order by name limit 200)x),'[]'::jsonb));
end $$;

create function oconnect_private.create_conversation(kind text,title text default '',members uuid[] default '{}',source_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare t uuid:=oconnect_private.tenant(); actor uuid:=auth.uid(); cid uuid; key text; source_title text; other uuid;
begin
 if t is null then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 -- Serialize creation and messaging limits for this actor across requests.
 perform pg_advisory_xact_lock(hashtextextended(actor::text,551));
 if kind in('CLASS','PROJECT') then
   if kind='CLASS' and oconnect_private.class_member(source_id,actor) then
     select name into source_title from public.classrooms where id=source_id and tenant_id=t;
     insert into public.oconnect_conversations(tenant_id,kind,title,created_by,classroom_id) values(t,kind,source_title,actor,source_id)
     on conflict(classroom_id) do update set title=excluded.title returning id into cid;
   elsif kind='PROJECT' and oconnect_private.project_member(source_id,actor) then
     select name into source_title from public.team_projects where id=source_id and tenant_id=t;
     insert into public.oconnect_conversations(tenant_id,kind,title,created_by,project_id) values(t,kind,source_title,actor,source_id)
     on conflict(project_id) do update set title=excluded.title returning id into cid;
   else raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 else
   if kind not in('DIRECT','GROUP') or members is null or cardinality(members) not between 1 and 99 then raise exception 'CONNECT_INVALID'; end if;
   if exists(select 1 from unnest(members) m where m is null or not exists(select 1 from public.users u where u.id=m and u.tenant_id=t and oconnect_private.active_user(u.id))) then
     raise exception 'CONNECT_FORBIDDEN' using errcode='42501';
   end if;
   if kind='DIRECT' then
     if cardinality(members)<>1 or members[1]=actor then raise exception 'CONNECT_INVALID'; end if;
     other:=members[1];
     if not oconnect_private.staff(actor) and not oconnect_private.staff(other) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
     key:=least(actor::text,other::text)||':'||greatest(actor::text,other::text);
     select id into cid from public.oconnect_conversations where tenant_id=t and direct_key=key;
   elsif not oconnect_private.staff(actor) or char_length(trim(title)) not between 2 and 120 then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
   if cid is null then
     if (select count(*) from public.oconnect_conversations c where c.created_by=actor and c.created_at>now()-interval '1 hour')>=30 then raise exception 'CONNECT_RATE_LIMIT'; end if;
     insert into public.oconnect_conversations(tenant_id,kind,title,created_by,direct_key)
     values(t,kind,case when kind='DIRECT' then 'Percakapan pribadi' else trim(title) end,actor,key)
     on conflict(tenant_id,direct_key) do update set direct_key=excluded.direct_key returning id into cid;
     insert into public.oconnect_members(tenant_id,conversation_id,user_id) select t,cid,m from unnest(members)m on conflict do nothing;
   end if;
 end if;
 insert into public.oconnect_members(tenant_id,conversation_id,user_id,is_manager) values(t,cid,actor,kind='GROUP')
 on conflict(conversation_id,user_id) do update set archived=false;
 return cid;
end $$;

create function oconnect_private.inbox(search text default '',page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if oconnect_private.tenant() is null then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select c.id,c.kind,case when c.kind='DIRECT' then coalesce((select u.full_name from public.oconnect_members m join public.users u on u.id=m.user_id where m.conversation_id=c.id and m.user_id<>auth.uid() limit 1),'Pengguna OSEKOLA') else c.title end title,
 c.classroom_id,c.project_id,c.updated_at,coalesce(mine.muted,false) muted,coalesce(mine.archived,false) archived,
 coalesce(mine.is_manager,false) is_manager,
 (select count(*) from public.oconnect_messages msg where msg.conversation_id=c.id and msg.seq>coalesce(mine.last_read_seq,0) and msg.sender_id<>auth.uid() and msg.deleted_at is null) unread_count,
 (select case when msg.deleted_at is not null then null else left(msg.body,100) end from public.oconnect_messages msg where msg.conversation_id=c.id order by seq desc limit 1) preview
 from public.oconnect_conversations c left join public.oconnect_members mine on mine.conversation_id=c.id and mine.user_id=auth.uid()
 where c.tenant_id=oconnect_private.tenant() and oconnect_private.can_access(c.id)
 order by c.updated_at desc,c.id limit 100 offset least(greatest(coalesce(page,0),0),1000)*100)x
 where position(lower(left(coalesce(search,''),80)) in lower(x.title))>0),'[]'::jsonb);
end $$;

create function oconnect_private.thread(conversation uuid,before_seq bigint default null,search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; participants jsonb;
begin
 if not oconnect_private.can_access(conversation) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into participants from (
 select u.id,coalesce(u.full_name,'Pengguna OSEKOLA') full_name,coalesce(m.last_read_seq,0) last_read_seq,coalesce(m.is_manager,false) is_manager
 from public.users u left join public.oconnect_members m on m.user_id=u.id and m.conversation_id=conversation
 where u.tenant_id=oconnect_private.tenant() and oconnect_private.can_access(conversation,u.id) order by u.full_name limit 1000)x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.seq),'[]'::jsonb) into result from (
 select msg.*,coalesce(u.full_name,'Pengguna OSEKOLA') sender_name,
 case when reply.deleted_at is null then left(reply.body,160) else null end reply_body
 from public.oconnect_messages msg join public.users u on u.id=msg.sender_id
 left join public.oconnect_messages reply on reply.id=msg.reply_to and reply.conversation_id=msg.conversation_id
 where msg.conversation_id=conversation and (before_seq is null or msg.seq<before_seq)
 and (coalesce(search,'')='' or (msg.deleted_at is null and position(lower(left(search,80)) in lower(msg.body))>0))
 order by msg.seq desc limit 50)x;
 return jsonb_build_object('messages',result,'members',participants);
end $$;

create function oconnect_private.resource_allowed(kind text,resource uuid,who uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and oconnect_private.active_user(who) and case kind
 when 'calendar' then exists(select 1 from public.calendar_events e join public.calendars c on c.id=e.calendar_id join public.users u on u.id=who and u.tenant_id=c.tenant_id where e.id=resource and public.app_has_permission(who,'calendar.read'))
 when 'course' then exists(select 1 from public.courses c join public.users u on u.id=who and u.tenant_id=c.tenant_id where c.id=resource and c.is_active and public.app_has_permission(who,'courses.read'))
 when 'task' then exists(select 1 from public.team_tasks task where task.id=resource and oconnect_private.project_member(task.project_id,who) and public.app_has_permission(who,'team_projects.read'))
 else false end;
$$;
create function oconnect_private.resources(conversation uuid,kind text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not oconnect_private.can_access(conversation) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select e.id,e.title name from public.calendar_events e where kind='calendar' and oconnect_private.resource_allowed(kind,e.id,auth.uid())
 union all select c.id,c.name from public.courses c where kind='course' and oconnect_private.resource_allowed(kind,c.id,auth.uid())
 union all select t.id,t.title from public.team_tasks t where kind='task' and oconnect_private.resource_allowed(kind,t.id,auth.uid())
 limit 100)x),'[]'::jsonb);
end $$;

create function oconnect_private.send(conversation uuid,message_id uuid,body text default '',reply_to uuid default null,attachment jsonb default null,resource_type text default null,resource_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); t uuid:=oconnect_private.tenant(); saved public.oconnect_messages; path text; obj storage.objects; c public.oconnect_conversations;
begin
 if not oconnect_private.can_access(conversation) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,551));
 select * into c from public.oconnect_conversations where id=conversation for update;
 select * into saved from public.oconnect_messages where id=message_id;
 if found then
   if saved.sender_id=actor and saved.conversation_id=conversation then return to_jsonb(saved); end if;
   raise exception 'CONNECT_INVALID';
 end if;
 if message_id is null or body is null or char_length(body)>6000 then raise exception 'CONNECT_INVALID'; end if;
 if (select count(*) from public.oconnect_messages m where m.sender_id=actor and m.created_at>now()-interval '1 minute')>=30 then raise exception 'CONNECT_RATE_LIMIT'; end if;
 if reply_to is not null and not exists(select 1 from public.oconnect_messages m where m.id=send.reply_to and m.conversation_id=conversation and m.deleted_at is null) then raise exception 'CONNECT_INVALID'; end if;
 if attachment is not null then
   path:=attachment->>'path';
   if path is null or split_part(path,'/',1)<>t::text or split_part(path,'/',2)<>conversation::text or split_part(path,'/',3)<>actor::text then raise exception 'CONNECT_INVALID'; end if;
   select * into obj from storage.objects where bucket_id='oconnect-attachments' and name=path;
   if not found or coalesce((obj.metadata->>'size')::bigint,0) not between 1 and 10485760
      or coalesce(obj.metadata->>'mimetype','') not in('image/png','image/jpeg','image/webp','application/pdf','text/plain')
      or char_length(coalesce(attachment->>'name','')) not between 1 and 180 then raise exception 'CONNECT_INVALID_ATTACHMENT'; end if;
 end if;
 if (resource_type is null)<>(resource_id is null) then raise exception 'CONNECT_INVALID'; end if;
 if resource_id is not null and not oconnect_private.resource_allowed(resource_type,resource_id,actor) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 insert into public.oconnect_messages(id,tenant_id,conversation_id,sender_id,body,reply_to,attachment_path,attachment_name,attachment_type,attachment_size,resource_type,resource_id)
 values(message_id,t,conversation,actor,trim(body),reply_to,path,attachment->>'name',obj.metadata->>'mimetype',(obj.metadata->>'size')::integer,resource_type,resource_id) returning * into saved;
 update public.oconnect_conversations set updated_at=now() where id=conversation;
 insert into public.oconnect_members(tenant_id,conversation_id,user_id,last_read_seq) values(t,conversation,actor,saved.seq)
 on conflict(conversation_id,user_id) do update set last_read_seq=greatest(public.oconnect_members.last_read_seq,excluded.last_read_seq),archived=false;
 -- Generic notifications deliberately omit message content and attachment names.
 insert into public.notifications(tenant_id,user_id,type,title,body,resource_type,resource_id,metadata)
 select t,u.id,'INFO','O-Connect','Pesan baru / New message','oconnect',conversation,jsonb_build_object('conversation_id',conversation)
 from public.users u left join public.oconnect_members m on m.user_id=u.id and m.conversation_id=conversation
 where u.tenant_id=t and u.id<>actor and oconnect_private.can_access(conversation,u.id) and not coalesce(m.muted,false)
 and not exists(select 1 from public.notifications n where n.user_id=u.id and n.resource_type='oconnect' and n.resource_id=conversation and n.read_at is null);
 return to_jsonb(saved);
end $$;

create function oconnect_private.mark_read(conversation uuid,through_seq bigint) returns void
language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 if not oconnect_private.can_access(conversation) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 select coalesce(max(seq),0) into n from public.oconnect_messages where conversation_id=conversation and seq<=through_seq;
 insert into public.oconnect_members(tenant_id,conversation_id,user_id,last_read_seq) values(oconnect_private.tenant(),conversation,auth.uid(),n)
 on conflict(conversation_id,user_id) do update set last_read_seq=greatest(public.oconnect_members.last_read_seq,excluded.last_read_seq);
 update public.notifications set read_at=now() where user_id=auth.uid() and resource_type='oconnect' and resource_id=conversation and read_at is null
 and not exists(select 1 from public.oconnect_messages where conversation_id=conversation and seq>n and sender_id<>auth.uid() and deleted_at is null);
end $$;
create function oconnect_private.preferences(font_size integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if oconnect_private.tenant() is null then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 if font_size is null or font_size not in(14,16,18,20) then raise exception 'CONNECT_INVALID'; end if;
 insert into public.oconnect_preferences(user_id,font_size) values(auth.uid(),font_size)
 on conflict(user_id) do update set font_size=excluded.font_size,updated_at=now();
end $$;
create function oconnect_private.options(conversation uuid,muted boolean,archived boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not oconnect_private.can_access(conversation) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 insert into public.oconnect_members(tenant_id,conversation_id,user_id,muted,archived) values(oconnect_private.tenant(),conversation,auth.uid(),coalesce(muted,false),coalesce(archived,false))
 on conflict(conversation_id,user_id) do update set muted=excluded.muted,archived=excluded.archived;
end $$;
create function oconnect_private.manage_member(conversation uuid,member uuid,remove boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare c public.oconnect_conversations;
begin
 if not oconnect_private.can_access(conversation) or not oconnect_private.staff(auth.uid()) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 select * into c from public.oconnect_conversations where id=conversation for update;
 if c.kind<>'GROUP' or not exists(select 1 from public.oconnect_members where conversation_id=conversation and user_id=auth.uid() and is_manager) or member=auth.uid() then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 if remove then
   delete from public.oconnect_members where conversation_id=conversation and user_id=member and not is_manager;
   update public.notifications set read_at=now() where user_id=member and resource_type='oconnect' and resource_id=conversation and read_at is null;
 else
   if not exists(select 1 from public.users where id=member and tenant_id=c.tenant_id and oconnect_private.active_user(id)) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
   if (select count(*) from public.oconnect_members where conversation_id=conversation)>=100 then raise exception 'CONNECT_GROUP_FULL'; end if;
   insert into public.oconnect_members(tenant_id,conversation_id,user_id) values(c.tenant_id,conversation,member) on conflict do nothing;
 end if;
 update public.oconnect_conversations set updated_at=now() where id=conversation;
end $$;
create function oconnect_private.delete_message(message uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.oconnect_messages;
begin
 select * into m from public.oconnect_messages where id=message for update;
 if not found or not oconnect_private.can_access(m.conversation_id) or m.sender_id<>auth.uid() or m.created_at<now()-interval '24 hours' then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 update public.oconnect_messages set body='',attachment_path=null,attachment_name=null,attachment_type=null,attachment_size=null,resource_type=null,resource_id=null,deleted_at=now() where id=message;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('oconnect-attachments','oconnect-attachments',false,10485760,array['image/png','image/jpeg','image/webp','application/pdf','text/plain']);
create function oconnect_private.storage_allowed(path text,writing boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(path,'/'); cid uuid;
begin
 if auth.uid() is null or cardinality(parts)<>4 or parts[1] is distinct from oconnect_private.tenant()::text then return false; end if;
 begin cid:=parts[2]::uuid; exception when invalid_text_representation then return false; end;
 if not oconnect_private.can_access(cid) then return false; end if;
 if writing then return parts[3]=auth.uid()::text and parts[4] ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$'; end if;
 return exists(select 1 from public.oconnect_messages where attachment_path=path and conversation_id=cid and deleted_at is null)
   or parts[3]=auth.uid()::text;
end $$;
create policy oconnect_attachment_read on storage.objects for select to authenticated using(bucket_id='oconnect-attachments' and oconnect_private.storage_allowed(name,false));
create policy oconnect_attachment_insert on storage.objects for insert to authenticated with check(bucket_id='oconnect-attachments' and oconnect_private.storage_allowed(name,true));
create policy oconnect_attachment_cleanup on storage.objects for delete to authenticated using(bucket_id='oconnect-attachments' and oconnect_private.storage_allowed(name,true) and not exists(select 1 from public.oconnect_messages where attachment_path=name));

create function oconnect_private.resource(message uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.oconnect_messages; result jsonb;
begin
 select * into m from public.oconnect_messages where id=message and deleted_at is null;
 if not found or not oconnect_private.can_access(m.conversation_id) or not oconnect_private.resource_allowed(m.resource_type,m.resource_id,auth.uid()) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 if m.resource_type='calendar' then
   select jsonb_build_object('name',e.title,'description',e.description,'starts_at',e.starts_at,'href','/dashboard/calendar') into result from public.calendar_events e where e.id=m.resource_id;
 elsif m.resource_type='course' then
   select jsonb_build_object('name',c.name,'description',c.description,'href','/dashboard/learning') into result from public.courses c where c.id=m.resource_id;
 elsif m.resource_type='task' then
   select jsonb_build_object('name',t.title,'description',t.description,'href','/dashboard/team') into result from public.team_tasks t where t.id=m.resource_id;
 end if;
 return result;
end $$;

-- Public invoker wrappers expose only the intentionally supported API.
create function public.oconnect_resource(message uuid) returns jsonb language sql security invoker set search_path='' as $$ select oconnect_private.resource(message) $$;
create function public.oconnect_context() returns jsonb language sql security invoker set search_path='' as $$ select oconnect_private.context() $$;
create function public.oconnect_contacts(search text default '',for_group boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select oconnect_private.contacts(search,for_group) $$;
create function public.oconnect_sources() returns jsonb language sql security invoker set search_path='' as $$ select oconnect_private.sources() $$;
create function public.oconnect_create(kind text,title text default '',members uuid[] default '{}',source_id uuid default null) returns uuid language sql security invoker set search_path='' as $$ select oconnect_private.create_conversation(kind,title,members,source_id) $$;
create function public.oconnect_inbox(search text default '',page integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select oconnect_private.inbox(search,page) $$;
create function public.oconnect_thread(conversation uuid,before_seq bigint default null,search text default '') returns jsonb language sql security invoker set search_path='' as $$ select oconnect_private.thread(conversation,before_seq,search) $$;
create function public.oconnect_resources(conversation uuid,kind text) returns jsonb language sql security invoker set search_path='' as $$ select oconnect_private.resources(conversation,kind) $$;
create function public.oconnect_send(conversation uuid,message_id uuid,body text default '',reply_to uuid default null,attachment jsonb default null,resource_type text default null,resource_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select oconnect_private.send(conversation,message_id,body,reply_to,attachment,resource_type,resource_id) $$;
create function public.oconnect_mark_read(conversation uuid,through_seq bigint) returns void language sql security invoker set search_path='' as $$ select oconnect_private.mark_read(conversation,through_seq) $$;
create function public.oconnect_preferences(font_size integer) returns void language sql security invoker set search_path='' as $$ select oconnect_private.preferences(font_size) $$;
create function public.oconnect_options(conversation uuid,muted boolean,archived boolean) returns void language sql security invoker set search_path='' as $$ select oconnect_private.options(conversation,muted,archived) $$;
create function public.oconnect_manage_member(conversation uuid,member uuid,remove boolean default false) returns void language sql security invoker set search_path='' as $$ select oconnect_private.manage_member(conversation,member,remove) $$;
create function public.oconnect_delete_message(message uuid) returns void language sql security invoker set search_path='' as $$ select oconnect_private.delete_message(message) $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='oconnect_private' or (n.nspname='public' and p.proname like 'oconnect_%') loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
 -- CI does not have the Supabase Realtime publication; production does.
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   alter publication supabase_realtime add table public.oconnect_conversations,public.oconnect_members,public.oconnect_messages,public.oconnect_preferences;
 end if;
end $$;
notify pgrst,'reload schema';
