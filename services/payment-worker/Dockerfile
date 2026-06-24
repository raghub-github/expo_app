# payment-worker — BullMQ consumer for payment reconcile + webhook retry.
# Same build pattern as notification-worker (see that file for notes).

# ─── deps stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* turbo.json ./
COPY packages/shared-config/package.json ./packages/shared-config/
COPY packages/redis/package.json ./packages/redis/
COPY packages/queue/package.json ./packages/queue/
COPY services/payment-worker/package.json ./services/payment-worker/
RUN npm ci --workspaces --include-workspace-root --no-audit --no-fund

# ─── runtime stage ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json turbo.json ./
COPY packages/shared-config ./packages/shared-config
COPY packages/redis ./packages/redis
COPY packages/queue ./packages/queue
COPY services/payment-worker ./services/payment-worker

# @gatimitra/{redis,queue} are consumed via their package.json main: dist/index.js.
# Without these builds the next CMD (`npx tsx src/index.ts`) crashes with
# ERR_MODULE_NOT_FOUND when Node resolves the cross-workspace imports.
# Topological order: redis (no deps) → queue (depends on redis).
RUN npm run build \
      --workspace=@gatimitra/redis \
      --workspace=@gatimitra/queue

RUN addgroup -S app && adduser -S app -G app \
  && chown -R app:app /repo
USER app

WORKDIR /repo/services/payment-worker
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node --input-type=module -e "import('@gatimitra/redis').then(m => m.getRedis().ping()).then(()=>process.exit(0)).catch(()=>process.exit(1))" || exit 1
CMD ["npx", "tsx", "src/index.ts"]
