-- A hospital guidance save is the automatic boundary of one visit-preparation flow.
-- The next observation opens a fresh episode, while the prior guidance remains
-- attached to the closed episode. No client-side "finish flow" action is needed.

create or replace function public.ensure_open_episode(
  target_user_id uuid,
  target_pet_id uuid,
  activity_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  open_episode_id uuid;
begin
  if target_user_id is null
    or target_pet_id is null
    or activity_at is null
  then
    raise exception 'Valid episode fields are required';
  end if;

  if not exists (
    select 1
    from public.pets
    where id = target_pet_id and user_id = target_user_id
  ) then
    raise exception 'Pet ownership could not be verified';
  end if;

  -- Plan saves and observation saves for one pet must agree on which episode is
  -- open. This prevents a concurrent observation from being linked to an
  -- episode while hospital guidance is closing it.
  perform pg_advisory_xact_lock(hashtextextended(target_pet_id::text, 0));

  select id into open_episode_id
  from public.episodes
  where user_id = target_user_id
    and pet_id = target_pet_id
    and status = 'open'
  order by started_at desc
  limit 1
  for update;

  if open_episode_id is null then
    insert into public.episodes (
      user_id,
      pet_id,
      status,
      started_at,
      last_activity_at
    ) values (
      target_user_id,
      target_pet_id,
      'open',
      activity_at,
      activity_at
    )
    returning id into open_episode_id;
  end if;

  update public.episodes
  set last_activity_at = greatest(last_activity_at, activity_at),
      updated_at = now()
  where id = open_episode_id
    and user_id = target_user_id
    and pet_id = target_pet_id
    and status = 'open';

  return open_episode_id;
end;
$$;

revoke all on function public.ensure_open_episode(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ensure_open_episode(uuid, uuid, timestamptz)
  to service_role;

create or replace function public.assign_open_episode_to_health_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stored_episode_id uuid;
begin
  if new.user_id is null
    or new.pet_id is null
    or new.client_id is null
    or new.created_at is null
  then
    raise exception 'Valid report episode fields are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.pet_id::text, 0));

  -- Preserve the original episode for an idempotent duplicate request. The
  -- unique request constraint will decide which insert wins.
  select report.episode_id into stored_episode_id
  from public.health_reports report
  where report.user_id = new.user_id
    and report.client_id = new.client_id
  limit 1;

  if stored_episode_id is not null then
    new.episode_id := stored_episode_id;
    return new;
  end if;

  -- Run the episode choice inside the report INSERT transaction. The API also
  -- calls ensure_open_episode before inserting, but a hospital-guidance save
  -- could otherwise close that episode in the gap between the two requests.
  new.episode_id := public.ensure_open_episode(
    new.user_id,
    new.pet_id,
    new.created_at
  );
  return new;
end;
$$;

revoke all on function public.assign_open_episode_to_health_report()
  from public, anon, authenticated, service_role;

drop trigger if exists health_reports_assign_open_episode
  on public.health_reports;
create trigger health_reports_assign_open_episode
before insert on public.health_reports
for each row
execute function public.assign_open_episode_to_health_report();

create or replace function public.save_user_reported_episode_plan(
  target_user_id uuid,
  target_episode_id uuid,
  task_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_pet_id uuid;
  target_last_activity_at timestamptz;
  saved_plan_id uuid;
  task_count integer;
  guidance_reported_at timestamptz := now();
begin
  if target_user_id is null or target_episode_id is null then
    raise exception 'Valid plan ownership fields are required';
  end if;

  if task_items is null or jsonb_typeof(task_items) <> 'array' then
    raise exception 'Plan tasks must be an array';
  end if;

  task_count := jsonb_array_length(task_items);
  if task_count < 1 or task_count > 5 then
    raise exception 'A plan must contain between 1 and 5 tasks';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(task_items) item
    where char_length(btrim(item)) not between 1 and 160
  ) then
    raise exception 'Each plan task must contain between 1 and 160 characters';
  end if;

  select pet_id into target_pet_id
  from public.episodes
  where id = target_episode_id and user_id = target_user_id;

  if target_pet_id is null then
    raise exception 'Episode ownership could not be verified';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_pet_id::text, 0));

  select pet_id, last_activity_at
  into target_pet_id, target_last_activity_at
  from public.episodes
  where id = target_episode_id and user_id = target_user_id
  for update;

  if target_pet_id is null then
    raise exception 'Episode ownership could not be verified';
  end if;

  insert into public.episode_plans (
    user_id,
    pet_id,
    episode_id,
    source_type,
    review_status,
    reported_at,
    updated_at
  ) values (
    target_user_id,
    target_pet_id,
    target_episode_id,
    'owner',
    'user_reported',
    guidance_reported_at,
    guidance_reported_at
  )
  on conflict (episode_id) do update set
    source_type = 'owner',
    review_status = 'user_reported',
    reported_at = excluded.reported_at,
    updated_at = excluded.updated_at
  returning id into saved_plan_id;

  delete from public.plan_tasks where plan_id = saved_plan_id;

  insert into public.plan_tasks (plan_id, task_text, position)
  select saved_plan_id, btrim(item), (ordinality - 1)::smallint
  from jsonb_array_elements_text(task_items)
    with ordinality as tasks(item, ordinality);

  update public.episodes
  set status = 'closed',
      last_activity_at = greatest(target_last_activity_at, guidance_reported_at),
      closed_at = greatest(target_last_activity_at, guidance_reported_at),
      updated_at = guidance_reported_at
  where id = target_episode_id
    and user_id = target_user_id
    and pet_id = target_pet_id
    and status = 'open';

  return saved_plan_id;
end;
$$;

revoke all on function public.save_user_reported_episode_plan(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_user_reported_episode_plan(uuid, uuid, jsonb)
  to service_role;

-- Establish the same invariant for data saved before this migration. When an
-- old open episode contains observations dated after its hospital guidance,
-- retain the guidance on the closed visit and move those later observations
-- (and their media metadata) to one fresh open episode. Observations whose
-- entered-at time was never stored cannot be inferred beyond created_at.
do $$
declare
  boundary record;
  next_episode_id uuid;
  refreshed_started_at timestamptz;
  refreshed_reported_at timestamptz;
  refreshed_first_activity_at timestamptz;
  refreshed_last_activity_at timestamptz;
begin
  -- Fence direct SQL writers as well as the RPC paths that honor advisory
  -- locks. These table locks are acquired before the cursor opens and remain
  -- held for the entire DO statement/transaction, so its boundary snapshot,
  -- source-revision bump, result invalidation, and row move are atomic with
  -- respect to INSERT, UPDATE, and DELETE on every affected source table.
  lock table
    public.episodes,
    public.episode_plans,
    public.plan_tasks,
    public.health_reports,
    public.health_report_media,
    public.ai_report_usage
  in share row exclusive mode;

  for boundary in
    select
      episode.id,
      episode.user_id,
      episode.pet_id
    from public.episodes episode
    join lateral (
      select max(plan.reported_at) as reported_at
      from public.episode_plans plan
      where plan.episode_id = episode.id
    ) plan_boundary on plan_boundary.reported_at is not null
    where episode.status = 'open'
    order by episode.pet_id
  loop
    -- Match the live write-path lock order, then refresh every boundary value
    -- after waiting. This prevents a report or guidance save from racing the
    -- one-time data move while the migration is running.
    perform pg_advisory_xact_lock(hashtextextended(boundary.pet_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(boundary.user_id::text, 0));

    refreshed_started_at := null;
    select episode.started_at
    into refreshed_started_at
    from public.episodes episode
    where episode.id = boundary.id
      and episode.user_id = boundary.user_id
      and episode.pet_id = boundary.pet_id
      and episode.status = 'open'
    for update;

    if refreshed_started_at is null then
      continue;
    end if;

    select max(plan.reported_at)
    into refreshed_reported_at
    from public.episode_plans plan
    where plan.episode_id = boundary.id
      and plan.user_id = boundary.user_id
      and plan.pet_id = boundary.pet_id;

    if refreshed_reported_at is null then
      continue;
    end if;

    select min(report.created_at), max(report.created_at)
    into refreshed_first_activity_at, refreshed_last_activity_at
    from public.health_reports report
    where report.episode_id = boundary.id
      and report.user_id = boundary.user_id
      and report.pet_id = boundary.pet_id
      and report.created_at > refreshed_reported_at;

    update public.episodes
    set status = 'closed',
        last_activity_at = greatest(refreshed_started_at, refreshed_reported_at),
        closed_at = greatest(refreshed_started_at, refreshed_reported_at),
        source_revision = source_revision + 1,
        updated_at = now()
    where id = boundary.id
      and user_id = boundary.user_id
      and pet_id = boundary.pet_id
      and status = 'open';

    -- A draft made before the boundary repair may contain records that are
    -- about to move. Retain the audit row but make its result unrecoverable.
    update public.ai_report_usage
    set status = case when status = 'pending' then 'failed' else status end,
        result = null,
        error_code = 'source_changed',
        reservation_updated_at = now()
    where user_id = boundary.user_id
      and pet_id = boundary.pet_id
      and episode_id = boundary.id
      and access_mode = 'free_daily'
      and (status = 'pending' or result is not null);

    if refreshed_first_activity_at is not null then
      next_episode_id := gen_random_uuid();
      insert into public.episodes (
        id,
        user_id,
        pet_id,
        status,
        started_at,
        last_activity_at,
        created_at,
        updated_at
      ) values (
        next_episode_id,
        boundary.user_id,
        boundary.pet_id,
        'open',
        refreshed_first_activity_at,
        refreshed_last_activity_at,
        refreshed_first_activity_at,
        now()
      );

      update public.health_reports
      set episode_id = next_episode_id
      where episode_id = boundary.id
        and user_id = boundary.user_id
        and pet_id = boundary.pet_id
        and created_at > refreshed_reported_at;

      update public.health_report_media media
      set episode_id = next_episode_id
      where media.episode_id = boundary.id
        and media.user_id = boundary.user_id
        and media.pet_id = boundary.pet_id
        and exists (
          select 1
          from public.health_reports report
          where report.id = media.report_id
            and report.user_id = media.user_id
            and report.episode_id = next_episode_id
        );
    end if;
  end loop;
end;
$$;

comment on table public.episodes is
  'Server-managed visit-preparation flows. Saving owner-reported hospital guidance closes a flow automatically; the next observation opens a new one.';
comment on table public.episode_plans is
  'One editable owner-reported hospital guidance snapshot per automatically bounded episode. Guidance from prior episodes remains preserved.';
