create extension if not exists pgcrypto with schema extensions;

create or replace function public.normalize_ai_access_code(raw_code text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select upper(regexp_replace(coalesce(raw_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.hash_ai_access_code(raw_code text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(extensions.digest(public.normalize_ai_access_code(raw_code), 'sha256'), 'hex');
$$;

create table if not exists public.ai_access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_prefix text not null,
  label text not null check (char_length(label) between 1 and 80),
  created_by text not null default 'admin' check (char_length(created_by) between 1 and 80),
  max_redemptions integer not null default 1 check (max_redemptions between 1 and 500),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  monthly_report_limit integer not null default 10 check (monthly_report_limit between 1 and 500),
  total_report_limit integer check (total_report_limit is null or total_report_limit > 0),
  expires_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_access_codes_redeemed_max_check
    check (redeemed_count <= max_redemptions)
);

create table if not exists public.ai_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_id uuid not null references public.ai_access_codes(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'revoked')),
  monthly_report_limit integer not null check (monthly_report_limit between 1 and 500),
  total_report_limit integer check (total_report_limit is null or total_report_limit > 0),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_access_grants_user_key unique (user_id)
);

create table if not exists public.ai_report_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid references public.ai_access_grants(id) on delete set null,
  pet_id uuid,
  episode_id uuid,
  source_type text not null default 'ai' check (source_type = 'ai'),
  review_status text not null default 'unreviewed' check (review_status = 'unreviewed'),
  status text not null check (status in ('succeeded', 'failed')),
  model text,
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens is null or completion_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  estimated_cost_usd numeric(12, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  error_code text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ai_report_usage_pet_owner_fkey
    foreign key (pet_id, user_id)
    references public.pets (id, user_id)
    match full
    on delete cascade,
  constraint ai_report_usage_episode_owner_fkey
    foreign key (episode_id, user_id, pet_id)
    references public.episodes (id, user_id, pet_id)
    match full
    on delete cascade
);

create table if not exists public.ai_report_feedback (
  id uuid primary key default gen_random_uuid(),
  usage_id uuid not null references public.ai_report_usage(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  episode_id uuid,
  usefulness_score smallint not null check (usefulness_score between 1 and 5),
  would_pay text not null check (would_pay in ('no', 'maybe', 'yes')),
  willingness_to_pay_krw integer check (
    willingness_to_pay_krw is null or willingness_to_pay_krw between 0 and 1000000
  ),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_report_feedback_usage_user_key unique (usage_id, user_id)
);

create index if not exists ai_access_codes_active_idx
  on public.ai_access_codes (expires_at, disabled_at)
  where disabled_at is null;

create index if not exists ai_report_usage_user_generated_idx
  on public.ai_report_usage (user_id, generated_at desc);

create index if not exists ai_report_usage_episode_idx
  on public.ai_report_usage (episode_id, generated_at desc);

create index if not exists ai_report_feedback_user_created_idx
  on public.ai_report_feedback (user_id, created_at desc);

alter table public.ai_access_codes enable row level security;
alter table public.ai_access_grants enable row level security;
alter table public.ai_report_usage enable row level security;
alter table public.ai_report_feedback enable row level security;

revoke all on table public.ai_access_codes from anon, authenticated;
revoke all on table public.ai_access_grants from anon, authenticated;
revoke all on table public.ai_report_usage from anon, authenticated;
revoke all on table public.ai_report_feedback from anon, authenticated;
grant select, insert, update, delete on table public.ai_access_codes to service_role;
grant select, insert, update, delete on table public.ai_access_grants to service_role;
grant select, insert, update, delete on table public.ai_report_usage to service_role;
grant select, insert, update, delete on table public.ai_report_feedback to service_role;

create or replace function public.create_ai_access_code(
  target_label text,
  target_max_redemptions integer default 1,
  target_monthly_report_limit integer default 10,
  target_total_report_limit integer default null,
  target_expires_at timestamptz default null,
  target_created_by text default 'admin'
)
returns table (
  id uuid,
  code text,
  label text,
  max_redemptions integer,
  monthly_report_limit integer,
  total_report_limit integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  generated_code text;
  saved_id uuid;
begin
  if btrim(coalesce(target_label, '')) = '' then
    raise exception 'Code label is required';
  end if;

  if target_max_redemptions is null or target_max_redemptions not between 1 and 500 then
    raise exception 'max_redemptions must be between 1 and 500';
  end if;

  if target_monthly_report_limit is null or target_monthly_report_limit not between 1 and 500 then
    raise exception 'monthly_report_limit must be between 1 and 500';
  end if;

  if target_total_report_limit is not null and target_total_report_limit <= 0 then
    raise exception 'total_report_limit must be positive';
  end if;

  loop
    generated_code :=
      'PF-' ||
      upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 4)) ||
      '-' ||
      upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 4)) ||
      '-' ||
      upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 4));

    insert into public.ai_access_codes (
      code_hash,
      code_prefix,
      label,
      created_by,
      max_redemptions,
      monthly_report_limit,
      total_report_limit,
      expires_at
    ) values (
      public.hash_ai_access_code(generated_code),
      left(public.normalize_ai_access_code(generated_code), 6),
      btrim(target_label),
      btrim(coalesce(target_created_by, 'admin')),
      target_max_redemptions,
      target_monthly_report_limit,
      target_total_report_limit,
      target_expires_at
    )
    on conflict (code_hash) do nothing
    returning ai_access_codes.id into saved_id;

    exit when saved_id is not null;
  end loop;

  return query
    select
      created.id,
      generated_code,
      created.label,
      created.max_redemptions,
      created.monthly_report_limit,
      created.total_report_limit,
      created.expires_at
    from public.ai_access_codes created
    where created.id = saved_id;
end;
$$;

create or replace function public.redeem_ai_access_code(
  target_user_id uuid,
  raw_code text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_code public.ai_access_codes%rowtype;
  existing_grant public.ai_access_grants%rowtype;
  saved_grant_id uuid;
begin
  if target_user_id is null then
    raise exception 'User id is required';
  end if;

  select *
  into target_code
  from public.ai_access_codes
  where code_hash = public.hash_ai_access_code(raw_code)
    and disabled_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if target_code.id is null then
    raise exception 'AI access code is invalid or expired';
  end if;

  select *
  into existing_grant
  from public.ai_access_grants
  where user_id = target_user_id
  for update;

  if existing_grant.id is not null and existing_grant.code_id = target_code.id then
    update public.ai_access_grants
    set status = 'active',
        revoked_at = null,
        monthly_report_limit = target_code.monthly_report_limit,
        total_report_limit = target_code.total_report_limit,
        updated_at = now()
    where id = existing_grant.id
    returning id into saved_grant_id;

    return saved_grant_id;
  end if;

  if target_code.redeemed_count >= target_code.max_redemptions then
    raise exception 'AI access code has no remaining seats';
  end if;

  update public.ai_access_codes
  set redeemed_count = redeemed_count + 1,
      updated_at = now()
  where id = target_code.id;

  insert into public.ai_access_grants (
    user_id,
    code_id,
    status,
    monthly_report_limit,
    total_report_limit,
    granted_at,
    updated_at
  ) values (
    target_user_id,
    target_code.id,
    'active',
    target_code.monthly_report_limit,
    target_code.total_report_limit,
    now(),
    now()
  )
  on conflict (user_id) do update set
    code_id = excluded.code_id,
    status = 'active',
    monthly_report_limit = excluded.monthly_report_limit,
    total_report_limit = excluded.total_report_limit,
    granted_at = excluded.granted_at,
    revoked_at = null,
    updated_at = excluded.updated_at
  returning id into saved_grant_id;

  return saved_grant_id;
end;
$$;

revoke all on function public.normalize_ai_access_code(text) from public, anon, authenticated;
revoke all on function public.hash_ai_access_code(text) from public, anon, authenticated;
revoke all on function public.create_ai_access_code(text, integer, integer, integer, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.redeem_ai_access_code(uuid, text)
  from public, anon, authenticated;

grant execute on function public.normalize_ai_access_code(text) to service_role;
grant execute on function public.hash_ai_access_code(text) to service_role;
grant execute on function public.create_ai_access_code(text, integer, integer, integer, timestamptz, text)
  to service_role;
grant execute on function public.redeem_ai_access_code(uuid, text)
  to service_role;

create or replace view public.ai_usage_management as
select
  grant_row.user_id,
  code.label as code_label,
  grant_row.status as grant_status,
  grant_row.monthly_report_limit,
  grant_row.total_report_limit,
  grant_row.granted_at,
  count(usage.id) filter (where usage.status = 'succeeded')::integer as total_ai_reports,
  count(usage.id) filter (
    where usage.status = 'succeeded'
      and date_trunc('month', usage.generated_at) = date_trunc('month', now())
  )::integer as current_month_ai_reports,
  coalesce(sum(usage.total_tokens) filter (where usage.status = 'succeeded'), 0)::integer as total_tokens,
  coalesce(sum(usage.estimated_cost_usd) filter (where usage.status = 'succeeded'), 0)::numeric(12, 6) as estimated_cost_usd,
  round(avg(feedback.usefulness_score)::numeric, 2) as average_usefulness_score,
  count(feedback.id)::integer as feedback_count,
  count(feedback.id) filter (where feedback.would_pay = 'yes')::integer as would_pay_yes_count,
  count(feedback.id) filter (where feedback.would_pay = 'maybe')::integer as would_pay_maybe_count,
  max(usage.generated_at) as last_ai_report_at
from public.ai_access_grants grant_row
join public.ai_access_codes code on code.id = grant_row.code_id
left join public.ai_report_usage usage on usage.grant_id = grant_row.id
left join public.ai_report_feedback feedback on feedback.usage_id = usage.id
group by grant_row.user_id, code.label, grant_row.status, grant_row.monthly_report_limit,
  grant_row.total_report_limit, grant_row.granted_at;

revoke all on public.ai_usage_management from anon, authenticated;
grant select on public.ai_usage_management to service_role;

comment on table public.ai_access_codes is
  'Service-role-only participation codes that grant GPT-backed veterinary report access.';
comment on table public.ai_access_grants is
  'Per-user GPT report access granted by a participation code.';
comment on table public.ai_report_usage is
  'GPT-backed report generation attempts, token use, and optional cost estimates.';
comment on table public.ai_report_feedback is
  'Tester usefulness and willingness-to-pay feedback for GPT-backed reports.';
comment on view public.ai_usage_management is
  'Service-role-only AI access, usage, cost, and feedback summary for pilot management.';
