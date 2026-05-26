# syntax=docker/dockerfile:1
#
# Production image for the Next.js partner portal (partner.gatimitra.com).
#
# Design notes:
#   • Multi-stage. Partnersite does NOT use Next standalone output (the
#     comment in next.config.js explains: Turbopack + `output: 'standalone'`
#     fails on Windows during finalize). So the runtime image carries the
#     full `.next/` build output, the public dir, and a prod-only
#     `node_modules` re-installed in the runner stage.
#   • Targeted workspace build: ONLY `gmmportal` is built. The previous
#     Dockerfile copied the root package.json to /app and then ran
#     `npm run build` which resolved to the root's `turbo run build` —
#     Turbo then tried to build the dashboard workspace as well, producing
#     `sh: next: not found` because dashboard's deps weren't installed in
#     this image.
#   • Partnersite has ZERO @gatimitra/* shared package deps, so no
#     workspace cross-builds are needed.
#   • Non-root user (uid 1001) + healthcheck against /api/health.
#
# Build context: repo root (set in docker-compose.prod.yml as `context: ../..`).

# ────────────────────────────────────────────────────────────────────────
# Stage 1 — install all deps (dev + prod) needed for the build
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo

COPY package.json package-lock.json ./
COPY partnersite/package.json ./partnersite/package.json

RUN npm ci --no-audit --no-fund --ignore-scripts

# ────────────────────────────────────────────────────────────────────────
# Stage 2 — build the partnersite workspace only
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo

# Bring the entire deps stage tree so root + any workspace-local
# node_modules survive (npm sometimes can't hoist due to peer-dep
# conflicts across workspaces).
COPY --from=deps /repo /repo

# Only partnersite source — explicitly avoid `COPY . .` which would drag
# dashboard, backend, mobile apps, and their build artefacts into context.
COPY partnersite ./partnersite

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time NEXT_PUBLIC_* (Next bakes these into the client JS).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Targeted workspace build. Critically NOT `npm run build` — that would
# resolve to the root's `turbo run build` and pull in every workspace.
# `gmmportal` is partnersite's package.json "name".
RUN npm run build --workspace=gmmportal

# ────────────────────────────────────────────────────────────────────────
# Stage 3 — production-only deps (no dev deps, no build tooling)
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo

COPY package.json package-lock.json ./
COPY partnersite/package.json ./partnersite/package.json

# `--omit=dev` strips devDependencies; `--workspace=gmmportal` plus
# `--include-workspace-root` installs only what runtime partnersite needs
# plus root-level shared deps. Much smaller than the deps stage.
RUN npm ci --no-audit --no-fund --ignore-scripts --omit=dev \
      --workspace=gmmportal --include-workspace-root

# ────────────────────────────────────────────────────────────────────────
# Stage 4 — minimal runtime
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache wget \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Root manifest first so workspace symlinks under node_modules resolve.
COPY --from=prod-deps --chown=nextjs:nodejs /repo/package.json              ./package.json
COPY --from=prod-deps --chown=nextjs:nodejs /repo/node_modules              ./node_modules

# Build artefacts + partnersite manifest needed by `next start`.
COPY --from=builder  --chown=nextjs:nodejs /repo/partnersite/.next          ./partnersite/.next
COPY --from=builder  --chown=nextjs:nodejs /repo/partnersite/public         ./partnersite/public
COPY --from=builder  --chown=nextjs:nodejs /repo/partnersite/package.json   ./partnersite/package.json
COPY --from=builder  --chown=nextjs:nodejs /repo/partnersite/next.config.js ./partnersite/next.config.js

USER nextjs
WORKDIR /app/partnersite
EXPOSE 3002

HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/api/health || exit 1

# Invoke next's CLI through node — avoids needing `next` binary in PATH.
CMD ["node", "../node_modules/next/dist/bin/next", "start", "-p", "3002"]
