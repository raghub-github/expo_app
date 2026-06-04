# syntax=docker/dockerfile:1
#
# Production image for the Next.js admin dashboard (control.gatimitra.com).
#
# Design notes:
#   • Multi-stage; runtime image carries only the Next.js standalone output.
#   • Builds ONLY the dashboard workspace + @gatimitra/contracts (its sole
#     shared package). The previous Dockerfile copied the root package.json
#     to /app and then ran `npm run build`, which resolved to the root's
#     `turbo run build` script — Turbo would then try to build EVERY
#     workspace including gmmportal/partnersite (whose `next` binary isn't
#     installed in this image), producing `sh: next: not found`.
#   • Copies the entire `/repo` tree from the deps stage so workspace-local
#     `node_modules/` (where npm puts deps it can't hoist due to version
#     conflicts across workspaces) survive into the build stage.
#   • Non-root user (uid 1001) + healthcheck against /api/health.
#
# Build context: repo root (set in docker-compose.prod.yml as `context: ../..`).

# ────────────────────────────────────────────────────────────────────────
# Stage 1 — install deps for dashboard + the one shared package it imports
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo

# Workspace manifests. Missing any one would cause `npm ci` to refuse with
# "Cannot find module" because the lockfile expects them all.
COPY package.json package-lock.json ./
COPY dashboard/package.json            ./dashboard/package.json
COPY packages/contracts/package.json   ./packages/contracts/package.json

# --ignore-scripts: avoid running lifecycle hooks during install (some
# native postinstalls fail on Alpine without dev toolchain). Lifecycle for
# the build itself happens in stage 2.
RUN npm ci --no-audit --no-fund --ignore-scripts

# ────────────────────────────────────────────────────────────────────────
# Stage 2 — build TS → JS + standalone Next output
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo

# Bring the entire deps stage tree so root + workspace-local node_modules
# (and the manifests they installed against) all survive. See backend
# Dockerfile for the full story — same nodemailer/@types-versioning class
# of bug bites here if we only copy root node_modules.
COPY --from=deps /repo /repo

# Overlay source for dashboard + the one shared package. We deliberately
# do NOT `COPY . .` — that would drag partnersite, backend, mobile apps,
# and their `.next` build artefacts into this image's context.
COPY dashboard            ./dashboard
COPY packages/contracts   ./packages/contracts

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Next bakes `NEXT_PUBLIC_*` env into the JS bundle at build time, so pass
# them via build args (set in the workflow / docker-compose).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Targeted workspace build. Critically NOT `npm run build` (which would
# pick up the root script `turbo run build` and try to build every
# workspace).
#
# Build order matters: @gatimitra/contracts is consumed by dashboard
# (imported in src/lib/db/operations/merchant-wallet.ts). Its package.json
# `main` points to ./dist/index.js, so the dist must exist BEFORE Next's
# webpack tries to resolve the import. npm executes --workspace flags
# left-to-right, so contracts builds first.
#
# `transpilePackages: ["@gatimitra/contracts"]` in next.config.ts only
# controls whether Next transpiles a resolved file — it does NOT change
# how the package is resolved. The resolution still goes through
# package.json/main, which has to exist on disk.
RUN npm run build \
      --workspace=@gatimitra/contracts \
      --workspace=dashboard

# ────────────────────────────────────────────────────────────────────────
# Stage 3 — minimal runtime
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache wget \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Next standalone output: a self-contained directory with server.js and the
# subset of node_modules actually used at runtime. With `outputFileTracingRoot`
# set to the MONOREPO ROOT (so the tracer can follow hoisted workspace deps
# like `next` itself), the standalone tree is nested:
#   .next/standalone/
#   ├── node_modules/                   ← traced deps (incl. next)
#   ├── packages/                       ← traced workspace packages
#   ├── package.json                    ← root workspace manifest
#   └── dashboard/                      ← app subtree
#       ├── server.js                   ← runtime entry
#       └── .next/                      ← runtime artefacts
# So we copy the standalone root into /app, then place public/ + static/
# under /app/dashboard/ where server.js expects them.
COPY --from=builder --chown=nextjs:nodejs /repo/dashboard/.next/standalone       ./
COPY --from=builder --chown=nextjs:nodejs /repo/dashboard/public                 ./dashboard/public
COPY --from=builder --chown=nextjs:nodejs /repo/dashboard/.next/static           ./dashboard/.next/static

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1

CMD ["node", "dashboard/server.js"]
