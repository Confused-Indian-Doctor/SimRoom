begin;
create table if not exists public.instructors(user_id uuid primary key references auth.users(id) on delete cascade,via_invite boolean not null default false);
create table if not exists public.faculty_invites(email text primary key check(email=lower(email)));
create table if not exists public.scenarios(id text primary key,data jsonb not null);
create table if not exists public.scenario_versions(id text not null,version integer not null,data jsonb not null,primary key(id,version));
create table if not exists public.source_archive(id text primary key,data jsonb not null);
create table if not exists public.sessions(id uuid primary key,owner uuid not null references auth.users(id),code text not null unique check(code ~ '^[A-F0-9]{8}$'),state jsonb not null,revision bigint not null default 0);
create table if not exists public.monitors(id uuid primary key references public.sessions(id) on delete cascade,state jsonb not null check(jsonb_typeof(state)='object' and state-array['patient','status','elapsed','anchor','observations','pins','ramp','oxygen','rhythm','revision','updatedAt','alarmAck','released']='{}'::jsonb));
create table if not exists public.monitor_members(session_id uuid references public.sessions(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,primary key(session_id,user_id));
create or replace function public.is_instructor() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.instructors where user_id=auth.uid()) $$;
create or replace function public.can_monitor(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.monitor_members where session_id=p_id and user_id=auth.uid()) or exists(select 1 from public.sessions where id=p_id and owner=auth.uid() and public.is_instructor()) $$;
revoke all on function public.is_instructor() from public,anon;grant execute on function public.is_instructor() to authenticated,service_role;
revoke all on function public.can_monitor(uuid) from public,anon;grant execute on function public.can_monitor(uuid) to authenticated,service_role;
alter table public.instructors enable row level security;
alter table public.faculty_invites enable row level security;
alter table public.scenarios enable row level security;
alter table public.scenario_versions enable row level security;
alter table public.source_archive enable row level security;
alter table public.sessions enable row level security;
alter table public.monitors enable row level security;
alter table public.monitor_members enable row level security;
create policy instructor_self on public.instructors for select to authenticated using(user_id=auth.uid());
create policy faculty_scenarios on public.scenarios for select to authenticated using(public.is_instructor());
create policy faculty_versions on public.scenario_versions for select to authenticated using(public.is_instructor());
create policy faculty_archive on public.source_archive for select to authenticated using(public.is_instructor());
create policy session_owner on public.sessions for select to authenticated using(owner=auth.uid() and public.is_instructor());
create policy monitor_reader on public.monitors for select to authenticated using(public.can_monitor(id));
revoke all on public.faculty_invites,public.instructors,public.scenarios,public.scenario_versions,public.source_archive,public.sessions,public.monitors,public.monitor_members from anon,authenticated;
grant select on public.instructors,public.scenarios,public.scenario_versions,public.source_archive,public.sessions,public.monitors to authenticated;
grant all on public.faculty_invites,public.instructors,public.scenarios,public.scenario_versions,public.source_archive,public.sessions,public.monitors,public.monitor_members to service_role;
create or replace function public.server_time() returns bigint language sql volatile set search_path='' as $$ select floor(extract(epoch from clock_timestamp())*1000)::bigint $$;
revoke all on function public.server_time() from public,anon,authenticated;grant execute on function public.server_time() to service_role;
create or replace function public.create_session(p_id uuid,p_owner uuid,p_code text,p_state jsonb,p_public jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from public.instructors where user_id=p_owner) then raise exception 'Instructor required';end if;
 insert into public.sessions(id,owner,code,state,revision) values(p_id,p_owner,p_code,p_state,0);
 insert into public.monitors(id,state) values(p_id,p_public);
 end $$;
create or replace function public.commit_session(p_id uuid,p_owner uuid,p_expected bigint,p_state jsonb,p_public jsonb) returns boolean language plpgsql security definer set search_path='' as $$ declare existing public.sessions;begin
 select * into existing from public.sessions where id=p_id for update;
 if not found or existing.owner<>p_owner or not exists(select 1 from public.instructors where user_id=p_owner) then raise exception 'Session owner required';end if;
 if existing.revision<>p_expected then return false;end if;
 if (p_state->>'revision')::bigint is distinct from p_expected+1 or p_state->>'owner' is distinct from p_owner::text or p_state->'scenario' is distinct from existing.state->'scenario' then raise exception 'Invalid session version';end if;
 update public.sessions set state=p_state,revision=p_expected+1 where id=p_id;
 update public.monitors set state=p_public where id=p_id;
 return true;
 end $$;
create or replace function public.save_scenario(p_draft jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ declare scenario_id text:=p_draft->>'id';v integer;d jsonb;begin
 perform pg_advisory_xact_lock(hashtext('simroom-scenario:'||scenario_id));
 select coalesce((data->>'version')::integer,0)+1 into v from public.scenarios where id=scenario_id;
 v:=coalesce(v,1);d:=p_draft||jsonb_build_object('version',v);
 insert into public.scenarios(id,data) values(scenario_id,d) on conflict(id) do update set data=excluded.data;
 insert into public.scenario_versions(id,version,data) values(scenario_id,v,d);
 return jsonb_build_object('version',v);
 end $$;
revoke all on function public.create_session(uuid,uuid,text,jsonb,jsonb),public.commit_session(uuid,uuid,bigint,jsonb,jsonb),public.save_scenario(jsonb) from public,anon,authenticated;
grant execute on function public.create_session(uuid,uuid,text,jsonb,jsonb),public.commit_session(uuid,uuid,bigint,jsonb,jsonb),public.save_scenario(jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('investigations','investigations',false,10485760,array['image/png','image/jpeg','image/webp','image/svg+xml','application/pdf']) on conflict(id) do nothing;
create policy faculty_asset_read on storage.objects for select to authenticated using(bucket_id='investigations' and public.is_instructor());
create policy faculty_asset_insert on storage.objects for insert to authenticated with check(bucket_id='investigations' and public.is_instructor() and (storage.foldername(name))[1]=auth.uid()::text);
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='scenarios' and schemaname='public') then alter publication supabase_realtime add table public.scenarios;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='sessions' and schemaname='public') then alter publication supabase_realtime add table public.sessions;end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='monitors' and schemaname='public') then alter publication supabase_realtime add table public.monitors;end if;
 end if;
end $$;
create or replace function public.sync_faculty_user() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.email_confirmed_at is not null and exists(select 1 from public.faculty_invites where email=lower(new.email)) then
  insert into public.instructors(user_id,via_invite) values(new.id,true) on conflict(user_id) do nothing;
 else delete from public.instructors where user_id=new.id and via_invite=true;end if;
 return new;end $$;
create trigger simroom_faculty_user after insert or update on auth.users for each row execute function public.sync_faculty_user();
create or replace function public.sync_faculty_invite() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='DELETE' then delete from public.instructors where via_invite=true and user_id in(select id from auth.users where lower(email)=old.email);return old;end if;
 insert into public.instructors(user_id,via_invite) select id,true from auth.users where lower(email)=new.email and email_confirmed_at is not null on conflict(user_id) do nothing;
 return new;end $$;
create trigger simroom_faculty_invite after insert or delete on public.faculty_invites for each row execute function public.sync_faculty_invite();
revoke all on function public.sync_faculty_user(),public.sync_faculty_invite() from public,anon,authenticated;
commit;
