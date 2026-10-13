-- Local PostgreSQL fixtures emulate Supabase's principal/schema contract.
create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant select,insert on storage.objects to authenticated;grant all on storage.buckets,storage.objects to service_role;
insert into auth.users values('11111111-1111-4111-8111-111111111111','faculty@simroom.test',now()),('22222222-2222-4222-8222-222222222222','monitor@simroom.test',null),('33333333-3333-4333-8333-333333333333','stranger@simroom.test',null);
