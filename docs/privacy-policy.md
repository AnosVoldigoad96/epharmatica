# Privacy Policy — ePharmatica

> **DRAFT — pending review by qualified legal counsel before publication.** Bracketed fields must be completed at launch.

**Effective date:** [set at launch] · **Data controller:** [legal entity / operator name], [registered address] · **Contact:** privacy@epharmatica.com

This policy explains what we collect on **epharmatica.com**, why, and your choices. Short version: we collect what the product needs, we run no advertising trackers, your study data is private, your AI keys are yours, and our servers are in the European Union.

## 1. What We Collect

**Account & profile.** Email address and password (hashed), or your name, email, and avatar from Google if you sign in with Google; username, display name, user type (student/pharmacist/other), and optional country, institution, and bio. Public profiles show only username, display name, avatar, bio, badges, and public activity.

**Study data (private).** Highlights, personal notes, bookmarks, progress ("mark as complete") records, and saved jobs. These are visible only to you and are never published.

**Community content (public).** Forum threads/replies, blog posts (approved writers), votes you cast, and reports you file. Public content is visible to anyone, indexed by search engines, and may be surfaced via the WhatsApp assistant.

**Verified Pharmacist applications (sensitive).** If you apply, we collect your name, license/registration number, issuing council, and uploaded credential documents. Documents are stored in a private bucket, accessible only to reviewing staff, and are **automatically deleted 90 days after a decision**; the decision and license reference are retained for badge integrity.

**AI keys & prompts (BYOK).** If you use AI features you provide an API key for your chosen provider. Two storage modes: **"This device only"** (default — the key stays in your browser and is sent per-request over TLS, held only in server memory) or **"Sync across devices"** (the key is encrypted with a server-held application key before database storage). Keys are masked after entry, excluded from logs and error reports, and deleted immediately on request or account deletion. Your prompts and the relevant study content are transmitted to your chosen provider to generate responses; **we do not store AI conversations**. Your provider processes that data under its own privacy terms — review them.

**Resume data (private).** Resume content you enter is stored privately in your account; PDF files are generated **in your browser** and are not uploaded to us.

**Employer job submissions.** Company and contact details submitted with a listing, used to verify and manage the listing.

**WhatsApp assistant (when launched).** If you message our WhatsApp number: your phone number (stored hashed, with an encrypted copy solely for reply routing), your messages, and our replies, retained for 90 days. We message you only in reply to messages you initiate unless you separately opt in to alerts.

**Technical data.** Server logs (IP address, user agent, timestamps) for security and debugging, retained briefly; error reports via Sentry with personal data scrubbed; and privacy-respecting analytics (see §2).

**Waitlist & support.** Email addresses you submit for feature waitlists, and correspondence you send us.

## 2. Cookies & Analytics

We use only **essential cookies**: authentication/session cookies and a theme preference. We run **self-hosted, cookieless analytics (Umami)** that aggregates page views and feature-usage events without cross-site tracking, and **we use no advertising or third-party tracking pixels**. Embedded YouTube videos load only after you click play and use YouTube's privacy-enhanced mode (`youtube-nocookie.com`); once playing, Google/YouTube processes data under its own policy.

## 3. How We Use Data

To provide and secure the service (accounts, content access, study tools, community, jobs, resume builder); to review verification and writer applications; to moderate and enforce our policies; to respond to support requests; to measure aggregate product usage; to send transactional email (verification, password reset, essential service notices) via our email provider; and to comply with legal obligations. **We do not sell personal data and we do not use it for advertising.** Marketing communications, if ever introduced, will be opt-in.

## 4. Sharing & Processors

We share data only with service providers acting on our instructions, and only what each needs:

- **Hetzner (Germany/Finland)** — server hosting; all application data resides in the EU.
- **Cloudflare** — DNS, CDN, TLS, and security in front of our servers; encrypted backups stored in Cloudflare R2 [or Backblaze B2].
- **Google** — if you choose Google sign-in; and YouTube for embedded videos (privacy-enhanced mode) once you press play.
- **Your chosen AI provider** (OpenAI, Anthropic, Google, OpenRouter, or Groq) — receives your prompts and related content only when you use AI features, under your key and their terms.
- **[Resend/Brevo]** — transactional email delivery.
- **Sentry** — error monitoring, with keys, emails, and phone numbers scrubbed.
- **Meta (WhatsApp Business Platform)** — message delivery, when the WhatsApp assistant launches.

We may disclose data where required by law or to protect users, the public, or the Platform, and in any merger/transfer of the service (with notice).

## 5. International Transfers

Our servers are in the EU; our users are worldwide, including Pakistan. Providers above may process limited data in other jurisdictions under their published safeguards. By using the Platform you understand your data is processed on EU-based infrastructure.

## 6. Retention

Account, profile, study, and resume data: for the life of your account. Verification documents: 90 days post-decision. WhatsApp logs: 90 days. Encrypted backups: rolling ~30 days. Server logs: short-term. On **account deletion** (available in Settings): personal data, study data, resumes, and AI keys are erased; public forum/blog contributions are either deleted or anonymized ("deleted user") to preserve thread coherence — you may request full deletion of your public posts; residual copies clear from backups within the backup cycle.

## 7. Your Rights & Choices

Regardless of where you live, you can: access and update your profile in Settings; **export your notes, highlights, and progress** (Settings → Data); delete individual content; switch or delete AI keys at any time; and delete your account entirely. You may also contact **privacy@epharmatica.com** to exercise access, correction, deletion, or objection rights available under applicable law (including Pakistani data-protection law and, where it applies, the GDPR). We will verify identity before acting and respond within a reasonable period [target: 30 days].

## 8. Security

TLS everywhere; row-level security isolating each user's private data at the database layer; encrypted storage of synced AI keys; private buckets for sensitive documents; least-privilege staff access with audit logging; hardened, patched servers; and encrypted offsite backups with restore testing. No system is perfectly secure; we will notify affected users and authorities of any breach as required by applicable law.

## 9. Children

The Platform is not directed to children under 13, and we do not knowingly collect their data. If you believe a child under 13 has an account, contact us and we will delete it.

## 10. Changes & Contact

We will post updates here with a new effective date and announce material changes on the Platform. Questions or requests: **privacy@epharmatica.com**.
