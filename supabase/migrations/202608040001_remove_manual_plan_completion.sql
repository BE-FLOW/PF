-- Hospital guidance is owner-reported context, not a task checklist.
drop function if exists public.set_plan_task_completion(uuid, uuid, uuid, boolean);

comment on table public.plan_tasks is
  'Owner-reported hospital guidance lines. They are not veterinarian-confirmed or completion tasks.';
