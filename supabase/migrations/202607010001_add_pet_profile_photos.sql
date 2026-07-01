insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'petflow-pet-photos',
  'petflow-pet-photos',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners can upload PetFlow pet photos"
  on storage.objects;
drop policy if exists "Owners can read PetFlow pet photos"
  on storage.objects;
drop policy if exists "Owners can update PetFlow pet photos"
  on storage.objects;
drop policy if exists "Owners can delete PetFlow pet photos"
  on storage.objects;

create policy "Owners can upload PetFlow pet photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'petflow-pet-photos'
    and name like ((select auth.uid())::text || '/%')
  );

create policy "Owners can read PetFlow pet photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'petflow-pet-photos'
    and name like ((select auth.uid())::text || '/%')
  );

create policy "Owners can update PetFlow pet photos"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'petflow-pet-photos'
    and name like ((select auth.uid())::text || '/%')
  )
  with check (
    bucket_id = 'petflow-pet-photos'
    and name like ((select auth.uid())::text || '/%')
  );

create policy "Owners can delete PetFlow pet photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'petflow-pet-photos'
    and name like ((select auth.uid())::text || '/%')
  );

alter table public.pets
  add column if not exists photo_path text;

alter table public.pets
  drop constraint if exists pets_photo_path_length_check;

alter table public.pets
  add constraint pets_photo_path_length_check
  check (photo_path is null or char_length(photo_path) between 1 and 320);

comment on column public.pets.photo_path is
  'Private Supabase Storage path for an optional pet profile photo.';
