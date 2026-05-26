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
COPY backend/package.json                  ./backend/package.json
COPY packages/contracts/package.json       ./packages/contracts/package.json
COPY packages/event-contracts/package.json ./packages/event-contracts/package.json
COPY packages/logger/package.json          ./packages/logger/package.json
COPY packages/queue/package.json           ./packages/queue/package.json
COPY packages/redis/package.json           ./packages/redis/package.json

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
COPY packages/logger          ./packages/logger
COPY packages/queue           ./packages/queue
COPY packages/redis           ./packages/redis

# Targeted build — only the 6 workspaces the backend needs. If you later
# add a new shared package the backend imports, add it here AND to the
# `COPY` block above AND to the `deps` stage.
RUN npm run build \
      --workspace=@gatimitra/backend \
      --workspace=@gatimitra/contracts \
      --workspace=@gatimitra/event-contracts \
      --workspace=@gatimitra/logger \
      --workspace=@gatimitra/queue \
      --workspace=@gatimitra/redis

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
COPY --from=build --chown=fastify:nodejs /repo/node_modules          ./node_modules
COPY --from=build --chown=fastify:nodejs /repo/packages              ./packages

# Drizzle migration files (used at boot if MIGRATE_ON_BOOT=true).
COPY --from=build --chown=fastify:nodejs /repo/backend/drizzle       ./drizzle

USER fastify
EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=4s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/v1/health || exit 1

# Node 20 propagates SIGTERM correctly when invoked directly on Alpine.
# Backend wires graceful shutdown — no need for tini/dumb-init.
CMD ["node", "dist/index.js"]
