delete from public.health_reports
where is_test = true
  and app_version = 'seed-v1'
  and deployment_environment = 'seed';

drop view if exists public.tester_management;

alter table public.tester_profiles
  drop column if exists age_band,
  drop column if exists care_experience;

create view public.tester_management
with (security_invoker = false)
as
select
  tester.user_id,
  tester.nickname,
  tester.phone,
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

comment on view public.tester_management is
  'Service-role-only tester activity summary with only v0.2 approved contact fields.';
