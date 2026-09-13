-- Part 4: directional role matrix. Membership never grants a sending bypass.
create function oconnect_private.role_codes(who uuid) returns text[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(r.code::text order by r.code),'{}') from public.roles r
 where r.is_active and r.id in (select role_id from public.user_roles where user_id=who union
 select lr.role_id from public.user_level_roles lr join public.users u on u.user_level_id=lr.user_level_id where u.id=who)
$$;
create function oconnect_private.can_message(sender uuid,recipient uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sender<>recipient and oconnect_private.active_user(sender) and oconnect_private.active_user(recipient)
 and ('OWNER'=any(oconnect_private.role_codes(sender)) or (
 (select tenant_id from public.users where id=sender)=(select tenant_id from public.users where id=recipient)
 and exists(select 1 from unnest(oconnect_private.role_codes(sender)) a
 cross join unnest(oconnect_private.role_codes(recipient)) b where
 a='TEACHER' or (a='PRINCIPAL' and b in ('STAFF','TEACHER'))
 or (a='STAFF' and b in ('PRINCIPAL','TEACHER','PARENT'))
 or (a='PARENT' and b in ('TEACHER','STAFF'))
 or (a='STUDENT' and b in ('STUDENT','TEACHER')))))
$$;
create function oconnect_private.participant(conversation uuid,who uuid) returns boolean language sql stable security definer set search_path='' as $$
 select oconnect_private.active_user(who) and exists(select 1 from public.oconnect_conversations c
 join public.users u on u.id=who where c.id=conversation
 and (u.tenant_id=c.tenant_id or 'OWNER'=any(oconnect_private.role_codes(who)))
 and case c.kind when 'CLASS' then oconnect_private.class_member(c.classroom_id,who)
 when 'PROJECT' then oconnect_private.project_member(c.project_id,who)
 else exists(select 1 from public.oconnect_members m where m.conversation_id=c.id and m.user_id=who) end)
$$;
-- Resolve explicit members first; do not scan every platform account for each inbox row.
create function oconnect_private.participants(conversation uuid) returns setof uuid language sql stable security definer set search_path='' as $$
 select m.user_id from public.oconnect_conversations c join public.oconnect_members m on m.conversation_id=c.id
 where c.id=conversation and c.kind in ('DIRECT','GROUP') and oconnect_private.participant(c.id,m.user_id)
 union
 select u.id from public.oconnect_conversations c join public.users u on u.tenant_id=c.tenant_id
 where c.id=conversation and c.kind in ('CLASS','PROJECT') and oconnect_private.participant(c.id,u.id)
$$;
create or replace function oconnect_private.can_access(conversation uuid,who uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and oconnect_private.participant(conversation,who)
 and exists(select 1 from public.oconnect_conversations c where c.id=conversation and
 (c.kind<>'DIRECT' or exists(select 1 from public.oconnect_members m where m.conversation_id=c.id and m.user_id<>who
 and (oconnect_private.can_message(who,m.user_id) or oconnect_private.can_message(m.user_id,who)))))
$$;
create function oconnect_private.can_send(conversation uuid,who uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
 select oconnect_private.can_access(conversation,who)
 and exists(select 1 from oconnect_private.participants(conversation) u(id) where u.id<>who)
 and not exists(select 1 from oconnect_private.participants(conversation) u(id) where u.id<>who
 and not oconnect_private.can_message(who,u.id))
$$;
-- The sending policy applies to historical messages too, including indirect group routes.
create function oconnect_private.message_visible(sender uuid,recipient uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sender=recipient or oconnect_private.can_message(sender,recipient)
$$;
create policy message_matrix_part4 on public.oconnect_messages as restrictive for select to authenticated
 using(oconnect_private.message_visible(sender_id,(select auth.uid())));
create or replace function oconnect_private.class_member(class_id uuid,who uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.classrooms c join public.users u on u.id=who and u.tenant_id=c.tenant_id
 where c.id=class_id and c.is_active and oconnect_private.active_user(who) and (
 c.homeroom_teacher_user_id=who
 or (oconnect_private.role_codes(who) && array['OWNER','PRINCIPAL','STAFF'] and oconnect_private.staff(who))
 or exists(select 1 from public.teacher_assignments a join public.teachers t on t.id=a.teacher_id
   where a.classroom_id=c.id and a.tenant_id=c.tenant_id and a.is_active and t.user_id=who and t.employment_status='ACTIVE')
 or exists(select 1 from public.student_assignments a join public.students s on s.id=a.student_id
   where a.classroom_id=c.id and a.tenant_id=c.tenant_id and a.is_active and s.user_id=who and s.enrollment_status='ACTIVE')));
$$;
create or replace function oconnect_private.context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=oconnect_private.tenant(); result jsonb;
begin
 if t is null then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 select jsonb_build_object('user_id',u.id,'tenant_id',t,'full_name',u.full_name,
 'roles',oconnect_private.role_codes(u.id),'platform_owner','OWNER'=any(oconnect_private.role_codes(u.id)),'can_manage',oconnect_private.staff(u.id),'font_size',coalesce(p.font_size,16)) into result
 from public.users u left join public.oconnect_preferences p on p.user_id=u.id where u.id=auth.uid();
 return result;
end $$;
create or replace function oconnect_private.contacts(search text default '',for_group boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t uuid:=oconnect_private.tenant();
begin
 if t is null then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select u.id,coalesce(nullif(u.full_name,''),'Pengguna OSEKOLA') full_name,oconnect_private.staff(u.id) is_staff,oconnect_private.role_codes(u.id) roles,u.tenant_id,(select name from public.tenants where id=u.tenant_id) tenant_name
 from public.users u where (not for_group or u.tenant_id=t) and u.id<>auth.uid() and oconnect_private.active_user(u.id)
 and oconnect_private.can_message(auth.uid(),u.id)
 and position(lower(left(coalesce(search,''),80)) in lower(coalesce(u.full_name,'')||' '||(select name from public.tenants where id=u.tenant_id)))>0
 order by u.full_name,u.id limit 50) x),'[]'::jsonb);
end $$;
create unique index oconnect_direct_pair_part4 on public.oconnect_conversations(direct_key) where direct_key is not null;
create or replace function oconnect_private.create_conversation(kind text,title text default '',members uuid[] default '{}',source_id uuid default null) returns uuid
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
   if exists(select 1 from unnest(members) m where m is null or not exists(select 1 from public.users u where u.id=m and oconnect_private.can_message(actor,u.id) and (kind='DIRECT' or u.tenant_id=t))) then
     raise exception 'CONNECT_FORBIDDEN' using errcode='42501';
   end if;
   if kind='DIRECT' then
     if cardinality(members)<>1 or members[1]=actor then raise exception 'CONNECT_INVALID'; end if;
     other:=members[1];
     if not oconnect_private.can_message(actor,other) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
     key:=least(actor::text,other::text)||':'||greatest(actor::text,other::text);
     select id,tenant_id into cid,t from public.oconnect_conversations where direct_key=key;
     if cid is null then select tenant_id into t from public.users where id=other; end if;
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
create or replace function oconnect_private.inbox(search text default '',page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if oconnect_private.tenant() is null then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select c.id,c.kind,case when c.kind='DIRECT' then coalesce((select u.full_name from public.oconnect_members m join public.users u on u.id=m.user_id where m.conversation_id=c.id and m.user_id<>auth.uid() limit 1),'Pengguna OSEKOLA') else c.title end title,
 c.tenant_id,oconnect_private.can_send(c.id) can_send,c.classroom_id,c.project_id,c.updated_at,coalesce(mine.muted,false) muted,coalesce(mine.archived,false) archived,
 coalesce(mine.is_manager,false) is_manager,
 (select count(*) from public.oconnect_messages msg where msg.conversation_id=c.id and oconnect_private.message_visible(msg.sender_id,auth.uid()) and msg.seq>coalesce(mine.last_read_seq,0) and msg.sender_id<>auth.uid() and msg.deleted_at is null) unread_count,
 (select case when msg.deleted_at is not null then null else left(msg.body,100) end from public.oconnect_messages msg where msg.conversation_id=c.id and oconnect_private.message_visible(msg.sender_id,auth.uid()) order by seq desc limit 1) preview
 from public.oconnect_conversations c left join public.oconnect_members mine on mine.conversation_id=c.id and mine.user_id=auth.uid()
 where oconnect_private.can_access(c.id)
 order by c.updated_at desc,c.id limit 100 offset least(greatest(coalesce(page,0),0),1000)*100)x
 where position(lower(left(coalesce(search,''),80)) in lower(x.title))>0),'[]'::jsonb);
end $$;
create or replace function oconnect_private.thread(conversation uuid,before_seq bigint default null,search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; participants jsonb;
begin
 if not oconnect_private.can_access(conversation) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into participants from (
 select u.id,coalesce(u.full_name,'Pengguna OSEKOLA') full_name,coalesce(m.last_read_seq,0) last_read_seq,coalesce(m.is_manager,false) is_manager
 from oconnect_private.participants(conversation) member_id join public.users u on u.id=member_id left join public.oconnect_members m on m.user_id=u.id and m.conversation_id=conversation
 where oconnect_private.can_access(conversation,u.id) order by u.full_name limit 1000)x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.seq),'[]'::jsonb) into result from (
 select msg.*,coalesce(u.full_name,'Pengguna OSEKOLA') sender_name,
 case when reply.deleted_at is null and oconnect_private.message_visible(reply.sender_id,auth.uid()) then left(reply.body,160) else null end reply_body
 from public.oconnect_messages msg join public.users u on u.id=msg.sender_id
 left join public.oconnect_messages reply on reply.id=msg.reply_to and reply.conversation_id=msg.conversation_id
 where msg.conversation_id=conversation and oconnect_private.message_visible(msg.sender_id,auth.uid()) and (before_seq is null or msg.seq<before_seq)
 and (coalesce(search,'')='' or (msg.deleted_at is null and position(lower(left(search,80)) in lower(msg.body))>0))
 order by msg.seq desc limit 50)x;
 return jsonb_build_object('messages',result,'members',participants,'can_send',oconnect_private.can_send(conversation),'tenant_id',(select tenant_id from public.oconnect_conversations where id=conversation));
end $$;
create or replace function oconnect_private.send(conversation uuid,message_id uuid,body text default '',reply_to uuid default null,attachment jsonb default null,resource_type text default null,resource_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); t uuid:=oconnect_private.tenant(); saved public.oconnect_messages; path text; obj storage.objects; c public.oconnect_conversations;
begin
 if not oconnect_private.can_access(conversation) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,551));
 select * into c from public.oconnect_conversations where id=conversation for update;
 t:=c.tenant_id;
 if not oconnect_private.can_send(conversation) then raise exception 'CONNECT_SEND_FORBIDDEN' using errcode='42501'; end if;
 select * into saved from public.oconnect_messages where id=message_id;
 if found then
   if saved.sender_id=actor and saved.conversation_id=conversation then return to_jsonb(saved); end if;
   raise exception 'CONNECT_INVALID';
 end if;
 if message_id is null or body is null or char_length(body)>6000 then raise exception 'CONNECT_INVALID'; end if;
 if (select count(*) from public.oconnect_messages m where m.sender_id=actor and m.created_at>now()-interval '1 minute')>=30 then raise exception 'CONNECT_RATE_LIMIT'; end if;
 if reply_to is not null and not exists(select 1 from public.oconnect_messages m where m.id=send.reply_to and m.conversation_id=conversation and m.deleted_at is null and oconnect_private.message_visible(m.sender_id,actor)) then raise exception 'CONNECT_INVALID'; end if;
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
 select u.tenant_id,u.id,'INFO','O-Connect','Pesan baru / New message','oconnect',conversation,jsonb_build_object('conversation_id',conversation)
 from oconnect_private.participants(conversation) member_id join public.users u on u.id=member_id left join public.oconnect_members m on m.user_id=u.id and m.conversation_id=conversation
 where u.id<>actor and oconnect_private.can_access(conversation,u.id) and not coalesce(m.muted,false)
 and not exists(select 1 from public.notifications n where n.user_id=u.id and n.resource_type='oconnect' and n.resource_id=conversation and n.read_at is null);
 return to_jsonb(saved);
end $$;
create or replace function oconnect_private.mark_read(conversation uuid,through_seq bigint) returns void
language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 if not oconnect_private.can_access(conversation) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 select coalesce(max(seq),0) into n from public.oconnect_messages where conversation_id=conversation and seq<=through_seq;
 insert into public.oconnect_members(tenant_id,conversation_id,user_id,last_read_seq) values((select tenant_id from public.oconnect_conversations where id=conversation),conversation,auth.uid(),n)
 on conflict(conversation_id,user_id) do update set last_read_seq=greatest(public.oconnect_members.last_read_seq,excluded.last_read_seq);
 update public.notifications set read_at=now() where user_id=auth.uid() and resource_type='oconnect' and resource_id=conversation and read_at is null
 and not exists(select 1 from public.oconnect_messages where conversation_id=conversation and seq>n and sender_id<>auth.uid() and deleted_at is null);
end $$;
create or replace function oconnect_private.options(conversation uuid,muted boolean,archived boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not oconnect_private.can_access(conversation) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 insert into public.oconnect_members(tenant_id,conversation_id,user_id,muted,archived) values((select tenant_id from public.oconnect_conversations where id=conversation),conversation,auth.uid(),coalesce(muted,false),coalesce(archived,false))
 on conflict(conversation_id,user_id) do update set muted=excluded.muted,archived=excluded.archived;
end $$;
create or replace function oconnect_private.manage_member(conversation uuid,member uuid,remove boolean default false) returns void
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
   if not exists(select 1 from public.users where id=member and tenant_id=c.tenant_id and oconnect_private.can_message(auth.uid(),id)) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
   if (select count(*) from public.oconnect_members where conversation_id=conversation)>=100 then raise exception 'CONNECT_GROUP_FULL'; end if;
   insert into public.oconnect_members(tenant_id,conversation_id,user_id) values(c.tenant_id,conversation,member) on conflict do nothing;
 end if;
 update public.oconnect_conversations set updated_at=now() where id=conversation;
end $$;
create or replace function oconnect_private.storage_allowed(path text,writing boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(path,'/'); cid uuid;
begin
 if auth.uid() is null or cardinality(parts)<>4 then return false; end if;
 begin cid:=parts[2]::uuid; exception when invalid_text_representation then return false; end;
 if not exists(select 1 from public.oconnect_conversations where id=cid and tenant_id::text=parts[1]) or not oconnect_private.can_access(cid) then return false; end if;
 if writing then return oconnect_private.can_send(cid) and parts[3]=auth.uid()::text and parts[4] ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$'; end if;
 return exists(select 1 from public.oconnect_messages where attachment_path=path and conversation_id=cid and deleted_at is null and oconnect_private.message_visible(sender_id,auth.uid()))
   or parts[3]=auth.uid()::text;
end $$;
create or replace function oconnect_private.resource(message uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare m public.oconnect_messages; result jsonb;
begin
 select * into m from public.oconnect_messages where id=message and deleted_at is null;
 if not found or not oconnect_private.can_access(m.conversation_id) or not oconnect_private.message_visible(m.sender_id,auth.uid()) or not oconnect_private.resource_allowed(m.resource_type,m.resource_id,auth.uid()) then raise exception 'CONNECT_FORBIDDEN' using errcode='42501'; end if;
 if m.resource_type='calendar' then
   select jsonb_build_object('name',e.title,'description',e.description,'starts_at',e.starts_at,'href','/dashboard/calendar') into result from public.calendar_events e where e.id=m.resource_id;
 elsif m.resource_type='course' then
   select jsonb_build_object('name',c.name,'description',c.description,'href','/dashboard/learning') into result from public.courses c where c.id=m.resource_id;
 elsif m.resource_type='task' then
   select jsonb_build_object('name',t.title,'description',t.description,'href','/dashboard/team') into result from public.team_tasks t where t.id=m.resource_id;
 end if;
 return result;
end $$;
revoke all on function oconnect_private.role_codes(uuid),oconnect_private.can_message(uuid,uuid),oconnect_private.participant(uuid,uuid),oconnect_private.can_send(uuid,uuid),oconnect_private.message_visible(uuid,uuid) from public,anon,authenticated;
grant execute on function oconnect_private.message_visible(uuid,uuid) to authenticated;

revoke all on function oconnect_private.participants(uuid) from public,anon,authenticated;
