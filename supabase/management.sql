-- Privacy-preserving operational aggregates for the Supabase SQL Editor.

select
  (select count(*)::integer from auth.users) as account_count,
  (select count(*)::integer from public.pets) as pet_count,
  (select count(*)::integer from public.health_reports) as report_count,
  (select count(*)::integer from public.health_report_media) as media_count,
  (select count(*)::integer from public.episodes) as episode_count;

select
  risk_level,
  count(*)::integer as report_count
from public.health_reports
group by risk_level
order by risk_level;

select
  feedback,
  count(*)::integer as feedback_count
from public.health_report_feedback
group by feedback
order by feedback;

select
  date_trunc('day', usage.generated_at) as usage_day,
  usage.status,
  usage.model,
  count(*)::integer as request_count,
  sum(usage.total_tokens)::bigint as total_tokens,
  sum(usage.estimated_cost_usd) as estimated_cost_usd
from public.ai_report_usage usage
group by usage_day, usage.status, usage.model
order by usage_day desc, usage.status, usage.model;

select
  feedback.usefulness_score,
  count(*)::integer as feedback_count
from public.ai_report_feedback feedback
group by feedback.usefulness_score
order by feedback.usefulness_score;

-- Revenue and conversion contain no observation text, media, email, or phone.
select *
from public.billing_daily_metrics
order by metric_date desc
limit 90;

select
  purchase.product_id,
  purchase.store,
  purchase.currency,
  count(*)::integer as purchase_count,
  count(distinct purchase.user_id)::integer as purchasing_accounts,
  sum(purchase.price_amount) as gross_revenue_in_purchase_currency,
  sum(purchase.price_usd) as gross_revenue_usd,
  sum(
    purchase.price_usd
      * (1 - coalesce(purchase.tax_percentage, 0))
      * (1 - coalesce(purchase.commission_percentage, 0))
  ) as estimated_proceeds_usd
from public.billing_purchases purchase
where purchase.status = 'active'
  and purchase.environment = 'production'
group by purchase.product_id, purchase.store, purchase.currency
order by purchase_count desc;
