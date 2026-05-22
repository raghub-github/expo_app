# Security baseline

Covers Phase 18 of the modernization plan. Each item is either ✅ shipped,
🟡 partial, or ⏳ deferred with a note on what's missing.

## 1. Transport

| Control | Status |
|---|---|
| TLS 1.2/1.3 termination at Nginx | ✅ [`nginx.conf`](../infra/nginx/nginx.conf) |
| HTTP → HTTPS redirect | ✅ via default server block returning 301 |
| HSTS header | ⏳ TODO — add `Strict-Transport-Security` to `proxy_common.conf` |
| Internal services on private docker network only | ✅ `expose:` not `ports:` for backend/workers/ws |

## 2. Authentication + sessions

| Control | Status |
|---|---|
| JWT verify via [`@gatimitra/auth`](../packages/auth/) | ✅ |
| HS256 with Supabase secret | ✅ |
| Rotation support (CURRENT + PREVIOUS) | ✅ Stage 10 in backend auth + ws-gateway |
| Customer session invalidation via `sessionsInvalidBefore` | ✅ existing |
| Merchant device session check | ✅ existing |
| Short-lived single-use ws tickets (60 s + Redis burn) | ✅ Stage 3 |
| Refresh tokens stored server-side | ⏳ Stage 10b — currently rely on Supabase refresh |

## 3. Request validation + abuse

| Control | Status |
|---|---|
| Zod schemas on every route body | ✅ via `fastify-type-provider-zod` |
| Helmet security headers | ✅ `@fastify/helmet` registered |
| CORS allowlist | ✅ existing |
| Rate limiting per route | ✅ `@fastify/rate-limit` + Nginx `limit_req_zone` |
| Tighter rate limit on `/v1/auth/*` | ✅ Nginx zone=auth burst=10 |
| Request size cap | ✅ `client_max_body_size 25m` in nginx |

## 4. Secrets + env

| Control | Status |
|---|---|
| `.env` files git-ignored (never committed) | ✅ verify on each PR |
| Internal RPC secret (`INTERNAL_API_TOKEN`) | ✅ Stage 2 |
| Distinct token per gateway → internal endpoint | ✅ single token today; per-caller token = future |
| Secret rotation procedure documented | ✅ [env.ts](../backend/src/config/env.ts) inline |
| Secrets managed via VPS systemd env / Docker secrets | 🟡 currently `.env` files; consider Doppler / Vault when team grows |

## 5. Data + queries

| Control | Status |
|---|---|
| Drizzle parametrized queries everywhere | ✅ no raw `sql.unsafe()` in route handlers |
| Postgres connection pool capped | ✅ `max: 20` prod / `max: 5` dev |
| Statement-timeout handling | ✅ `unhandledRejection` filter ignores 57014 |
| Row-level security on Supabase | 🟡 dashboard tables only; expand to customer tables when JWT claims stabilize |

## 6. Workers + queues

| Control | Status |
|---|---|
| BullMQ uses authenticated Redis (`AUTH` in URL) | ✅ when `REDIS_URL` includes password |
| Webhook signature verification (Razorpay) | ✅ HMAC SHA256 + UNIQUE event_id dedup |
| Idempotency on order placement | ✅ `pending_orders.idempotency_key` |
| Internal RPC token check on `/v1/internal/*` | ✅ Stage 2 |

## 7. Observability that aids security

| Control | Status |
|---|---|
| Structured request logs with requestId | ✅ Pino + ULID |
| Centralized log aggregation | ✅ Loki via Promtail (Stage 4 monitoring stack) |
| Sentry capture of unhandled errors | ✅ lazy init via `@gatimitra/logger` |
| Audit trail on commission / payment changes | ✅ `commission_audit_log`, `payment_events`, `payment_webhook_events` |

## 8. Network controls

| Control | Status |
|---|---|
| `/metrics` blocked from public via Nginx `location ~ ^/(metrics|v1/internal)` | ✅ |
| Postgres + Redis not exposed on public ports | ✅ both bind to `127.0.0.1:*` in dev, `expose:` only in prod |
| SSH key-only auth on VPS | 🟡 verify on VPS (outside repo scope) |

## 9. Open hardening tasks (post-Stage 10)

- [ ] Add HSTS header (`max-age=31536000; includeSubDomains`)
- [ ] Move from one shared `INTERNAL_API_TOKEN` to per-caller tokens
- [ ] Adopt Docker secrets / Doppler for env (no plain `.env` on VPS)
- [ ] Expand Supabase RLS to customer + rider tables
- [ ] Add CSP header for dashboard + partnersite (Next.js middleware)
