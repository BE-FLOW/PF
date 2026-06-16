insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'petflow-report-media',
  'petflow-report-media',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners can upload PetFlow report media"
  on storage.objects;
drop policy if exists "Owners can read PetFlow report media"
  on storage.objects;
drop policy if exists "Owners can delete PetFlow report media"
  on storage.objects;

create policy "Owners can upload PetFlow report media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'petflow-report-media'
    and name like ((select auth.uid())::text || '/%')
  );

create policy "Owners can read PetFlow report media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'petflow-report-media'
    and name like ((select auth.uid())::text || '/%')
  );

create policy "Owners can delete PetFlow report media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'petflow-report-media'
    and name like ((select auth.uid())::text || '/%')
  );

create table if not exists public.health_report_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  client_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null,
  episode_id uuid not null,
  kind text not null check (kind in ('image', 'video')),
  file_name text not null check (char_length(file_name) between 1 and 160),
  mime_type text not null check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/quicktime',
      'video/webm'
    )
  ),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 52428800),
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint health_report_media_storage_path_key unique (storage_path),
  constraint health_report_media_report_fkey
    foreign key (report_id, client_id)
    references public.health_reports (id, client_id)
    on delete cascade,
  constraint health_report_media_pet_owner_fkey
    foreign key (pet_id, user_id)
    references public.pets (id, user_id)
    on delete cascade,
  constraint health_report_media_episode_owner_fkey
    foreign key (episode_id, user_id, pet_id)
    references public.episodes (id, user_id, pet_id)
    on delete cascade
);

create index if not exists health_report_media_report_created_idx
  on public.health_report_media (report_id, created_at asc);
create index if not exists health_report_media_episode_created_idx
  on public.health_report_media (episode_id, created_at asc);
create index if not exists health_report_media_user_pet_created_idx
  on public.health_report_media (user_id, pet_id, created_at desc);

alter table public.health_report_media enable row level security;

revoke all on table public.health_report_media from anon, authenticated;
grant select, insert, update, delete on table public.health_report_media to service_role;

comment on table public.health_report_media is
  'Owner-uploaded image and video attachment metadata for PetFlow health reports. Files are private Storage objects and are not AI-interpreted.';
