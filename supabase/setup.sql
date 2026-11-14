-- Applied to the shared project containing g4a_private and timeline_private.
-- Canonical project ref: ngtkrtabbxrwduleenwn. Run once when setting up a NEW project.
-- Separate schema; no existing application tables or shared Auth settings are changed.
begin;
create schema time_bank;
revoke all on schema time_bank from public, anon;
grant usage on schema time_bank to authenticated;
create table time_bank.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 start_week date not null check (extract(isodow from start_week)=1 and start_week >= '1900-01-01'),
 opening_minutes integer not null default 0 check (abs(opening_minutes::bigint)<=6000000),
 created_at timestamptz not null default now()
);
create table time_bank.entries (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references time_bank.profiles(user_id) on delete cascade,
 spent_on date not null,
 minutes integer not null check (minutes between 1 and 1440),
 note text not null default '' check (char_length(note)<=500),
 start_time time,
 end_time time,
 next_day boolean not null default false,
 created_at timestamptz not null default now(),
 deleted_at timestamptz,
 constraint valid_times check (
  (start_time is null and end_time is null and next_day=false) or
  (start_time is not null and end_time is not null
   and extract(second from start_time)=0 and extract(second from end_time)=0
   and minutes=extract(epoch from (end_time-start_time))/60+(case when next_day then 1440 else 0 end))
 )
);
create index time_bank_entries_owner_date on time_bank.entries(user_id,spent_on);
alter table time_bank.profiles enable row level security;
alter table time_bank.entries enable row level security;
create policy own_profile_select on time_bank.profiles for select to authenticated using ((select auth.uid())=user_id);
create policy own_profile_insert on time_bank.profiles for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_profile_update on time_bank.profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_entries_select on time_bank.entries for select to authenticated using ((select auth.uid())=user_id);
create policy own_entries_insert on time_bank.entries for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_entries_update on time_bank.entries for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on all tables in schema time_bank from public,anon,authenticated;
grant select,insert,update on time_bank.profiles,time_bank.entries to authenticated;
-- Validate relationships at the database boundary as well as in the UI.
create function time_bank.validate_dates() returns trigger language plpgsql security invoker set search_path='' as $$
declare first_week date; local_today date := (now() at time zone 'Europe/Ljubljana')::date;
begin
 if tg_table_name='profiles' then
  if new.start_week>local_today then raise exception 'Starting week cannot be in the future'; end if;
  if exists(select 1 from time_bank.entries where user_id=new.user_id and spent_on<new.start_week) then raise exception 'Starting week is after existing spending'; end if;
 else
  select start_week into first_week from time_bank.profiles where user_id=new.user_id;
  if first_week is null or new.spent_on<first_week or new.spent_on+(case when new.next_day then 1 else 0 end)>local_today then raise exception 'Spending date is outside the allowed range'; end if;
 end if;
 return new;
end;
$$;
revoke all on function time_bank.validate_dates() from public,anon;
grant execute on function time_bank.validate_dates() to authenticated;
create trigger validate_profile_dates before insert or update on time_bank.profiles for each row execute function time_bank.validate_dates();
create trigger validate_entry_dates before insert or update on time_bank.entries for each row execute function time_bank.validate_dates();
-- Public RPC entry points use caller permissions and the tables' RLS policies.
-- The time_bank schema stays private: no Data API exposed-schema changes.
create function public.time_bank_get_profile() returns setof time_bank.profiles
language sql stable security invoker set search_path='' as $$
 select * from time_bank.profiles where user_id=(select auth.uid());
$$;
create function public.time_bank_get_entries(p_offset integer default 0) returns setof time_bank.entries
language sql stable security invoker set search_path='' as $$
 select * from time_bank.entries where user_id=(select auth.uid())
 order by created_at,id limit 1000 offset greatest(p_offset,0);
$$;
create function public.time_bank_save_profile(p_start_week date,p_opening_minutes integer) returns setof time_bank.profiles
language sql security invoker set search_path='' as $$
 insert into time_bank.profiles(user_id,start_week,opening_minutes)
 values ((select auth.uid()),p_start_week,p_opening_minutes)
 on conflict(user_id) do update set start_week=excluded.start_week,opening_minutes=excluded.opening_minutes
 returning *;
$$;
create function public.time_bank_save_entry(p_entry jsonb) returns setof time_bank.entries
language sql security invoker set search_path='' as $$
 insert into time_bank.entries(id,user_id,spent_on,minutes,note,start_time,end_time,next_day,deleted_at)
 values ((p_entry->>'id')::uuid,(select auth.uid()),(p_entry->>'spent_on')::date,
 (p_entry->>'minutes')::integer,coalesce(p_entry->>'note',''),(p_entry->>'start_time')::time,
 (p_entry->>'end_time')::time,coalesce((p_entry->>'next_day')::boolean,false),(p_entry->>'deleted_at')::timestamptz)
 on conflict(id) do update set spent_on=excluded.spent_on,minutes=excluded.minutes,note=excluded.note,
 start_time=excluded.start_time,end_time=excluded.end_time,next_day=excluded.next_day,deleted_at=excluded.deleted_at
 returning *;
$$;
revoke all on function public.time_bank_get_profile(),public.time_bank_get_entries(integer),public.time_bank_save_profile(date,integer),public.time_bank_save_entry(jsonb) from public,anon;
grant execute on function public.time_bank_get_profile(),public.time_bank_get_entries(integer),public.time_bank_save_profile(date,integer),public.time_bank_save_entry(jsonb) to authenticated;
commit;
-- Weekly credits are derived from dates, never inserted by a browser or scheduler.
-- This avoids duplicate credits and includes weeks when the app was not opened.
