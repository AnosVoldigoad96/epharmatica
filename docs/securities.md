# ePharmatica — Security Program

| | |
|---|---|
| **Version** | 1.0 · 19 July 2026 |
| **Scope** | Application, data, infrastructure, and operational security for the whole platform (M1–M8) |
| **Derived from** | Master PRD §13.2/§10 · ARCHITECTURE.md invariants · module PRDs M1–M8 · Privacy Policy / ToS / Content Policy / Medical Disclaimer drafts |
| **Companions** | `rules.md` (engineering rules) · `development-plan.md` (when each control lands) |

This document is the single place where every security control, limit, retention window, and required CI probe lives. Numbers here are **contractual** — they come from the PRDs and the legal drafts the product publishes. If an implementation disagrees with this file, one of them is wrong; fix it in the same PR.

---

## 1. Posture & principles

1. **Postgres is the authority.** Security is enforced at the data layer (RLS, security-definer RPCs, security-barrier views, triggers) first; UI and middleware are convenience layers on top. Anything enforced only in UI is not enforced.
2. **Deny by default.** Every table has RLS enabled with no-access as the baseline (I1). Admin access is three-layered: `proxy.ts` role gate + per-page permission map + RLS.
3. **Least privilege, always audited.** Staff see the minimum (masked phones, signed URLs, no password access); every mutating admin action writes `audit_log` via `withAudit()` (I8).
4. **Privacy as an architectural property, not a policy promise.** Anonymity, preview gating, BYOK key handling, and client-side PDF rendering are structural — the code path to violate them does not exist.
5. **The platform never holds what it doesn't need**: no AI conversation storage in v1, no per-user search query storage, no raw phone numbers as keys, no marketing email, cookies limited to auth/session + theme.

## 2. Data classification

| Class | Examples | Handling |
|---|---|---|
| Public | Published content, published blogs/jobs, opted-in public profiles | Public-read RLS on `status='published'` only; ISR/CDN cacheable. **Exception — `jobs`:** public select is *not* expiry-gated (expired rows stay selectable; routes gate presentation, enabling seeker-history joins per M6 §9/§4.3) |
| Private user data | Highlights, notes, bookmarks, progress, resumes, saved jobs, prefs, email | Owner-only RLS; never public; in export + purge scope |
| Sensitive | AI keys, verification documents, license numbers, phone numbers, anonymous authors' identities | Encrypted and/or private buckets; RPC-only access; retention-limited; masked in staff UIs |
| Staff-only | Audit log, moderation reports, review queues, preview links | Role-gated; audit log append-only |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `AI_KEYS_ENCRYPTION_KEY`, `WHATSAPP_APP_SECRET`/`WHATSAPP_TOKEN`, `CRON_SECRET`, SMTP/Sentry tokens | Coolify env store only; never in DB, repo, logs, or client bundles |

## 3. Non-negotiable security invariants

- `SUPABASE_SERVICE_ROLE_KEY` imported in exactly one server-only module (`apps/web/lib/supabase/admin.ts`), ESLint-enforced (I2). Never in `packages/*`.
- Gated content is truncated **server-side**; full JSON never serialized to anonymous sessions (I3) — verified at the network layer in e2e.
- AI keys and prompt/output bodies never touch logs, Sentry, or analytics (I6).
- Privileged mutations only via route handlers/server actions with shared-Zod-validated input; service-role key never leaves server context.
- Model output is rendered as markdown text only — never executed, no tool access, no auto-fetched links (prompt-injection posture).
- `audit_log` is append-only: no update/delete grants to any role, CI-tested.
- Forum anonymity is enforced at the data-access layer: public reads only via `threads_public`/`replies_public` security-barrier views; base-table select revoked from `anon` and `authenticated`.
- `wa_*` tables have **zero** anon/authenticated access; console access via staff RPCs with masking; phone decryption only inside the audited reveal RPC.
- Entitlements are server-checked (`can(user, feature)`, I5) — no client trust, gateway-agnostic by design.

## 4. RLS conventions

Three archetypes cover ~90% of tables; new tables must fit one before inventing a fourth:

```sql
-- (a) owner-only rows: study data, ai_keys, resumes, saved_jobs, prefs …
create policy owner_all on public.highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- (b) public-read of published content; writes only via roles
create policy public_read_published on public.subtopics
  for select using (status = 'published');
create policy staff_write on public.subtopics
  for all using (public.has_role(array['author','content_manager','admin','super_admin']))
  with check (public.has_role(array['author','content_manager','admin','super_admin']));

-- (c) participant-write community rows with moderation override
-- per M5 §10, community write policies check ALL THREE at RLS: author identity,
-- the verified-email claim, and sanction state — never UI-only
create policy author_insert on public.replies
  for insert with check (
    auth.uid() = author_id
    and public.has_verified_email()
    and not public.is_sanctioned(auth.uid())
  );
```

Special patterns beyond the archetypes (each defined in its module PRD):
- **RPC-only tables:** `ai_keys` (no direct select even by owner; status RPC returns masked tail only), `job_submissions` (service-role only; public insert via RPC when flag on), all `wa_*` tables.
- **`jobs` is not expiry-gated:** public select regardless of expiry (routes gate presentation; seeker-history joins depend on it — M6 §9/§4.3); writes `jobs_manager`+ only.
- **Security-barrier views:** forum public reads (anonymity masking).
- **Trigger-guarded columns:** `profiles` BEFORE UPDATE trigger rejects non-service changes to `role`, `is_verified_pharmacist`, `verified_at`, and clearing `deletion_requested_at`; role mutation only via audited security-definer functions.
- **Sanction enforcement in RLS**, not just UI: muted/banned users cannot insert regardless of what the client renders.
- The preview gate is **not** an RLS concern (anon may select published subtopics); truncation lives in the data layer so SEO metadata can still be computed server-side (I3).

## 5. Required CI security probes (the catalog)

The RLS/security suite runs in CI against a migrated shadow DB. A feature is incomplete until its probes are in. Accumulated catalog:

**Foundation / M2**
- Anon cannot read unpublished subtopics; user A cannot read user B's notes/keys/prefs/email
- User cannot self-elevate `role`; cannot self-set `is_verified_pharmacist`; cannot clear own `deletion_requested_at`
- Username availability check works anonymously; auto-link is blocked when either email is unverified
- CI fails if any table containing `user_id` is missing from `personal_data_registry`

**M1**
- Anon cannot select draft subtopics; owner isolation on all five study tables (highlights, user_notes, bookmarks, progress, last_visited)
- No role below author can update `primary_video_url`
- Preview truncation verified at the network layer (gated blocks absent from the anon payload)

**M3**
- `authenticated` cannot select `ai_keys`; status RPC returns masked data only; anon cannot invoke the AI proxy
- User cannot edit another user's `profiles.prefs` (prefs write isolation)
- Log-audit fixture proves zero key material or message content in pino/Sentry output
- Sync→device-only switch deletes the server-side encrypted blob (DB-checked)

**M4**
- Reviewer cannot publish; author cannot approve their own draft
- Audit rows immutable under every role; role assignment respects rank rules
- Anon preview RPC honors expiry and revocation; publish auto-revokes preview links (network-verified)
- Yearly audit-export cron produces a valid R2 object from a seeded aged year

**M5 (five non-negotiables + extras)**
- No non-staff query path returns an anonymous author's identity — PostgREST probing fixture including filters, ordering tricks, and embedded joins
- Unverified email cannot insert; muted user cannot insert (RLS-level)
- Anonymous OP can still mark an accepted answer via RPC
- Post-window edits always produce publicly readable revisions
- Verification docs bucket: staff-only signed URLs; 90-day purge clock-tested

**M6**
- Non-manager cannot write jobs/orgs; owner isolation on `saved_jobs`
- `job_submissions` unreachable while `employer_submissions` flag is off; staging flag-flip activates the full path

**M7**
- Resume owner isolation; cap-5 enforced via UI, RPC, **and** direct-insert attempt
- Signed-URL scope: user B's token fails on user A's photo; purge-registry coverage clock-tested

**M8**
- Zero anon/authenticated access to any `wa_*` table (probed)
- Phone unmask only via the audited RPC (writes `wa_phone_revealed`); webhook rejects bad `X-Hub-Signature-256`

## 6. Authentication & session security

- **Passwords:** users min 10 chars + zxcvbn ≥2; **staff min 12 chars + zxcvbn ≥3**. No composition rules. Hashed by GoTrue.
- **Verification:** email verification required before community posting and before identity auto-linking. Google emails count as verified.
- **Auto-linking (M2-4):** Google ↔ local link only when **both** sides have verified email; never merges data on a blocked link; every link/unlink event emails the user. Closes the takeover vector R-M2a.
- **Unlink invariant:** a sign-in method is removable only if another remains; removing Google with no password forces set-password first.
- **Re-authentication required** for: account deletion, email change, sign-in-method removal.
- **Sessions:** httpOnly/secure/SameSite=Lax cookies via `@supabase/ssr`; `proxy.ts` refreshes tokens and hard-blocks `/admin/**` without a staff role. "Sign out everywhere" revokes **all** refresh tokens (e2e-tested on a second live device).
- **No account-existence leakage:** "If that account exists, we've emailed a link."
- **Age gate:** required 13+ checkbox at signup. *(Legal delta to close: the ToS additionally requires parental consent for under-18s — the signup affirmation must cover both; under-13 accounts discovered on report are deleted.)*
- **Bot friction:** Cloudflare Turnstile on sign-up, password reset, waitlist, and the (flag-gated) employer form.
- **Staff 2FA (M4-5):** TOTP fully built via GoTrue MFA (enroll/verify/recovery codes); enforcement off at launch (accepted risk R-M4a). Enforcement triggers: any staff-credential incident OR staff headcount > 5. Compensating controls: 12-char staff passwords, staff sign-in notifications, weekly admin-audit review habit.
- **Auth events** append `audit_log` entries with hashed IP.

## 7. BYOK AI key security (M3 / master §7.5.4)

- Two storage modes, user-selectable per provider:
  - **This device only (default):** key in IndexedDB, sent per-request over TLS, held in server memory for the request only.
  - **Sync across devices:** key encrypted with libsodium sealed-box (`crypto_box_seal`) using `AI_KEYS_ENCRYPTION_KEY` held only in server env — never in the database; decrypted transiently per request. (One construction, per ARCHITECTURE §5 — do not substitute AES-GCM.)
- Keys are write-only in the UI (masked tail `····k3Jq` after save), validated with a 1-token test call, revocable instantly; switching to device-only deletes the server copy immediately.
- `ai_keys` is RPC-only (§4); the encrypted blob never crosses the API, even to its owner.
- CSP disallows browser→provider calls: all inference goes through the server proxy by construction.
- Account deletion purges `ai_keys` **first** (purge step 1).
- Spend guardrails protect users from key-burning bugs: see §10.

## 8. Uploads & storage security

| Bucket | Access | Constraints | Lifecycle |
|---|---|---|---|
| `content-media` | public-read via CDN | PNG/JPG/WebP, server type-sniff, auto-WebP, max edge 1920, ≤2 MB post-compress, **alt required** | permanent; replaced files retained 30 days |
| `avatars` | public-read | client square-crop → WebP 512px, ≤1 MB, type-sniffed, write-then-swap | replaced on upload |
| `covers` | public-read | blog covers / OG assets | permanent |
| `verification-docs` | **private**; staff-only signed URLs | ≤5 MB, pdf/jpg/png, MIME-sniffed | **auto-purge 90 days after decision** (cron, clock-tested) |
| `resume-photos` | **private**; owner-scoped path `{user_id}/{resume_id}.webp` | square-crop WebP; signed-URL client fetch at export | deleted with resume; weekly orphan-sweep |

All uploads: type/size sniffing server-side (extension is not trust), private buckets for anything sensitive, signed URLs scoped and expiring.

## 9. Webhooks, cron & outbound integrations

- **WhatsApp webhook:** GET verification via `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; every POST verified against `X-Hub-Signature-256` with `WHATSAPP_APP_SECRET`; idempotent by `wamid`; malformed payloads never crash processing; kill-switch flag short-circuits the router. Inbound-only is architectural — no code path capable of unsolicited sends exists in v1 (replies only, via `lib/integrations/whatsapp.ts`). **STOP** sets `do_not_contact = true` **and** `opt_in_alerts = false`, replying with a single confirmation; because the bot is inbound-only, later inbound from the user is still answered — `do_not_contact` is the hard gate any future outbound path must check. **START** clears `do_not_contact` (it does not restore alert opt-in).
- **Cron endpoints:** `GET /api/cron/{job}?token=CRON_SECRET`; idempotent; each logs a run record. Full job inventory in `development-plan.md` §12.
- **All outbound side effects** (email, WhatsApp, future payments) go through `lib/integrations/*` (I10) — single choke point for review and kill-switches.
- **Email:** transactional only (no marketing, ever — Privacy §3); monograph-styled HTML + text part; account-security notices (link/unlink, deletion, force-rename) are mandatory sends.

## 10. Rate-limit catalog (table-backed sliding windows + Cloudflare outer layer)

| Surface | Limit |
|---|---|
| Sign-up | 5 / hour / IP |
| Sign-in | 10 / 15 min / IP, with backoff |
| Password reset | 3 / hour / identifier |
| Username availability | 30 / min / IP |
| Data export | 3 / day / user |
| AI proxy — burst | 30 requests / 5 min / user |
| AI proxy — daily | default 100 / day (user-adjustable 20–500; no unlimited) |
| AI output tokens | default 1,024 / response (user-adjustable 256–4,096) |
| AI chat context guard | "whole topic" disabled above ~150k chars estimated context |
| AI concurrency | one active stream per user |
| New accounts (<24 h) | 2 threads + 10 replies / day |
| Draft preview links | 30 opens / hour / IP |
| Employer submissions | rate-limited + Turnstile (flag-gated) |
| WhatsApp inbound | 30 messages / rolling hour / contact (one notice, then silence) |
| Admin routes | stricter than public equivalents (M4) |

## 11. Data retention & purge catalog

| Data | Window / rule |
|---|---|
| Account deletion grace | **14 days**, sign-in auto-cancels; then `purge-deleted-accounts` cron runs the contractual order: (1) ai_keys → (2) study data → (3) module personal rows (resumes, saved jobs, verification docs) → (4) waitlist by email → (5) storage objects → (6) public contributions → "deleted user" sentinel → (7) profiles + GoTrue user. Idempotent; writes PII-free `deletion_receipts` |
| Backups | Rolling **30 days**, encrypted, offsite (R2/B2); deleted data ages out with the cycle |
| Verification documents | Auto-delete **90 days** after decision; decision + license reference retained for badge integrity |
| WhatsApp message logs | **90 days**; the same cycle nulls `phone_encrypted` for contacts with no activity in 90 days and no active alert opt-in (Privacy Policy scopes the encrypted copy "solely for reply routing"). `phone_hash` + opt-in/do-not-contact flags persist to honor STOP |
| Draft preview links | 128-bit token, hashed at rest, single-subtopic scope; `expires_at = now()+7d`; revocable; auto-revoked on publish |
| Unverified accounts | Cleanup-eligible after **7 days** with zero activity |
| Handle quarantine (force-rename) | **90 days** |
| Audit log | **12 months** hot in Postgres → yearly encrypted export to R2 (immutable) → prune |
| Media replaced files / unused soft-delete | **30 days** each |
| Server logs (IP, UA) | Brief/short-term only |
| AI conversations | **Not stored** (session-only; sessionStorage client-side) |
| Search queries | Never stored per-user (aggregate Umami events only) |
| Study/profile/resume data | Life of the account |
| Appeals window | 14 days (different-staff review where feasible) |
| Writer/verification reapply | 30 days after rejection |

Privacy-rights requests (access, correction, deletion, objection) via privacy@epharmatica.com: verify identity first, respond within the target 30 days.

## 12. Infrastructure hardening (VPS runbook musts)

- SSH keys only + fail2ban; UFW default-deny (80/443 + SSH only); unattended-upgrades on.
- Only Traefik exposed; everything app↔Supabase on the internal Docker network. Supabase Studio + Kong admin bound to a private hostname, IP-allow-listed at Cloudflare **and** UFW.
- HTTPS everywhere (hard requirement for Google OAuth); HSTS; CSP allowing YouTube embeds (and nothing else external — inference is proxy-only); `frame-ancestors` locked.
- Docker images pinned; monthly patch window. Self-hosted Supabase upgrades: test on a scratch clone, snapshot first, announce a maintenance window.
- Secrets only in the Coolify env store. Rotate `SUPABASE_JWT_SECRET` + keys on any suspicion of compromise.
- Cloudflare WAF + rate rules as the coarse outer layer; cache-everything for anon with `Bypass on cookie: sb-*`.
- Cloudflare Access policy (or IP allowlist) on `/admin/*` — the fourth admin defense layer on top of proxy gate + permission map + RLS (v1.7 decision; CMS remains in-app, no separate deployment).
- EU data residency (Hetzner Falkenstein/Nuremberg) per the Privacy Policy; Cloudflare in front; encrypted backups to R2/B2.
- Dependency hygiene: weekly `pnpm audit` + Renovate.

## 13. Logging, redaction & analytics privacy

- pino structured logs with a redaction list covering: `authorization`, `x-api-key`/`x-provider-key`, `apiKey`, prompt/message bodies, phone numbers, emails.
- Sentry `beforeSend` scrubs the same set; releases tagged from CI.
- The AI path logs only `{user_hash, feature, provider, duration_ms, error_kind}` — nothing else (I6).
- Umami is cookieless, self-hosted, PII-free, and **absent** from `/admin` and the WhatsApp module (server-side aggregates there); events are code constants.
- Audit entries and auth events store **hashed** IPs; deletion receipts contain no PII.

## 14. Abuse, moderation & content security

- Report buttons on every thread/reply (and "Report an issue" on every study page — a medical-disclaimer obligation); reports land in the M4 queue; moderators review **all** reports (an affirmative policy commitment, staff it).
- Enforcement ladder: remove/hide → warn → mute (1/7/30 days) → ban; severe violations (threats, patient-data exposure, illegal content) skip the ladder and may be reported to authorities. All actions audited; sanctions block writes at RLS.
- Appeals: support@epharmatica.com, 14-day window, different staff member reviews where feasible.
- Anonymity (Question threads only) is permanent, data-layer enforced, and monitored (report-rate on anonymous vs named); `anon_questions` flag is the policy kill-switch.
- DMCA-style copyright intake via legal@epharmatica.com; prompt removal capability; repeat-infringer termination.
- Content protection: preview gate is server-enforced; scraping/bulk-download/ML-training extraction prohibited and rate-limited; Cloudflare bot rules assist.
- Medical accuracy: mandatory reviewer approval before publish (G6); persistent AI disclaimers with strict grounding; the Verified Pharmacist badge is point-in-time credential review, **not** a license-verification service — UI copy must not overclaim.

## 15. Backups & disaster recovery

- Nightly `pg_dump` (custom format) + weekly base backup + Storage bucket sync → encrypted upload to Cloudflare R2/Backblaze B2; 30-day retention.
- Targets: **RPO ≤ 24 h, RTO ≤ 4 h**.
- **Monthly restore drill** into a scratch container, calendar-enforced; the first drill happens in Phase 0 before real data exists.
- Snapshot before every Supabase upgrade or risky migration; the deploy pipeline takes an automatic pre-migration dump.
- Uptime Kuma alerting; documented recovery playbook; single-VPS risk consciously accepted at this stage (R2).

## 16. Legal & compliance launch checklist

Before public launch, every policy promise must be a shipped feature — shipping the policies without these is immediate self-inflicted non-compliance:

- [x] Counsel review of all four documents (Terms, Privacy, Content Policy, Medical Disclaimer) — **complete**, founder confirmation 19 Jul 2026
- [ ] Bracketed fields finalized in the actual files (they still contain placeholders as of 19 Jul 2026): effective dates, legal entity + registered address, jurisdiction city, liability cap, backup provider (R2 vs B2), email provider (Resend vs Brevo), privacy-response SLA; remove the DRAFT headers
- [ ] `/terms`, `/privacy`, `/content-policy`, `/medical-disclaimer` live and cross-linked
- [ ] Mailboxes live **and monitored**: legal@, privacy@, support@epharmatica.com
- [ ] Settings account deletion + 14-day machine; Settings → Data export
- [ ] AI key storage-mode chooser with "This device only" as default; AI disclaimers on every AI surface incl. WhatsApp later
- [ ] 90-day verification-doc auto-delete running
- [ ] Report on every thread/reply; "Report an issue" on study pages
- [ ] Age gate (13+ + under-18 parental-consent affirmation — close the M2/ToS delta); under-13 deletion-on-report process
- [ ] Cookies: essential + theme only; Umami cookieless; YouTube click-to-load via youtube-nocookie.com
- [ ] Policy-change announcement surface (updated effective dates)
- [x] Content Policy's employer-form directive matches reality — §4 wording **edited (19 Jul 2026, founder-directed)** to "use the employer submission channel on the Jobs page"; interim intake is `jobs@epharmatica.com` surfaced on the Jobs page (build task in the plan). Remaining: ensure the `jobs@` mailbox exists before the policy goes live
- [ ] Medical disclaimer visible across channels: study pages, AI outputs, forum, blog, WhatsApp replies
- [ ] Breach-notification process documented (users + authorities)

## 17. Review cadence

| What | When |
|---|---|
| RLS/security probe suite | Every PR (CI) |
| Dependency audit (`pnpm audit` + Renovate) | Weekly |
| Admin audit-log review | Weekly habit (dashboard tile) |
| Restore drill | Monthly |
| Docker/OS patch window | Monthly |
| Staff-2FA enforcement decision (R-M4a) | Quarterly, or immediately on incident / headcount > 5 |
| Business-model / entitlement review (R8) | Quarterly |
| This document | Every phase gate, and in any PR that changes a control |
