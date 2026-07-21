alter table public.ai_report_usage
  drop constraint if exists ai_report_usage_status_check;

alter table public.ai_report_usage
  add constraint ai_report_usage_status_check
  check (status in ('pending', 'succeeded', 'failed'));

create index if not exists ai_report_usage_quota_idx
  on public.ai_report_usage (user_id, grant_id, status, generated_at desc);

create or replace function public.reserve_ai_report_usage(
  target_user_id uuid,
  target_grant_id uuid,
  target_pet_id uuid,
  target_episode_id uuid,
  target_model text,
  target_monthly_report_limit integer,
  target_total_report_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved_usage_id uuid;
  used_this_month integer;
  used_total integer;
begin
  if target_user_id is null
    or target_pet_id is null
    or target_episode_id is null
    or target_monthly_report_limit is null
    or target_monthly_report_limit < 1
  then
    raise exception 'Valid AI report reservation fields are required';
  end if;

  if target_grant_id is not null and not exists (
    select 1
    from public.ai_access_grants grant_row
    where grant_row.id = target_grant_id
      and grant_row.user_id = target_user_id
  ) then
    raise exception 'AI access grant does not belong to the user';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      target_user_id::text || ':' || coalesce(target_grant_id::text, 'standard'),
      0
    )
  );

  update public.ai_report_usage usage
  set
    status = 'failed',
    error_code = 'reservation_timeout'
  where usage.user_id = target_user_id
    and usage.grant_id is not distinct from target_grant_id
    and usage.status = 'pending'
    and usage.created_at < now() - interval '5 minutes';

  select count(*)::integer
  into used_this_month
  from public.ai_report_usage usage
  where usage.user_id = target_user_id
    and usage.grant_id is not distinct from target_grant_id
    and usage.generated_at >= date_trunc('month', now())
    and usage.status in ('pending', 'succeeded');

  if used_this_month >= target_monthly_report_limit then
    return null;
  end if;

  if target_total_report_limit is not null then
    select count(*)::integer
    into used_total
    from public.ai_report_usage usage
    where usage.user_id = target_user_id
      and usage.grant_id is not distinct from target_grant_id
      and usage.status in ('pending', 'succeeded');

    if used_total >= target_total_report_limit then
      return null;
    end if;
  end if;

  insert into public.ai_report_usage (
    user_id,
    grant_id,
    pet_id,
    episode_id,
    status,
    model
  )
  values (
    target_user_id,
    target_grant_id,
    target_pet_id,
    target_episode_id,
    'pending',
    nullif(trim(target_model), '')
  )
  returning id into reserved_usage_id;

  return reserved_usage_id;
end;
$$;

revoke all on function public.reserve_ai_report_usage(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.reserve_ai_report_usage(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer
) to service_role;

comment on table public.ai_access_codes is
  'Service-role-only codes that add AI veterinary summary allowance.';
comment on table public.ai_access_grants is
  'Optional per-user AI summary allowance granted by an additional-use code.';
comment on table public.ai_report_usage is
  'AI summary reservations, generation outcomes, token use, and cost estimates.';
comment on table public.ai_report_feedback is
  'User usefulness and willingness-to-pay feedback for AI summaries.';
