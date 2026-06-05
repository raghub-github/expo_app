# outbox-relay — polls event_outbox → Kafka (or Redis stream fallback).
# Same multi-stage pattern as the other workers.

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* turbo.json ./
COPY packages/shared-config/package.json ./packages/shared-config/
COPY packages/redis/package.json ./packages/redis/
COPY packages/logger/package.json ./packages/logger/
COPY packages/event-contracts/package.json ./packages/event-contracts/
COPY services/outbox-relay/package.json ./services/outbox-relay/
RUN npm ci --workspaces --include-workspace-root --no-audit --no-fund

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json turbo.json ./
COPY packages/shared-config ./packages/shared-config
COPY packages/redis ./packages/redis
COPY packages/logger ./packages/logger
COPY packages/event-contracts ./packages/event-contracts
COPY services/outbox-relay ./services/outbox-relay

# @gatimitra/{redis,logger,event-contracts} are consumed via their package.json
# main: dist/index.js. Without these builds the next CMD (`npx tsx src/index.ts`)
# crashes with ERR_MODULE_NOT_FOUND when Node resolves the cross-workspace
# imports. None of the three have @gatimitra/* deps on each other — flat order.
RUN npm run build \
      --workspace=@gatimitra/redis \
      --workspace=@gatimitra/logger \
      --workspace=@gatimitra/event-contracts

RUN addgroup -S app && adduser -S app -G app \
  && chown -R app:app /repo
USER app

WORKDIR /repo/services/outbox-relay
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1
CMD ["npx", "tsx", "src/index.ts"]
