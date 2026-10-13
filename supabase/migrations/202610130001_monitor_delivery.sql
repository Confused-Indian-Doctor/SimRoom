begin;
alter table public.monitors drop constraint if exists monitors_state_check;
alter table public.monitors add constraint monitors_state_check check (
  jsonb_typeof(state)='object' and
  state-array['patient','status','elapsed','anchor','observations','pins','ramp','oxygen','oxygenDevice','oxygenFlow','ventilation','rhythm','revision','updatedAt','alarmAck','released']='{}'::jsonb
);
commit;
