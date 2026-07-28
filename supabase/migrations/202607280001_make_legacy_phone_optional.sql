alter table public.tester_profiles
  alter column phone drop not null,
  alter column phone_consented_at drop not null;

update public.tester_profiles
set
  phone = null,
  phone_consented_at = null,
  updated_at = now()
where phone is not null or phone_consented_at is not null;

drop view if exists public.tester_management;

create view public.tester_management
with (security_invoker = false)
as
select
  profile.user_id,
  profile.nickname,
  count(distinct pets.id)::integer as pet_count,
  count(distinct reports.id)::integer as report_count,
  max(reports.created_at) as last_report_at,
  profile.created_at
from public.tester_profiles profile
left join public.pets pets on pets.user_id = profile.user_id
left join public.health_reports reports on reports.user_id = profile.user_id
group by profile.user_id;

revoke all on public.tester_management from anon, authenticated;
grant select on public.tester_management to service_role;

comment on column public.tester_profiles.phone is
  'Legacy optional field. Current clients do not collect a phone number.';
comment on column public.tester_profiles.phone_consented_at is
  'Legacy optional consent timestamp retained for older client compatibility.';
comment on view public.tester_management is
  'Service-role-only account activity summary without contact information.';
