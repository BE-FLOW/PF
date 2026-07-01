begin;

select plan(71);

select has_table('public', 'health_reports', 'health_reports table exists');
select has_table(
  'public',
  'health_report_feedback',
  'health_report_feedback table exists'
);
select has_table('public', 'pets', 'pets table exists');
select has_table('public', 'episodes', 'episodes table exists');
select has_table('public', 'tester_profiles', 'tester_profiles table exists');
select has_table('public', 'episode_plans', 'episode plans table exists');
select has_table('public', 'plan_tasks', 'plan tasks table exists');
select has_table(
  'public',
  'episode_progress_logs',
  'episode progress logs table exists'
);
select has_view('public', 'tester_management', 'tester management view exists');
select has_table('public', 'ai_access_codes', 'ai access codes table exists');
select has_table('public', 'ai_access_grants', 'ai access grants table exists');
select has_table('public', 'ai_report_usage', 'ai report usage table exists');
select has_table('public', 'ai_report_feedback', 'ai report feedback table exists');
select has_view('public', 'ai_usage_management', 'ai usage management view exists');
select has_table(
  'public',
  'account_deletion_requests',
  'account deletion request table exists'
);
select has_view(
  'public',
  'account_deletion_management',
  'account deletion management view exists'
);
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
select has_column('public', 'pets', 'photo_path', 'pet profile photo path exists');
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
select hasnt_column('public', 'tester_profiles', 'age_band', 'tester age is not collected');
select hasnt_column('public', 'tester_profiles', 'care_experience', 'tester care experience is not collected');
select has_column(
  'public',
  'tester_profiles',
  'phone_consented_at',
  'phone consent timestamp exists'
);
select col_not_null(
  'public',
  'tester_profiles',
  'phone',
  'tester phone is required'
);
select col_not_null(
  'public',
  'tester_profiles',
  'phone_consented_at',
  'phone consent timestamp is required'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('health_reports', 'health_report_feedback')),
  0,
  'no browser-facing RLS policies exist'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.episode_plans'::regclass),
  true,
  'RLS is enabled for episode plans'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.plan_tasks'::regclass),
  true,
  'RLS is enabled for plan tasks'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('episode_plans', 'plan_tasks')),
  0,
  'plan data has no browser-facing policies'
);
select has_column('public', 'episode_plans', 'source_type', 'plan source is stored');
select has_column('public', 'episode_plans', 'review_status', 'plan review status is stored');
select has_column('public', 'plan_tasks', 'completed_at', 'plan task completion is stored');
select is(
  (select confdeltype::text from pg_constraint where conname = 'health_reports_user_id_fkey'),
  'c',
  'account deletion removes linked reports'
);
select is(
  (select confdeltype::text from pg_constraint where conname = 'health_reports_pet_owner_fkey'),
  'c',
  'pet deletion removes linked reports'
);
select is(
  (select confdeltype::text from pg_constraint where conname = 'health_reports_episode_owner_fkey'),
  'c',
  'episode deletion removes linked reports'
);
select has_column(
  'public',
  'episode_progress_logs',
  'follow_up_day',
  'progress checkpoint day is stored'
);
select has_column(
  'public',
  'episode_progress_logs',
  'condition_change',
  'progress condition change is stored'
);
select has_column(
  'public',
  'episode_progress_logs',
  'source_type',
  'progress source is stored'
);
select has_column(
  'public',
  'episode_progress_logs',
  'review_status',
  'progress review status is stored'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.episode_progress_logs'::regclass),
  true,
  'RLS is enabled for episode progress logs'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'episode_progress_logs'),
  0,
  'progress data has no browser-facing policies'
);
select is(
  (select confdeltype::text from pg_constraint where conname = 'episode_progress_logs_episode_owner_fkey'),
  'c',
  'episode deletion removes progress logs'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.save_owner_episode_progress(uuid,uuid,smallint,text,text,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot call progress RPC directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.save_owner_episode_progress(uuid,uuid,smallint,text,text,text)',
    'EXECUTE'
  ),
  true,
  'service role can call progress RPC'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.ai_access_codes'::regclass),
  true,
  'RLS is enabled for AI access codes'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.ai_access_grants'::regclass),
  true,
  'RLS is enabled for AI access grants'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.ai_report_usage'::regclass),
  true,
  'RLS is enabled for AI report usage'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.ai_report_feedback'::regclass),
  true,
  'RLS is enabled for AI report feedback'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in (
    'ai_access_codes',
    'ai_access_grants',
    'ai_report_usage',
    'ai_report_feedback'
  )),
  0,
  'AI access and usage data has no browser-facing policies'
);
select has_column('public', 'ai_access_codes', 'code_hash', 'AI access code hash is stored');
select has_column('public', 'ai_access_codes', 'monthly_report_limit', 'AI code monthly limit is stored');
select has_column('public', 'ai_access_grants', 'monthly_report_limit', 'AI grant monthly limit is stored');
select has_column('public', 'ai_report_usage', 'total_tokens', 'AI report token usage is stored');
select has_column('public', 'ai_report_usage', 'estimated_cost_usd', 'AI report cost estimate is stored');
select has_column('public', 'ai_report_feedback', 'usefulness_score', 'AI report usefulness score is stored');
select has_column('public', 'ai_report_feedback', 'would_pay', 'AI report willingness to pay is stored');
select is(
  has_function_privilege(
    'authenticated',
    'public.create_ai_access_code(text,integer,integer,integer,timestamp with time zone,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot create AI access codes'
);
select is(
  has_function_privilege(
    'service_role',
    'public.create_ai_access_code(text,integer,integer,integer,timestamp with time zone,text)',
    'EXECUTE'
  ),
  true,
  'service role can create AI access codes'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.redeem_ai_access_code(uuid,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot call AI code redemption RPC directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.redeem_ai_access_code(uuid,text)',
    'EXECUTE'
  ),
  true,
  'service role can redeem AI access codes through route handlers'
);

select has_column(
  'public',
  'account_deletion_requests',
  'status',
  'account deletion request status is stored'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.account_deletion_requests'::regclass),
  true,
  'RLS is enabled for account deletion requests'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'account_deletion_requests'),
  0,
  'account deletion requests have no browser-facing policies'
);
select is(
  (select confdeltype::text from pg_constraint where conname = 'account_deletion_requests_user_id_fkey'),
  'c',
  'account deletion request is removed with the auth user'
);
select is(
  (
    select count(*)::integer
    from public.health_reports
    where is_test = true
      and app_version = 'seed-v1'
      and deployment_environment = 'seed'
  ),
  0,
  'legacy seed reports are removed'
);

select * from finish();
rollback;
