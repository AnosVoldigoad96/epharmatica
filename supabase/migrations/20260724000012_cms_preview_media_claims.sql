-- 012 · M4 CMS tables — preview links (+ anon open RPC), media library, review claims
-- (M4 §5.6/§5.7/§6/§11/§12 · securities.md §5 M4 probes · development-plan.md 1.B)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- Already in place from earlier migrations (do NOT re-create here):
--   feature_flags.phase_tag (003) · audit_log append-only hardening (008)
--   content-media storage bucket + staff object policies (010)

-- ---------------------------------------------------------------------------
-- preview_links — tokenized draft sharing (M4-4, §5.7)
-- ---------------------------------------------------------------------------
-- 128-bit tokens are generated app-side and stored ONLY as sha256 hex
-- (token_hash). Single-subtopic scope, 7-day expiry, revocable; publishing
-- the subtopic auto-revokes its links (publish pipeline). The public read
-- path is the security-definer RPC below — never this table.
create table public.preview_links (
  id uuid primary key default gen_random_uuid(),
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index preview_links_subtopic_idx
  on public.preview_links (subtopic_id, created_at desc);

create trigger preview_links_set_updated_at
  before update on public.preview_links
  for each row execute function public.set_updated_at();

alter table public.preview_links enable row level security;

-- Staff-only visibility (M4 §12); reviewer included so the queue can show
-- link state. Create/revoke ride the content staff-write set.
create policy preview_links_staff_read on public.preview_links
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

create policy preview_links_staff_insert on public.preview_links
  for insert to authenticated
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy preview_links_staff_update on public.preview_links
  for update to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

-- No delete policy: links are revoked (revoked_at), never erased — the opens
-- log must keep its parent row for the leak-detection trail (R-M4c).

-- ---------------------------------------------------------------------------
-- preview_link_opens — append-only open log (detection trail, R-M4c)
-- ---------------------------------------------------------------------------
-- Hashed IP only (securities.md §13). Rows are written by the RPC below;
-- update/delete revoked from every API role like audit_log.
create table public.preview_link_opens (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.preview_links (id) on delete cascade,
  opened_at timestamptz not null default now(),
  ip_hash text,
  ua text,
  created_at timestamptz not null default now(),
  -- Frozen forever — UPDATE is revoked from every API role below.
  updated_at timestamptz not null default now()
);

create index preview_link_opens_link_idx
  on public.preview_link_opens (link_id, opened_at desc);

create index preview_link_opens_ip_idx
  on public.preview_link_opens (ip_hash, opened_at desc);

alter table public.preview_link_opens enable row level security;

revoke update, delete on table public.preview_link_opens from public;
revoke update, delete on table public.preview_link_opens from anon, authenticated, service_role;

create policy preview_link_opens_staff_read on public.preview_link_opens
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

-- No insert policy for API roles: inserts happen inside the security-definer
-- RPC (runs as the function owner) — direct writes are impossible.

-- ---------------------------------------------------------------------------
-- open_preview_link(token, ip_hash, ua) — the ONLY anon path to a draft
-- ---------------------------------------------------------------------------
-- Validates hash + expiry + revocation, enforces the 30 opens/hr/IP cap
-- in-function (the RPC is reachable via PostgREST directly, so the guard
-- cannot live only in the app), logs the open, and returns the subtopic
-- payload for the watermarked /preview/[token] renderer. Returns null for
-- anything invalid — the route renders one neutral card either way, so the
-- response never distinguishes "expired" from "revoked" from "unknown".
create or replace function public.open_preview_link(
  p_token text,
  p_ip_hash text,
  p_ua text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link record;
  v_subtopic record;
begin
  if p_token is null or length(p_token) = 0 then
    return null;
  end if;

  -- Rate limit: 30 opens/hr/IP (securities.md §11), counted over the log.
  -- IS NOT DISTINCT FROM groups null ip_hash callers (direct PostgREST hits
  -- that bypass the app) into one shared bucket instead of exempting them.
  if (
       select count(*)
         from public.preview_link_opens o
        where o.ip_hash is not distinct from p_ip_hash
          and o.opened_at > now() - interval '1 hour'
     ) >= 30 then
    return null;
  end if;

  select l.id, l.subtopic_id
    into v_link
    from public.preview_links l
   where l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and l.revoked_at is null
     and l.expires_at > now();

  if not found then
    return null;
  end if;

  select s.id, s.title, s.content, s.reading_minutes, s.updated_at
    into v_subtopic
    from public.subtopics s
   where s.id = v_link.subtopic_id;

  if not found then
    return null;
  end if;

  insert into public.preview_link_opens (link_id, ip_hash, ua)
  values (v_link.id, p_ip_hash, p_ua);

  return jsonb_build_object(
    'subtopic_id', v_subtopic.id,
    'title', v_subtopic.title,
    'content', v_subtopic.content,
    'reading_minutes', v_subtopic.reading_minutes,
    'updated_at', v_subtopic.updated_at
  );
end;
$$;

comment on function public.open_preview_link(text, text, text) is
  'Anon draft-preview path (M4-4). Validates token hash + expiry + revocation, rate-limits 30 opens/hr/IP, logs the open, returns the subtopic payload — or null for anything invalid.';

-- ---------------------------------------------------------------------------
-- media_assets — global media library (M4-3, §6)
-- ---------------------------------------------------------------------------
-- path points into the content-media bucket (public, migration 010).
-- Alt text is required at upload (a11y floor — no alt, no save): NOT NULL +
-- non-blank CHECK, mirrored by the shared Zod schema. deleted_at is the
-- 30-day-undo soft delete; replaced_at marks replace-in-place (prior file
-- retained 30 days by the storage sweep).
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  alt text not null,
  tags text[] not null default '{}',
  width int not null,
  height int not null,
  bytes int not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  replaced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_alt_nonblank check (length(btrim(alt)) > 0),
  constraint media_assets_dimensions_positive check (width > 0 and height > 0 and bytes > 0)
);

create index media_assets_uploaded_by_idx on public.media_assets (uploaded_by);
create index media_assets_deleted_at_idx on public.media_assets (deleted_at)
  where deleted_at is not null;
-- Library search (filename/alt) rides trigram like the content tree (009).
create index media_assets_path_trgm_idx
  on public.media_assets using gin (path extensions.gin_trgm_ops);
create index media_assets_alt_trgm_idx
  on public.media_assets using gin (alt extensions.gin_trgm_ops);

create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row execute function public.set_updated_at();

alter table public.media_assets enable row level security;

-- Public read of live assets (published pages render alt text from here);
-- soft-deleted rows are staff-only (undo surface). Staff-write archetype (b).
create policy media_assets_public_read on public.media_assets
  for select to anon, authenticated
  using (deleted_at is null);

create policy media_assets_staff_read on public.media_assets
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

create policy media_assets_staff_write on public.media_assets
  for all to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- media_refs — usage tracking (delete-block source of truth, M4 §6)
-- ---------------------------------------------------------------------------
-- Refreshed by the publish-pipeline content scan (authoritative for
-- 'published') and a lighter periodic draft scan ('draft' — R-M4b:
-- delete-block errs conservative, draft uses also block). Writes are
-- service-role only; RESTRICT on asset_id makes hard-deleting a referenced
-- asset impossible even for privileged code.
create table public.media_refs (
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  asset_id uuid not null references public.media_assets (id) on delete restrict,
  source text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_refs_source_known check (source in ('published', 'draft')),
  constraint media_refs_pkey primary key (subtopic_id, asset_id, source)
);

create index media_refs_asset_idx on public.media_refs (asset_id);

create trigger media_refs_set_updated_at
  before update on public.media_refs
  for each row execute function public.set_updated_at();

alter table public.media_refs enable row level security;

-- Staff read the usage lists; no write policies — the publish/draft scans
-- run on the service role only.
create policy media_refs_staff_read on public.media_refs
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- review_claims — open-queue claim semantics (M4-2, §5.6)
-- ---------------------------------------------------------------------------
-- Claiming is coordination, not permission: any reviewer MAY review; the
-- claim just prevents collisions. One active claim per subtopic, enforced
-- by a partial unique index (race-proof at the DB, not the UI).
create table public.review_claims (
  id uuid primary key default gen_random_uuid(),
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index review_claims_one_active_idx
  on public.review_claims (subtopic_id)
  where released_at is null;

create index review_claims_reviewer_idx
  on public.review_claims (reviewer_id, claimed_at desc);

create trigger review_claims_set_updated_at
  before update on public.review_claims
  for each row execute function public.set_updated_at();

alter table public.review_claims enable row level security;

create policy review_claims_staff_read on public.review_claims
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

-- Reviewers claim for themselves only (reviewer_id = auth.uid()).
create policy review_claims_reviewer_insert on public.review_claims
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and public.has_role(array['reviewer', 'content_manager', 'admin', 'super_admin'])
  );

-- Release: self anytime; others by content_manager+ (M4 §5.6).
create policy review_claims_release on public.review_claims
  for update to authenticated
  using (
    (reviewer_id = auth.uid()
      and public.has_role(array['reviewer', 'content_manager', 'admin', 'super_admin']))
    or public.has_role(array['content_manager', 'admin', 'super_admin'])
  )
  with check (
    (reviewer_id = auth.uid()
      and public.has_role(array['reviewer', 'content_manager', 'admin', 'super_admin']))
    or public.has_role(array['content_manager', 'admin', 'super_admin'])
  );

-- ---------------------------------------------------------------------------
-- personal_data_registry — staff-reference columns, documented (R-M2b spirit)
-- ---------------------------------------------------------------------------
-- None of these tables carries user_id (study PII); their staff references
-- resolve via FK behavior when an account is purged (step 7 deletes the
-- GoTrue user). Registered anyway so the registry stays a complete map.
insert into public.personal_data_registry (table_name, module, purge_step, notes) values
  ('preview_links',  'm4-cms', 3, 'created_by → auth.users ON DELETE SET NULL; no user PII stored.'),
  ('media_assets',   'm4-cms', 3, 'uploaded_by → auth.users ON DELETE SET NULL; no user PII stored.'),
  ('review_claims',  'm4-cms', 3, 'reviewer_id → auth.users ON DELETE CASCADE; rows vanish with the account.');
