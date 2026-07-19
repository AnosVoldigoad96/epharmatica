-- Local-dev seed (development-plan.md 0.B: demo content + one user per role).
-- Applied by `supabase db reset` AFTER migrations 001–010. Not for staging or
-- production. Idempotent: safe to run on every reset.
--
-- UUID ranges: demo users 10000000-… , content 11111111-… — disjoint from the
-- RLS probe fixtures (00000000-… / f0000000-…) so `supabase db reset` +
-- the probe suite coexist.
--
-- All demo passwords are 'password123' (bcrypt via extensions.crypt).

-- ===========================================================================
-- Demo auth users + profiles — one per application role (app_role enum)
-- ===========================================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000001', 'authenticated', 'authenticated', 'user@epharmatica.test',            extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000002', 'authenticated', 'authenticated', 'author@epharmatica.test',          extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000003', 'authenticated', 'authenticated', 'reviewer@epharmatica.test',        extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000004', 'authenticated', 'authenticated', 'content-manager@epharmatica.test', extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000005', 'authenticated', 'authenticated', 'blog-editor@epharmatica.test',     extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000006', 'authenticated', 'authenticated', 'moderator@epharmatica.test',       extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000007', 'authenticated', 'authenticated', 'jobs-manager@epharmatica.test',    extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000008', 'authenticated', 'authenticated', 'support@epharmatica.test',         extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000009', 'authenticated', 'authenticated', 'admin@epharmatica.test',           extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-b000-000000000010', 'authenticated', 'authenticated', 'super-admin@epharmatica.test',     extensions.crypt('password123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into public.profiles (id, username, display_name, role, user_type, email_verified_at, prefs)
values
  ('10000000-0000-4000-b000-000000000001', 'demo-user',            'Demo User',            'user',            'student',    now(), '{"theme":"system","text_size":1}'::jsonb),
  ('10000000-0000-4000-b000-000000000002', 'demo-author',          'Demo Author',          'author',          'other',      now(), '{}'::jsonb),
  ('10000000-0000-4000-b000-000000000003', 'demo-reviewer',        'Demo Reviewer',        'reviewer',        'pharmacist', now(), '{}'::jsonb),
  ('10000000-0000-4000-b000-000000000004', 'demo-content-mgr',     'Demo Content Manager', 'content_manager', 'other',      now(), '{}'::jsonb),
  ('10000000-0000-4000-b000-000000000005', 'demo-blog-editor',     'Demo Blog Editor',     'blog_editor',     'other',      now(), '{}'::jsonb),
  ('10000000-0000-4000-b000-000000000006', 'demo-moderator',       'Demo Moderator',       'moderator',       'pharmacist', now(), '{}'::jsonb),
  ('10000000-0000-4000-b000-000000000007', 'demo-jobs-mgr',        'Demo Jobs Manager',    'jobs_manager',    'other',      now(), '{}'::jsonb),
  ('10000000-0000-4000-b000-000000000008', 'demo-support',         'Demo Support',         'support',         'other',      now(), '{}'::jsonb),
  ('10000000-0000-4000-b000-000000000009', 'demo-admin',           'Demo Admin',           'admin',           'other',      now(), '{}'::jsonb),
  ('10000000-0000-4000-b000-000000000010', 'demo-super-admin',     'Demo Super Admin',     'super_admin',     'other',      now(), '{}'::jsonb)
on conflict (id) do nothing;

-- ===========================================================================
-- Content: 1 subject → 2 chapters → 3 topics → 6 subtopics (all published)
-- Small valid Plate-JSON documents ({"type":"p","children":[{"text":"…"}]}).
-- ===========================================================================
insert into public.subjects (id, name, slug, description, default_semester, sort_order)
values ('11111111-0000-4000-c000-000000000001', 'Pharmacology', 'pharmacology',
        'Drugs, their actions, and therapeutic use — the launch subject (A8).', 3, 1)
on conflict (id) do nothing;

insert into public.chapters (id, subject_id, name, slug, sort_order)
values
  ('11111111-0000-4000-c000-000000000011', '11111111-0000-4000-c000-000000000001',
   'Autonomic Nervous System', 'autonomic-nervous-system', 1),
  ('11111111-0000-4000-c000-000000000012', '11111111-0000-4000-c000-000000000001',
   'Cardiovascular Pharmacology', 'cardiovascular-pharmacology', 2)
on conflict (id) do nothing;

insert into public.topics (id, chapter_id, name, slug, description, semester, sort_order)
values
  ('11111111-0000-4000-c000-000000000021', '11111111-0000-4000-c000-000000000011',
   'Cholinergic Agonists', 'cholinergic-agonists',
   'Direct and indirect activators of cholinergic receptors and their clinical roles.', 3, 1),
  ('11111111-0000-4000-c000-000000000022', '11111111-0000-4000-c000-000000000011',
   'Adrenergic Agonists', 'adrenergic-agonists',
   'Sympathomimetics acting on alpha and beta adrenoceptors.', 3, 2),
  ('11111111-0000-4000-c000-000000000023', '11111111-0000-4000-c000-000000000012',
   'Antihypertensives', 'antihypertensives',
   'Drug classes for lowering blood pressure and their mechanisms.', 4, 1)
on conflict (id) do nothing;

insert into public.subtopics
  (id, topic_id, title, slug, content, plain_text, headings_text,
   preview_block_count, reading_minutes, sort_order, status, published_at)
values
  ('11111111-0000-4000-c000-000000000031', '11111111-0000-4000-c000-000000000021',
   'Muscarinic Receptor Overview', 'muscarinic-receptor-overview',
   '[{"type":"h2","children":[{"text":"Muscarinic Receptors"}]},{"type":"p","children":[{"text":"Muscarinic receptors are G-protein-coupled receptors activated by acetylcholine."}]},{"type":"p","children":[{"text":"Subtypes M1 through M5 mediate distinct parasympathetic responses."}]}]'::jsonb,
   'Muscarinic Receptors Muscarinic receptors are G-protein-coupled receptors activated by acetylcholine. Subtypes M1 through M5 mediate distinct parasympathetic responses.',
   'Muscarinic Receptors', 2, 3, 1, 'published', now()),
  ('11111111-0000-4000-c000-000000000032', '11111111-0000-4000-c000-000000000021',
   'Pilocarpine in Practice', 'pilocarpine-in-practice',
   '[{"type":"h2","children":[{"text":"Pilocarpine"}]},{"type":"p","children":[{"text":"Pilocarpine is a direct-acting muscarinic agonist used to treat glaucoma and xerostomia."}]}]'::jsonb,
   'Pilocarpine Pilocarpine is a direct-acting muscarinic agonist used to treat glaucoma and xerostomia.',
   'Pilocarpine', null, 2, 2, 'published', now()),
  ('11111111-0000-4000-c000-000000000033', '11111111-0000-4000-c000-000000000022',
   'Alpha vs Beta Selectivity', 'alpha-vs-beta-selectivity',
   '[{"type":"h2","children":[{"text":"Receptor Selectivity"}]},{"type":"p","children":[{"text":"Adrenergic agonists differ in their affinity for alpha and beta adrenoceptors, shaping their clinical use."}]}]'::jsonb,
   'Receptor Selectivity Adrenergic agonists differ in their affinity for alpha and beta adrenoceptors, shaping their clinical use.',
   'Receptor Selectivity', null, 3, 1, 'published', now()),
  ('11111111-0000-4000-c000-000000000034', '11111111-0000-4000-c000-000000000022',
   'Epinephrine Emergencies', 'epinephrine-emergencies',
   '[{"type":"h2","children":[{"text":"Epinephrine"}]},{"type":"p","children":[{"text":"Epinephrine is first-line for anaphylaxis, acting on alpha-1, beta-1, and beta-2 receptors."}]}]'::jsonb,
   'Epinephrine Epinephrine is first-line for anaphylaxis, acting on alpha-1, beta-1, and beta-2 receptors.',
   'Epinephrine', null, 3, 2, 'published', now()),
  ('11111111-0000-4000-c000-000000000035', '11111111-0000-4000-c000-000000000023',
   'ACE Inhibitors', 'ace-inhibitors',
   '[{"type":"h2","children":[{"text":"ACE Inhibitors"}]},{"type":"p","children":[{"text":"ACE inhibitors block conversion of angiotensin I to II, lowering blood pressure and offering renal protection."}]}]'::jsonb,
   'ACE Inhibitors ACE inhibitors block conversion of angiotensin I to II, lowering blood pressure and offering renal protection.',
   'ACE Inhibitors', null, 4, 1, 'published', now()),
  ('11111111-0000-4000-c000-000000000036', '11111111-0000-4000-c000-000000000023',
   'Calcium Channel Blockers', 'calcium-channel-blockers',
   '[{"type":"h2","children":[{"text":"Calcium Channel Blockers"}]},{"type":"p","children":[{"text":"Dihydropyridines and non-dihydropyridines differ in vascular versus cardiac selectivity."}]}]'::jsonb,
   'Calcium Channel Blockers Dihydropyridines and non-dihydropyridines differ in vascular versus cardiac selectivity.',
   'Calcium Channel Blockers', null, 4, 2, 'published', now())
on conflict (id) do nothing;

-- ===========================================================================
-- Study data for the demo user (so the dashboard has something to show)
-- ===========================================================================
insert into public.progress (user_id, subtopic_id)
values ('10000000-0000-4000-b000-000000000001', '11111111-0000-4000-c000-000000000031')
on conflict (user_id, subtopic_id) do nothing;

insert into public.bookmarks (user_id, target_type, target_id)
values ('10000000-0000-4000-b000-000000000001', 'topic', '11111111-0000-4000-c000-000000000021')
on conflict (user_id, target_type, target_id) do nothing;

insert into public.highlights (user_id, subtopic_id, anchor, text_snapshot, color)
values ('10000000-0000-4000-b000-000000000001', '11111111-0000-4000-c000-000000000031',
        '{"v":1,"block_id":"seed-h1","kind":"prose","path":[],"start":0,"end":21,"snapshot":"Muscarinic receptors"}'::jsonb,
        'Muscarinic receptors', 'amber')
on conflict do nothing;

insert into public.last_visited (user_id, subtopic_id)
values ('10000000-0000-4000-b000-000000000001', '11111111-0000-4000-c000-000000000031')
on conflict (user_id) do update set subtopic_id = excluded.subtopic_id, visited_at = now();

-- ===========================================================================
-- Feature-flag states (local dev) — reaffirm the Phase-1-live / later-phase
-- Coming-Soon states. Migration 003 already seeds these; this upsert keeps a
-- reset deterministic even if a dev toggled a flag in Studio.
-- ===========================================================================
insert into public.feature_flags (key, enabled, value, description, phase_tag) values
  ('coming_soon.learning',       false, null,           'Learning ribbon (live in Phase 1).', 'phase-1'),
  ('coming_soon.ai_study_tools', false, null,           'AI study tools ribbon (live in Phase 1).', 'phase-1'),
  ('coming_soon.community',      true,  null,           'Community ribbon.', 'phase-2'),
  ('coming_soon.blog',           true,  null,           'Blog ribbon.', 'phase-2'),
  ('coming_soon.jobs',           true,  null,           'Jobs ribbon.', 'phase-3'),
  ('coming_soon.resume',         true,  null,           'Resume ribbon.', 'phase-3'),
  ('coming_soon.whatsapp',       true,  null,           'WhatsApp ribbon.', 'phase-4'),
  ('employer_submissions',       false, null,           'Employer submissions dormant.', 'phase-3'),
  ('wa_bot_enabled',             false, null,           'WhatsApp bot kill-switch off.', 'phase-4'),
  ('highlight_kinds',            true,  '"all"'::jsonb,  'All anchor kinds enabled.', 'phase-1'),
  ('anon_questions',             true,  null,           'Anonymous questions permitted.', 'phase-2')
on conflict (key) do update
  set enabled = excluded.enabled,
      value = excluded.value,
      description = excluded.description,
      phase_tag = excluded.phase_tag;

-- ===========================================================================
-- Sample waitlist row
-- ===========================================================================
insert into public.waitlist_signups (email, module, role)
values ('waitlist-demo@epharmatica.test', 'community', 'student')
on conflict (email, module) do nothing;

-- ===========================================================================
-- AI model registry — a few defaults for the M3 picker (Groq/Gemini first,
-- generous free tiers surfaced — R3)
-- ===========================================================================
insert into public.ai_models (provider, model_id, label, tier_note, is_default, active, sort)
values
  ('groq',      'llama-3.3-70b-versatile', 'Llama 3.3 70B (Groq)', 'Generous free tier', true,  true, 1),
  ('gemini',    'gemini-2.0-flash',        'Gemini 2.0 Flash',     'Generous free tier', true,  true, 2),
  ('openai',    'gpt-4o-mini',             'GPT-4o mini',          'Paid',               true,  true, 3),
  ('anthropic', 'claude-3-5-haiku',        'Claude 3.5 Haiku',     'Paid',               true,  true, 4),
  ('openrouter','openrouter/auto',         'OpenRouter Auto',      'Routes to many models', true, true, 5)
on conflict (provider, model_id) do nothing;
