begin;
alter table public.monitors drop constraint if exists monitors_state_check;
alter table public.monitors add constraint monitors_state_check check(jsonb_typeof(state)='object' and state-array['patient','status','elapsed','anchor','observations','pins','ramp','oxygen','oxygenDevice','oxygenFlow','ventilation','rhythm','perfusion','signalQuality','revision','updatedAt','alarmAck','released','measurements','rhythmLabels','signalRate']='{}'::jsonb);
create table public.session_commands(session_id uuid not null references public.sessions on delete cascade,sequence bigint not null,record jsonb not null,primary key(session_id,sequence));
create table public.session_attempts(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.sessions on delete cascade,user_id uuid references auth.users on delete set null,at timestamptz default now(),command jsonb not null,accepted boolean not null,reason text,duplicate boolean not null default false);
alter table public.session_commands enable row level security;
alter table public.session_attempts enable row level security;
grant all on public.session_commands,public.session_attempts to service_role;
grant select on public.session_commands,public.session_attempts to authenticated;
create policy private_command_ledger on public.session_commands for select to authenticated using(public.is_instructor() and (public.can_control(session_id) or exists(select 1 from public.sessions where id=session_id and owner=auth.uid())));
create policy private_attempt_ledger on public.session_attempts for select to authenticated using(public.is_instructor() and (public.can_control(session_id) or exists(select 1 from public.sessions where id=session_id and owner=auth.uid())));
create or replace function public.archive_engine_commands() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.session_commands(session_id,sequence,record) select new.id,(r->>'sequence')::bigint,r from jsonb_array_elements(coalesce(new.state#>'{engine,commands}','[]'::jsonb)) r on conflict do nothing;
 return new;
end $$;
create trigger archive_engine_commands after insert or update on public.sessions for each row execute function public.archive_engine_commands();
commit;
-- Authentication lifecycle is private audit data, never part of monitor projections.
create table public.session_access_events(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.sessions on delete cascade,at timestamptz not null default now(),kind text not null,user_id uuid,device_hash text);
alter table public.session_access_events enable row level security;
grant all on public.session_access_events to service_role;
grant select on public.session_access_events to authenticated;
create policy private_access_ledger on public.session_access_events for select to authenticated using(public.is_instructor() and (public.can_control(session_id) or exists(select 1 from public.sessions where id=session_id and owner=auth.uid())));
create function public.audit_controller_access() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from public.sessions where id=coalesce(new.session_id,old.session_id)) then return coalesce(new,old);end if;
 if tg_op='INSERT' then insert into public.session_access_events(session_id,kind,user_id,device_hash) values(new.session_id,'controller paired',new.user_id,md5(new.device));
 elsif tg_op='DELETE' then insert into public.session_access_events(session_id,kind,user_id,device_hash) values(old.session_id,'controller disconnected',old.user_id,md5(old.device));
 elsif new.device is distinct from old.device or new.user_id is distinct from old.user_id then insert into public.session_access_events(session_id,kind,user_id,device_hash) values(new.session_id,'controller takeover',new.user_id,md5(new.device));end if;
 return coalesce(new,old);end $$;
create trigger audit_controller_access after insert or update or delete on public.controller_links for each row execute function public.audit_controller_access();
