\set ON_ERROR_STOP on
insert into public.instructors(user_id) values('22222222-2222-4222-8222-222222222222') on conflict do nothing;
set role service_role;
insert into public.pair_challenges values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','one-use-token','fallback-code',now()+interval '2 minutes');
do $$declare r jsonb;begin
 r:=public.redeem_pair('one-use-token','22222222-2222-4222-8222-222222222222','controller-device-one',false);if r->>'id'<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then raise exception 'Pairing failed';end if;
 if not(public.redeem_pair('one-use-token','22222222-2222-4222-8222-222222222222','controller-device-one',false)?'error')then raise exception 'Token reused';end if;
end $$;
insert into public.pair_challenges values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','replacement-token','replacement-code',now()+interval '2 minutes');
do $$begin
 if public.redeem_pair('replacement-code','11111111-1111-4111-8111-111111111111','controller-device-two',false)->>'replacementRequired'<>'true' then raise exception 'Implicit takeover';end if;
 if not exists(select 1 from public.pair_challenges where token_hash='replacement-token') then raise exception 'Token consumed before confirmation';end if;
 perform public.redeem_pair('replacement-token','11111111-1111-4111-8111-111111111111','controller-device-two',true);
 begin perform public.control_commit('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','controller-device-one',1,'{}','{}');raise exception 'Old controller accepted';exception when raise_exception then if sqlerrm<>'Another device controls this session' then raise;end if;end;
end $$;
insert into public.pair_challenges values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','expired-token','expired-code',now()-interval '1 minute');
do $$begin if not(public.redeem_pair('expired-token','11111111-1111-4111-8111-111111111111','controller-device-two',false)?'error')then raise exception 'Expired token accepted';end if;end $$;
update public.sessions set state=state||'{"status":"ended"}'::jsonb where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$begin if exists(select 1 from public.pair_challenges) or exists(select 1 from public.controller_links) then raise exception 'Ended session pairing retained';end if;end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
do $$begin
 begin perform public.redeem_pair('expired-token','33333333-3333-4333-8333-333333333333','controller-device-three',true);raise exception 'Client redeemed privileged token RPC';exception when insufficient_privilege then null;end;
 begin perform public.control_commit('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','controller-device-three',1,'{}','{}');raise exception 'Client invoked privileged commit';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: SQL single-use pairing, explicit takeover, old-device control denial, expiry and session-end revocation' as verification;
set role service_role;
select public.create_session('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','ABCDEF01','{"owner":"11111111-1111-4111-8111-111111111111","revision":0,"status":"ready","scenario":{"version":1}}','{"patient":"Direct controller fixture"}');
do $$begin
 if not public.control_commit('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','direct-device-one',0,'{"owner":"11111111-1111-4111-8111-111111111111","revision":1,"status":"running","scenario":{"version":1}}','{"patient":"Direct controller fixture"}') then raise exception 'Direct primary claim failed';end if;
 if not exists(select 1 from public.controller_links where session_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and device='direct-device-one')then raise exception 'No primary device';end if;
 begin perform public.control_commit('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','direct-device-two',1,'{}','{}');raise exception 'Unconfirmed direct replacement accepted';exception when raise_exception then if sqlerrm<>'Another device controls this session' then raise;end if;end;
end $$;
reset role;
select 'PASS: direct owner commands also claim one primary device and deny unconfirmed replacement' as verification;
