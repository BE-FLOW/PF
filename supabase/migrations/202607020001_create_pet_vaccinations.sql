create table if not exists public.pet_vaccinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null,
  vaccine_name text not null check (char_length(vaccine_name) between 1 and 80),
  administered_at date,
  due_at date,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'done')),
  note text not null default '' check (char_length(note) <= 240),
  source_type text not null default 'owner' check (source_type = 'owner'),
  review_status text not null default 'user_reported'
    check (review_status = 'user_reported'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_vaccinations_has_date
    check (administered_at is not null or due_at is not null),
  constraint pet_vaccinations_pet_owner_fkey
    foreign key (pet_id, user_id)
    references public.pets (id, user_id)
    on delete cascade
);

create index if not exists pet_vaccinations_user_pet_due_idx
  on public.pet_vaccinations (user_id, pet_id, due_at asc nulls last);

create index if not exists pet_vaccinations_user_pet_administered_idx
  on public.pet_vaccinations (user_id, pet_id, administered_at desc nulls last);

create or replace function public.set_pet_vaccination_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pet_vaccination_updated_at on public.pet_vaccinations;
create trigger set_pet_vaccination_updated_at
  before update on public.pet_vaccinations
  for each row
  execute function public.set_pet_vaccination_updated_at();

alter table public.pet_vaccinations enable row level security;

grant select, insert, update, delete on table public.pet_vaccinations to authenticated;
grant select, insert, update, delete on table public.pet_vaccinations to service_role;

drop policy if exists "Users can view their pet vaccinations" on public.pet_vaccinations;
create policy "Users can view their pet vaccinations"
  on public.pet_vaccinations for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their pet vaccinations" on public.pet_vaccinations;
create policy "Users can create their pet vaccinations"
  on public.pet_vaccinations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their pet vaccinations" on public.pet_vaccinations;
create policy "Users can update their pet vaccinations"
  on public.pet_vaccinations for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their pet vaccinations" on public.pet_vaccinations;
create policy "Users can delete their pet vaccinations"
  on public.pet_vaccinations for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.pet_vaccinations is
  'Owner-entered vaccination records and due dates for quiet hospital reminders. PetFlow stores schedules but does not recommend medical protocols.';
comment on column public.pet_vaccinations.source_type is
  'The person who entered the vaccination record. v0.4 accepts owner-entered content only.';
comment on column public.pet_vaccinations.review_status is
  'Vaccination records are user-reported unless a later workflow explicitly confirms them.';
