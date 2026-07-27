begin;

-- Unowned MVP rows cannot be returned to a user and are unsafe to retain.
delete from public.health_reports
where user_id is null
   or pet_id is null
   or episode_id is null
   or is_test = true;

alter table public.health_reports
  add column if not exists owner_note text;

alter table public.health_reports
  drop constraint if exists health_reports_owner_note_length_check;

alter table public.health_reports
  add constraint health_reports_owner_note_length_check
  check (owner_note is null or char_length(owner_note) <= 1000);

alter table public.health_reports
  drop constraint if exists health_reports_account_link_check;

alter table public.health_reports
  alter column user_id set not null,
  alter column pet_id set not null,
  alter column episode_id set not null,
  drop column if exists is_test;

alter table public.health_reports
  drop constraint if exists health_reports_id_client_user_key;

alter table public.health_reports
  add constraint health_reports_id_client_user_key
  unique (id, client_id, user_id);

alter table public.health_report_feedback
  add column if not exists user_id uuid;

update public.health_report_feedback feedback
set user_id = report.user_id
from public.health_reports report
where report.id = feedback.report_id
  and report.client_id = feedback.client_id
  and feedback.user_id is null;

delete from public.health_report_feedback where user_id is null;

alter table public.health_report_feedback
  alter column user_id set not null,
  drop constraint if exists health_report_feedback_report_fkey,
  drop constraint if exists health_report_feedback_user_id_fkey,
  drop constraint if exists health_report_feedback_report_owner_fkey;

create temporary table duplicate_report_request_ids
on commit drop
as
select
  report.id,
  report.client_id as previous_client_id,
  gen_random_uuid() as replacement_client_id
from (
  select
    id,
    client_id,
    row_number() over (
      partition by user_id, client_id
      order by created_at, id
    ) as duplicate_number
  from public.health_reports
) report
where report.duplicate_number > 1;

update public.health_report_feedback feedback
set client_id = duplicate.replacement_client_id
from duplicate_report_request_ids duplicate
where feedback.report_id = duplicate.id
  and feedback.client_id = duplicate.previous_client_id;

update public.health_reports report
set client_id = duplicate.replacement_client_id
from duplicate_report_request_ids duplicate
where report.id = duplicate.id
  and report.client_id = duplicate.previous_client_id;

alter table public.health_reports
  drop constraint if exists health_reports_user_client_id_key;

alter table public.health_reports
  add constraint health_reports_user_client_id_key
  unique (user_id, client_id);

alter table public.health_report_feedback
  add constraint health_report_feedback_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  add constraint health_report_feedback_report_owner_fkey
    foreign key (report_id, client_id, user_id)
    references public.health_reports (id, client_id, user_id)
    on delete cascade;

drop view if exists public.account_deletion_management;

do $$
begin
  if exists (
    select 1
    from public.account_deletion_requests request
    join storage.objects object
      on object.name like (request.user_id::text || '/%')
    where request.status in ('requested', 'processing')
  ) then
    raise exception
      'Pending account deletion has storage objects; remove them through the Storage API first';
  end if;

  if exists (
    select 1
    from public.account_deletion_requests request
    where request.status = 'processing'
  ) then
    raise exception
      'An account deletion is still processing; finish it before removing the legacy queue';
  end if;
end;
$$;

delete from auth.users account
using public.account_deletion_requests request
where account.id = request.user_id
  and request.status = 'requested';

drop table if exists public.account_deletion_requests;

drop function if exists public.save_owner_episode_progress(
  uuid,
  uuid,
  smallint,
  text,
  text,
  text
);

drop policy if exists "Owners can upload PetFlow report media"
  on storage.objects;
drop policy if exists "Owners can upload PetFlow pet photos"
  on storage.objects;
drop policy if exists "Owners can update PetFlow pet photos"
  on storage.objects;

update public.pets
set name = coalesce(nullif(btrim(name), ''), '반려동물'),
    breed = nullif(btrim(breed), ''),
    weight = nullif(btrim(weight), ''),
    photo_path = case
      when photo_path is null
        or photo_path like (user_id::text || '/' || id::text || '/%')
      then photo_path
      else null
    end;

update public.tester_profiles
set nickname = coalesce(nullif(btrim(nickname), ''), '사용자');

alter table public.pets
  drop constraint if exists pets_name_trimmed_check,
  drop constraint if exists pets_breed_length_check,
  drop constraint if exists pets_weight_length_check,
  drop constraint if exists pets_photo_owner_path_check;

alter table public.pets
  add constraint pets_name_trimmed_check
    check (name = btrim(name)),
  add constraint pets_breed_length_check
    check (
      breed is null
      or (breed = btrim(breed) and char_length(breed) between 1 and 80)
    ),
  add constraint pets_weight_length_check
    check (
      weight is null
      or (weight = btrim(weight) and char_length(weight) between 1 and 30)
    ),
  add constraint pets_photo_owner_path_check
    check (
      photo_path is null
      or photo_path like (user_id::text || '/' || id::text || '/%')
    );

alter table public.tester_profiles
  drop constraint if exists tester_profiles_nickname_trimmed_check;

alter table public.tester_profiles
  add constraint tester_profiles_nickname_trimmed_check
    check (nickname = btrim(nickname));

alter table public.pets force row level security;
alter table public.tester_profiles force row level security;
alter table public.pet_vaccinations force row level security;
alter table public.episodes force row level security;
alter table public.health_reports force row level security;
alter table public.health_report_feedback force row level security;
alter table public.health_report_media force row level security;
alter table public.episode_plans force row level security;
alter table public.plan_tasks force row level security;
alter table public.episode_progress_logs force row level security;
alter table public.ai_report_usage force row level security;
alter table public.ai_report_feedback force row level security;

revoke insert, update, delete on table public.episodes from authenticated;
drop policy if exists "Users can create their episodes" on public.episodes;
drop policy if exists "Users can update their episodes" on public.episodes;
drop policy if exists "Users can delete their episodes" on public.episodes;

create or replace function public.reserve_ai_report_usage(
  target_user_id uuid,
  target_pet_id uuid,
  target_episode_id uuid,
  target_model text,
  target_monthly_report_limit integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reserved_usage_id uuid;
  used_this_month integer;
begin
  if target_user_id is null
    or target_pet_id is null
    or target_episode_id is null
    or target_monthly_report_limit is null
    or target_monthly_report_limit not between 1 and 100
    or target_model is null
    or char_length(btrim(target_model)) not between 1 and 120
  then
    raise exception 'Valid AI report reservation fields are required';
  end if;

  if not exists (
    select 1
    from public.episodes episode
    where episode.id = target_episode_id
      and episode.user_id = target_user_id
      and episode.pet_id = target_pet_id
  ) then
    raise exception 'AI report ownership could not be verified';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  update public.ai_report_usage usage
  set status = 'failed',
      error_code = 'reservation_timeout'
  where usage.user_id = target_user_id
    and usage.status = 'pending'
    and usage.created_at < now() - interval '5 minutes';

  select count(*)::integer
  into used_this_month
  from public.ai_report_usage usage
  where usage.user_id = target_user_id
    and usage.generated_at >= date_trunc('month', now())
    and usage.status in ('pending', 'succeeded');

  if used_this_month >= target_monthly_report_limit then
    return null;
  end if;

  insert into public.ai_report_usage (
    user_id,
    pet_id,
    episode_id,
    status,
    model
  ) values (
    target_user_id,
    target_pet_id,
    target_episode_id,
    'pending',
    btrim(target_model)
  )
  returning id into reserved_usage_id;

  return reserved_usage_id;
end;
$$;

revoke all on function public.reserve_ai_report_usage(
  uuid,
  uuid,
  uuid,
  text,
  integer
) from public, anon, authenticated;

grant execute on function public.reserve_ai_report_usage(
  uuid,
  uuid,
  uuid,
  text,
  integer
) to service_role;

comment on table public.health_reports is
  'Account-owned PetFlow observations. Raw owner notes are private and AI output is stored separately.';
comment on column public.health_reports.owner_note is
  'The owner-written observation attached to this record, limited to 1000 characters.';
comment on table public.health_report_feedback is
  'Feedback accepted only after the API verifies report ownership.';
comment on table public.episodes is
  'Server-managed chronology groups account-owned observations without a manual completion step.';

commit;
