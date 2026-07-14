# syntax=docker/dockerfile:1
#
# Production image for the Next.js customer site (gatimitra.com).
#
# Build context: REPO ROOT (set in docker-compose.prod.yml as `context: ../..`).
# The cxsite app sits at /cxsite inside the repo and is NOT a workspace —
# it has its own package.json + package-lock.json, so we install in-place
# rather than running `npm ci --workspace=...`.
#
# Notes:
#   • Multi-stage standalone deployment via `output: 'standalone'` in
#     cxsite/next.config.js. The runner stage only carries the standalone
#     bundle + public/ + .next/static/. No npm at runtime.
#   • Legal markdown is bundled at build time from
#       apps/customer_app/legal/*.md
#     into cxsite/lib/legal/bundle.generated.ts via the `prebuild` script.
#     That directory must be in the build context — we explicitly COPY it.
#   • Non-root user (uid 1001) + healthcheck against `/`.

# ────────────────────────────────────────────────────────────────────────
# Stage 1 — install deps
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo/cxsite

COPY cxsite/package.json cxsite/package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

# ────────────────────────────────────────────────────────────────────────
# Stage 2 — build the cxsite app (produces .next/standalone)
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /repo

COPY --from=deps /repo/cxsite/node_modules ./cxsite/node_modules

# cxsite source
COPY cxsite ./cxsite
# The legal markdown source-of-truth lives under the customer mobile app.
# `prebuild` reads ../../apps/customer_app/legal/*.md to generate
# cxsite/lib/legal/bundle.generated.ts before `next build`.
COPY apps/customer_app/legal ./apps/customer_app/legal

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time NEXT_PUBLIC_*. Add any NEXT_PUBLIC_* var that cxsite reads
# in its client bundle. (Server-only env vars stay in env_file at runtime.)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG NEXT_PUBLIC_APP_DOWNLOAD_URL
ARG NEXT_PUBLIC_IOS_APP_DOWNLOAD_URL
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_MAPBOX_TOKEN=${NEXT_PUBLIC_MAPBOX_TOKEN}
ENV NEXT_PUBLIC_APP_DOWNLOAD_URL=${NEXT_PUBLIC_APP_DOWNLOAD_URL}
ENV NEXT_PUBLIC_IOS_APP_DOWNLOAD_URL=${NEXT_PUBLIC_IOS_APP_DOWNLOAD_URL}

WORKDIR /repo/cxsite
RUN npm run build

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

# Without `outputFileTracingRoot`, the standalone bundle is rooted at the
# app dir itself — server.js sits at /repo/cxsite/.next/standalone/server.js
# and node_modules + .next/server are right next to it.
COPY --from=builder --chown=nextjs:nodejs /repo/cxsite/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/cxsite/public           ./public
COPY --from=builder --chown=nextjs:nodejs /repo/cxsite/.next/static     ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=4s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1

CMD ["node", "server.js"]
