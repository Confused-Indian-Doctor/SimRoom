begin;
create table public.controller_links(session_id uuid primary key references public.sessions on delete cascade,user_id uuid not null references auth.users on delete cascade,device text not null,seen_at timestamptz not null default now());
create table public.pair_challenges(session_id uuid primary key references public.sessions on delete cascade,token_hash text unique not null,code_hash text unique not null,expires_at timestamptz not null);
create table public.revoked_controllers(session_id uuid references public.sessions on delete cascade,user_id uuid references auth.users on delete cascade,device text,primary key(session_id,user_id,device));
alter table public.revoked_controllers enable row level security;grant all on public.revoked_controllers to service_role;
create table public.pair_attempts(user_id uuid not null references auth.users on delete cascade,at timestamptz not null default now());
create table public.scenario_drafts(user_id uuid not null references auth.users on delete cascade,id text not null,data jsonb not null,updated_at timestamptz default now(),primary key(user_id,id));
alter table public.controller_links enable row level security;
alter table public.pair_challenges enable row level security;
alter table public.pair_attempts enable row level security;
alter table public.scenario_drafts enable row level security;
grant all on public.controller_links,public.pair_challenges,public.pair_attempts,public.scenario_drafts to service_role;
create or replace function public.can_control(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.is_instructor() and exists(select 1 from public.controller_links where session_id=p_id and user_id=auth.uid()) $$;
revoke all on function public.can_control(uuid) from public,anon; grant execute on function public.can_control(uuid) to authenticated,service_role;
create policy paired_faculty on public.sessions for select to authenticated using(public.can_control(id));
create or replace function public.redeem_pair(p_hash text,p_user uuid,p_device text,p_replace boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare challenge public.pair_challenges; active public.controller_links; s public.sessions; begin
 if not exists(select 1 from public.instructors where user_id=p_user) then raise exception 'Instructor access required';end if;
 if length(p_device)<16 or length(p_device)>128 then raise exception 'Invalid controller device';end if;
 -- Bound guesses even for authenticated faculty. Attempts are committed on rejected codes.
 delete from public.pair_attempts where at<now()-interval '10 minutes';
 if (select count(*) from public.pair_attempts where user_id=p_user and at>now()-interval '1 minute')>=10 then return jsonb_build_object('error','Too many attempts; wait one minute');end if;
 insert into public.pair_attempts(user_id) values(p_user);
 select * into challenge from public.pair_challenges where token_hash=p_hash or code_hash=p_hash;
 if not found then return jsonb_build_object('error','Pairing link expired, used or regenerated');end if;
 select * into s from public.sessions where id=challenge.session_id for update;
 select * into challenge from public.pair_challenges where session_id=s.id for update;
 if not found or (challenge.token_hash<>p_hash and challenge.code_hash<>p_hash) or challenge.expires_at<=now() or s.state->>'status'='ended' then return jsonb_build_object('error','Pairing link expired, used or regenerated');end if;
 select * into active from public.controller_links where session_id=s.id;
 if found and (active.device<>p_device or active.user_id<>p_user) and not p_replace then return jsonb_build_object('replacementRequired',true);end if;
 delete from public.revoked_controllers where session_id=s.id and user_id=p_user and device=p_device;
 insert into public.controller_links(session_id,user_id,device) values(s.id,p_user,p_device) on conflict(session_id) do update set user_id=excluded.user_id,device=excluded.device,seen_at=now();
 insert into public.monitor_members(session_id,user_id) values(s.id,p_user) on conflict do nothing;
 delete from public.pair_challenges where session_id=s.id;
 return jsonb_build_object('id',s.id,'code',s.code);
end $$;
create or replace function public.control_commit(p_id uuid,p_actor uuid,p_device text,p_expected bigint,p_state jsonb,p_public jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare s public.sessions; active public.controller_links; begin
 select * into s from public.sessions where id=p_id for update;
 if not found then raise exception 'Session not found';end if;
 if exists(select 1 from public.revoked_controllers where session_id=p_id and user_id=p_actor and device=p_device) then raise exception 'Controller disconnected; pair this device again';end if;
 if not exists(select 1 from public.instructors where user_id=p_actor) then raise exception 'Instructor required';end if;
 select * into active from public.controller_links where session_id=p_id;
 if found then
  if active.user_id<>p_actor or active.device<>p_device then raise exception 'Another device controls this session';end if;
  update public.controller_links set seen_at=now() where session_id=p_id;
 elsif s.owner<>p_actor then raise exception 'Pair this device first';end if;
 return public.commit_session(p_id,s.owner,p_expected,p_state,p_public);
end $$;
create or replace function public.clear_ended_pairing() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.state->>'status'='ended' then delete from public.pair_challenges where session_id=new.id;delete from public.controller_links where session_id=new.id;end if;return new;end $$;
create trigger clear_ended_pairing after update on public.sessions for each row execute function public.clear_ended_pairing();
revoke all on function public.redeem_pair(text,uuid,text,boolean),public.control_commit(uuid,uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.redeem_pair(text,uuid,text,boolean),public.control_commit(uuid,uuid,text,bigint,jsonb,jsonb) to service_role;
alter table public.monitors drop constraint if exists monitors_state_check;
alter table public.monitors add constraint monitors_state_check check(jsonb_typeof(state)='object' and state-array['patient','status','elapsed','anchor','observations','pins','ramp','oxygen','oxygenDevice','oxygenFlow','ventilation','rhythm','perfusion','signalQuality','revision','updatedAt','alarmAck','released']='{}'::jsonb);
commit;
