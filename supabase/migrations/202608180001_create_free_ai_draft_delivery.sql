alter table public.episodes
  add column if not exists source_revision bigint not null default 0
    check (source_revision >= 0);

alter table public.ai_report_usage
  add column if not exists access_mode text not null default 'credit',
  add column if not exists request_id uuid,
  add column if not exists request_fingerprint text,
  add column if not exists selected_report_ids uuid[],
  add column if not exists result jsonb,
  add column if not exists fair_use_date date,
  add column if not exists source_revision bigint,
  add column if not exists reservation_token uuid,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists reservation_updated_at timestamptz not null default now();

update public.ai_report_usage usage
set source_revision = episode.source_revision,
    reservation_token = coalesce(usage.reservation_token, gen_random_uuid()),
    attempt_count = greatest(usage.attempt_count, 1)
from public.episodes episode
where usage.access_mode = 'free_daily'
  and usage.episode_id = episode.id
  and usage.user_id = episode.user_id
  and usage.pet_id = episode.pet_id
  and (
    usage.source_revision is null
    or usage.reservation_token is null
    or usage.attempt_count < 1
  );

alter table public.ai_report_usage
  drop constraint if exists ai_report_usage_access_mode_check;
alter table public.ai_report_usage
  add constraint ai_report_usage_access_mode_check
  check (access_mode in ('credit', 'free_daily'));

alter table public.ai_report_usage
  drop constraint if exists ai_report_usage_request_fields_check;
alter table public.ai_report_usage
  add constraint ai_report_usage_request_fields_check
  check (
    (request_id is null and request_fingerprint is null)
    or (
      request_id is not null
      and request_fingerprint ~ '^[0-9a-f]{64}$'
    )
  );

alter table public.ai_report_usage
  drop constraint if exists ai_report_usage_free_request_check;
alter table public.ai_report_usage
  add constraint ai_report_usage_free_request_check
  check (
    access_mode <> 'free_daily'
    or (
      request_id is not null
      and fair_use_date is not null
      and selected_report_ids is not null
      and cardinality(selected_report_ids) <= 60
      and source_revision is not null
      and source_revision >= 0
      and reservation_token is not null
      and attempt_count >= 1
    )
  );

create unique index if not exists ai_report_usage_user_request_key
  on public.ai_report_usage (user_id, request_id)
  where request_id is not null;

create index if not exists ai_report_usage_free_daily_limit_idx
  on public.ai_report_usage (user_id, fair_use_date, status)
  where access_mode = 'free_daily';

create or replace function public.get_free_ai_access_status(
  target_user_id uuid,
  target_daily_limit integer
)
returns table (
  used_today integer,
  daily_limit integer,
  attempts_today integer,
  daily_attempt_limit integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  current_kst_date date := timezone('Asia/Seoul', now())::date;
begin
  if target_user_id is null
    or target_daily_limit is null
    or target_daily_limit < 1
    or target_daily_limit > 100
  then
    raise exception 'Valid free AI access fields are required';
  end if;

  update public.ai_report_usage usage
  set
    status = 'failed',
    error_code = 'reservation_timeout',
    result = null,
    reservation_updated_at = now()
  where usage.user_id = target_user_id
    and usage.access_mode = 'free_daily'
    and usage.status = 'pending'
    and usage.reservation_updated_at < now() - interval '5 minutes';

  return query
  select
    count(*) filter (where usage.status in ('pending', 'succeeded'))::integer,
    target_daily_limit,
    coalesce(sum(usage.attempt_count), 0)::integer,
    target_daily_limit * 3,
    ((current_kst_date + 1)::timestamp at time zone 'Asia/Seoul')
  from public.ai_report_usage usage
  where usage.user_id = target_user_id
    and usage.access_mode = 'free_daily'
    and usage.fair_use_date = current_kst_date;
end;
$$;

create or replace function public.reserve_free_ai_report_usage(
  target_user_id uuid,
  target_pet_id uuid,
  target_episode_id uuid,
  target_model text,
  target_request_id uuid,
  target_request_fingerprint text,
  target_source_revision bigint,
  target_selected_report_ids uuid[],
  target_daily_limit integer
)
returns table (
  usage_id uuid,
  reservation_state text,
  stored_result jsonb,
  reservation_token uuid
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  current_kst_date date := timezone('Asia/Seoul', now())::date;
  existing_usage public.ai_report_usage%rowtype;
  current_source_revision bigint;
  current_usage_count integer;
  current_attempt_count integer;
  reserved_usage_id uuid;
  next_reservation_token uuid;
begin
  if target_user_id is null
    or target_pet_id is null
    or target_episode_id is null
    or target_request_id is null
    or btrim(coalesce(target_model, '')) = ''
    or coalesce(target_request_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or target_source_revision is null
    or target_source_revision < 0
    or target_selected_report_ids is null
    or cardinality(target_selected_report_ids) > 60
    or target_daily_limit is null
    or target_daily_limit < 1
    or target_daily_limit > 100
  then
    raise exception 'Valid free AI report reservation fields are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  -- The reservation path must clean up its own abandoned attempts. A caller
  -- can retry generation without first making a separate status request.
  update public.ai_report_usage usage
  set
    status = 'failed',
    error_code = 'reservation_timeout',
    result = null,
    reservation_updated_at = now()
  where usage.user_id = target_user_id
    and usage.access_mode = 'free_daily'
    and usage.status = 'pending'
    and usage.reservation_updated_at < now() - interval '5 minutes';

  select episode.source_revision
  into current_source_revision
    from public.episodes episode
    join public.pets pet
      on pet.id = episode.pet_id
     and pet.user_id = episode.user_id
    where episode.id = target_episode_id
      and episode.pet_id = target_pet_id
      and episode.user_id = target_user_id
  ;

  if current_source_revision is null then
    raise exception 'AI report ownership could not be verified';
  end if;

  if current_source_revision <> target_source_revision then
    return query
    select null::uuid, 'stale_source'::text, null::jsonb, null::uuid;
    return;
  end if;

  select usage.*
  into existing_usage
  from public.ai_report_usage usage
  where usage.user_id = target_user_id
    and usage.request_id = target_request_id
  for update;

  if existing_usage.id is not null then
    if existing_usage.access_mode <> 'free_daily'
      or existing_usage.episode_id <> target_episode_id
      or existing_usage.pet_id <> target_pet_id
      or (
        existing_usage.source_revision = target_source_revision
        and (
          existing_usage.request_fingerprint <> target_request_fingerprint
          or existing_usage.selected_report_ids <> target_selected_report_ids
        )
      )
    then
      return query
      select existing_usage.id, 'conflict'::text, null::jsonb, null::uuid;
      return;
    end if;

    if existing_usage.status = 'succeeded'
      and existing_usage.result is not null
      and existing_usage.source_revision = target_source_revision
      and existing_usage.request_fingerprint = target_request_fingerprint
    then
      return query
      select
        existing_usage.id,
        'succeeded'::text,
        existing_usage.result,
        null::uuid;
      return;
    end if;

    if existing_usage.status = 'pending'
      and existing_usage.source_revision = target_source_revision
      and existing_usage.request_fingerprint = target_request_fingerprint
      and existing_usage.reservation_updated_at >= now() - interval '5 minutes'
    then
      return query
      select existing_usage.id, 'pending'::text, null::jsonb, null::uuid;
      return;
    end if;
  end if;

  select coalesce(sum(usage.attempt_count), 0)::integer
  into current_attempt_count
  from public.ai_report_usage usage
  where usage.user_id = target_user_id
    and usage.access_mode = 'free_daily'
    and usage.fair_use_date = current_kst_date;

  if current_attempt_count >= target_daily_limit * 3 then
    return query
    select
      existing_usage.id,
      'attempt_limit'::text,
      null::jsonb,
      null::uuid;
    return;
  end if;

  select count(*)::integer
  into current_usage_count
  from public.ai_report_usage usage
  where usage.user_id = target_user_id
    and usage.access_mode = 'free_daily'
    and usage.fair_use_date = current_kst_date
    and usage.status in ('pending', 'succeeded')
    and (existing_usage.id is null or usage.id <> existing_usage.id);

  if current_usage_count >= target_daily_limit then
    return query
    select existing_usage.id, 'limit'::text, null::jsonb, null::uuid;
    return;
  end if;

  next_reservation_token := gen_random_uuid();

  if existing_usage.id is not null then
    update public.ai_report_usage
    set
      status = 'pending',
      model = btrim(target_model),
      prompt_tokens = null,
      completion_tokens = null,
      total_tokens = null,
      estimated_cost_usd = null,
      error_code = null,
      result = null,
      request_fingerprint = target_request_fingerprint,
      selected_report_ids = target_selected_report_ids,
      source_revision = target_source_revision,
      reservation_token = next_reservation_token,
      attempt_count = case
        when fair_use_date = current_kst_date then attempt_count + 1
        else 1
      end,
      fair_use_date = current_kst_date,
      reservation_updated_at = now()
    where id = existing_usage.id;

    return query
    select
      existing_usage.id,
      'reserved'::text,
      null::jsonb,
      next_reservation_token;
    return;
  end if;

  insert into public.ai_report_usage (
    user_id,
    pet_id,
    episode_id,
    status,
    model,
    access_mode,
    request_id,
    request_fingerprint,
    source_revision,
    reservation_token,
    attempt_count,
    selected_report_ids,
    fair_use_date,
    reservation_updated_at
  ) values (
    target_user_id,
    target_pet_id,
    target_episode_id,
    'pending',
    btrim(target_model),
    'free_daily',
    target_request_id,
    target_request_fingerprint,
    target_source_revision,
    next_reservation_token,
    1,
    target_selected_report_ids,
    current_kst_date,
    now()
  )
  returning id into reserved_usage_id;

  return query
  select reserved_usage_id, 'reserved'::text, null::jsonb, next_reservation_token;
end;
$$;

create or replace function public.complete_free_ai_report_usage(
  target_usage_id uuid,
  target_user_id uuid,
  target_reservation_token uuid,
  target_status text,
  target_model text,
  target_prompt_tokens integer,
  target_completion_tokens integer,
  target_total_tokens integer,
  target_estimated_cost_usd numeric,
  target_error_code text,
  target_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_usage public.ai_report_usage%rowtype;
begin
  if target_usage_id is null
    or target_user_id is null
    or target_reservation_token is null
  then
    raise exception 'Valid free AI completion fields are required';
  end if;
  if target_status not in ('succeeded', 'failed') then
    raise exception 'AI report completion status is invalid';
  end if;
  if target_status = 'succeeded'
    and (target_result is null or jsonb_typeof(target_result) <> 'object')
  then
    raise exception 'A successful AI report requires a stored result';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  select usage.*
  into target_usage
  from public.ai_report_usage usage
  where usage.id = target_usage_id
    and usage.user_id = target_user_id
    and usage.access_mode = 'free_daily'
    and usage.reservation_token = target_reservation_token
  for update;

  if target_usage.id is null then
    return false;
  end if;

  if target_status = 'succeeded'
    and not exists (
      select 1
      from public.episodes episode
      where episode.id = target_usage.episode_id
        and episode.user_id = target_usage.user_id
        and episode.pet_id = target_usage.pet_id
        and episode.source_revision = target_usage.source_revision
    )
  then
    update public.ai_report_usage
    set status = 'failed',
        result = null,
        error_code = 'source_changed',
        reservation_updated_at = now()
    where id = target_usage_id
      and reservation_token = target_reservation_token;
    return false;
  end if;

  if target_usage.status <> 'pending' then
    return target_usage.status = target_status
      and (
        target_status = 'failed'
        or target_usage.result is not null
      );
  end if;

  update public.ai_report_usage
  set
    status = target_status,
    model = nullif(btrim(coalesce(target_model, '')), ''),
    prompt_tokens = target_prompt_tokens,
    completion_tokens = target_completion_tokens,
    total_tokens = target_total_tokens,
    estimated_cost_usd = case
      when target_status = 'succeeded' then target_estimated_cost_usd
      else null
    end,
    error_code = target_error_code,
    result = case
      when target_status = 'succeeded' then target_result
      else null
    end,
    generated_at = case
      when target_status = 'succeeded' then now()
      else generated_at
    end,
    reservation_updated_at = now()
  where id = target_usage_id
    and reservation_token = target_reservation_token;

  return true;
end;
$$;

revoke all on function public.get_free_ai_access_status(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.reserve_free_ai_report_usage(
  uuid, uuid, uuid, text, uuid, text, bigint, uuid[], integer
) from public, anon, authenticated;
revoke all on function public.complete_free_ai_report_usage(
  uuid, uuid, uuid, text, text, integer, integer, integer, numeric, text, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.get_free_ai_access_status(uuid, integer)
  to service_role;
grant execute on function public.reserve_free_ai_report_usage(
  uuid, uuid, uuid, text, uuid, text, bigint, uuid[], integer
) to service_role;
grant execute on function public.complete_free_ai_report_usage(
  uuid, uuid, uuid, text, text, integer, integer, integer, numeric, text, jsonb
) to service_role;

-- Paid-credit RPCs stay in the database only as isolated legacy code during
-- the free release. In particular, the old completion and stale-release paths
-- were created before access_mode existed and must not be able to mutate or
-- count free_daily rows through the server role.
revoke all on function public.ensure_ai_complimentary_credit(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_ai_credit_status(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.release_stale_ai_report_reservations(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.reserve_ai_report_usage(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_ai_report_usage(
  uuid, uuid, text, text, integer, integer, integer, numeric, text
) from public, anon, authenticated, service_role;
revoke all on function public.record_ai_credit_purchase(
  uuid, text, text, text, text, text, timestamptz, integer,
  numeric, numeric, text, text, integer, numeric, numeric
) from public, anon, authenticated, service_role;
revoke all on function public.refund_ai_credit_purchase(text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.reverse_ai_credit_refund(text, text, timestamptz)
  from public, anon, authenticated, service_role;

comment on column public.ai_report_usage.request_id is
  'Client-generated UUID that makes free AI draft creation idempotent per account.';
comment on column public.ai_report_usage.result is
  'Successful unreviewed draft persisted for retry and signed-in recovery.';
comment on column public.ai_report_usage.reservation_token is
  'Per-attempt fencing token required to complete the current free AI reservation.';
comment on function public.get_free_ai_access_status(uuid, integer) is
  'Returns KST-day fair-use status without consulting purchase credits.';
comment on function public.reserve_free_ai_report_usage(
  uuid, uuid, uuid, text, uuid, text, bigint, uuid[], integer
) is 'Atomically reserves a free daily AI draft or returns its idempotent state.';
