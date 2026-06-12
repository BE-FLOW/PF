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
