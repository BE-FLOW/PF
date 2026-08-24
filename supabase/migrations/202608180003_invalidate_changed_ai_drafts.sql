-- Stored AI drafts are recoverable only while every source row is unchanged.
-- A per-episode revision closes the race between reading a bundle, reserving an
-- AI request, and persisting its result. Source mutations also clear any older
-- stored draft so deleted or edited owner data cannot reappear in the UI.

create or replace function public.invalidate_free_ai_drafts_for_episode(
  target_user_id uuid,
  target_pet_id uuid,
  target_episode_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if target_user_id is null
    or target_pet_id is null
    or target_episode_id is null
  then
    raise exception 'Valid AI draft source ownership is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  update public.episodes
  set source_revision = source_revision + 1,
      updated_at = now()
  where id = target_episode_id
    and user_id = target_user_id
    and pet_id = target_pet_id;

  update public.ai_report_usage
  set status = case when status = 'pending' then 'failed' else status end,
      result = null,
      error_code = 'source_changed',
      reservation_updated_at = now()
  where user_id = target_user_id
    and pet_id = target_pet_id
    and episode_id = target_episode_id
    and access_mode = 'free_daily'
    and (status = 'pending' or result is not null);
end;
$$;

create or replace function public.invalidate_free_ai_drafts_for_pet()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_user_id uuid;
  target_pet_id uuid;
  episode_row record;
begin
  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
    target_pet_id := old.id;
  else
    target_user_id := new.user_id;
    target_pet_id := new.id;
  end if;
  for episode_row in
    select id
    from public.episodes
    where user_id = target_user_id and pet_id = target_pet_id
    order by id
  loop
    perform public.invalidate_free_ai_drafts_for_episode(
      target_user_id,
      target_pet_id,
      episode_row.id
    );
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.invalidate_free_ai_drafts_for_source_row()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.invalidate_free_ai_drafts_for_episode(
      old.user_id,
      old.pet_id,
      old.episode_id
    );
    return old;
  end if;
  if tg_op = 'UPDATE'
    and (old.user_id, old.pet_id, old.episode_id)
      is distinct from (new.user_id, new.pet_id, new.episode_id)
  then
    perform public.invalidate_free_ai_drafts_for_episode(
      old.user_id,
      old.pet_id,
      old.episode_id
    );
  end if;
  perform public.invalidate_free_ai_drafts_for_episode(
    new.user_id,
    new.pet_id,
    new.episode_id
  );
  return new;
end;
$$;

create or replace function public.invalidate_free_ai_drafts_for_plan_task()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target_plan_id uuid;
  plan_row record;
begin
  if tg_op = 'DELETE' then
    target_plan_id := old.plan_id;
  else
    target_plan_id := new.plan_id;
  end if;
  if tg_op = 'UPDATE' and old.plan_id is distinct from new.plan_id then
    select user_id, pet_id, episode_id
    into plan_row
    from public.episode_plans
    where id = old.plan_id;
    if plan_row.episode_id is not null then
      perform public.invalidate_free_ai_drafts_for_episode(
        plan_row.user_id,
        plan_row.pet_id,
        plan_row.episode_id
      );
    end if;
  end if;
  select user_id, pet_id, episode_id
  into plan_row
  from public.episode_plans
  where id = target_plan_id;

  if plan_row.episode_id is not null then
    perform public.invalidate_free_ai_drafts_for_episode(
      plan_row.user_id,
      plan_row.pet_id,
      plan_row.episode_id
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists pets_invalidate_free_ai_drafts on public.pets;
create trigger pets_invalidate_free_ai_drafts
after update of name, species, breed, birth_date, sex, weight
on public.pets
for each row execute function public.invalidate_free_ai_drafts_for_pet();

drop trigger if exists health_reports_invalidate_free_ai_drafts
  on public.health_reports;
create trigger health_reports_invalidate_free_ai_drafts
after insert or update or delete on public.health_reports
for each row execute function public.invalidate_free_ai_drafts_for_source_row();

drop trigger if exists health_report_media_invalidate_free_ai_drafts
  on public.health_report_media;
create trigger health_report_media_invalidate_free_ai_drafts
after insert or update or delete on public.health_report_media
for each row execute function public.invalidate_free_ai_drafts_for_source_row();

drop trigger if exists episode_plans_invalidate_free_ai_drafts
  on public.episode_plans;
create trigger episode_plans_invalidate_free_ai_drafts
after insert or update or delete on public.episode_plans
for each row execute function public.invalidate_free_ai_drafts_for_source_row();

drop trigger if exists plan_tasks_invalidate_free_ai_drafts
  on public.plan_tasks;
create trigger plan_tasks_invalidate_free_ai_drafts
after insert or update or delete on public.plan_tasks
for each row execute function public.invalidate_free_ai_drafts_for_plan_task();

drop trigger if exists episode_progress_invalidate_free_ai_drafts
  on public.episode_progress_logs;
create trigger episode_progress_invalidate_free_ai_drafts
after insert or update or delete on public.episode_progress_logs
for each row execute function public.invalidate_free_ai_drafts_for_source_row();

revoke all on function public.invalidate_free_ai_drafts_for_episode(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.invalidate_free_ai_drafts_for_pet()
  from public, anon, authenticated;
revoke all on function public.invalidate_free_ai_drafts_for_source_row()
  from public, anon, authenticated;
revoke all on function public.invalidate_free_ai_drafts_for_plan_task()
  from public, anon, authenticated;

comment on column public.episodes.source_revision is
  'Monotonic revision for report, media, plan, progress, and pet-profile facts used by a recoverable AI draft.';
comment on column public.ai_report_usage.source_revision is
  'Episode source revision reserved for this AI draft; stale revisions cannot complete or recover.';
comment on column public.ai_report_usage.attempt_count is
  'Model call attempts for one idempotent request, including failed retries.';
