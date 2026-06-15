begin;

select plan(19);

select has_table('public', 'health_reports', 'health_reports table exists');
select has_table(
  'public',
  'health_report_feedback',
  'health_report_feedback table exists'
);
select has_table('public', 'pets', 'pets table exists');
select has_table('public', 'episodes', 'episodes table exists');
select has_table('public', 'tester_profiles', 'tester_profiles table exists');
select has_view('public', 'tester_management', 'tester management view exists');
select col_not_null(
  'public',
  'health_reports',
  'client_id',
  'anonymous client id is required'
);
select has_column(
  'public',
  'health_reports',
  'episode_id',
  'health reports can be linked to an episode'
);
select col_not_null(
  'public',
  'health_reports',
  'risk_level',
  'risk level is required'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.health_reports'::regclass),
  true,
  'RLS is enabled for health reports'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.pets'::regclass),
  true,
  'RLS is enabled for pets'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.episodes'::regclass),
  true,
  'RLS is enabled for episodes'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'pets'),
  4,
  'pets has owner-only CRUD policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'episodes'),
  4,
  'episodes has owner-only CRUD policies'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.tester_profiles'::regclass),
  true,
  'RLS is enabled for tester profiles'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'tester_profiles'),
  4,
  'tester profiles has owner-only CRUD policies'
);
select has_column('public', 'tester_profiles', 'phone', 'tester phone exists');
select has_column(
  'public',
  'tester_profiles',
  'phone_consented_at',
  'phone consent timestamp exists'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('health_reports', 'health_report_feedback')),
  0,
  'no browser-facing RLS policies exist'
);

select * from finish();
rollback;
