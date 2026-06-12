create extension if not exists pgcrypto;

create table if not exists public.health_reports (
  id uuid not null,
  client_id uuid not null,
  species text not null check (species in ('dog', 'cat', 'other')),
  breed text,
  age_group text not null check (age_group in ('young', 'adult', 'senior')),
  symptoms text[] not null default '{}',
  appetite text not null check (appetite in ('normal', 'slight', 'low', 'none')),
  energy text not null check (energy in ('normal', 'slight', 'low', 'none')),
  duration text not null check (duration in ('today', '2-3days', '4-7days', 'over-week')),
  red_flags text[] not null default '{}',
  risk_level text not null check (risk_level in ('watch', 'soon', 'urgent')),
  risk_score integer not null check (risk_score between 0 and 100),
  analysis_source text not null check (analysis_source in ('local', 'openai')),
  app_version text not null default 'dev',
  deployment_environment text not null default 'development',
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (id, client_id)
);

create table if not exists public.health_report_feedback (
  report_id uuid not null,
  client_id uuid not null,
  feedback text not null check (feedback in ('helpful', 'not-helpful')),
  updated_at timestamptz not null default now(),
  primary key (report_id, client_id),
  constraint health_report_feedback_report_fkey
    foreign key (report_id, client_id)
    references public.health_reports (id, client_id)
    on delete cascade
);

create index if not exists health_reports_created_at_idx
  on public.health_reports (created_at desc);
create index if not exists health_reports_environment_idx
  on public.health_reports (deployment_environment, created_at desc);
create index if not exists health_reports_risk_idx
  on public.health_reports (risk_level, created_at desc);

alter table public.health_reports enable row level security;
alter table public.health_report_feedback enable row level security;

revoke all on table public.health_reports from anon, authenticated;
revoke all on table public.health_report_feedback from anon, authenticated;
grant select, insert, update, delete on table public.health_reports to service_role;
grant select, insert, update, delete on table public.health_report_feedback to service_role;

comment on table public.health_reports is
  'Anonymous, structured PetFlow MVP usage data. Pet names, birth dates, notes, and generated report text are intentionally excluded.';
