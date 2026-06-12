begin;

select plan(9);

select has_table('public', 'health_reports', 'health_reports table exists');
select has_table(
  'public',
  'health_report_feedback',
  'health_report_feedback table exists'
);
select has_table('public', 'pets', 'pets table exists');
select col_not_null(
  'public',
  'health_reports',
  'client_id',
  'anonymous client id is required'
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
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'pets'),
  4,
  'pets has owner-only CRUD policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('health_reports', 'health_report_feedback')),
  0,
  'no browser-facing RLS policies exist'
);

select * from finish();
rollback;
