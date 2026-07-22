# Runbook — deploying 1.A accounts core (M2 first half)

What the `feat/1a-accounts-core` branch needs on the VPS before auth works in
production. Companion to `development-plan.md` §5 (1.A) and `prd-m2-accounts-profiles.md`.

## 1. Database

- Apply migration `supabase/migrations/20260720000011_auth_rate_limits_reserved_handles.sql`
  (forward-only; pre-migration dump per the merge pipeline).
- Run the RLS probe suite including the new `supabase/tests/07_auth_rate_limits.sql`
  (`psql -v ON_ERROR_STOP=1` as postgres, files in order).
- Regenerate types against the migrated stack and commit:
  `pnpm --filter @epharmatica/database gen:types` (type-drift CI check).

## 2. GoTrue (auth service env, Coolify)

| Variable                                        | Value / note                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOTRUE_EXTERNAL_GOOGLE_ENABLED`                | `true`                                                                                                                                                                                                                                         |
| `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`              | from Google Cloud Console (below)                                                                                                                                                                                                              |
| `GOTRUE_EXTERNAL_GOOGLE_SECRET`                 | from Google Cloud Console                                                                                                                                                                                                                      |
| `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI`           | `https://<supabase-host>/auth/v1/callback`                                                                                                                                                                                                     |
| `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED`        | `true` — required for `unlinkIdentity` (Settings → Sessions removal) and `getUserIdentities`                                                                                                                                                   |
| `GOTRUE_MAILER_ALLOW_UNVERIFIED_EMAIL_SIGN_INS` | `true` if the deployed supabase/auth version supports it. With it, unverified users sign in and see the verify banner (M2 §4.1). Without it, GoTrue blocks sign-in until verified — the app handles both (`emailNotConfirmed` error + resend). |
| `GOTRUE_URI_ALLOW_LIST`                         | append `https://epharmatica.com/auth/callback,https://epharmatica.com/**`                                                                                                                                                                      |
| `GOTRUE_SITE_URL`                               | `https://epharmatica.com` (should already be set from #14)                                                                                                                                                                                     |

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

HTTPS origin is a hard requirement (securities.md §12) — Traefik terminates TLS.

## 4. App container env (Coolify)

| Variable                                                                                   | Note                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IP_HASH_SECRET`                                                                           | new — HMAC key for hashed IPs / identifiers in `audit_log.ip_hash` and `auth_rate_limits.identifier`. Generate: `openssl rand -hex 32`. Rotating it resets in-flight rate-limit windows and unlinks old audit hashes (acceptable). |
| `EMAIL_FROM`                                                                               | optional — defaults to `ePharmatica <no-reply@epharmatica.com>`                                                                                                                                                                    |
| `RESEND_API_KEY`                                                                           | exists since #14 (GoTrue SMTP) — the app now also uses it via the Resend HTTP API for link/unlink notices (I10, `lib/integrations/email.ts`)                                                                                       |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | already set                                                                                                                                                                                                                        |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`                                  | already set — Turnstile now also guards sign-up and password reset                                                                                                                                                                 |

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
