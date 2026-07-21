drop view if exists public.ai_usage_management;

drop function if exists public.reserve_ai_report_usage(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer
);
drop function if exists public.create_ai_access_code(
  text,
  integer,
  integer,
  integer,
  timestamptz,
  text
);
drop function if exists public.redeem_ai_access_code(uuid, text);
drop function if exists public.hash_ai_access_code(text);
drop function if exists public.normalize_ai_access_code(text);

drop index if exists public.ai_report_usage_quota_idx;

alter table public.ai_report_usage
  drop column if exists grant_id;

drop table if exists public.ai_access_grants;
drop table if exists public.ai_access_codes;

alter table public.ai_report_feedback
  drop column if exists would_pay,
  drop column if exists willingness_to_pay_krw;

create index if not exists ai_report_usage_quota_idx
  on public.ai_report_usage (user_id, status, generated_at desc);

create or replace function public.reserve_ai_report_usage(
  target_user_id uuid,
  target_pet_id uuid,
  target_episode_id uuid,
  target_model text,
  target_monthly_report_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved_usage_id uuid;
  used_this_month integer;
begin
  if target_user_id is null
    or target_pet_id is null
    or target_episode_id is null
    or target_monthly_report_limit is null
    or target_monthly_report_limit < 1
  then
    raise exception 'Valid AI report reservation fields are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  update public.ai_report_usage usage
  set
    status = 'failed',
    error_code = 'reservation_timeout'
  where usage.user_id = target_user_id
    and usage.status = 'pending'
    and usage.created_at < now() - interval '5 minutes';

  select count(*)::integer
  into used_this_month
  from public.ai_report_usage usage
  where usage.user_id = target_user_id
    and usage.generated_at >= date_trunc('month', now())
    and usage.status in ('pending', 'succeeded');

  if used_this_month >= target_monthly_report_limit then
    return null;
  end if;

  insert into public.ai_report_usage (
    user_id,
    pet_id,
    episode_id,
    status,
    model
  )
  values (
    target_user_id,
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
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.reserve_ai_report_usage(
  uuid,
  uuid,
  uuid,
  text,
  integer
) to service_role;

create or replace view public.ai_usage_management as
select
  usage.user_id,
  count(usage.id) filter (where usage.status = 'succeeded')::integer as total_ai_reports,
  count(usage.id) filter (
    where usage.status = 'succeeded'
      and date_trunc('month', usage.generated_at) = date_trunc('month', now())
  )::integer as current_month_ai_reports,
  coalesce(
    sum(usage.total_tokens) filter (where usage.status = 'succeeded'),
    0
  )::integer as total_tokens,
  coalesce(
    sum(usage.estimated_cost_usd) filter (where usage.status = 'succeeded'),
    0
  )::numeric(12, 6) as estimated_cost_usd,
  round(avg(feedback.usefulness_score)::numeric, 2) as average_usefulness_score,
  count(feedback.id)::integer as feedback_count,
  max(usage.generated_at) as last_ai_report_at
from public.ai_report_usage usage
left join public.ai_report_feedback feedback on feedback.usage_id = usage.id
group by usage.user_id;

revoke all on public.ai_usage_management from anon, authenticated;
grant select on public.ai_usage_management to service_role;

comment on table public.ai_report_usage is
  'AI summary reservations, generation outcomes, token use, and cost estimates.';
comment on table public.ai_report_feedback is
  'User usefulness feedback for AI summaries.';
comment on view public.ai_usage_management is
  'Service-role-only AI usage, cost, and usefulness summary.';
