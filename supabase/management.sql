-- Useful read-only queries for the Supabase SQL Editor.

select *
from public.tester_management
order by created_at desc;

select *
from public.account_deletion_management
order by requested_at desc;

select
  risk_level,
  count(*)::integer as report_count
from public.health_reports
where is_test = false
group by risk_level
order by risk_level;

select
  feedback,
  count(*)::integer as feedback_count
from public.health_report_feedback
group by feedback
order by feedback;

select
  plan.user_id,
  plan.pet_id,
  plan.episode_id,
  count(task.id)::integer as task_count,
  count(task.completed_at)::integer as completed_task_count,
  plan.reported_at
from public.episode_plans plan
left join public.plan_tasks task on task.plan_id = plan.id
group by plan.id
order by plan.reported_at desc;

select
  progress.user_id,
  progress.pet_id,
  progress.episode_id,
  progress.follow_up_day,
  progress.condition_change,
  progress.appetite,
  progress.energy,
  progress.recorded_at
from public.episode_progress_logs progress
order by progress.recorded_at desc;

select *
from public.ai_usage_management
order by last_ai_report_at desc nulls last;

select
  usage.user_id,
  usage.episode_id,
  usage.status,
  usage.model,
  usage.prompt_tokens,
  usage.completion_tokens,
  usage.total_tokens,
  usage.estimated_cost_usd,
  usage.error_code,
  usage.generated_at
from public.ai_report_usage usage
order by usage.generated_at desc;

select
  feedback.user_id,
  feedback.episode_id,
  feedback.usefulness_score,
  feedback.comment,
  feedback.created_at
from public.ai_report_feedback feedback
order by feedback.created_at desc;
