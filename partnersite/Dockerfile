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
# @gatimitra/financial-rules is consumed by partnersite via
#   "main": "./dist/index.js"
# so it must be present + built before partnersite's Next build runs.
COPY packages/financial-rules/package.json ./packages/financial-rules/package.json
COPY packages/store-status/package.json ./packages/store-status/package.json
COPY packages/shared-config/package.json ./packages/shared-config/package.json
# @gatimitra/merchant-payout is imported by partnersite (payout-settlement /
# payout-utils under /app/mx/payments) and needs @gatimitra/contracts as a
# build-time dep. Both must be present or `next build` fails with
# "Can't resolve '@gatimitra/merchant-payout'".
COPY packages/merchant-payout/package.json ./packages/merchant-payout/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
# Source-only print packages (bill/KOT); Next transpiles them via transpilePackages.
# Their package.json must be present so `npm ci` links the workspace.
COPY packages/print-utils/package.json ./packages/print-utils/package.json
COPY packages/bill-print/package.json ./packages/bill-print/package.json
COPY packages/kot-print/package.json ./packages/kot-print/package.json
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

# Only partnersite source + the one shared package it imports.
# Explicitly avoid `COPY . .` which would drag dashboard, backend, mobile
# apps, and their build artefacts into context.
COPY partnersite              ./partnersite
COPY packages/financial-rules ./packages/financial-rules
COPY packages/store-status    ./packages/store-status
COPY packages/shared-config   ./packages/shared-config
COPY packages/contracts       ./packages/contracts
COPY packages/merchant-payout ./packages/merchant-payout
COPY packages/print-utils     ./packages/print-utils
COPY packages/bill-print      ./packages/bill-print
COPY packages/kot-print       ./packages/kot-print

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time NEXT_PUBLIC_* (Next bakes these into the client JS). Anything
# the client bundle dereferences via `process.env.NEXT_PUBLIC_*` must be
# here — runtime `env_file:` injection is too late for client-side code.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_R2_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_DISABLE_CURRENT_LOCATION
ARG NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN
ARG NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_MAPBOX_TOKEN=${NEXT_PUBLIC_MAPBOX_TOKEN}
ENV NEXT_PUBLIC_R2_PUBLIC_BASE_URL=${NEXT_PUBLIC_R2_PUBLIC_BASE_URL}
ENV NEXT_PUBLIC_DISABLE_CURRENT_LOCATION=${NEXT_PUBLIC_DISABLE_CURRENT_LOCATION}
ENV NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN=${NEXT_PUBLIC_ENABLE_PHONE_OTP_LOGIN}
ENV NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER=${NEXT_PUBLIC_ENABLE_PHONE_OTP_REGISTER}

# @gatimitra/bill-print is source-only; its own `build` script is a no-op echo.
# But its package.json `node` export condition points at ./dist/index.js, and
# Next's webpack SERVER build matches that `node` condition — so the dist MUST
# exist before `next build`, or gmmportal fails with
#   Module not found: Can't resolve '@gatimitra/bill-print'
# Bundle it self-contained here, like backend/Dockerfile does for its node
# runtime. NOTE: unlike the backend image, the partnersite deps stage does not
# copy backend/package.json, so esbuild is NOT installed (no tsx). Fetch the
# pinned esbuild on demand via npx. kot-print / print-utils have no `node`
# condition, so they resolve to src (transpilePackages) and need no dist.
RUN npx --yes esbuild@0.25.12 packages/bill-print/src/index.ts \
      --bundle --format=esm --platform=node \
      --outfile=packages/bill-print/dist/index.js

# Targeted workspace build. The `build` script in partnersite/package.json
# is `next build --webpack` — webpack on Linux Docker correctly finalizes
# the standalone output (Turbopack standalone-finalize is the buggy combo).
# Order matters — shared packages first, then the consuming app.
# Topological order (leaves first): contracts has no @gatimitra/* deps;
# merchant-payout depends on contracts; then the two independent packages;
# gmmportal (partnersite) consumes them all last.
RUN npm run build \
      --workspace=@gatimitra/contracts \
      --workspace=@gatimitra/merchant-payout \
      --workspace=@gatimitra/financial-rules \
      --workspace=@gatimitra/store-status \
      --workspace=@gatimitra/print-utils \
      --workspace=@gatimitra/bill-print \
      --workspace=@gatimitra/kot-print \
      --workspace=gmmportal

# ────────────────────────────────────────────────────────────────────────
# Stage 3 — minimal runtime
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
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
EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "partnersite/server.js"]
