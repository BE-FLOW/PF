create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'requested'
    check (status in ('requested', 'processing', 'completed', 'cancelled')),
  reason text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_status_requested_idx
  on public.account_deletion_requests (status, requested_at desc);

alter table public.account_deletion_requests enable row level security;

revoke all on table public.account_deletion_requests from anon, authenticated;
grant select, insert, update, delete on table public.account_deletion_requests
  to service_role;

create or replace view public.account_deletion_management as
select
  request.user_id,
  request.email,
  profile.nickname,
  profile.phone,
  request.status,
  request.reason,
  request.requested_at,
  request.updated_at
from public.account_deletion_requests request
left join public.tester_profiles profile on profile.user_id = request.user_id;

revoke all on public.account_deletion_management from anon, authenticated;
grant select on public.account_deletion_management to service_role;

comment on table public.account_deletion_requests is
  'Service-role-only tester account deletion requests for pilot operations.';
comment on view public.account_deletion_management is
  'Service-role-only account deletion request queue with tester contact context.';
