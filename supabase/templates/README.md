# GoTrue email templates

Branded HTML for the emails GoTrue sends over SMTP (M2 §5; the token_hash flow
required by `@supabase/ssr`). Every action link points at the **app** callback
with `token_hash` + `type` — never GoTrue's `/verify` redirect — so verification
works without a PKCE verifier cookie (i.e. cross-device, and from any mail
client). The app callback (`apps/web/app/auth/callback/route.ts`) calls
`verifyOtp({ type, token_hash })`.

| File                | GoTrue template     | `type` in the link | Callback behaviour              |
| ------------------- | ------------------- | ------------------ | ------------------------------- |
| `confirmation.html` | signup confirmation | `email`            | verify → mirror sync → `next`   |
| `recovery.html`     | password reset      | `recovery`         | verify → `/auth/reset-password` |
| `email_change.html` | email change        | `email_change`     | verify → `/settings/profile`    |

These are the 3 GoTrue-sent templates. The other M2 emails (link/unlink notices,
deletion, force-rename) are app-sent via `lib/integrations/email.ts` (Resend
HTTP API) and are not GoTrue templates — see M2 §5 / 1.F.

## Deploy (self-hosted, on the box)

GoTrue reads templates from `file://` paths inside the `auth` container. Mount
this dir and point the env at it via a compose override (non-invasive — it
doesn't touch the upstream `docker-compose.yml`). Run as root on the VPS:

```bash
cd /opt/epharmatica-supabase/supabase-upstream/docker
mkdir -p volumes/gotrue-templates
cp /tmp/gotrue-templates/*.html volumes/gotrue-templates/      # files copied up from this repo dir

cat > docker-compose.override.yml <<'YAML'
services:
  auth:
    volumes:
      - ./volumes/gotrue-templates:/etc/gotrue-templates:ro
    environment:
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: file:///etc/gotrue-templates/confirmation.html
      GOTRUE_MAILER_TEMPLATES_RECOVERY: file:///etc/gotrue-templates/recovery.html
      GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: file:///etc/gotrue-templates/email_change.html
YAML

docker compose -p epharmatica-supabase up -d --no-deps --force-recreate auth
```

`docker compose` auto-merges `docker-compose.override.yml` from the working dir,
so subsequent `up` commands keep the templates. To restyle, edit the HTML here,
copy up, and recreate `auth` again.

## Gotchas already hit (documented so they aren't rediscovered)

- **SMTP port:** Hetzner blocks outbound 465; 2465 deadlocks on TLS mode (GoTrue
  only does implicit TLS on 465, STARTTLS elsewhere). Use `SMTP_PORT=587`
  (STARTTLS) — open and protocol-matched with Resend.
- Without these token_hash templates GoTrue uses its default `/verify` redirect,
  which hands the app a `?code=` needing a PKCE verifier that isn't present on an
  email-link click → "link expired or already used".
