\set ON_ERROR_STOP on
set role service_role;
insert into public.session_attempts(session_id,user_id,command,accepted,duplicate) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','{"type":"medication","drug":"PRIVATE FIXTURE"}',true,true);
update public.sessions set state=state||'{"engine":{"commands":[{"sequence":1,"id":"domain-test","command":{"type":"medication","drug":"PRIVATE FIXTURE"}}]}}'::jsonb where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$begin if not exists(select 1 from public.session_commands where sequence=1) then raise exception 'Command ledger not archived';end if;end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
do $$begin if exists(select 1 from public.session_commands) or exists(select 1 from public.session_attempts) or exists(select 1 from public.session_access_events) then raise exception 'Private audit exposed';end if;end $$;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$begin if not exists(select 1 from public.session_commands) or not exists(select 1 from public.session_attempts) or not exists(select 1 from public.session_access_events) then raise exception 'Owner audit inaccessible';end if;end $$;
reset role;
select 'PASS private command archive, attempts and controller access RLS' as verification;
