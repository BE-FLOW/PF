-- Keep already-installed clients usable while new clients move to server-signed uploads.
-- Every legacy object path must still resolve to a pet or report owned by auth.uid().

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
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.health_reports report
      where report.user_id = (select auth.uid())
        and report.pet_id::text = (storage.foldername(name))[2]
        and report.id::text = (storage.foldername(name))[3]
    )
  );

create policy "Owners can read PetFlow report media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'petflow-report-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.health_reports report
      where report.user_id = (select auth.uid())
        and report.pet_id::text = (storage.foldername(name))[2]
        and report.id::text = (storage.foldername(name))[3]
    )
  );

create policy "Owners can delete PetFlow report media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'petflow-report-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.health_reports report
      where report.user_id = (select auth.uid())
        and report.pet_id::text = (storage.foldername(name))[2]
        and report.id::text = (storage.foldername(name))[3]
    )
  );

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
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.pets pet
      where pet.user_id = (select auth.uid())
        and pet.id::text = (storage.foldername(name))[2]
    )
  );

create policy "Owners can read PetFlow pet photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'petflow-pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.pets pet
      where pet.user_id = (select auth.uid())
        and pet.id::text = (storage.foldername(name))[2]
    )
  );

create policy "Owners can update PetFlow pet photos"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'petflow-pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.pets pet
      where pet.user_id = (select auth.uid())
        and pet.id::text = (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'petflow-pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.pets pet
      where pet.user_id = (select auth.uid())
        and pet.id::text = (storage.foldername(name))[2]
    )
  );

create policy "Owners can delete PetFlow pet photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'petflow-pet-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.pets pet
      where pet.user_id = (select auth.uid())
        and pet.id::text = (storage.foldername(name))[2]
    )
  );
