-- Username accounts use Supabase Auth sessions with app-specific internal identifiers.
-- Shared Auth settings remain unchanged. Rate limiting applies to this signup endpoint.
begin;
create table time_bank.signup_limits (
 bucket_key text primary key,
 attempts integer not null default 1,
 expires_at timestamptz not null
);
alter table time_bank.signup_limits enable row level security;
create policy service_only on time_bank.signup_limits for all to service_role using (true) with check (true);
revoke all on time_bank.signup_limits from public,anon,authenticated;
grant usage on schema time_bank to service_role;
grant select,insert,update,delete on time_bank.signup_limits to service_role;
create function public.time_bank_signup_allowed(p_ip_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer; hour_bucket text; day_bucket text;
begin
 if p_ip_hash !~ '^[a-f0-9]{64}$' then return false; end if;
 delete from time_bank.signup_limits where expires_at<now();
 hour_bucket := p_ip_hash||':h:'||floor(extract(epoch from now())/3600)::text;
 day_bucket := p_ip_hash||':d:'||floor(extract(epoch from now())/86400)::text;
 insert into time_bank.signup_limits(bucket_key,expires_at) values(hour_bucket,now()+interval '2 hours')
 on conflict(bucket_key) do update set attempts=time_bank.signup_limits.attempts+1 returning attempts into n;
 if n>5 then return false; end if;
 insert into time_bank.signup_limits(bucket_key,expires_at) values(day_bucket,now()+interval '2 days')
 on conflict(bucket_key) do update set attempts=time_bank.signup_limits.attempts+1 returning attempts into n;
 return n<=15;
end;
$$;
revoke all on function public.time_bank_signup_allowed(text) from public,anon,authenticated;
grant execute on function public.time_bank_signup_allowed(text) to service_role;
commit;
