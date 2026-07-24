-- RLS probe suite · 00 — fixtures
-- Run as postgres against the migrated local stack (see tests/README.md).
-- Idempotent: deletes any previous fixture rows before re-inserting.
--
-- Fixture UUIDs (fixed so probes can reference them):
--   USER A   00000000-0000-4000-a000-000000000001  (role: user)
--   USER B   00000000-0000-4000-a000-000000000002  (role: user)
--   ADMIN    00000000-0000-4000-a000-000000000003  (role: admin)
--   AUTHOR   00000000-0000-4000-a000-000000000004  (role: author)
--   REVIEWER 00000000-0000-4000-a000-000000000005  (role: reviewer)
--   CM       00000000-0000-4000-a000-000000000006  (role: content_manager)
--   SUPER    00000000-0000-4000-a000-000000000007  (role: super_admin)
--   subject  f0000000-0000-4000-a000-000000000010
--   chapter  f0000000-0000-4000-a000-000000000011
--   topic    f0000000-0000-4000-a000-000000000012
--   subtopic published f0000000-0000-4000-a000-000000000013
--   subtopic draft     f0000000-0000-4000-a000-000000000014
--   topic 2 (move target) f0000000-0000-4000-a000-000000000015
--   preview link valid   f0000000-0000-4000-a000-000000000020  (token: rls-probe-preview-token)
--   preview link expired f0000000-0000-4000-a000-000000000021  (token: rls-probe-expired-token)
--   preview link revoked f0000000-0000-4000-a000-000000000022  (token: rls-probe-revoked-token)
--   media asset used     f0000000-0000-4000-a000-000000000030
--   media asset unused   f0000000-0000-4000-a000-000000000031
--   media asset deleted  f0000000-0000-4000-a000-000000000032

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Clean previous run (cascades take care of profiles + study data)
-- ---------------------------------------------------------------------------
delete from auth.users
 where id in ('00000000-0000-4000-a000-000000000001',
              '00000000-0000-4000-a000-000000000002',
              '00000000-0000-4000-a000-000000000003',
              '00000000-0000-4000-a000-000000000004',
              '00000000-0000-4000-a000-000000000005',
              '00000000-0000-4000-a000-000000000006',
              '00000000-0000-4000-a000-000000000007');

-- Cascades from subjects clear subtopics → preview_links / preview_link_opens
-- / media_refs / review_claims, which un-references media_assets (RESTRICT).
delete from public.subjects
 where id = 'f0000000-0000-4000-a000-000000000010';

delete from public.media_assets
 where path like 'rls-probe/%';

delete from public.slug_history
 where entity_id in ('f0000000-0000-4000-a000-000000000011',
                     'f0000000-0000-4000-a000-000000000012',
                     'f0000000-0000-4000-a000-000000000013',
                     'f0000000-0000-4000-a000-000000000014',
                     'f0000000-0000-4000-a000-000000000015');

delete from public.waitlist_signups
 where email = 'rls-probe@example.com';

delete from public.audit_log
 where action in ('rls_probe', 'rls_probe_aged');

delete from public.handle_quarantine
 where handle like 'rls-%';

-- ---------------------------------------------------------------------------
-- Auth users + profiles
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'rls-user-a@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated',
   'rls-user-b@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated',
   'rls-admin@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated',
   'rls-author@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated',
   'rls-reviewer@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated',
   'rls-cm@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-4000-a000-000000000007', 'authenticated', 'authenticated',
   'rls-super@example.com',
   extensions.crypt('password123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
   now(), now(), '', '', '', '');

insert into public.profiles (id, username, display_name, role, user_type, email_verified_at, prefs)
values
  ('00000000-0000-4000-a000-000000000001', 'rls-user-a', 'RLS User A',
   'user',  'student', now(), '{"theme":"light","text_size":1}'::jsonb),
  ('00000000-0000-4000-a000-000000000002', 'rls-user-b', 'RLS User B',
   'user',  'student', now(), '{"theme":"dark","text_size":2}'::jsonb),
  ('00000000-0000-4000-a000-000000000003', 'rls-admin',  'RLS Admin',
   'admin', 'other',   now(), '{}'::jsonb),
  ('00000000-0000-4000-a000-000000000004', 'rls-author', 'RLS Author',
   'author', 'other',  now(), '{}'::jsonb),
  ('00000000-0000-4000-a000-000000000005', 'rls-reviewer', 'RLS Reviewer',
   'reviewer', 'other', now(), '{}'::jsonb),
  ('00000000-0000-4000-a000-000000000006', 'rls-cm', 'RLS Content Manager',
   'content_manager', 'other', now(), '{}'::jsonb),
  ('00000000-0000-4000-a000-000000000007', 'rls-super', 'RLS Super Admin',
   'super_admin', 'other', now(), '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- Content fixture: one published + one draft subtopic
-- ---------------------------------------------------------------------------
insert into public.subjects (id, name, slug, sort_order)
values ('f0000000-0000-4000-a000-000000000010', 'RLS Probe Subject', 'rls-probe-subject', 999);

insert into public.chapters (id, subject_id, name, slug, sort_order)
values ('f0000000-0000-4000-a000-000000000011',
        'f0000000-0000-4000-a000-000000000010',
        'RLS Probe Chapter', 'rls-probe-chapter', 1);

insert into public.topics (id, chapter_id, name, slug, description, semester, sort_order)
values ('f0000000-0000-4000-a000-000000000012',
        'f0000000-0000-4000-a000-000000000011',
        'RLS Probe Topic', 'rls-probe-topic', 'Fixture topic for RLS probes.', 1, 1),
       ('f0000000-0000-4000-a000-000000000015',
        'f0000000-0000-4000-a000-000000000011',
        'RLS Probe Topic Two', 'rls-probe-topic-2', 'Move… destination fixture.', 1, 2);

insert into public.subtopics
  (id, topic_id, title, slug, content, plain_text, headings_text,
   reading_minutes, sort_order, status, published_at)
values
  ('f0000000-0000-4000-a000-000000000013',
   'f0000000-0000-4000-a000-000000000012',
   'Published Probe Subtopic', 'published-probe-subtopic',
   '[{"type":"p","children":[{"text":"Published fixture body."}]}]'::jsonb,
   'Published fixture body.', '', 1, 1, 'published', now()),
  ('f0000000-0000-4000-a000-000000000014',
   'f0000000-0000-4000-a000-000000000012',
   'Draft Probe Subtopic', 'draft-probe-subtopic',
   '[{"type":"p","children":[{"text":"Draft fixture body — must never leak."}]}]'::jsonb,
   'Draft fixture body — must never leak.', '', 1, 2, 'draft', null);

-- ---------------------------------------------------------------------------
-- Study data for both users (owner-isolation probes)
-- ---------------------------------------------------------------------------
insert into public.highlights (user_id, subtopic_id, anchor, text_snapshot, color)
values
  ('00000000-0000-4000-a000-000000000001',
   'f0000000-0000-4000-a000-000000000013',
   '{"v":1,"block_id":"b1","kind":"prose","path":[],"start":0,"end":9,"snapshot":"Published"}'::jsonb,
   'Published', 'amber'),
  ('00000000-0000-4000-a000-000000000002',
   'f0000000-0000-4000-a000-000000000013',
   '{"v":1,"block_id":"b1","kind":"prose","path":[],"start":10,"end":17,"snapshot":"fixture"}'::jsonb,
   'fixture', 'mint');

insert into public.user_notes (user_id, subtopic_id, content)
values
  ('00000000-0000-4000-a000-000000000001',
   'f0000000-0000-4000-a000-000000000013',
   '[{"type":"p","children":[{"text":"User A private note."}]}]'::jsonb),
  ('00000000-0000-4000-a000-000000000002',
   'f0000000-0000-4000-a000-000000000013',
   '[{"type":"p","children":[{"text":"User B private note."}]}]'::jsonb);

insert into public.bookmarks (user_id, target_type, target_id)
values
  ('00000000-0000-4000-a000-000000000001', 'subtopic', 'f0000000-0000-4000-a000-000000000013'),
  ('00000000-0000-4000-a000-000000000002', 'subtopic', 'f0000000-0000-4000-a000-000000000013');

insert into public.progress (user_id, subtopic_id)
values
  ('00000000-0000-4000-a000-000000000001', 'f0000000-0000-4000-a000-000000000013'),
  ('00000000-0000-4000-a000-000000000002', 'f0000000-0000-4000-a000-000000000013');

insert into public.last_visited (user_id, subtopic_id)
values
  ('00000000-0000-4000-a000-000000000001', 'f0000000-0000-4000-a000-000000000013'),
  ('00000000-0000-4000-a000-000000000002', 'f0000000-0000-4000-a000-000000000013');

-- ---------------------------------------------------------------------------
-- ai_keys row for USER B (inserted as owner-role postgres — API roles can't)
-- ---------------------------------------------------------------------------
insert into public.ai_keys (user_id, provider, encrypted_key, storage_mode, last_validated_at)
values ('00000000-0000-4000-a000-000000000002', 'groq',
        '\x00010203'::bytea, 'sync', now());

-- ---------------------------------------------------------------------------
-- audit_log probe row (immutability probes target it)
-- ---------------------------------------------------------------------------
insert into public.audit_log (actor_id, action, entity, entity_id, meta)
values ('00000000-0000-4000-a000-000000000003', 'rls_probe', 'test', 'fixture',
        '{"purpose":"immutability probe"}'::jsonb);

-- ---------------------------------------------------------------------------
-- M4 CMS fixtures (migration 012 probes: 08_preview_links, 09_media_claims)
-- ---------------------------------------------------------------------------
-- Preview links on the DRAFT subtopic: one valid, one expired, one revoked.
-- Raw tokens live only in this file + the probes; the table stores sha256.
insert into public.preview_links (id, subtopic_id, token_hash, created_by, expires_at, revoked_at)
values
  ('f0000000-0000-4000-a000-000000000020',
   'f0000000-0000-4000-a000-000000000014',
   encode(extensions.digest('rls-probe-preview-token', 'sha256'), 'hex'),
   '00000000-0000-4000-a000-000000000004', now() + interval '7 days', null),
  ('f0000000-0000-4000-a000-000000000021',
   'f0000000-0000-4000-a000-000000000014',
   encode(extensions.digest('rls-probe-expired-token', 'sha256'), 'hex'),
   '00000000-0000-4000-a000-000000000004', now() - interval '1 hour', null),
  ('f0000000-0000-4000-a000-000000000022',
   'f0000000-0000-4000-a000-000000000014',
   encode(extensions.digest('rls-probe-revoked-token', 'sha256'), 'hex'),
   '00000000-0000-4000-a000-000000000004', now() + interval '7 days', now());

-- Media assets: one referenced by the published subtopic, one unused, one
-- soft-deleted (public read must exclude it).
insert into public.media_assets (id, path, alt, tags, width, height, bytes, uploaded_by, deleted_at)
values
  ('f0000000-0000-4000-a000-000000000030', 'rls-probe/used.webp',
   'Probe asset in use', '{probe}', 800, 600, 12345,
   '00000000-0000-4000-a000-000000000004', null),
  ('f0000000-0000-4000-a000-000000000031', 'rls-probe/unused.webp',
   'Probe asset unused', '{probe}', 800, 600, 12345,
   '00000000-0000-4000-a000-000000000004', null),
  ('f0000000-0000-4000-a000-000000000032', 'rls-probe/deleted.webp',
   'Probe asset soft-deleted', '{probe}', 800, 600, 12345,
   '00000000-0000-4000-a000-000000000004', now());

insert into public.media_refs (subtopic_id, asset_id, source)
values ('f0000000-0000-4000-a000-000000000013',
        'f0000000-0000-4000-a000-000000000030', 'published');

select 'SETUP OK — fixtures in place' as status;
