-- 011 · auth_rate_limits + reserved-handle additions
-- (M2 §4.1–§4.4/§7 · securities.md §4 "RPC-only tables" / §10 / §13)

-- ---------------------------------------------------------------------------
-- auth_rate_limits — table-backed sliding windows for pre-auth flows
-- (M2 §7 · securities.md §10)
-- ---------------------------------------------------------------------------
-- Counters for signup / sign-in / password-reset / username-availability
-- limits. Unlike ai_rate_limits (007) there is NO user_id column: these flows
-- run before a session exists, so rows are keyed by `identifier` — an HMAC
-- hash of the caller's IP for signup/signin/username_check, or of the
-- lowercased email for reset. The identifier is ALWAYS a keyed hash
-- (securities.md §13), never a raw IP or email. No user_id column ⇒ no
-- personal_data_registry entry (R-M2b applies to user_id tables); stale
-- windows are pruned opportunistically by the app on each enforcement pass.
-- Managed exclusively by the service role; not readable or writable via the
-- API roles (same archetype as ai_rate_limits).
create table public.auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  -- HMAC-SHA256 hex — ip hash (signup/signin/username_check) or
  -- lowercased-email hash (reset). NEVER a raw value.
  identifier text not null,
  bucket text not null,
  window_start timestamptz not null,
  request_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_rate_limits_bucket_known check (
    bucket in ('signup', 'signin', 'reset', 'username_check')
  ),
  constraint auth_rate_limits_count_nonnegative check (request_count >= 0),
  constraint auth_rate_limits_unique_window unique (identifier, bucket, window_start)
);

-- Opportunistic pruning scans by window age
-- (delete where window_start < now() - 2 × window).
create index auth_rate_limits_window_start_idx
  on public.auth_rate_limits (window_start);

create trigger auth_rate_limits_set_updated_at
  before update on public.auth_rate_limits
  for each row execute function public.set_updated_at();

alter table public.auth_rate_limits enable row level security;

-- Hard revoke: probes must get "permission denied", not empty results.
revoke all on table public.auth_rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- auth_rate_limit_hit(text, text, timestamptz) — atomic window increment
-- (securities.md §10 — the counter's single write path)
-- ---------------------------------------------------------------------------
-- Insert-or-increment one counter row and return the post-increment count in
-- a single statement, so concurrent attempts serialize on the row instead of
-- racing a read-then-upsert (which under-counts and can regress the counter).
-- The app decides allowed/denied against the RETURNED value: N concurrent
-- attempts can never all observe a pre-increment count.
--
-- Invoker rights on purpose — NOT security definer (unlike the 001/002
-- helpers, which must see through RLS for API-role callers): the only
-- legitimate caller is the service role, which already holds full table
-- privileges, and an API role that somehow executed it would still hit the
-- table's hard revoke. Execute is revoked below anyway so probes get
-- "permission denied" at the function too, matching the table's posture.
create or replace function public.auth_rate_limit_hit(
  p_identifier text,
  p_bucket text,
  p_window_start timestamptz
)
returns int
language sql
as $$
  insert into public.auth_rate_limits (identifier, bucket, window_start, request_count)
  values (p_identifier, p_bucket, p_window_start, 1)
  on conflict (identifier, bucket, window_start)
    do update set request_count = auth_rate_limits.request_count + 1,
                  updated_at = now()
  returning request_count;
$$;

comment on function public.auth_rate_limit_hit(text, text, timestamptz) is
  'Atomic insert-or-increment of one auth_rate_limits window row; returns the post-increment count. Service-role only.';

-- Hard revoke — functions default to PUBLIC execute, so public is revoked
-- alongside the API roles.
revoke all on function public.auth_rate_limit_hit(text, text, timestamptz)
  from public, anon, authenticated;

-- Explicit rather than inherited-from-defaults: the service role is the one
-- legitimate caller.
grant execute on function public.auth_rate_limit_hit(text, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- reserved_usernames — auth/account route handles (M2 §4.4 — list is growable)
-- ---------------------------------------------------------------------------
-- The 002 seed covered brand + top-level product routes. 1.A ships the auth
-- and settings surfaces, so their route handles (plus the usual operational
-- handles) join the reserve list. `on conflict do nothing` keeps the insert
-- safe against environments already holding a subset.
insert into public.reserved_usernames (handle) values
  ('login'), ('logout'), ('signin'), ('signup'), ('register'), ('account'),
  ('accounts'), ('profile'), ('profiles'), ('dashboard'), ('me'), ('user'),
  ('users'), ('staff'), ('moderator'), ('moderators'), ('official'),
  ('security'), ('www'), ('mail'), ('root'), ('info'), ('home'), ('new'),
  ('notifications'), ('sessions'), ('onboarding'), ('password'), ('reset'),
  ('callback'), ('email'), ('contact'), ('terms'), ('privacy'), ('about')
on conflict (handle) do nothing;
