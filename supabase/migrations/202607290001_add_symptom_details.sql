alter table public.health_reports
  add column if not exists symptom_details jsonb not null default '{}'::jsonb;

alter table public.health_reports
  drop constraint if exists health_reports_symptom_details_check;

alter table public.health_reports
  add constraint health_reports_symptom_details_check
  check (
    jsonb_typeof(symptom_details) = 'object'
    and octet_length(symptom_details::text) <= 4096
  );

comment on column public.health_reports.symptom_details is
  'Optional owner-selected intake facts for each observed symptom. Values are factual tags, not diagnoses.';
