-- Transactional integration checks. All fixture users and data are rolled back.
begin;
create temporary table time_bank_test_ids as select gen_random_uuid() a,gen_random_uuid() b,gen_random_uuid() entry_id;
grant select on time_bank_test_ids to authenticated;
insert into auth.users(id,aud,role,email)
select a,'authenticated','authenticated','time-bank-test-'||a||'@example.invalid' from time_bank_test_ids
union all select b,'authenticated','authenticated','time-bank-test-'||b||'@example.invalid' from time_bank_test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select a::text from time_bank_test_ids),true);
select public.time_bank_save_profile('2026-11-02',30);
select public.time_bank_save_entry(jsonb_build_object('id',(select entry_id from time_bank_test_ids),'spent_on','2026-11-03','minutes',180,'note','Integration test'));
do $$ begin
 if (select count(*) from public.time_bank_get_profile())<>1 then raise exception 'Owner profile missing'; end if;
 if (select minutes from public.time_bank_get_entries())<>180 then raise exception 'Owner entry missing'; end if;
 -- Malformed duration and forbidden start-week edits must fail at the DB boundary.
 begin
  perform public.time_bank_save_entry(jsonb_build_object('id',gen_random_uuid(),'spent_on','2026-11-03','minutes',60,'start_time','17:00','end_time','19:00'));
  raise exception 'Bad duration accepted';
 exception when check_violation then null; end;
 begin
  perform public.time_bank_save_profile('2026-11-09',0);
  raise exception 'Bad start date accepted';
 exception when raise_exception then
  if sqlerrm='Bad start date accepted' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub',(select b::text from time_bank_test_ids),true);
do $$ begin
 if (select count(*) from public.time_bank_get_profile())<>0 or (select count(*) from public.time_bank_get_entries())<>0 then raise exception 'Cross-user data leak'; end if;
end $$;
select public.time_bank_save_profile('2026-11-02',0);
do $$ begin
 begin
  perform public.time_bank_save_entry(jsonb_build_object('id',(select entry_id from time_bank_test_ids),'spent_on','2026-11-03','minutes',1));
  raise exception 'Cross-user update accepted';
 exception when insufficient_privilege then null; end;
 if has_function_privilege('anon','public.time_bank_get_profile()','EXECUTE') or
    has_function_privilege('anon','public.time_bank_save_entry(jsonb)','EXECUTE') then raise exception 'Anonymous RPC access enabled'; end if;
end $$;
reset role;
rollback;
select 'All transactional backend checks passed; fixture data rolled back.' as result;
