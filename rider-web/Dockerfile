# syntax=docker/dockerfile:1
#
# Production image for the rider marketing/onboarding site (rider.gatimitra.com).
#
# Build context: the rider-web/ directory itself (set in
# docker-compose.prod.yml as `context: ../../rider-web` and in the
# rider-web-deploy workflow as `context: rider-web`). rider-web is a
# STANDALONE app — it is NOT a workspace and shares no packages with the
# monorepo, so it installs in-place rather than via `npm ci --workspace=...`.
#
# Notes:
#   • Multi-stage standalone deploy via `output: 'standalone'` in
#     rider-web/next.config.js. The runner carries only the standalone bundle
#     + public/ + .next/static/. No npm at runtime.
#   • Only NEXT_PUBLIC_* are baked at build time (client bundle). Server-only
#     secrets (DATABASE_URL, R2_*, SUPABASE_SERVICE_ROLE_KEY, email creds) are
#     provided at RUNTIME via the env_file, never baked into the image.
#   • Non-root user (uid 1001) + healthcheck against `/` so deploy-service.sh
#     can verify the new replica before swapping.

# ────────────────────────────────────────────────────────────────────────
# Stage 1 — install deps (devDeps included; tailwind/postcss needed to build)
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

# ────────────────────────────────────────────────────────────────────────
# Stage 2 — build (produces .next/standalone)
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time NEXT_PUBLIC_* — these are the ONLY vars inlined into the client
# bundle. `ARG NEXT_PUBLIC_*` (wildcard) is NOT valid Docker syntax; each var
# must be declared explicitly.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

RUN npm run build

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

# Standalone bundle is rooted at the app dir: server.js sits at
# /app/.next/standalone/server.js with node_modules + .next/server beside it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=4s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ >/dev/null || exit 1

CMD ["node", "server.js"]
