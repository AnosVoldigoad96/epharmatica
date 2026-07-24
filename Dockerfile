# syntax=docker/dockerfile:1
# ePharmatica — single deployable (apps/web, Next.js standalone output).
# Built ON the server (deploy: /opt/epharmatica-app on the Hetzner box);
# routed via the existing epharmatica cloudflared tunnel — no Coolify
# (dev-plan 0.A amended: compose + cloudflared is the deploy topology).

FROM node:22-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    HUSKY=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

# NEXT_PUBLIC_* values are baked into the client bundle at build time — the
# anon key is public by design (RLS is the boundary, rules.md I1).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL=https://epharmatica.com
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
RUN pnpm build

FROM node:22-alpine AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Standalone output carries its own pruned node_modules, the traced repo-root
# docs/ (legal page sources), and apps/web/server.js as the entrypoint.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# sharp (media pipeline, 1.B-4) is imported at runtime by name; the
# pnpm+standalone trace copies its store dir but creates no name-resolvable
# link, so install it directly here — this also guarantees the alpine/musl
# binaries match the runtime image. Keep the version in lockstep with
# apps/web/package.json.
RUN npm install --no-save --prefix /app sharp@0.35.3 \
  && chown -R node:node /app/node_modules
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
