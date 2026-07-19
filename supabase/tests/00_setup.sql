-- RLS probe suite · 00 — fixtures
-- Run as postgres against the migrated local stack (see tests/README.md).
-- Idempotent: deletes any previous fixture rows before re-inserting.
--
-- Fixture UUIDs (fixed so probes can reference them):
--   USER A   00000000-0000-4000-a000-000000000001  (role: user)
--   USER B   00000000-0000-4000-a000-000000000002  (role: user)
--   ADMIN    00000000-0000-4000-a000-000000000003  (role: admin)
--   subject  f0000000-0000-4000-a000-000000000010
--   chapter  f0000000-0000-4000-a000-000000000011
--   topic    f0000000-0000-4000-a000-000000000012
--   subtopic published f0000000-0000-4000-a000-000000000013
--   subtopic draft     f0000000-0000-4000-a000-000000000014

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Clean previous run (cascades take care of profiles + study data)
-- ---------------------------------------------------------------------------
delete from auth.users
 where id in ('00000000-0000-4000-a000-000000000001',
              '00000000-0000-4000-a000-000000000002',
              '00000000-0000-4000-a000-000000000003');

delete from public.subjects
 where id = 'f0000000-0000-4000-a000-000000000010';

delete from public.waitlist_signups
 where email = 'rls-probe@example.com';

delete from public.audit_log
 where action = 'rls_probe';

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
   now(), now(), '', '', '', '');

insert into public.profiles (id, username, display_name, role, user_type, email_verified_at, prefs)
values
  ('00000000-0000-4000-a000-000000000001', 'rls-user-a', 'RLS User A',
   'user',  'student', now(), '{"theme":"light","text_size":1}'::jsonb),
  ('00000000-0000-4000-a000-000000000002', 'rls-user-b', 'RLS User B',
   'user',  'student', now(), '{"theme":"dark","text_size":2}'::jsonb),
  ('00000000-0000-4000-a000-000000000003', 'rls-admin',  'RLS Admin',
   'admin', 'other',   now(), '{}'::jsonb);

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
        'RLS Probe Topic', 'rls-probe-topic', 'Fixture topic for RLS probes.', 1, 1);

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

select 'SETUP OK — fixtures in place' as status;
