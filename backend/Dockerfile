# syntax=docker/dockerfile:1
#
# Production image for the Fastify backend.
#
# Design notes:
#   • Multi-stage so the runtime image carries only compiled JS + prod deps.
#   • Builds ONLY the backend workspace (not all workspaces — the previous
#     `npm -ws run build` blew up on Expo apps that have no build script).
#   • Copies the package.json of each @gatimitra/* package the backend
#     imports (contracts, event-contracts, logger, queue, redis). Adding a
#     new shared package import → add a COPY line and a workspace filter
#     below.
#   • Runs as non-root (uid 1001) with a HEALTHCHECK against /v1/health.
#   • `npm prune --omit=dev` strips devDependencies from the runtime layer.
#
# Build context: repo root (set in docker-compose.prod.yml as `context: ../..`).

# ────────────────────────────────────────────────────────────────────────
# Stage 1 — install dependencies for backend + its workspace packages
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /repo

# Copy every manifest needed to resolve npm workspaces. node_modules layout
# is determined by these and the root lockfile; missing any one would cause
# npm to skip that workspace.
COPY package.json package-lock.json ./
COPY backend/package.json                    ./backend/package.json
COPY packages/contracts/package.json         ./packages/contracts/package.json
COPY packages/event-contracts/package.json   ./packages/event-contracts/package.json
COPY packages/financial-rules/package.json   ./packages/financial-rules/package.json
COPY packages/logger/package.json            ./packages/logger/package.json
COPY packages/queue/package.json             ./packages/queue/package.json
COPY packages/redis/package.json             ./packages/redis/package.json
COPY packages/slab-pricing/package.json      ./packages/slab-pricing/package.json
COPY packages/store-status/package.json      ./packages/store-status/package.json
# @gatimitra/merchant-payout is consumed by backend/src/lib/merchant-payout-*.
# Depends on @gatimitra/contracts (already listed above).
COPY packages/merchant-payout/package.json   ./packages/merchant-payout/package.json
# shared-config is a config-only workspace (no source, no build step) — but
# event-contracts/logger/queue/redis all have
#   "extends": "@gatimitra/shared-config/tsconfig.node.json"
# in their tsconfig. Without it in the context, `tsc` in stage 2 fails with
#   File '@gatimitra/shared-config/tsconfig.node.json' not found.
COPY packages/shared-config/package.json     ./packages/shared-config/package.json

# --ignore-scripts skips lifecycle hooks at install time (some packages have
# postinstalls that fail on Alpine); the build stage runs them properly.
RUN npm ci --no-audit --no-fund --ignore-scripts

# ────────────────────────────────────────────────────────────────────────
# Stage 2 — build TS → JS for backend + the 5 shared packages it imports
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /repo

# Copy the ENTIRE deps stage tree (root node_modules + every workspace's
# local node_modules). npm cannot always hoist devDeps when sibling
# workspaces pin different versions — e.g. backend wants
# @types/nodemailer@^8.0.0 while dashboard wants ^7.0.11, so npm installs
# each into its own `<workspace>/node_modules`. Copying only the root
# node_modules (as the original Dockerfile did) silently dropped those
# workspace-local types, producing TS7016 "Could not find a declaration
# file for module 'nodemailer'" at build time. Copying the whole /repo
# tree keeps both layouts intact.
COPY --from=deps /repo /repo

# Overlay source files. Docker COPY merges into the destination — the
# node_modules dirs already present from the deps stage are preserved.
COPY backend                  ./backend
COPY packages/contracts       ./packages/contracts
COPY packages/event-contracts ./packages/event-contracts
COPY packages/financial-rules ./packages/financial-rules
COPY packages/logger          ./packages/logger
COPY packages/queue           ./packages/queue
COPY packages/redis           ./packages/redis
COPY packages/slab-pricing    ./packages/slab-pricing
COPY packages/store-status    ./packages/store-status
COPY packages/merchant-payout ./packages/merchant-payout
# shared-config carries the tsconfig.*.json files the 4 packages above extend.
# No build step here (no source) — it's a config-only workspace.
COPY packages/shared-config   ./packages/shared-config

# Targeted build — only the 6 workspaces the backend needs.
#
# Order matters: npm processes --workspace= flags left-to-right. Each
# package's `tsc` step imports from its declared @gatimitra/* deps, which
# must already be compiled to ./dist by the time tsc runs. Listing backend
# first (as the original Dockerfile did) caused
#   error TS2307: Cannot find module '@gatimitra/redis'
# Topological order, leaves first:
#   1. contracts        — no @gatimitra/* deps
#   2. redis            — no @gatimitra/* deps
#   3. event-contracts  — no @gatimitra/* deps
#   4. logger           — no @gatimitra/* deps
#   5. queue            — depends on @gatimitra/redis
#   6. backend          — depends on all 5
#
# If you add a new shared package the backend imports, add it here AND to
# the `COPY` block above AND to the `deps` stage.
RUN npm run build \
      --workspace=@gatimitra/contracts \
      --workspace=@gatimitra/merchant-payout \
      --workspace=@gatimitra/redis \
      --workspace=@gatimitra/event-contracts \
      --workspace=@gatimitra/financial-rules \
      --workspace=@gatimitra/slab-pricing \
      --workspace=@gatimitra/store-status \
      --workspace=@gatimitra/logger \
      --workspace=@gatimitra/queue \
      --workspace=@gatimitra/backend

# Drop devDependencies so the runtime image doesn't carry TypeScript, tsx,
# pino-pretty, etc. Done after build (TS is a devDep but is required during
# the build step).
RUN npm prune --omit=dev --workspaces --include-workspace-root \
    && rm -rf /repo/.npm /root/.npm

# ────────────────────────────────────────────────────────────────────────
# Stage 3 — minimal runtime
# ────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    PORT=3000

# wget for HEALTHCHECK; libc6-compat for native deps (postgres-js, sharp, etc).
RUN apk add --no-cache wget libc6-compat \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs fastify

# Compiled backend + its package.json (for `node` to resolve "type":"module").
COPY --from=build --chown=fastify:nodejs /repo/backend/dist          ./dist
COPY --from=build --chown=fastify:nodejs /repo/backend/package.json  ./package.json

# Hoisted prod node_modules + workspace symlinks point into the root tree,
# so we ship the root node_modules and the 5 shared packages it depends on.
# Each @gatimitra/* package now points its `main` field at `./dist/index.js`
# (not `./src/index.ts`), and the build stage emits compiled JS into those
# `dist/` directories — so this single COPY brings the runtime-ready
# artifacts. If a shared package is added later, no Dockerfile change is
# needed as long as its package.json `main` resolves to compiled JS.
COPY --from=build --chown=fastify:nodejs /repo/node_modules          ./node_modules
COPY --from=build --chown=fastify:nodejs /repo/packages              ./packages

# Drizzle migration files (used at boot if MIGRATE_ON_BOOT=true).
COPY --from=build --chown=fastify:nodejs /repo/backend/drizzle       ./drizzle

# Runtime static assets read from disk (NOT bundled by tsc):
#   assets/address-share-og.png  — WhatsApp/social OG preview
#   assets/invoice-signature.png — PDF invoice signature stamp
#   assets/fonts/*.ttf           — PDF invoice fonts
# Without this the routes above return HTTP 500 with an ENOENT.
COPY --from=build --chown=fastify:nodejs /repo/backend/assets        ./assets

USER fastify
EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/v1/health || exit 1

# Node 20 propagates SIGTERM correctly when invoked directly on Alpine.
# Backend wires graceful shutdown — no need for tini/dumb-init.
CMD ["node", "dist/index.js"]
