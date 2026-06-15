-- Useful read-only queries for the Supabase SQL Editor.

select *
from public.tester_management
order by created_at desc;

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
