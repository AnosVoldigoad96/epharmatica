-- 007 · ai_keys + ai_rate_limits + ai_models
-- (master PRD §7.5 · M3 · securities.md §4 "RPC-only tables" / §7 / §10)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- 'device' = key lives in the browser (IndexedDB), encrypted_key stays null.
-- 'sync'   = libsodium sealed-box blob stored server-side, decrypted
--            transiently per request with AI_KEYS_ENCRYPTION_KEY (env-only).
create type public.ai_key_storage_mode as enum ('device', 'sync');

-- ---------------------------------------------------------------------------
-- ai_keys — RPC-ONLY TABLE (securities.md §4)
-- ---------------------------------------------------------------------------
-- There are deliberately NO select/insert/update/delete policies for
-- anon/authenticated, and their table privileges are revoked outright: the
-- encrypted blob never crosses the API, even to its owner. All access goes
-- through security-definer RPCs that land with M3 (Phase 1):
--   * save/validate key (writes the sealed-box blob in sync mode)
--   * status RPC (returns masked tail only, e.g. '····k3Jq')
--   * revoke / switch-to-device (deletes the server copy immediately)
-- The AI proxy resolves sync-mode keys server-side (service role).
-- Account deletion purges ai_keys FIRST (purge step 1, M2 §4.7).
create table public.ai_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Provider slug (openai | anthropic | gemini | openrouter | groq, D9).
  -- Text, not enum: the provider roster is registry-driven (ai_models) and
  -- must grow without a migration.
  provider text not null,
  -- Null in device-only mode; libsodium sealed-box ciphertext in sync mode.
  encrypted_key bytea,
  storage_mode public.ai_key_storage_mode not null default 'device',
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_keys_one_per_provider unique (user_id, provider),
  -- Sync mode implies a stored blob; device mode implies none.
  constraint ai_keys_mode_blob_consistency check (
    (storage_mode = 'sync' and encrypted_key is not null)
    or (storage_mode = 'device' and encrypted_key is null)
  )
);

create trigger ai_keys_set_updated_at
  before update on public.ai_keys
  for each row execute function public.set_updated_at();

alter table public.ai_keys enable row level security;

-- Hard revoke: probes must get "permission denied", not empty results.
revoke all on table public.ai_keys from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ai_rate_limits — table-backed sliding windows (ARCH §7, securities.md §10)
-- ---------------------------------------------------------------------------
-- Counters for the AI proxy: burst 30 req / 5 min and daily default 100
-- (user-adjustable 20–500). Managed exclusively by the proxy route with the
-- service role; not readable or writable via the API roles.
create table public.ai_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'burst' = 5-minute window · 'daily' = rolling day window.
  bucket text not null,
  window_start timestamptz not null,
  request_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_rate_limits_bucket_known check (bucket in ('burst', 'daily')),
  constraint ai_rate_limits_count_nonnegative check (request_count >= 0),
  constraint ai_rate_limits_unique_window unique (user_id, bucket, window_start)
);

create trigger ai_rate_limits_set_updated_at
  before update on public.ai_rate_limits
  for each row execute function public.set_updated_at();

alter table public.ai_rate_limits enable row level security;

revoke all on table public.ai_rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- ai_models — DB-driven model registry, admin-edited (M3 §13 / M4 Settings)
-- ---------------------------------------------------------------------------
create table public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model_id text not null,
  label text not null,
  -- e.g. 'Generous free tier' / 'Paid' — surfaced in the picker.
  tier_note text,
  is_default boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_models_unique_per_provider unique (provider, model_id)
);

create trigger ai_models_set_updated_at
  before update on public.ai_models
  for each row execute function public.set_updated_at();

alter table public.ai_models enable row level security;

-- Signed-in users read the registry for the model picker (inactive rows too:
-- a saved selection that was deactivated must still be labeled in Settings).
create policy ai_models_authenticated_read on public.ai_models
  for select to authenticated
  using (true);

-- Admin-edited via the M4 Settings registry editor.
create policy ai_models_admin_write on public.ai_models
  for all to authenticated
  using (public.has_role(array['admin', 'super_admin']))
  with check (public.has_role(array['admin', 'super_admin']));
