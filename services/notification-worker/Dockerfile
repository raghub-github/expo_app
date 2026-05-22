# notification-worker — BullMQ consumer for q.push.send.
#
# Build context MUST be the repo root because we depend on workspace packages
# (@gatimitra/queue, @gatimitra/redis, @gatimitra/shared-config). Use:
#
#   docker build -f services/notification-worker/Dockerfile -t gm/notification-worker .
#
# Runtime: tsx (no compile step). The TS sources are tiny and worker startup
# time matters less than image size — switch to `tsc && node dist/index.js`
# if cold-start latency becomes a concern.

# ─── deps stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* turbo.json ./
COPY packages/shared-config/package.json ./packages/shared-config/
COPY packages/redis/package.json ./packages/redis/
COPY packages/queue/package.json ./packages/queue/
COPY services/notification-worker/package.json ./services/notification-worker/
RUN npm ci --workspaces --include-workspace-root --no-audit --no-fund

# ─── runtime stage ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
# Bring node_modules + source. node_modules is hoisted at repo root by npm
# workspaces so a single COPY does it.
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json turbo.json ./
COPY packages/shared-config ./packages/shared-config
COPY packages/redis ./packages/redis
COPY packages/queue ./packages/queue
COPY services/notification-worker ./services/notification-worker

# Drop to non-root and lock down the writable surface.
RUN addgroup -S app && adduser -S app -G app \
  && chown -R app:app /repo
USER app

WORKDIR /repo/services/notification-worker
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('@gatimitra/redis').getRedis().ping().then(()=>process.exit(0)).catch(()=>process.exit(1))" || exit 1
CMD ["npx", "tsx", "src/index.ts"]
