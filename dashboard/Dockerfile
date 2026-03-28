# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# -------------------------
# Dependencies
# -------------------------
FROM base AS deps
COPY package.json ./
COPY packages/contracts/package.json ./packages/contracts/
RUN npm install

# -------------------------
# Build
# -------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time envs (IMPORTANT)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_MAPBOX_TOKEN

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_APP_URL

# Fail fast if required build-time public envs are missing.
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" || (echo "Missing build arg: NEXT_PUBLIC_SUPABASE_URL" && exit 1)
RUN test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" || (echo "Missing build arg: NEXT_PUBLIC_SUPABASE_ANON_KEY" && exit 1)
RUN test -n "$NEXT_PUBLIC_APP_URL" || (echo "Missing build arg: NEXT_PUBLIC_APP_URL" && exit 1)

# Safety: ensure no stale artifacts are reused inside the image build context.
RUN rm -rf .next
RUN npm run build

# -------------------------
# Production Runner
# -------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Runtime uses full Next server (`next start`) to avoid standalone manifest
# initialization issues seen in Next 16 with certain app routes.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

USER nextjs
EXPOSE 3000

CMD ["npm", "start"]