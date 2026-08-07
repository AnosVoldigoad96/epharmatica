# Server Infrastructure — as actually deployed

**Verified against the live host 2026-08-07.** Written by enumerating running
containers, port mappings, cron, backups and tunnel config — not from the design
docs.

> ## ⚠️ This diverges from `docs/ARCHITECTURE.md` §1 and §8
>
> ARCHITECTURE.md describes the _intended_ deployment. Several parts were never
> built or have since changed. Where they disagree, **this document is what is
> running**.
>
> | ARCHITECTURE.md says               | Reality                                                                                                                                  |
> | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
> | "Coolify → Traefik"                | **No Coolify.** It was trialled 2026-08-06 and fully removed the next day. ePharmatica is routed by **its own `cloudflared` container**. |
> | "4 vCPU / 8 GB VPS"                | **20-core, 64 GB bare-metal Hetzner dedicated server**, shared with another production system.                                           |
> | "umami · uptime-kuma"              | Not deployed. Monitoring is **dozzle** (logs) + **beszel** (metrics), owned by the other project.                                        |
> | "staging (second compose project)" | **No staging exists.**                                                                                                                   |
> | "Coolify webhook deploy"           | GitHub Actions SSH'd to the host and ran a script — **currently broken**, see Deployment.                                                |
>
> **The single most important omission:** the host is **shared with UnusedMind**, a
> live sales CRM. That is not a detail — it is the source of a real outage on
> 2026-08-07 (see Port allocation).

---

## 1. The host

|                     |                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Address             | `178.63.23.176`                                                                             |
| Hardware            | Hetzner **dedicated** (bare metal), 20 cores, 64 GB RAM                                     |
| OS                  | Ubuntu 24.04                                                                                |
| Disk                | `/` 436 GB (7% used) · `/mnt/storage` 938 GB NVMe (used by the other project)               |
| **Snapshots**       | **None.** Dedicated servers have no snapshot/rollback. Every revert must be staged by hand. |
| Shares the box with | **UnusedMind CRM** (live) — its own Nhost stack, web app, PDF service, VPN, monitoring      |

Access is key-only; SSH password authentication was disabled 2026-08-06. ePharmatica
has no dedicated login — administration is via the host owner's root access.

---

## 2. Port allocation — the prefix convention

The host uses a documented convention (owner's `Server/PROJECT_ONBOARDING.md`):
**the primary stack keeps default ports; every secondary project offsets them by a
single-digit prefix.** ePharmatica is **prefix `1`**.

| Service                      | Host binding      | Notes          |
| ---------------------------- | ----------------- | -------------- |
| Kong (HTTP)                  | `127.0.0.1:18000` |                |
| Kong (HTTPS)                 | `127.0.0.1:18443` |                |
| Supavisor → Postgres         | `127.0.0.1:15432` | set 2026-08-07 |
| Supavisor transaction pooler | `127.0.0.1:16543` | set 2026-08-07 |

Everything binds to loopback. Nothing in this stack is directly reachable from the
internet — public traffic arrives only through the tunnel.

> ### The 2026-08-07 outage — read before touching ports
>
> Supavisor's compose mapped bare **`5432`**, which is owned by the _other_
> project's production Postgres. The running container predated that config, so it
> had never re-bound and the conflict stayed hidden. A routine `--force-recreate`
> surfaced it and the pooler would not start.
>
> The fix attempt then made it worse: **`POSTGRES_PORT` in `.env` is used twice** —
> as the host-side port mapping **and** as PostgreSQL's own `port` parameter inside
> `supabase-db`. Setting it to `127.0.0.1:15432` took the database down with:
>
> ```
> FATAL: invalid value for parameter "port": "127.0.0.1:15432"
> ```
>
> **Rules that follow:**
>
> 1. `POSTGRES_PORT` must stay a plain `5432`. Change only the **host side** of the
>    `ports:` line in `docker-compose.yml`.
> 2. `POOLER_PROXY_PORT_TRANSACTION` is used once (host side only) and is safe to
>    change — but it is now a literal in the compose for consistency.
> 3. Before changing any port variable, `grep` for every use first.
>
> Backups on the host: `docker-compose.yml.bak-poolerport`,
> `docker-compose.yml.bak-6543`, `.env.bak-portfix-*`.

---

## 3. Containers

16 containers, project name **`epharmatica-supabase`** (except the web app).

| Group    | Containers                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase | `supabase-db`, `-kong`, `-auth`, `-rest`, `-realtime`, `-storage`, `-imgproxy`, `-studio`, `-meta`, `-analytics`, `-vector`, `-pooler`, `-edge-functions` |
| Custom   | `epharmatica-supabase-email-templates-1` (nginx serving GoTrue templates)                                                                                 |
| App      | `epharmatica-web`                                                                                                                                         |
| Routing  | `epharmatica-cloudflared`                                                                                                                                 |

**Locations**

```
/opt/epharmatica-supabase/supabase-upstream/docker/   # Supabase stack + .env
/opt/epharmatica-app/                                 # web app: compose, .env, repo/, deploy script
/opt/epharmatica-backups/                             # nightly dumps + backup.sh
```

> ### 🚨 Always pass `-p epharmatica-supabase`
>
> ```bash
> cd /opt/epharmatica-supabase/supabase-upstream/docker
> docker compose -p epharmatica-supabase ps
> docker compose -p epharmatica-supabase up -d --force-recreate <service>
> ```
>
> The directory is named `docker`, and `COMPOSE_PROJECT_NAME` is **not** set in
> `.env`. A bare `docker compose` therefore derives the project name `docker`,
> concludes the running containers are not its own, and tries to **create**
> duplicates — failing on the fixed `container_name` values. This wasted two
> attempts on 2026-08-07.

**Local customisation:** `docker-compose.override.yml` adds the `email-templates`
nginx service and points GoTrue's mailer at it **by container name**
(`http://email-templates/...`). Anything that renames containers breaks this.

---

## 4. Routing

ePharmatica has **its own Cloudflare tunnel**, separate from the other project's.

|               |                                                                         |
| ------------- | ----------------------------------------------------------------------- |
| Container     | `epharmatica-cloudflared` (`cloudflare/cloudflared:latest`)             |
| Auth          | `TUNNEL_TOKEN` environment variable                                     |
| Ingress rules | **In the Cloudflare Zero Trust dashboard — not on disk**                |
| Command       | `tunnel --no-autoupdate run`                                            |
| Network       | `epharmatica-supabase_default`, so it resolves other containers by name |

**Consequences:**

- Routing **cannot be changed from the server**. It is a dashboard action.
- The tunnel reaches containers **by DNS name** on the shared network, so container
  names are load-bearing. Anything that renames them breaks routing.
- The other project's shared Traefik does **not** front ePharmatica.

---

## 5. Deployment — ⚠️ CURRENTLY BROKEN

**Intended flow** (`/opt/epharmatica-app/deploy-from-ci.sh`):

1. GitHub Actions SSHes to the host as **root** using the `DEPLOY_SSH_KEY` secret
2. `git fetch` + `reset --hard origin/main` into `/opt/epharmatica-app/repo`
   (using a separate deploy key, `/root/.ssh/id_ed25519_epharmatica`)
3. `docker build` with four `NEXT_PUBLIC_*` build args, two read out of server
   `.env` files (`ANON_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`)
4. `docker compose up -d`, then poll for `healthy`

**Why it is broken:** on 2026-08-06 the host's root `authorized_keys` was audited
and pruned. `github-actions-deploy@epharmatica` was **removed deliberately** — a
GitHub-_hosted_ runner held **root** on a machine running someone else's production
database, reachable from rotating Azure IPs (so not even lockable by source IP).
Anyone able to push to this repo, or to compromise a workflow or dependency in it,
had root there.

**Do not simply re-add a root key.** Before launch, pick one:

| Option                               | Notes                                                  |
| ------------------------------------ | ------------------------------------------------------ |
| **Self-hosted runner** (recommended) | What UnusedMind uses. Needs no inbound SSH key at all. |
| Non-root deploy user                 | Scoped account + narrow sudo for the compose commands. |

The build itself still works; only the trigger path is severed. A manual deploy is
`bash /opt/epharmatica-app/deploy-from-ci.sh` as root on the host.

---

## 6. Backups

|          |                                                                               |
| -------- | ----------------------------------------------------------------------------- |
| Schedule | `/etc/cron.d/…` → `30 3 * * * root /opt/epharmatica-backups/backup.sh`        |
| What     | `pg_dump -Fc` of `postgres`; `pg_dumpall --globals-only` on Sundays           |
| Local    | `/opt/epharmatica-backups/dumps`, 30-day retention                            |
| Offsite  | `rclone` → `r2-epharmatica:epharmatica-backups/dumps` — **confirmed working** |
| Log      | `/opt/epharmatica-backups/backup.log`                                         |
| Size     | ~560 KB/dump (DB is ~212 MB on disk)                                          |

> ### ⚠️ Storage objects are NOT backed up
>
> The script covers Postgres only. Supabase **Storage** objects
> (`volumes/storage/`) have no backup. That is fine while unlaunched and becomes a
> real gap the moment users upload anything.
>
> The other project hit exactly this: its uploaded files had no backup for a month
> and it was only found by accident. Fix before launch.

> **No alerting.** Unlike the other project's backup (a Sentry cron monitor with a
> dead-man switch), a silent failure here goes unnoticed. The log is the only
> signal.

---

## 7. Container logs

The Docker daemon sets `max-size 10m / max-file 3`, but that only applies to
containers created **after** 2026-08-06. Log config is fixed at container creation.

The whole ePharmatica stack was recreated on 2026-08-07, so **it is capped**. If you
restore an older container from an image, check:

```bash
docker inspect -f '{{.HostConfig.LogConfig.Config}}' <container>
```

Context: an uncapped log on the other project reached **1.6 GB**.

---

## 8. Pre-launch checklist

Everything below is safe to leave while unlaunched, and must be resolved before
real users exist:

- [ ] **Restore deployments** via a self-hosted runner or non-root deploy user
- [ ] **Back up Storage objects**, not just Postgres
- [ ] **Add backup alerting** (dead-man monitor, as the other project has)
- [ ] **Reconcile `docs/ARCHITECTURE.md`** §1 and §8 with this document
- [ ] **Confirm tunnel ingress** in the Cloudflare dashboard still points at the
      right container names after any stack change
- [ ] Consider whether sharing a box with an unrelated production CRM is acceptable
      at launch — a resource spike or a mistake on either side affects both

---

## 9. Cross-references

- Owner's host-wide docs: `Danish/Server/SERVER_DOCUMENTATION.md`,
  `SERVICE_HIERARCHY.md`, `PROJECT_ONBOARDING.md` (the port-prefix convention)
- The other project's runbook, which records the Coolify trial, the
  Docker-bypasses-UFW trap, and the SSH hardening:
  `UnusedMind/docs/Self_Hosting_Runbook.md` §12–§14
