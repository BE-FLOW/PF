begin;

select plan(133);

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
select hasnt_table('public', 'ai_access_codes', 'AI access codes were removed');
select hasnt_table('public', 'ai_access_grants', 'AI access grants were removed');
select has_table('public', 'ai_report_usage', 'ai report usage table exists');
select has_table('public', 'ai_report_feedback', 'ai report feedback table exists');
select has_table('public', 'billing_purchases', 'verified billing purchases exist');
select has_table('public', 'billing_events', 'billing webhook outcomes exist');
select has_table('public', 'ai_credit_grants', 'AI summary credit grants exist');
select has_table('public', 'ai_credit_ledger', 'AI summary credit ledger exists');
select has_table(
  'public',
  'monetization_events',
  'minimal first-party monetization events exist'
);
select has_view(
  'public',
  'billing_daily_metrics',
  'daily billing conversion metrics exist'
);
select has_view('public', 'ai_usage_management', 'ai usage management view exists');
select hasnt_table(
  'public',
  'account_deletion_requests',
  'unused account deletion request table was removed'
);
select has_table(
  'public',
  'pet_vaccinations',
  'pet vaccination schedule table exists'
);
select hasnt_view(
  'public',
  'account_deletion_management',
  'unused account deletion management view was removed'
);
select col_not_null(
  'public',
  'health_reports',
  'client_id',
  'idempotency client id is required'
);
select col_not_null('public', 'health_reports', 'user_id', 'report owner is required');
select col_not_null('public', 'health_reports', 'pet_id', 'report pet is required');
select col_not_null('public', 'health_reports', 'episode_id', 'report flow is required');
select has_constraint(
  'public',
  'health_reports',
  'health_reports_user_client_id_key',
  'report request ids are idempotent within an account'
);
select has_column('public', 'health_reports', 'owner_note', 'owner source note is stored');
select hasnt_column('public', 'health_reports', 'is_test', 'public test marker was removed');
select has_column('public', 'health_report_feedback', 'user_id', 'feedback owner is stored');
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
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.health_reports'::regclass,
      'public.health_report_feedback'::regclass,
      'public.health_report_media'::regclass,
      'public.episode_plans'::regclass,
      'public.plan_tasks'::regclass,
      'public.episode_progress_logs'::regclass,
      'public.ai_report_usage'::regclass,
      'public.ai_report_feedback'::regclass
    )
      and relforcerowsecurity
  ),
  8,
  'RLS is forced on all server-managed account data'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.pets'::regclass),
  true,
  'RLS is enabled for pets'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.pets'::regclass),
  true,
  'RLS is forced for pets'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.episodes'::regclass),
  true,
  'RLS is enabled for episodes'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.episodes'::regclass),
  true,
  'RLS is forced for episodes'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'pets'),
  4,
  'pets has owner-only CRUD policies'
);
select has_column('public', 'pets', 'photo_path', 'pet profile photo path exists');
select has_check(
  'public',
  'pets',
  'pets_photo_owner_path_check',
  'pet photo paths are bound to the owner prefix'
);
select has_check(
  'public',
  'pets',
  'pets_breed_length_check',
  'pet breed length is constrained in the database'
);
select has_column(
  'public',
  'pet_vaccinations',
  'due_at',
  'vaccination due date is stored'
);
select has_column(
  'public',
  'pet_vaccinations',
  'administered_at',
  'vaccination administered date is stored'
);
select has_column(
  'public',
  'pet_vaccinations',
  'review_status',
  'vaccination review status is stored'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.pet_vaccinations'::regclass),
  true,
  'RLS is enabled for pet vaccinations'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.pet_vaccinations'::regclass),
  true,
  'RLS is forced for pet vaccinations'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'pet_vaccinations'),
  4,
  'pet vaccinations has owner-only CRUD policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'episodes'),
  1,
  'episodes expose only owner-scoped reads to clients'
);
select is(
  has_table_privilege('authenticated', 'public.episodes', 'INSERT'),
  false,
  'authenticated clients cannot insert episodes directly'
);
select is(
  has_table_privilege('authenticated', 'public.episodes', 'UPDATE'),
  false,
  'authenticated clients cannot update episodes directly'
);
select is(
  has_table_privilege('authenticated', 'public.episodes', 'DELETE'),
  false,
  'authenticated clients cannot delete episodes directly'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.tester_profiles'::regclass),
  true,
  'RLS is enabled for tester profiles'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.tester_profiles'::regclass),
  true,
  'RLS is forced for account profiles'
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
select has_check(
  'public',
  'tester_profiles',
  'tester_profiles_nickname_trimmed_check',
  'profile nicknames are normalized in the database'
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
select hasnt_function(
  'public',
  'save_owner_episode_progress',
  array['uuid', 'uuid', 'smallint', 'text', 'text', 'text'],
  'manual progress write RPC was removed'
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
    'ai_report_usage',
    'ai_report_feedback'
  )),
  0,
  'AI access and usage data has no browser-facing policies'
);
select hasnt_column('public', 'ai_report_usage', 'grant_id', 'AI usage has no code grant');
select has_column('public', 'ai_report_usage', 'total_tokens', 'AI report token usage is stored');
select has_column('public', 'ai_report_usage', 'estimated_cost_usd', 'AI report cost estimate is stored');
select has_column('public', 'ai_report_feedback', 'usefulness_score', 'AI report usefulness score is stored');
select hasnt_column('public', 'ai_report_feedback', 'would_pay', 'payment intent is not collected');
select hasnt_column(
  'public',
  'ai_report_feedback',
  'willingness_to_pay_krw',
  'price willingness is not collected'
);
select hasnt_function('public', 'normalize_ai_access_code', array['text'], 'code normalization was removed');
select hasnt_function('public', 'hash_ai_access_code', array['text'], 'code hashing was removed');
select hasnt_function(
  'public',
  'create_ai_access_code',
  array['text', 'integer', 'integer', 'integer', 'timestamp with time zone', 'text'],
  'code creation was removed'
);
select hasnt_function(
  'public',
  'redeem_ai_access_code',
  array['uuid', 'text'],
  'code redemption was removed'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.reserve_ai_report_usage(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot reserve AI usage directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.reserve_ai_report_usage(uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  true,
  'service role can reserve AI usage through route handlers'
);
select throws_ok(
  $$
    select public.reserve_ai_report_usage(
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid,
      'gpt-test'
    )
  $$,
  'P0001',
  'AI report ownership could not be verified',
  'AI usage reservations reject unowned episodes'
);
select has_column(
  'public',
  'ai_usage_management',
  'current_month_ai_reports',
  'AI management view exposes monthly usage'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.billing_purchases'::regclass),
  true,
  'RLS is enabled for verified purchases'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.billing_events'::regclass),
  true,
  'RLS is enabled for billing events'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.ai_credit_grants'::regclass),
  true,
  'RLS is enabled for AI credit grants'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.ai_credit_ledger'::regclass),
  true,
  'RLS is enabled for the AI credit ledger'
);
select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.monetization_events'::regclass
  ),
  true,
  'RLS is enabled for monetization events'
);
select is(
  has_table_privilege('authenticated', 'public.monetization_events', 'SELECT'),
  false,
  'authenticated users cannot query monetization events directly'
);
select is(
  has_table_privilege('service_role', 'public.billing_daily_metrics', 'SELECT'),
  true,
  'service role can read daily billing metrics'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'billing_purchases',
        'billing_events',
        'ai_credit_grants',
        'ai_credit_ledger',
        'monetization_events'
      )
  ),
  0,
  'billing and credit tables have no browser-facing policies'
);
select has_column(
  'public',
  'billing_purchases',
  'transaction_id',
  'external transactions are idempotent'
);
select has_column(
  'public',
  'billing_purchases',
  'price_usd',
  'verified purchases retain reported USD revenue'
);
select has_column(
  'public',
  'billing_purchases',
  'price_amount',
  'verified purchases retain the purchased currency amount'
);
select has_column(
  'public',
  'billing_purchases',
  'currency',
  'verified purchases retain the purchased currency'
);
select has_column(
  'public',
  'billing_purchases',
  'commission_percentage',
  'verified purchases retain the reported store commission'
);
select has_column(
  'public',
  'billing_purchases',
  'quantity',
  'verified purchases retain the purchased quantity'
);
select has_function(
  'public',
  'record_ai_credit_purchase',
  array[
    'uuid', 'text', 'text', 'text', 'text', 'text', 'timestamp with time zone',
    'integer', 'numeric', 'numeric', 'text', 'text', 'integer', 'numeric',
    'numeric'
  ],
  'verified purchase RPC accepts optional revenue fields'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.record_ai_credit_purchase(uuid,text,text,text,text,text,timestamp with time zone,integer,numeric,numeric,text,text,integer,numeric,numeric)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot grant paid credits'
);
select has_column(
  'public',
  'ai_credit_grants',
  'quantity_remaining',
  'remaining AI summaries are tracked atomically'
);
select has_column(
  'public',
  'ai_credit_ledger',
  'idempotency_key',
  'credit ledger writes are idempotent'
);
select has_function(
  'public',
  'release_stale_ai_report_reservations',
  array['uuid'],
  'stale AI reservations can be recovered'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.release_stale_ai_report_reservations(uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot release AI credits directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.release_stale_ai_report_reservations(uuid)',
    'EXECUTE'
  ),
  true,
  'service role can recover stale AI reservations'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conname = 'ai_credit_grants_purchase_id_fkey'
  ),
  'c',
  'deleting an account can cascade through purchase grants'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conname = 'ai_credit_ledger_grant_id_fkey'
  ),
  'c',
  'deleting an account can cascade through credit ledger grants'
);
select is(
  (
    select confdeltype::text
    from pg_constraint
    where conname = 'ai_credit_ledger_usage_id_fkey'
  ),
  'c',
  'deleting an account can cascade through AI usage ledger rows'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Owners can upload PetFlow report media'
  ),
  1,
  'installed clients retain one ownership-scoped report media upload policy'
);
select ok(
  position(
    'health_reports' in coalesce((
      select with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'Owners can upload PetFlow report media'
    ), '')
  ) > 0,
  'report media uploads verify report ownership'
);
select ok(
  position(
    'health_reports' in coalesce((
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'Owners can read PetFlow report media'
    ), '')
  ) > 0,
  'report media reads verify report ownership'
);
select ok(
  position(
    'health_reports' in coalesce((
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'Owners can delete PetFlow report media'
    ), '')
  ) > 0,
  'report media deletes verify report ownership'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Owners can upload PetFlow pet photos'
  ),
  1,
  'installed clients retain one ownership-scoped pet photo upload policy'
);
select ok(
  position(
    'pets' in coalesce((
      select with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'Owners can upload PetFlow pet photos'
    ), '')
  ) > 0,
  'pet photo uploads verify pet ownership'
);
select ok(
  position(
    'pets' in coalesce((
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'Owners can read PetFlow pet photos'
    ), '')
  ) > 0,
  'pet photo reads verify pet ownership'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Owners can update PetFlow pet photos'
  ),
  1,
  'installed clients retain one ownership-scoped pet photo update policy'
);
select ok(
  position(
    'pets' in coalesce((
      select with_check
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'Owners can update PetFlow pet photos'
    ), '')
  ) > 0,
  'pet photo updates verify pet ownership'
);
select ok(
  position(
    'pets' in coalesce((
      select qual
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'Owners can delete PetFlow pet photos'
    ), '')
  ) > 0,
  'pet photo deletes verify pet ownership'
);
select is(
  (select count(*)::integer from public.health_reports where user_id is null),
  0,
  'unowned reports are removed'
);

select * from finish();
rollback;
