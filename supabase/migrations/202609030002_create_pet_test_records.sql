begin;

create table if not exists public.pet_test_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null,
  episode_id uuid,
  tested_at date not null,
  test_name text not null,
  result_text text not null,
  clinic_name text,
  memo text,
  source_type text not null default 'owner'
    check (source_type = 'owner'),
  review_status text not null default 'user_reported'
    check (review_status = 'user_reported'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_test_records_test_name_check check (
    test_name = btrim(test_name)
    and char_length(test_name) between 1 and 120
  ),
  constraint pet_test_records_result_text_check check (
    result_text = btrim(result_text)
    and char_length(result_text) between 1 and 1000
  ),
  constraint pet_test_records_clinic_name_check check (
    clinic_name is null
    or (
      clinic_name = btrim(clinic_name)
      and char_length(clinic_name) between 1 and 120
    )
  ),
  constraint pet_test_records_memo_check check (
    memo is null
    or (
      memo = btrim(memo)
      and char_length(memo) between 1 and 1000
    )
  ),
  constraint pet_test_records_pet_owner_fkey
    foreign key (pet_id, user_id)
    references public.pets (id, user_id)
    on delete cascade,
  constraint pet_test_records_episode_owner_fkey
    foreign key (episode_id, user_id, pet_id)
    references public.episodes (id, user_id, pet_id)
    on delete cascade
);

create index if not exists pet_test_records_user_pet_tested_idx
  on public.pet_test_records (
    user_id,
    pet_id,
    tested_at desc,
    created_at desc
  );

create index if not exists pet_test_records_episode_tested_idx
  on public.pet_test_records (episode_id, tested_at desc)
  where episode_id is not null;

create or replace function public.set_pet_test_record_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pet_test_record_updated_at
  on public.pet_test_records;
create trigger set_pet_test_record_updated_at
  before update on public.pet_test_records
  for each row
  execute function public.set_pet_test_record_updated_at();

alter table public.pet_test_records enable row level security;
alter table public.pet_test_records force row level security;

grant select, insert, update, delete
  on table public.pet_test_records to authenticated;
grant select, insert, update, delete
  on table public.pet_test_records to service_role;

drop policy if exists "Users can view their pet test records"
  on public.pet_test_records;
create policy "Users can view their pet test records"
  on public.pet_test_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their pet test records"
  on public.pet_test_records;
create policy "Users can create their pet test records"
  on public.pet_test_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their pet test records"
  on public.pet_test_records;
create policy "Users can update their pet test records"
  on public.pet_test_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their pet test records"
  on public.pet_test_records;
create policy "Users can delete their pet test records"
  on public.pet_test_records for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.pet_test_records is
  'Owner-entered factual pet test records. PetFlow stores the entered test name and result text without diagnosing or interpreting them.';
comment on column public.pet_test_records.episode_id is
  'Optional visit-preparation flow link. A linked episode must belong to the same owner and pet.';
comment on column public.pet_test_records.result_text is
  'Result text entered by the owner; it is not an AI or veterinarian interpretation.';
comment on column public.pet_test_records.source_type is
  'The person who entered the test record. The current app accepts owner-entered content only.';
comment on column public.pet_test_records.review_status is
  'Owner-reported content that PetFlow has not verified with a veterinarian.';

commit;
