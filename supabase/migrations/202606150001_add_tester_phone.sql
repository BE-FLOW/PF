alter table public.tester_profiles
  add column if not exists phone text,
  add column if not exists phone_consented_at timestamptz;

alter table public.tester_profiles
  drop constraint if exists tester_profiles_phone_format_check;

alter table public.tester_profiles
  add constraint tester_profiles_phone_format_check
  check (phone is null or phone ~ '^010[0-9]{8}$');

drop view if exists public.tester_management;

create view public.tester_management
with (security_invoker = false)
as
select
  tester.user_id,
  tester.nickname,
  tester.phone,
  tester.age_band,
  tester.care_experience,
  tester.consent_version,
  tester.consented_at,
  tester.phone_consented_at,
  count(distinct pets.id)::integer as pet_count,
  count(distinct reports.id)::integer as report_count,
  max(reports.created_at) as last_report_at,
  tester.created_at
from public.tester_profiles tester
left join public.pets pets on pets.user_id = tester.user_id
left join public.health_reports reports on reports.user_id = tester.user_id
group by tester.user_id;

revoke all on public.tester_management from anon, authenticated;
grant select on public.tester_management to service_role;

comment on column public.tester_profiles.phone is
  'Required Korean mobile number for test operations and service contact. Stored as 11 digits.';
comment on column public.tester_profiles.phone_consented_at is
  'Time the tester agreed to phone collection for service and test operations.';
