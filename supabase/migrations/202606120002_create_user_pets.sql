create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  species text not null check (species in ('dog', 'cat', 'other')),
  breed text,
  birth_date date,
  sex text not null default 'unknown'
    check (sex in ('unknown', 'male', 'female', 'neutered-male', 'spayed-female')),
  weight text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pets_user_id_created_at_idx
  on public.pets (user_id, created_at);

alter table public.pets enable row level security;

grant select, insert, update, delete on table public.pets to authenticated;
grant select, insert, update, delete on table public.pets to service_role;

drop policy if exists "Users can view their pets" on public.pets;
create policy "Users can view their pets"
  on public.pets for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their pets" on public.pets;
create policy "Users can create their pets"
  on public.pets for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their pets" on public.pets;
create policy "Users can update their pets"
  on public.pets for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their pets" on public.pets;
create policy "Users can delete their pets"
  on public.pets for delete
  to authenticated
  using ((select auth.uid()) = user_id);

alter table public.health_reports
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists pet_id uuid references public.pets(id) on delete set null;

create index if not exists health_reports_user_pet_created_at_idx
  on public.health_reports (user_id, pet_id, created_at desc);

comment on table public.pets is
  'Pet profiles owned by authenticated PetFlow users. Contact details are not stored here.';
