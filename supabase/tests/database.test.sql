begin;

select plan(190);

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
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.health_reports'::regclass
      and conname = 'health_reports_user_client_id_key'
      and contype = 'u'
  ),
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
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pets'::regclass
      and conname = 'pets_photo_owner_path_check'
      and contype = 'c'
  ),
  'pet photo paths are bound to the owner prefix'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pets'::regclass
      and conname = 'pets_breed_length_check'
      and contype = 'c'
  ),
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
select col_is_null(
  'public',
  'tester_profiles',
  'phone',
  'legacy tester phone is optional'
);
select col_is_null(
  'public',
  'tester_profiles',
  'phone_consented_at',
  'legacy phone consent timestamp is optional'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tester_profiles'::regclass
      and conname = 'tester_profiles_nickname_trimmed_check'
      and contype = 'c'
  ),
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
select has_column('public', 'plan_tasks', 'completed_at', 'legacy completion data remains readable');
select has_function(
  'public',
  'ensure_open_episode',
  array['uuid', 'uuid', 'timestamp with time zone'],
  'the server can open the current episode without a manual completion action'
);
select has_function(
  'public',
  'save_user_reported_episode_plan',
  array['uuid', 'uuid', 'jsonb'],
  'the server can save owner-reported hospital guidance'
);
select has_trigger(
  'public',
  'health_reports',
  'health_reports_assign_open_episode',
  'report inserts choose their open episode atomically'
);

insert into auth.users (id)
values ('00000000-0000-4000-8000-0000000000e1'::uuid);

insert into public.pets (id, user_id, name, species)
values (
  '00000000-0000-4000-8000-0000000000e2'::uuid,
  '00000000-0000-4000-8000-0000000000e1'::uuid,
  '에피소드경계',
  'dog'
);

create temporary table episode_boundary_fixture (
  first_episode_id uuid,
  first_plan_id uuid,
  second_episode_id uuid,
  second_plan_id uuid
);

insert into episode_boundary_fixture (first_episode_id)
values (
  public.ensure_open_episode(
    '00000000-0000-4000-8000-0000000000e1'::uuid,
    '00000000-0000-4000-8000-0000000000e2'::uuid,
    '2026-08-18 09:00:00+09'::timestamptz
  )
);

update episode_boundary_fixture
set first_plan_id = public.save_user_reported_episode_plan(
  '00000000-0000-4000-8000-0000000000e1'::uuid,
  first_episode_id,
  '["첫 방문 안내"]'::jsonb
);

select is(
  (
    select status
    from public.episodes
    where id = (select first_episode_id from episode_boundary_fixture)
  ),
  'closed'::text,
  'saving hospital guidance closes the current episode automatically'
);
select ok(
  (
    select closed_at is not null
    from public.episodes
    where id = (select first_episode_id from episode_boundary_fixture)
  ),
  'the automatic episode boundary stores its close timestamp'
);

update public.episode_plans
set reported_at = '2000-01-01 00:00:00+00'::timestamptz
where id = (select first_plan_id from episode_boundary_fixture);

update episode_boundary_fixture
set first_plan_id = public.save_user_reported_episode_plan(
  '00000000-0000-4000-8000-0000000000e1'::uuid,
  first_episode_id,
  '["첫 방문 수정 안내"]'::jsonb
);

select ok(
  (
    select reported_at > '2000-01-01 00:00:00+00'::timestamptz
    from public.episode_plans
    where id = (select first_plan_id from episode_boundary_fixture)
  ),
  'editing guidance refreshes its reported timestamp'
);

insert into public.health_reports (
  id,
  client_id,
  user_id,
  pet_id,
  episode_id,
  species,
  age_group,
  appetite,
  energy,
  duration,
  risk_level,
  risk_score,
  analysis_source,
  created_at
) values (
  '00000000-0000-4000-8000-0000000000e3'::uuid,
  '00000000-0000-4000-8000-0000000000e4'::uuid,
  '00000000-0000-4000-8000-0000000000e1'::uuid,
  '00000000-0000-4000-8000-0000000000e2'::uuid,
  (select first_episode_id from episode_boundary_fixture),
  'dog',
  'adult',
  'normal',
  'normal',
  'today',
  'watch',
  0,
  'local',
  '2026-08-19 09:00:00+09'::timestamptz
);

update episode_boundary_fixture
set second_episode_id = (
  select episode_id
  from public.health_reports
  where id = '00000000-0000-4000-8000-0000000000e3'::uuid
    and client_id = '00000000-0000-4000-8000-0000000000e4'::uuid
);

select isnt(
  (select first_episode_id from episode_boundary_fixture),
  (select second_episode_id from episode_boundary_fixture),
  'the next observation opens a fresh episode after hospital guidance'
);
select is(
  (
    select count(*)::integer
    from public.episodes
    where pet_id = '00000000-0000-4000-8000-0000000000e2'::uuid
      and status = 'open'
  ),
  1,
  'a pet still has exactly one open episode after automatic rollover'
);

update episode_boundary_fixture
set second_plan_id = public.save_user_reported_episode_plan(
  '00000000-0000-4000-8000-0000000000e1'::uuid,
  second_episode_id,
  '["두 번째 방문 안내"]'::jsonb
);

select is(
  (
    select count(*)::integer
    from public.episode_plans
    where pet_id = '00000000-0000-4000-8000-0000000000e2'::uuid
  ),
  2,
  'guidance from separate visits remains in separate episode plans'
);
select is(
  (
    select task.task_text
    from public.plan_tasks task
    where task.plan_id = (select first_plan_id from episode_boundary_fixture)
  ),
  '첫 방문 수정 안내'::text,
  'the earlier visit guidance remains readable after the next visit'
);
select is(
  (
    select task.task_text
    from public.plan_tasks task
    where task.plan_id = (select second_plan_id from episode_boundary_fixture)
  ),
  '두 번째 방문 안내'::text,
  'the next visit guidance is stored without replacing the earlier visit'
);
select is(
  (
    select count(*)::integer
    from public.episodes
    where pet_id = '00000000-0000-4000-8000-0000000000e2'::uuid
      and status = 'open'
  ),
  0,
  'saving the next visit guidance also leaves no episode open forever'
);

select is(
  (
    select reservation_state
    from public.reserve_free_ai_report_usage(
      '00000000-0000-4000-8000-0000000000e1'::uuid,
      '00000000-0000-4000-8000-0000000000e2'::uuid,
      (select first_episode_id from episode_boundary_fixture),
      'gpt-test',
      '00000000-0000-4000-8000-0000000000e5'::uuid,
      repeat('a', 64),
      (
        select source_revision
        from public.episodes
        where id = (select first_episode_id from episode_boundary_fixture)
      ),
      array[]::uuid[],
      3
    )
  ),
  'reserved'::text,
  'a free draft reserves the exact current source revision'
);

create temporary table free_ai_fencing_fixture as
select reservation_token as first_reservation_token
from public.ai_report_usage
where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid;

update public.ai_report_usage
set reservation_updated_at = now() - interval '6 minutes'
where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid;

select is(
  (
    select reservation_state
    from public.reserve_free_ai_report_usage(
      '00000000-0000-4000-8000-0000000000e1'::uuid,
      '00000000-0000-4000-8000-0000000000e2'::uuid,
      (select first_episode_id from episode_boundary_fixture),
      'gpt-test',
      '00000000-0000-4000-8000-0000000000e5'::uuid,
      repeat('a', 64),
      (
        select source_revision
        from public.episodes
        where id = (select first_episode_id from episode_boundary_fixture)
      ),
      array[]::uuid[],
      3
    )
  ),
  'reserved'::text,
  'reservation retries clean up an abandoned free attempt themselves'
);
select ok(
  (
    select usage.reservation_token <> fixture.first_reservation_token
      and usage.attempt_count = 2
    from public.ai_report_usage usage
    cross join free_ai_fencing_fixture fixture
    where usage.request_id = '00000000-0000-4000-8000-0000000000e5'::uuid
  ),
  'a retry receives a fresh fencing token and counts one more same-day attempt'
);
select is(
  public.complete_free_ai_report_usage(
    (
      select id
      from public.ai_report_usage
      where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid
    ),
    '00000000-0000-4000-8000-0000000000e1'::uuid,
    (select first_reservation_token from free_ai_fencing_fixture),
    'succeeded',
    'gpt-test',
    1,
    1,
    2,
    0,
    null,
    '{"overview":"stale draft"}'::jsonb
  ),
  false,
  'an earlier attempt token cannot complete after a retry reserves the row'
);
select is(
  (
    select status
    from public.ai_report_usage
    where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid
  ),
  'pending'::text,
  'a stale completion leaves the current reservation pending'
);

select is(
  public.complete_free_ai_report_usage(
    (
      select id
      from public.ai_report_usage
      where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid
    ),
    '00000000-0000-4000-8000-0000000000e1'::uuid,
    (
      select reservation_token
      from public.ai_report_usage
      where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid
    ),
    'succeeded',
    'gpt-test',
    1,
    1,
    2,
    0,
    null,
    '{"overview":"stored draft"}'::jsonb
  ),
  true,
  'a free draft completes while its source revision is current'
);
select ok(
  (
    select result is not null
    from public.ai_report_usage
    where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid
  ),
  'the current successful draft is recoverable'
);

update public.plan_tasks
set task_text = '첫 방문 변경 안내', updated_at = now()
where plan_id = (select first_plan_id from episode_boundary_fixture);

select ok(
  (
    select result is null and error_code = 'source_changed'
    from public.ai_report_usage
    where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid
  ),
  'editing a source fact removes the older recoverable draft'
);
select ok(
  (
    select usage.source_revision < episode.source_revision
    from public.ai_report_usage usage
    join public.episodes episode on episode.id = usage.episode_id
    where usage.request_id = '00000000-0000-4000-8000-0000000000e5'::uuid
  ),
  'source mutation advances the episode revision beyond the stored draft'
);

update public.ai_report_usage
set status = 'failed', attempt_count = 9, result = null
where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid;

select is(
  (
    select reservation_state
    from public.reserve_free_ai_report_usage(
      '00000000-0000-4000-8000-0000000000e1'::uuid,
      '00000000-0000-4000-8000-0000000000e2'::uuid,
      (select first_episode_id from episode_boundary_fixture),
      'gpt-test',
      '00000000-0000-4000-8000-0000000000e5'::uuid,
      repeat('b', 64),
      (
        select source_revision
        from public.episodes
        where id = (select first_episode_id from episode_boundary_fixture)
      ),
      array[]::uuid[],
      3
    )
  ),
  'attempt_limit'::text,
  'repeated failed model calls stop at three times the daily success limit'
);

update public.ai_report_usage
set fair_use_date = timezone('Asia/Seoul', now())::date - 1,
    status = 'failed'
where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid;

select is(
  (
    select reservation_state
    from public.reserve_free_ai_report_usage(
      '00000000-0000-4000-8000-0000000000e1'::uuid,
      '00000000-0000-4000-8000-0000000000e2'::uuid,
      (select first_episode_id from episode_boundary_fixture),
      'gpt-test',
      '00000000-0000-4000-8000-0000000000e5'::uuid,
      repeat('b', 64),
      (
        select source_revision
        from public.episodes
        where id = (select first_episode_id from episode_boundary_fixture)
      ),
      array[]::uuid[],
      3
    )
  ),
  'reserved'::text,
  'a prior KST day attempt budget does not block a new day'
);
select ok(
  (
    select attempt_count = 1
      and fair_use_date = timezone('Asia/Seoul', now())::date
    from public.ai_report_usage
    where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid
  ),
  'reusing an idempotency row on a new KST day resets its attempt count'
);

update public.ai_report_usage
set status = 'succeeded',
    attempt_count = 1,
    source_revision = (
      select source_revision
      from public.episodes
      where id = (select first_episode_id from episode_boundary_fixture)
    ),
    request_fingerprint = repeat('c', 64),
    result = '{"overview":"first"}'::jsonb
where request_id = '00000000-0000-4000-8000-0000000000e5'::uuid;

insert into public.ai_report_usage (
  user_id, pet_id, episode_id, status, model, access_mode, request_id,
  request_fingerprint, source_revision, reservation_token, attempt_count,
  selected_report_ids, result, fair_use_date
)
select
  '00000000-0000-4000-8000-0000000000e1'::uuid,
  '00000000-0000-4000-8000-0000000000e2'::uuid,
  first_episode_id,
  'succeeded',
  'gpt-test',
  'free_daily',
  request_id,
  repeat(fingerprint_character, 64),
  episode.source_revision,
  gen_random_uuid(),
  1,
  array[]::uuid[],
  jsonb_build_object('overview', label),
  timezone('Asia/Seoul', now())::date
from episode_boundary_fixture fixture
join public.episodes episode on episode.id = fixture.first_episode_id
cross join (
  values
    ('00000000-0000-4000-8000-0000000000e6'::uuid, 'd', 'second'),
    ('00000000-0000-4000-8000-0000000000e7'::uuid, 'e', 'third')
) usage_rows(request_id, fingerprint_character, label);

select is(
  (
    select reservation_state
    from public.reserve_free_ai_report_usage(
      '00000000-0000-4000-8000-0000000000e1'::uuid,
      '00000000-0000-4000-8000-0000000000e2'::uuid,
      (select first_episode_id from episode_boundary_fixture),
      'gpt-test',
      '00000000-0000-4000-8000-0000000000e8'::uuid,
      repeat('f', 64),
      (
        select source_revision
        from public.episodes
        where id = (select first_episode_id from episode_boundary_fixture)
      ),
      array[]::uuid[],
      3
    )
  ),
  'limit'::text,
  'a fourth successful daily draft is blocked without a model call'
);
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
select has_column(
  'public',
  'ai_report_usage',
  'access_mode',
  'AI usage keeps free and legacy credit access isolated'
);
select has_column(
  'public',
  'ai_report_usage',
  'request_id',
  'free AI drafts store an idempotency request UUID'
);
select has_column(
  'public',
  'ai_report_usage',
  'request_fingerprint',
  'free AI drafts bind request IDs to an immutable selection'
);
select has_column(
  'public',
  'ai_report_usage',
  'selected_report_ids',
  'stored AI drafts retain their selected record IDs'
);
select has_column(
  'public',
  'ai_report_usage',
  'result',
  'successful AI draft results are persisted for recovery'
);
select has_column(
  'public',
  'ai_report_usage',
  'fair_use_date',
  'free AI reservations are attributed to a KST fair-use day'
);
select has_column(
  'public',
  'ai_report_usage',
  'reservation_updated_at',
  'stale free AI reservations can be retried safely'
);
select has_column(
  'public',
  'episodes',
  'source_revision',
  'episodes version every fact source used by recoverable AI drafts'
);
select has_column(
  'public',
  'ai_report_usage',
  'source_revision',
  'stored AI drafts retain the source revision they reserved'
);
select has_column(
  'public',
  'ai_report_usage',
  'reservation_token',
  'each free AI attempt stores a completion fencing token'
);
select has_column(
  'public',
  'ai_report_usage',
  'attempt_count',
  'failed model retries count toward an abuse safety budget'
);
select has_trigger(
  'public', 'health_reports', 'health_reports_invalidate_free_ai_drafts',
  'report changes invalidate recoverable AI drafts'
);
select has_trigger(
  'public', 'health_report_media', 'health_report_media_invalidate_free_ai_drafts',
  'media changes invalidate recoverable AI drafts'
);
select has_trigger(
  'public', 'episode_plans', 'episode_plans_invalidate_free_ai_drafts',
  'hospital guidance changes invalidate recoverable AI drafts'
);
select has_trigger(
  'public', 'plan_tasks', 'plan_tasks_invalidate_free_ai_drafts',
  'hospital guidance task changes invalidate recoverable AI drafts'
);
select has_trigger(
  'public', 'episode_progress_logs', 'episode_progress_invalidate_free_ai_drafts',
  'legacy progress changes invalidate recoverable AI drafts'
);
select has_trigger(
  'public', 'pets', 'pets_invalidate_free_ai_drafts',
  'pet profile fact changes invalidate recoverable AI drafts'
);
select has_index(
  'public',
  'ai_report_usage',
  'ai_report_usage_user_request_key',
  'AI request IDs are unique within an account'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_report_usage'::regclass
      and conname = 'ai_report_usage_free_request_check'
      and contype = 'c'
  ),
  'free AI rows require fair-use and idempotency fields'
);
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
  false,
  'free-release service role cannot execute legacy credit reservations'
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
select has_function(
  'public',
  'get_free_ai_access_status',
  array['uuid', 'integer'],
  'free AI access status accepts the server fair-use limit'
);
select has_function(
  'public',
  'reserve_free_ai_report_usage',
  array['uuid', 'uuid', 'uuid', 'text', 'uuid', 'text', 'bigint', 'uuid[]', 'integer'],
  'free AI reservations accept an idempotency key and selected record IDs'
);
select has_function(
  'public',
  'complete_free_ai_report_usage',
  array[
    'uuid', 'uuid', 'uuid', 'text', 'text', 'integer', 'integer', 'integer',
    'numeric', 'text', 'jsonb'
  ],
  'free AI completion atomically stores the successful draft'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.get_free_ai_access_status(uuid,integer)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot query free AI limits directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.get_free_ai_access_status(uuid,integer)',
    'EXECUTE'
  ),
  true,
  'service role can query free AI limits through route handlers'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.reserve_free_ai_report_usage(uuid,uuid,uuid,text,uuid,text,bigint,uuid[],integer)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot reserve free AI usage directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.reserve_free_ai_report_usage(uuid,uuid,uuid,text,uuid,text,bigint,uuid[],integer)',
    'EXECUTE'
  ),
  true,
  'service role can reserve free AI usage atomically'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.complete_free_ai_report_usage(uuid,uuid,uuid,text,text,integer,integer,integer,numeric,text,jsonb)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot persist free AI results directly'
);
select is(
  has_function_privilege(
    'service_role',
    'public.complete_free_ai_report_usage(uuid,uuid,uuid,text,text,integer,integer,integer,numeric,text,jsonb)',
    'EXECUTE'
  ),
  true,
  'service role can persist free AI results atomically'
);
select throws_ok(
  $$
    select * from public.reserve_free_ai_report_usage(
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid,
      'gpt-test',
      '00000000-0000-4000-8000-000000000004'::uuid,
      repeat('a', 64),
      0,
      array[]::uuid[],
      3
    )
  $$,
  'P0001',
  'AI report ownership could not be verified',
  'free AI reservations reject unowned episodes before counting usage'
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
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.monetization_events'::regclass
      and conname = 'monetization_events_event_name_check'
      and pg_get_constraintdef(oid) like '%factual_summary_shared%'
  ),
  'free factual handoff shares are accepted as product-quality events'
);
select ok(
  public.get_free_release_schema_version() = '202608180004'
    and has_function_privilege(
      'service_role',
      'public.get_free_release_schema_version()',
      'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated',
      'public.get_free_release_schema_version()',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.get_free_release_schema_version()',
      'EXECUTE'
    ),
  'the complete free-release schema exposes its version only to the server role'
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
  false,
  'free-release service role cannot execute legacy credit recovery'
);
select is(
  (
    select count(*)::integer
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any(array[
        'ensure_ai_complimentary_credit',
        'get_ai_credit_status',
        'release_stale_ai_report_reservations',
        'reserve_ai_report_usage',
        'complete_ai_report_usage',
        'record_ai_credit_purchase',
        'refund_ai_credit_purchase',
        'reverse_ai_credit_refund'
      ])
      and has_function_privilege('service_role', procedure.oid, 'EXECUTE')
  ),
  0,
  'free-release service role cannot execute any legacy paid-credit RPC'
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
