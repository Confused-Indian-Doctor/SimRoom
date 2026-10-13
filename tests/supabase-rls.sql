\set ON_ERROR_STOP on
insert into public.instructors(user_id) values('11111111-1111-4111-8111-111111111111');
set role service_role;
select public.create_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','ABCD1234','{"owner":"11111111-1111-4111-8111-111111111111","revision":0,"scenario":{"version":1,"history":"PRIVATE"}}','{"patient":"Simulated patient","observations":{"hr":110}}');
insert into public.monitor_members values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222');
do $$begin
 if not public.commit_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',0,'{"owner":"11111111-1111-4111-8111-111111111111","revision":1,"scenario":{"version":1,"history":"PRIVATE"}}','{"patient":"Simulated patient","observations":{"hr":120}}') then raise exception 'Expected accepted command';end if;
 if public.commit_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',0,'{}','{}') then raise exception 'Stale revision accepted';end if;
 begin
  perform public.commit_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',1,'{"owner":"11111111-1111-4111-8111-111111111111","revision":2,"scenario":{"version":99}}','{}');raise exception 'Scenario snapshot mutation accepted';
 exception when raise_exception then if sqlerrm<>'Invalid session version' then raise;end if;end;
 if (public.save_scenario((select data from public.scenarios where id='pe'))->>'version')::integer<>2 then raise exception 'Version increment failed';end if;
 if not exists(select 1 from public.scenario_versions where id='pe' and version=1) then raise exception 'Starting version lost';end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$begin
 if public.is_instructor() then raise exception 'Monitor elevated to instructor';end if;
 if exists(select 1 from public.scenarios) or exists(select 1 from public.source_archive) or exists(select 1 from public.sessions) then raise exception 'Faculty data leaked';end if;
 if (select count(*) from public.monitors)<>1 then raise exception 'Joined monitor cannot read';end if;
 if (select state->'observations'->>'hr' from public.monitors)<> '120' then raise exception 'Public state not atomically updated';end if;
 if exists(select 1 from public.monitors where state::text like '%PRIVATE%') then raise exception 'Private history leaked';end if;
 begin perform public.commit_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',1,'{}','{}');raise exception 'Monitor invoked privileged RPC';exception when insufficient_privilege then null;end;
 begin update public.monitors set state='{}';raise exception 'Monitor wrote directly';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name) values('investigations','22222222-2222-4222-8222-222222222222/secret.png');raise exception 'Monitor uploaded asset';exception when insufficient_privilege then null;end;
end $$;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
do $$begin if exists(select 1 from public.monitors) then raise exception 'Unrelated user read monitor';end if;end $$;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$begin
 if not public.is_instructor() or (select count(*) from public.scenarios)<>3 or (select count(*) from public.sessions)<>1 then raise exception 'Faculty access denied';end if;
 if not exists(select 1 from public.scenarios where id='ptx' and data->>'history' like '%Semi-professional basketball player%') then raise exception 'Original PTX missing';end if;
 begin insert into public.instructors(user_id) values('33333333-3333-4333-8333-333333333333');raise exception 'Client granted instructor';exception when insufficient_privilege then null;end;
end $$;
insert into storage.objects(bucket_id,name) values('investigations','11111111-1111-4111-8111-111111111111/fixture.png');
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$begin if exists(select 1 from storage.objects) then raise exception 'Private asset metadata leaked';end if;end $$;
reset role;
select 'PASS: PostgreSQL RLS, atomic command revisions, version snapshots, source cases and private asset policies' as verification;

insert into public.faculty_invites(email) values('stranger@simroom.test');
do $$begin if exists(select 1 from public.instructors where user_id='33333333-3333-4333-8333-333333333333') then raise exception 'Unverified email promoted';end if;end $$;
update auth.users set email_confirmed_at=now() where id='33333333-3333-4333-8333-333333333333';
do $$begin if not exists(select 1 from public.instructors where user_id='33333333-3333-4333-8333-333333333333') then raise exception 'Confirmed invited user not promoted';end if;end $$;
delete from public.faculty_invites where email='stranger@simroom.test';
do $$begin if exists(select 1 from public.instructors where user_id='33333333-3333-4333-8333-333333333333') then raise exception 'Revoked invite retained role';end if;end $$;
select 'PASS: invited faculty require confirmed email, and invite revocation removes derived access' as verification;
