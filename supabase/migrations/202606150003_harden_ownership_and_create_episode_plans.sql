do $$
begin
  if exists (
    select 1
    from public.tester_profiles
    where phone is null or phone_consented_at is null
  ) then
    raise exception 'Complete tester phone consent before applying this migration';
  end if;
end;
$$;

alter table public.tester_profiles
  alter column phone set not null,
  alter column phone_consented_at set not null;

alter table public.tester_profiles
  drop constraint if exists tester_profiles_phone_format_check;

alter table public.tester_profiles
  add constraint tester_profiles_phone_format_check
  check (phone ~ '^010[0-9]{8}$');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pets_id_user_id_key'
  ) then
    alter table public.pets
      add constraint pets_id_user_id_key unique (id, user_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'episodes_id_user_id_pet_id_key'
  ) then
    alter table public.episodes
      add constraint episodes_id_user_id_pet_id_key unique (id, user_id, pet_id);
  end if;
end;
$$;

alter table public.episodes
  drop constraint if exists episodes_pet_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'episodes_pet_owner_fkey'
  ) then
    alter table public.episodes
      add constraint episodes_pet_owner_fkey
      foreign key (pet_id, user_id)
      references public.pets (id, user_id)
      on delete cascade;
  end if;
end;
$$;

alter table public.health_reports
  drop constraint if exists health_reports_user_id_fkey,
  drop constraint if exists health_reports_pet_id_fkey,
  drop constraint if exists health_reports_episode_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'health_reports_account_link_check'
  ) then
    alter table public.health_reports
      add constraint health_reports_account_link_check check (
        (user_id is null and pet_id is null and episode_id is null)
        or (user_id is not null and pet_id is not null and episode_id is not null)
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'health_reports_user_id_fkey'
  ) then
    alter table public.health_reports
      add constraint health_reports_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'health_reports_pet_owner_fkey'
  ) then
    alter table public.health_reports
      add constraint health_reports_pet_owner_fkey
      foreign key (pet_id, user_id)
      references public.pets (id, user_id)
      match full
      on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'health_reports_episode_owner_fkey'
  ) then
    alter table public.health_reports
      add constraint health_reports_episode_owner_fkey
      foreign key (episode_id, user_id, pet_id)
      references public.episodes (id, user_id, pet_id)
      match full
      on delete cascade;
  end if;
end;
$$;

create table if not exists public.episode_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null,
  episode_id uuid not null,
  source_type text not null default 'owner'
    check (source_type = 'owner'),
  review_status text not null default 'user_reported'
    check (review_status = 'user_reported'),
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episode_plans_episode_key unique (episode_id),
  constraint episode_plans_pet_owner_fkey
    foreign key (pet_id, user_id)
    references public.pets (id, user_id)
    on delete cascade,
  constraint episode_plans_episode_owner_fkey
    foreign key (episode_id, user_id, pet_id)
    references public.episodes (id, user_id, pet_id)
    on delete cascade
);

create table if not exists public.plan_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.episode_plans(id) on delete cascade,
  task_text text not null check (char_length(task_text) between 1 and 160),
  position smallint not null check (position between 0 and 4),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_tasks_plan_position_key unique (plan_id, position)
);

create index if not exists episode_plans_user_pet_reported_idx
  on public.episode_plans (user_id, pet_id, reported_at desc);

create index if not exists plan_tasks_plan_position_idx
  on public.plan_tasks (plan_id, position);

alter table public.episode_plans enable row level security;
alter table public.plan_tasks enable row level security;

revoke all on table public.episode_plans from anon, authenticated;
revoke all on table public.plan_tasks from anon, authenticated;
grant select, insert, update, delete on table public.episode_plans to service_role;
grant select, insert, update, delete on table public.plan_tasks to service_role;

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

create or replace function public.set_plan_task_completion(
  target_user_id uuid,
  target_episode_id uuid,
  target_task_id uuid,
  is_completed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.plan_tasks task
  set completed_at = case when is_completed then now() else null end,
      updated_at = now()
  from public.episode_plans plan
  where task.id = target_task_id
    and task.plan_id = plan.id
    and plan.episode_id = target_episode_id
    and plan.user_id = target_user_id;

  return found;
end;
$$;

revoke all on function public.save_user_reported_episode_plan(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_user_reported_episode_plan(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.set_plan_task_completion(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_plan_task_completion(uuid, uuid, uuid, boolean)
  to service_role;

comment on table public.episode_plans is
  'Owner-entered hospital guidance linked to one health episode. It is never veterinarian-confirmed by default.';
comment on table public.plan_tasks is
  'Small, checkable actions copied by the owner from hospital guidance.';
comment on column public.episode_plans.source_type is
  'The person who entered the plan. v0.3 accepts owner-entered content only.';
comment on column public.episode_plans.review_status is
  'Owner-reported content that has not been confirmed by a veterinarian in PetFlow.';
comment on table public.health_reports is
  'Structured PetFlow observations. Anonymous test rows stay unlinked; account rows are bound to one owned pet and episode.';
