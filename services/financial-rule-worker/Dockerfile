# financial-rule-worker — outbox post-actions + approval reminders

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* turbo.json ./
COPY packages/shared-config/package.json ./packages/shared-config/
COPY packages/redis/package.json ./packages/redis/
COPY packages/queue/package.json ./packages/queue/
COPY services/financial-rule-worker/package.json ./services/financial-rule-worker/
RUN npm ci --workspaces --include-workspace-root --no-audit --no-fund

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json turbo.json ./
COPY packages/shared-config ./packages/shared-config
COPY packages/redis ./packages/redis
COPY packages/queue ./packages/queue
COPY services/financial-rule-worker ./services/financial-rule-worker

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /repo
USER app

WORKDIR /repo/services/financial-rule-worker
CMD ["npx", "tsx", "src/index.ts"]
