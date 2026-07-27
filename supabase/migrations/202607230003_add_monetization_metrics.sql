alter table public.billing_purchases
  add column if not exists price_usd numeric(12, 4)
    check (price_usd is null or price_usd >= 0),
  add column if not exists price_amount numeric(12, 4)
    check (price_amount is null or price_amount >= 0),
  add column if not exists currency text
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  add column if not exists country_code text
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add column if not exists quantity integer not null default 1
    check (quantity between 1 and 100),
  add column if not exists tax_percentage numeric(6, 5)
    check (tax_percentage is null or tax_percentage between 0 and 1),
  add column if not exists commission_percentage numeric(6, 5)
    check (commission_percentage is null or commission_percentage between 0 and 1);

create table if not exists public.monetization_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (
    event_name in (
      'paywall_viewed',
      'paywall_closed',
      'purchase_started',
      'purchase_cancelled',
      'purchase_failed',
      'purchase_sync_delayed',
      'purchase_history_checked',
      'ai_summary_shared'
    )
  ),
  context text not null check (context in ('account', 'report')),
  platform text not null check (platform in ('android', 'ios', 'web')),
  product_id text not null,
  app_version text,
  app_build text,
  created_at timestamptz not null default now()
);

create index if not exists monetization_events_name_created_idx
  on public.monetization_events (event_name, created_at desc);
create index if not exists monetization_events_user_created_idx
  on public.monetization_events (user_id, created_at desc);

alter table public.monetization_events enable row level security;
alter table public.monetization_events force row level security;
revoke all on table public.monetization_events
  from public, anon, authenticated;
grant select, insert on table public.monetization_events to service_role;

drop function if exists public.record_ai_credit_purchase(
  uuid, text, text, text, text, text, timestamptz, integer
);

create or replace function public.record_ai_credit_purchase(
  target_user_id uuid,
  target_transaction_id text,
  target_original_transaction_id text,
  target_product_id text,
  target_store text,
  target_environment text,
  target_purchased_at timestamptz,
  target_credits integer default 1,
  target_price_usd numeric default null,
  target_price_amount numeric default null,
  target_currency text default null,
  target_country_code text default null,
  target_quantity integer default 1,
  target_tax_percentage numeric default null,
  target_commission_percentage numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_purchase_id uuid;
  target_grant_id uuid;
  inserted_purchase boolean := false;
  normalized_currency text := upper(nullif(btrim(coalesce(target_currency, '')), ''));
  normalized_country_code text := upper(nullif(btrim(coalesce(target_country_code, '')), ''));
begin
  if target_user_id is null
    or btrim(coalesce(target_transaction_id, '')) = ''
    or btrim(coalesce(target_product_id, '')) = ''
    or target_store not in ('app_store', 'play_store', 'revenuecat', 'stripe', 'paddle')
    or target_environment not in ('sandbox', 'production')
    or target_purchased_at is null
    or target_credits not between 1 and 100
    or target_quantity not between 1 and 100
    or (target_price_usd is not null and target_price_usd < 0)
    or (target_price_amount is not null and target_price_amount < 0)
    or (normalized_currency is not null and normalized_currency !~ '^[A-Z]{3}$')
    or (normalized_country_code is not null and normalized_country_code !~ '^[A-Z]{2}$')
    or (
      target_tax_percentage is not null
      and target_tax_percentage not between 0 and 1
    )
    or (
      target_commission_percentage is not null
      and target_commission_percentage not between 0 and 1
    )
  then
    raise exception 'Valid purchase fields are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  insert into public.billing_purchases (
    user_id,
    transaction_id,
    original_transaction_id,
    product_id,
    store,
    environment,
    credits_granted,
    purchased_at,
    price_usd,
    price_amount,
    currency,
    country_code,
    quantity,
    tax_percentage,
    commission_percentage
  )
  values (
    target_user_id,
    btrim(target_transaction_id),
    nullif(btrim(coalesce(target_original_transaction_id, '')), ''),
    btrim(target_product_id),
    target_store,
    target_environment,
    target_credits,
    target_purchased_at,
    target_price_usd,
    target_price_amount,
    normalized_currency,
    normalized_country_code,
    target_quantity,
    target_tax_percentage,
    target_commission_percentage
  )
  on conflict (transaction_id) do nothing
  returning id into target_purchase_id;

  inserted_purchase := target_purchase_id is not null;

  if not inserted_purchase then
    select id
    into target_purchase_id
    from public.billing_purchases
    where transaction_id = btrim(target_transaction_id)
      and user_id = target_user_id;

    if target_purchase_id is null then
      raise exception 'Purchase belongs to another user';
    end if;

    update public.billing_purchases
    set
      original_transaction_id = coalesce(
        original_transaction_id,
        nullif(btrim(coalesce(target_original_transaction_id, '')), '')
      ),
      price_usd = coalesce(target_price_usd, price_usd),
      price_amount = coalesce(target_price_amount, price_amount),
      currency = coalesce(normalized_currency, currency),
      country_code = coalesce(normalized_country_code, country_code),
      quantity = greatest(quantity, target_quantity),
      tax_percentage = coalesce(target_tax_percentage, tax_percentage),
      commission_percentage = coalesce(
        target_commission_percentage,
        commission_percentage
      ),
      updated_at = now()
    where id = target_purchase_id;
  end if;

  if inserted_purchase then
    insert into public.ai_credit_grants (
      user_id,
      purchase_id,
      source,
      quantity_granted,
      quantity_remaining,
      granted_at
    )
    values (
      target_user_id,
      target_purchase_id,
      'purchase',
      target_credits,
      target_credits,
      target_purchased_at
    )
    returning id into target_grant_id;

    insert into public.ai_credit_ledger (
      user_id,
      grant_id,
      delta,
      reason,
      idempotency_key
    )
    values (
      target_user_id,
      target_grant_id,
      target_credits,
      'purchase',
      'purchase:' || btrim(target_transaction_id)
    );
  end if;

  return target_purchase_id;
end;
$$;

revoke all on function public.record_ai_credit_purchase(
  uuid, text, text, text, text, text, timestamptz, integer,
  numeric, numeric, text, text, integer, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.record_ai_credit_purchase(
  uuid, text, text, text, text, text, timestamptz, integer,
  numeric, numeric, text, text, integer, numeric, numeric
) to service_role;

create or replace view public.billing_daily_metrics
with (security_invoker = true)
as
with event_days as (
  select
    (created_at at time zone 'Asia/Seoul')::date as metric_date,
    count(*) filter (where event_name = 'paywall_viewed')::integer as paywall_views,
    count(distinct user_id) filter (
      where event_name = 'paywall_viewed'
    )::integer as paywall_users,
    count(*) filter (where event_name = 'purchase_started')::integer
      as purchase_starts,
    count(*) filter (where event_name = 'purchase_cancelled')::integer
      as purchase_cancellations,
    count(*) filter (where event_name = 'purchase_failed')::integer
      as purchase_failures,
    count(*) filter (where event_name = 'ai_summary_shared')::integer
      as summary_shares
  from public.monetization_events
  group by metric_date
),
ranked_purchases as (
  select
    purchase.*,
    row_number() over (
      partition by purchase.user_id
      order by purchase.purchased_at, purchase.id
    ) as purchase_number
  from public.billing_purchases purchase
  where purchase.status = 'active'
    and purchase.environment = 'production'
),
purchase_days as (
  select
    (purchased_at at time zone 'Asia/Seoul')::date as metric_date,
    count(*)::integer as purchases,
    count(distinct user_id)::integer as purchasers,
    count(*) filter (where purchase_number > 1)::integer as repeat_purchases,
    coalesce(sum(price_usd), 0)::numeric(14, 4) as gross_revenue_usd,
    coalesce(sum(
      price_usd
        * (1 - coalesce(tax_percentage, 0))
        * (1 - coalesce(commission_percentage, 0))
    ), 0)::numeric(14, 4) as estimated_proceeds_usd
  from ranked_purchases
  group by metric_date
),
usage_days as (
  select
    (generated_at at time zone 'Asia/Seoul')::date as metric_date,
    count(*) filter (where status = 'succeeded')::integer as summaries_created,
    count(*) filter (where status = 'failed')::integer as summaries_failed,
    coalesce(sum(estimated_cost_usd) filter (
      where status = 'succeeded'
    ), 0)::numeric(14, 6) as estimated_ai_cost_usd
  from public.ai_report_usage
  group by metric_date
),
metric_dates as (
  select metric_date from event_days
  union
  select metric_date from purchase_days
  union
  select metric_date from usage_days
)
select
  dates.metric_date,
  coalesce(events.paywall_views, 0) as paywall_views,
  coalesce(events.paywall_users, 0) as paywall_users,
  coalesce(events.purchase_starts, 0) as purchase_starts,
  coalesce(events.purchase_cancellations, 0) as purchase_cancellations,
  coalesce(events.purchase_failures, 0) as purchase_failures,
  coalesce(purchases.purchases, 0) as purchases,
  coalesce(purchases.purchasers, 0) as purchasers,
  coalesce(purchases.repeat_purchases, 0) as repeat_purchases,
  coalesce(usages.summaries_created, 0) as summaries_created,
  coalesce(events.summary_shares, 0) as summary_shares,
  coalesce(purchases.gross_revenue_usd, 0) as gross_revenue_usd,
  coalesce(purchases.estimated_proceeds_usd, 0) as estimated_proceeds_usd,
  coalesce(usages.estimated_ai_cost_usd, 0) as estimated_ai_cost_usd
from metric_dates dates
left join event_days events using (metric_date)
left join purchase_days purchases using (metric_date)
left join usage_days usages using (metric_date);

revoke all on public.billing_daily_metrics from public, anon, authenticated;
grant select on public.billing_daily_metrics to service_role;

comment on table public.monetization_events is
  'Minimal first-party purchase funnel events. No observation text, media, or payment credentials.';
comment on view public.billing_daily_metrics is
  'Daily owner purchase funnel, verified revenue, AI cost, and sharing metrics in Korea time.';
