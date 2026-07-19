-- 010 · Storage buckets + storage.objects policies
-- (ARCH §4.3 · securities.md §8 · development-plan.md §12)
--
-- Buckets in Phase 0:
--   content-media      public   study/blog images (auto-WebP, ≤2 MB post-compress)
--   avatars            public   user avatars (client crop → WebP 512px, ≤1 MB)
--   covers             public   blog covers / OG assets
--   verification-docs  PRIVATE  license/degree scans (≤5 MB, 90-day purge)
-- resume-photos (private, owner-scoped) lands with the Phase-3 migrations.
--
-- MIME allow-lists are a coarse first gate only — server-side type sniffing
-- remains mandatory at upload time (the extension is not trust).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('content-media', 'content-media', true, 2097152,
   array['image/png', 'image/jpeg', 'image/webp']),
  ('avatars', 'avatars', true, 1048576,
   array['image/webp']),
  ('covers', 'covers', true, 5242880,
   array['image/png', 'image/jpeg', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 5242880,
   array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- storage.objects policies (RLS is already enabled by Supabase)
-- ---------------------------------------------------------------------------

-- Public read of the three public buckets (listing + direct API reads; the
-- CDN path serves public buckets regardless, this keeps PostgREST consistent).
create policy "epharmatica_public_buckets_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('content-media', 'avatars', 'covers'));

-- content-media: content staff manage study/blog media via the M4 media
-- library (usage-tracked; deletes blocked while referenced — app-enforced).
create policy "epharmatica_content_media_staff_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'content-media'
    and public.has_role(array['author', 'content_manager', 'admin', 'super_admin'])
  );

create policy "epharmatica_content_media_staff_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'content-media'
    and public.has_role(array['author', 'content_manager', 'admin', 'super_admin'])
  )
  with check (
    bucket_id = 'content-media'
    and public.has_role(array['author', 'content_manager', 'admin', 'super_admin'])
  );

create policy "epharmatica_content_media_staff_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'content-media'
    and public.has_role(array['author', 'content_manager', 'admin', 'super_admin'])
  );

-- covers: blog editorial staff.
create policy "epharmatica_covers_staff_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'covers'
    and public.has_role(array['blog_editor', 'content_manager', 'admin', 'super_admin'])
  );

create policy "epharmatica_covers_staff_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'covers'
    and public.has_role(array['blog_editor', 'content_manager', 'admin', 'super_admin'])
  )
  with check (
    bucket_id = 'covers'
    and public.has_role(array['blog_editor', 'content_manager', 'admin', 'super_admin'])
  );

create policy "epharmatica_covers_staff_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'covers'
    and public.has_role(array['blog_editor', 'content_manager', 'admin', 'super_admin'])
  );

-- avatars: owner-scoped path {user_id}/… — write-then-swap needs
-- insert + update + delete for the owner (M2 §4.5).
create policy "epharmatica_avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "epharmatica_avatars_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "epharmatica_avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- verification-docs: PRIVATE. Owners upload into their own folder
-- {user_id}/… (the /verify-pharmacist flow, Phase 2 — bucket + policies
-- exist now so securities.md §8 holds from day one). Reads: the support
-- verification queue only (staff-only signed URLs are minted with the
-- service role; this select policy covers direct staff API reads). No owner
-- read-back, no update, no delete — the 90-day purge cron runs as service
-- role.
create policy "epharmatica_verification_docs_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "epharmatica_verification_docs_staff_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and public.has_role(array['support', 'admin', 'super_admin'])
  );
