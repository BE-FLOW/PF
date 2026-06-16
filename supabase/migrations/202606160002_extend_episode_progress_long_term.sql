alter table public.episode_progress_logs
  drop constraint if exists episode_progress_logs_follow_up_day_check;

alter table public.episode_progress_logs
  add constraint episode_progress_logs_follow_up_day_check
  check (follow_up_day in (3, 7, 14, 30, 60, 90));

create or replace function public.save_owner_episode_progress(
  target_user_id uuid,
  target_episode_id uuid,
  target_follow_up_day smallint,
  target_condition_change text,
  target_appetite text,
  target_energy text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_pet_id uuid;
  saved_progress_id uuid;
begin
  if target_follow_up_day not in (3, 7, 14, 30, 60, 90) then
    raise exception 'Follow-up day must be 3, 7, 14, 30, 60, or 90';
  end if;
  if target_condition_change not in ('better', 'same', 'worse') then
    raise exception 'Condition change is invalid';
  end if;
  if target_appetite not in ('normal', 'slight', 'low', 'none') then
    raise exception 'Appetite value is invalid';
  end if;
  if target_energy not in ('normal', 'slight', 'low', 'none') then
    raise exception 'Energy value is invalid';
  end if;

  select pet_id into target_pet_id
  from public.episodes
  where id = target_episode_id and user_id = target_user_id;

  if target_pet_id is null then
    raise exception 'Episode ownership could not be verified';
  end if;

  insert into public.episode_progress_logs (
    user_id,
    pet_id,
    episode_id,
    follow_up_day,
    condition_change,
    appetite,
    energy,
    source_type,
    review_status,
    recorded_at,
    updated_at
  ) values (
    target_user_id,
    target_pet_id,
    target_episode_id,
    target_follow_up_day,
    target_condition_change,
    target_appetite,
    target_energy,
    'owner',
    'unreviewed',
    now(),
    now()
  )
  on conflict (episode_id, follow_up_day) do update set
    condition_change = excluded.condition_change,
    appetite = excluded.appetite,
    energy = excluded.energy,
    source_type = 'owner',
    review_status = 'unreviewed',
    recorded_at = excluded.recorded_at,
    updated_at = excluded.updated_at
  returning id into saved_progress_id;

  update public.episodes
  set last_activity_at = greatest(last_activity_at, now()),
      updated_at = now()
  where id = target_episode_id and user_id = target_user_id;

  return saved_progress_id;
end;
$$;

revoke all on function public.save_owner_episode_progress(
  uuid,
  uuid,
  smallint,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.save_owner_episode_progress(
  uuid,
  uuid,
  smallint,
  text,
  text,
  text
) to service_role;

comment on table public.episode_progress_logs is
  'Structured owner follow-up observations for the 3, 7, 14, 30, 60, and 90 day checkpoints of one health episode.';
