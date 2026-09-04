begin;

create table if not exists public.pet_preventive_care (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null,
  category text not null,
  completed_on date not null,
  completed_month date generated always as (
    make_date(
      extract(year from completed_on)::integer,
      extract(month from completed_on)::integer,
      1
    )
  ) stored,
  note text not null default '',
  source_type text not null default 'owner',
  review_status text not null default 'user_reported',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_preventive_care_category_check
    check (category in ('heartworm', 'internal_external_parasite')),
  constraint pet_preventive_care_note_length_check
    check (char_length(note) <= 240),
  constraint pet_preventive_care_source_type_check
    check (source_type = 'owner'),
  constraint pet_preventive_care_review_status_check
    check (review_status = 'user_reported'),
  constraint pet_preventive_care_pet_owner_fkey
    foreign key (pet_id, user_id)
    references public.pets (id, user_id)
    on delete cascade,
  constraint pet_preventive_care_month_unique
    unique (pet_id, category, completed_month)
);

create index if not exists pet_preventive_care_user_pet_completed_idx
  on public.pet_preventive_care (user_id, pet_id, completed_on desc);

create or replace function public.set_pet_preventive_care_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pet_preventive_care_updated_at
  on public.pet_preventive_care;
create trigger set_pet_preventive_care_updated_at
  before update on public.pet_preventive_care
  for each row
  execute function public.set_pet_preventive_care_updated_at();

alter table public.pet_preventive_care enable row level security;
alter table public.pet_preventive_care force row level security;

grant select, insert, update, delete
  on table public.pet_preventive_care
  to authenticated;
grant select, insert, update, delete
  on table public.pet_preventive_care
  to service_role;

drop policy if exists "Users can view their pet preventive care"
  on public.pet_preventive_care;
create policy "Users can view their pet preventive care"
  on public.pet_preventive_care for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their pet preventive care"
  on public.pet_preventive_care;
create policy "Users can create their pet preventive care"
  on public.pet_preventive_care for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their pet preventive care"
  on public.pet_preventive_care;
create policy "Users can update their pet preventive care"
  on public.pet_preventive_care for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their pet preventive care"
  on public.pet_preventive_care;
create policy "Users can delete their pet preventive care"
  on public.pet_preventive_care for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.pet_preventive_care is
  'Owner-entered monthly completion notes for heartworm and internal/external parasite care. Calendar check-ins are recordkeeping prompts, not medical schedules.';
comment on column public.pet_preventive_care.completed_month is
  'Generated calendar month used to keep one owner-entered completion per pet and category each month.';
comment on column public.pet_preventive_care.source_type is
  'The person who entered the completion. The current flow accepts owner-entered content only.';
comment on column public.pet_preventive_care.review_status is
  'Preventive-care completions remain user-reported unless a later verified workflow is introduced.';

commit;
