-- Anonymous demo records for the PetFlow test project.
-- Fixed UUIDs make this seed safe to run repeatedly without creating duplicates.

insert into public.health_reports (
  id,
  client_id,
  species,
  breed,
  age_group,
  symptoms,
  appetite,
  energy,
  duration,
  red_flags,
  risk_level,
  risk_score,
  analysis_source,
  app_version,
  deployment_environment,
  is_test,
  created_at
) values
  (
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'dog', '말티즈', 'adult', array[]::text[],
    'normal', 'normal', 'today', array[]::text[],
    'watch', 6, 'local', 'seed-v1', 'seed', true, now() - interval '7 days'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    'cat', '코리안 숏헤어', 'young', array['vomiting'],
    'slight', 'normal', 'today', array[]::text[],
    'watch', 18, 'local', 'seed-v1', 'seed', true, now() - interval '6 days'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    'dog', '푸들', 'senior', array['limping'],
    'normal', 'slight', '2-3days', array[]::text[],
    'soon', 42, 'local', 'seed-v1', 'seed', true, now() - interval '5 days'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000004',
    'cat', '러시안 블루', 'adult', array['urination'],
    'low', 'slight', '2-3days', array[]::text[],
    'soon', 55, 'local', 'seed-v1', 'seed', true, now() - interval '4 days'
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    '20000000-0000-4000-8000-000000000005',
    'dog', '골든 리트리버', 'adult', array['diarrhea', 'vomiting'],
    'low', 'low', '4-7days', array[]::text[],
    'soon', 63, 'local', 'seed-v1', 'seed', true, now() - interval '3 days'
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000006',
    'cat', '브리티시 숏헤어', 'senior', array['cough'],
    'none', 'low', 'today', array['breathing'],
    'urgent', 92, 'local', 'seed-v1', 'seed', true, now() - interval '2 days'
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    '20000000-0000-4000-8000-000000000007',
    'dog', '믹스견', 'young', array['itching'],
    'normal', 'normal', 'over-week', array[]::text[],
    'watch', 24, 'local', 'seed-v1', 'seed', true, now() - interval '1 day'
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000008',
    'other', null, 'adult', array['pain'],
    'slight', 'low', 'today', array['collapse'],
    'urgent', 96, 'local', 'seed-v1', 'seed', true, now()
  )
on conflict (id, client_id) do update set
  species = excluded.species,
  breed = excluded.breed,
  age_group = excluded.age_group,
  symptoms = excluded.symptoms,
  appetite = excluded.appetite,
  energy = excluded.energy,
  duration = excluded.duration,
  red_flags = excluded.red_flags,
  risk_level = excluded.risk_level,
  risk_score = excluded.risk_score,
  analysis_source = excluded.analysis_source,
  app_version = excluded.app_version,
  deployment_environment = excluded.deployment_environment,
  is_test = excluded.is_test,
  created_at = excluded.created_at;

insert into public.health_report_feedback (
  report_id,
  client_id,
  feedback,
  updated_at
) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'helpful', now() - interval '7 days'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'helpful', now() - interval '6 days'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'not-helpful', now() - interval '5 days'),
  ('10000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'helpful', now() - interval '3 days'),
  ('10000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'helpful', now() - interval '2 days')
on conflict (report_id, client_id) do update set
  feedback = excluded.feedback,
  updated_at = excluded.updated_at;
