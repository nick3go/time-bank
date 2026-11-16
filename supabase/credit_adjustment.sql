-- One-off adjustment: preserve the 10h opening week and omit Monday 16 Nov 2026.
-- Store exceptions on each profile so other time banks follow the normal schedule.
alter table time_bank.profiles
  add column skipped_credit_weeks date[] not null default '{}';

update time_bank.profiles p
set skipped_credit_weeks = array_append(p.skipped_credit_weeks, date '2026-11-16')
from auth.users u
where p.user_id = u.id
  and u.email = 'nickk@users.time-bank.invalid'
  and p.start_week = date '2026-11-09'
  and not (date '2026-11-16' = any(p.skipped_credit_weeks));
