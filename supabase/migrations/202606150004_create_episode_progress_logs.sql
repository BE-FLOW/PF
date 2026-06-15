create table if not exists public.episode_progress_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null,
  episode_id uuid not null,
  follow_up_day smallint not null check (follow_up_day in (3, 7, 14)),
  condition_change text not null
    check (condition_change in ('better', 'same', 'worse')),
  appetite text not null
    check (appetite in ('normal', 'slight', 'low', 'none')),
  energy text not null
    check (energy in ('normal', 'slight', 'low', 'none')),
  source_type text not null default 'owner'
    check (source_type = 'owner'),
  review_status text not null default 'unreviewed'
    check (review_status = 'unreviewed'),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episode_progress_logs_episode_day_key
    unique (episode_id, follow_up_day),
  constraint episode_progress_logs_pet_owner_fkey
    foreign key (pet_id, user_id)
    references public.pets (id, user_id)
    on delete cascade,
  constraint episode_progress_logs_episode_owner_fkey
    foreign key (episode_id, user_id, pet_id)
    references public.episodes (id, user_id, pet_id)
    on delete cascade
);

create index if not exists episode_progress_logs_user_pet_recorded_idx
  on public.episode_progress_logs (user_id, pet_id, recorded_at desc);

alter table public.episode_progress_logs enable row level security;

revoke all on table public.episode_progress_logs from anon, authenticated;
grant select, insert, update, delete on table public.episode_progress_logs
  to service_role;

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
  if target_follow_up_day not in (3, 7, 14) then
    raise exception 'Follow-up day must be 3, 7, or 14';
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
  saved_plan_id uuid;
  task_count integer;
begin
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
    now(),
    now()
  )
  on conflict (episode_id) do update set
    updated_at = excluded.updated_at
  returning id into saved_plan_id;

  delete from public.plan_tasks where plan_id = saved_plan_id;

  insert into public.plan_tasks (plan_id, task_text, position)
  select saved_plan_id, btrim(item), (ordinality - 1)::smallint
  from jsonb_array_elements_text(task_items) with ordinality as tasks(item, ordinality);

  return saved_plan_id;
end;
$$;

revoke all on function public.save_user_reported_episode_plan(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_user_reported_episode_plan(uuid, uuid, jsonb)
  to service_role;

comment on table public.episode_progress_logs is
  'Structured owner follow-up observations for the 3, 7, and 14 day checkpoints of one health episode.';
comment on column public.episode_progress_logs.review_status is
  'Owner-entered follow-up that has not been reviewed or confirmed by a veterinarian in PetFlow.';
