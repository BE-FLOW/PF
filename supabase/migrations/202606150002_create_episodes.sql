create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint episodes_closed_state_check check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null)
  )
);

create index if not exists episodes_user_pet_activity_idx
  on public.episodes (user_id, pet_id, last_activity_at desc);

create unique index if not exists episodes_one_open_per_pet_idx
  on public.episodes (pet_id)
  where status = 'open';

alter table public.episodes enable row level security;

grant select, insert, update, delete on table public.episodes to authenticated;
grant select, insert, update, delete on table public.episodes to service_role;

drop policy if exists "Users can view their episodes" on public.episodes;
create policy "Users can view their episodes"
  on public.episodes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their episodes" on public.episodes;
create policy "Users can create their episodes"
  on public.episodes for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.pets
      where pets.id = pet_id and pets.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update their episodes" on public.episodes;
create policy "Users can update their episodes"
  on public.episodes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.pets
      where pets.id = pet_id and pets.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their episodes" on public.episodes;
create policy "Users can delete their episodes"
  on public.episodes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

alter table public.health_reports
  add column if not exists episode_id uuid
    references public.episodes(id) on delete set null;

create index if not exists health_reports_episode_created_at_idx
  on public.health_reports (episode_id, created_at asc);

do $$
declare
  report_row record;
  legacy_episode_id uuid;
begin
  for report_row in
    select id, client_id, user_id, pet_id, created_at
    from public.health_reports
    where episode_id is null
      and user_id is not null
      and pet_id is not null
  loop
    legacy_episode_id := gen_random_uuid();
    insert into public.episodes (
      id,
      user_id,
      pet_id,
      status,
      started_at,
      last_activity_at,
      closed_at,
      created_at,
      updated_at
    ) values (
      legacy_episode_id,
      report_row.user_id,
      report_row.pet_id,
      'closed',
      report_row.created_at,
      report_row.created_at,
      report_row.created_at,
      report_row.created_at,
      report_row.created_at
    );

    update public.health_reports
    set episode_id = legacy_episode_id
    where id = report_row.id and client_id = report_row.client_id;
  end loop;
end;
$$;

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
  if not exists (
    select 1
    from public.pets
    where id = target_pet_id and user_id = target_user_id
  ) then
    raise exception 'Pet ownership could not be verified';
  end if;

  select id into open_episode_id
  from public.episodes
  where pet_id = target_pet_id and status = 'open'
  limit 1;

  if open_episode_id is null then
    begin
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
    exception when unique_violation then
      select id into open_episode_id
      from public.episodes
      where pet_id = target_pet_id and status = 'open'
      limit 1;
    end;
  end if;

  update public.episodes
  set last_activity_at = greatest(last_activity_at, activity_at),
      updated_at = now()
  where id = open_episode_id;

  return open_episode_id;
end;
$$;

revoke all on function public.ensure_open_episode(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ensure_open_episode(uuid, uuid, timestamptz)
  to service_role;

comment on table public.episodes is
  'A pet health episode connecting owner observations, shared summaries, plans, and follow-up logs.';
comment on column public.health_reports.episode_id is
  'The episode that groups related owner observations. Anonymous reports may remain unlinked.';
