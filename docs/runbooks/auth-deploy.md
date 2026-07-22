# Runbook — deploying 1.A accounts core (M2 first half)

What the `feat/1a-accounts-core` branch needs on the VPS before auth works in
production. Companion to `development-plan.md` §5 (1.A) and `prd-m2-accounts-profiles.md`.

## 0. Deploy topology (how this box actually works)

Founder decision (19 Jul 2026) superseded the plan's Coolify assumption:
**there is no Coolify.** The shared Hetzner box (`178.63.23.176`) runs plain
Docker Compose behind a Cloudflare tunnel (`cloudflared`); Cloudflare terminates
TLS. Deploy is on merge to `main`: `.github/workflows/deploy.yml` SSHes in with a
forced-command key that can only run `deploy-from-ci` (pull → build →
`compose up` → health gate). So:

- **App runtime env** lives in the app's compose env file on the box
  (`/opt/epharmatica-app/.env`), NOT in any Coolify store. Editing it + a redeploy
  (or `docker compose up -d`) is how new app env takes effect.
- **GoTrue env** lives in the self-hosted Supabase stack's own compose env on the
  same box (a separate compose project). Changing it requires recreating the
  `auth` (GoTrue) container in that stack.
- **CI secrets** (e.g. `DEPLOY_SSH_KEY`) are GitHub repo secrets; the CI _build_
  uses GitHub repo _variables_ for placeholder Supabase values only.

## 1. Database (applied by hand on the box)

The gated migration step in `deploy.yml` is still a TODO (no automated
migration-on-deploy yet), so migration 011 is applied manually against the
self-hosted stack — the same way 001–010 were.

- Take a pre-migration dump first: `pg_dump -Fc` to the encrypted backup store
  (the migration never runs without a fresh dump).
- Apply migration `supabase/migrations/20260720000011_auth_rate_limits_reserved_handles.sql`
  (forward-only).
- Run the RLS probe suite including the new `supabase/tests/07_auth_rate_limits.sql`
  (`psql -v ON_ERROR_STOP=1` as postgres, files in order).
- Regenerate types against the migrated stack and commit:
  `pnpm --filter @epharmatica/database gen:types` (this clears the type-drift CI
  check, which stays red until it runs).

## 2. GoTrue (auth service env — self-hosted Supabase stack on the box)

| Variable                                        | Value / note                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOTRUE_EXTERNAL_GOOGLE_ENABLED`                | `true`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`              | from Google Cloud Console (below)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GOTRUE_EXTERNAL_GOOGLE_SECRET`                 | from Google Cloud Console                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI`           | `https://<supabase-host>/auth/v1/callback`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED`        | `true` — required for `unlinkIdentity` (Settings → Sessions removal) and `getUserIdentities`                                                                                                                                                                                                                                                                                                                                                            |
| `GOTRUE_MAILER_ALLOW_UNVERIFIED_EMAIL_SIGN_INS` | `true` if the deployed supabase/auth version supports it. With it, unverified users sign in and see the verify banner (M2 §4.1). Without it, GoTrue blocks sign-in until verified — the app handles both (`emailNotConfirmed` error + resend).                                                                                                                                                                                                          |
| `GOTRUE_URI_ALLOW_LIST`                         | append `https://epharmatica.com/auth/callback,https://epharmatica.com/**`                                                                                                                                                                                                                                                                                                                                                                               |
| `GOTRUE_SITE_URL`                               | `https://epharmatica.com` (should already be set from #14)                                                                                                                                                                                                                                                                                                                                                                                              |
| `GOTRUE_DISABLE_SIGNUP`                         | **must be `false`** — in the stock supabase compose this is `${DISABLE_SIGNUP}` from `.env`, and it is often left `true` during a waitlist-only phase. While `true`, GoTrue rejects ALL new account creation (email **and** first-time Google), so 1.A cannot create accounts. Flip `DISABLE_SIGNUP=false` in the Supabase `.env` as the go-live step (deferring until merge keeps the raw signup endpoint closed until the sign-up UI actually ships). |

> **Stock-Supabase note:** on the official self-hosted compose the Google + `MANUAL_LINKING` lines live commented-out in the `auth` service of `docker-compose.yml`; uncomment them (and add `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED: "true"`, which isn't in the file), then supply `GOOGLE_ENABLED`/`GOOGLE_CLIENT_ID`/`GOOGLE_SECRET` + the allow-list via `.env`. Recreate only the auth container without disturbing the DB: `docker compose -p epharmatica-supabase up -d --no-deps --force-recreate auth`. Verify through Kong with the anon key: `curl -s -H "apikey: $ANON_KEY" https://supabase.epharmatica.com/auth/v1/settings` → expect `"google":true` and `"disable_signup":false`.

Auto-linking note (M2-4): GoTrue links a Google identity into an existing
account only when that account's email is verified. When the local account is
unverified, GoTrue mints a duplicate user instead — the app's
`/auth/callback` detects that (same email, unverified local, freshly-created
OAuth-only shell with no profile row), deletes the shell, and shows the
verbatim blocked-link notice. No GoTrue config expresses this rule directly;
the callback is the enforcement point.

### Email templates (token_hash links)

Server-side auth needs GoTrue's email links to carry `token_hash` to the app
callback instead of the legacy `ConfirmationURL` implicit flow. Set the
template bodies (Confirmation, Recovery, Email change) so the action link is:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery
```

(Confirmation uses `type=email`; recovery uses `type=recovery`. The callback
route handles both plus OAuth `?code=`.)

## 3. Google Cloud Console

1. Create an OAuth 2.0 Client ID (Web application) in the ePharmatica GCP project.
2. Authorized redirect URI: `https://<supabase-host>/auth/v1/callback`.
3. Authorized JavaScript origin: `https://epharmatica.com`.
4. OAuth consent screen: external, app name ePharmatica, support email
   `support@epharmatica.com`, scopes: `email`, `profile`, `openid`.

HTTPS origin is a hard requirement (securities.md §12) — Cloudflare terminates
TLS at the tunnel edge in front of the box.

## 4. App container env (`/opt/epharmatica-app/.env` on the box)

| Variable                                                     | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IP_HASH_SECRET`                                             | new — HMAC key for hashed IPs / identifiers in `audit_log.ip_hash` and `auth_rate_limits.identifier`. Generate: `openssl rand -hex 32`. Rotating it resets in-flight rate-limit windows and unlinks old audit hashes (acceptable).                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `EMAIL_FROM`                                                 | optional — defaults to `ePharmatica <no-reply@epharmatica.com>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `RESEND_API_KEY`                                             | exists since #14 (GoTrue SMTP) — the app now also uses it via the Resend HTTP API for link/unlink notices (I10, `lib/integrations/email.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | already set (used since Phase 0 / the waitlist)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | **NEW for 1.A — was NOT set before** (Phase 0 only used the anon key). The admin client (audit writes, `email_verified_at` mirror, email-signup profile insert, rate-limit RPC) needs it, and fails SILENTLY without it. Copy the Supabase stack's `SERVICE_ROLE_KEY` (from `/opt/epharmatica-supabase/supabase-upstream/docker/.env`) into the app `.env` as `SUPABASE_SERVICE_ROLE_KEY`, then recreate the app container (`cd /opt/epharmatica-app && docker compose up -d --force-recreate`). Symptom if missing: Google sign-in works but audit_log stays empty and `email_verified_at` never populates; email sign-up fails at the profile insert. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`    | already set — Turnstile now also guards sign-up and password reset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 5. Post-deploy verification (M2 acceptance spot-checks)

1. Email sign-up end-to-end: create account → verification email arrives
   (Resend) → link lands on `/auth/callback` → banner clears → `email_verified_at`
   mirror set.
2. Google sign-up: completion step is unbypassable (navigate to `/settings/profile`
   mid-completion → redirected back); abandoning and re-signing-in resumes it.
3. Auto-link matrix: verified local + Google → linked, notification email sent;
   unverified local + Google → verbatim blocked notice, no duplicate user left
   behind (check `auth.users`).
4. `Sign out everywhere` from device A revokes device B within seconds.
5. Rate limits: 6th sign-up from one IP inside an hour → friendly
   too-many-attempts error; `auth_rate_limits` rows visible (service role).
6. Audit: `audit_log` rows for signup/signin/link/unlink carry `ip_hash`,
   never a raw IP.
7. Lighthouse on `/auth/sign-up` ≥ 90 mobile (continuous track).

## 6. Local dev parity

`supabase/config.toml` gains `[auth.external.google]` (disabled without
secrets) and the additional redirect URLs. No local stack runs on the dev
machine — verification happens against the VPS stack (project memory).
