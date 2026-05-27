# syntax=docker/dockerfile:1
#
# Production image for the Next.js partner portal (partner.gatimitra.com).
#
# Design notes:
#   • Multi-stage standalone deployment. `output: 'standalone'` is now enabled
#     in next.config.js — the build emits .next/standalone/ which bundles
#     `next` itself plus the minimal set of node_modules traced from actual
#     imports. The Windows-only Turbopack finalize bug is sidestepped by
#     using `next build --webpack` (the package.json `build` script).
#   • Runtime image only carries: standalone server tree + public/ + static/.
#     No separate `npm ci` step at runtime — the standalone bundle is
#     self-contained.
#   • Targeted workspace build: ONLY `gmmportal` (partnersite's package
#     name) is compiled. The previous Dockerfile ran `npm run build` which
#     resolved to the root's `turbo run build` and pulled in unrelated
#     workspaces.
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
# Stage 2 — build the partnersite workspace only (produces .next/standalone)
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo

# Bring the entire deps stage tree so root + any workspace-local
# node_modules survive (npm can't always hoist when workspaces pin
# conflicting peer-dep versions).
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

# Targeted workspace build. The `build` script in partnersite/package.json
# is `next build --webpack` — webpack on Linux Docker correctly finalizes
# the standalone output (Turbopack standalone-finalize is the buggy combo).
RUN npm run build --workspace=gmmportal

# ────────────────────────────────────────────────────────────────────────
# Stage 3 — minimal runtime
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

# Next standalone layout (with outputFileTracingRoot = monorepo root):
#   .next/standalone/
#   ├── node_modules/                ← traced deps (incl. next if hoisted)
#   ├── package.json                 ← root workspace manifest
#   └── partnersite/                 ← app subtree
#       ├── server.js                ← runtime entry
#       ├── node_modules/            ← workspace-local deps (incl. next when not hoisted)
#       └── .next/                   ← runtime artefacts
# Copy standalone root into /app, then place public/ + static/ under
# /app/partnersite/ where server.js expects them.
COPY --from=builder --chown=nextjs:nodejs /repo/partnersite/.next/standalone       ./
COPY --from=builder --chown=nextjs:nodejs /repo/partnersite/public                 ./partnersite/public
COPY --from=builder --chown=nextjs:nodejs /repo/partnersite/.next/static           ./partnersite/.next/static

USER nextjs
EXPOSE 3002

HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/api/health || exit 1

CMD ["node", "partnersite/server.js"]
