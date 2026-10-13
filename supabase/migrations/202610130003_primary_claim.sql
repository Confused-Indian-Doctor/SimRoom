begin;
-- First owner command claims the primary device atomically; direct controllers
-- receive the same one-device restriction as QR-paired controllers.
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
 elsif s.owner<>p_actor then raise exception 'Pair this device first';
 else insert into public.controller_links(session_id,user_id,device) values(p_id,p_actor,p_device);end if;
 return public.commit_session(p_id,s.owner,p_expected,p_state,p_public);
end $$;
commit;
