create table if not exists public.tester_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 30),
  age_band text check (age_band is null or age_band in ('under-20', '20s', '30s', '40s', '50-plus')),
  care_experience text check (care_experience is null or care_experience in ('first', 'under-3-years', 'over-3-years')),
  consent_version text not null,
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tester_profiles enable row level security;

grant select, insert, update, delete on table public.tester_profiles to authenticated;
grant select, insert, update, delete on table public.tester_profiles to service_role;

drop policy if exists "Users can view their tester profile" on public.tester_profiles;
create policy "Users can view their tester profile"
  on public.tester_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their tester profile" on public.tester_profiles;
create policy "Users can create their tester profile"
  on public.tester_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their tester profile" on public.tester_profiles;
create policy "Users can update their tester profile"
  on public.tester_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their tester profile" on public.tester_profiles;
create policy "Users can delete their tester profile"
  on public.tester_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace view public.tester_management
with (security_invoker = false)
as
select
  tester.user_id,
  tester.nickname,
  tester.age_band,
  tester.care_experience,
  tester.consent_version,
  tester.consented_at,
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

comment on table public.tester_profiles is
  'Minimal tester metadata and consent. Email remains in Supabase Auth and is not duplicated.';
comment on view public.tester_management is
  'Service-role-only tester activity summary for the Supabase dashboard.';
