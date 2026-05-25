# GatiMitra Monorepo Modernization Roadmap

> **Status:** Stages 0–10 **complete** + Phase-spec gaps filled.
> Last updated 2026‑05‑22. See [`architecture-overview.md`](architecture-overview.md)
> for the current-state diagram, [`security-baseline.md`](security-baseline.md)
> for control coverage, [`database-strategy.md`](database-strategy.md) for DB.
>
> **Goal achieved:** Modular Monolith → Hybrid Event‑Driven → Kubernetes‑ready,
> without breaking production.

## Original 20-phase spec — completion table

| Phase | What | Status | Evidence |
|---|---|---|---|
| 1  | Repository audit | ✅ | this doc (top section) |
| 2  | Target architecture tree | ✅ | repo layout matches; see architecture-overview.md |
| 3  | Monorepo modernization (Turborepo) | ✅ | `turbo.json` + `packages/shared-config` |
| 4  | Shared packages | ✅ 9 of 11 | redis, queue, logger, event-contracts, auth, shared-utils, constants, shared-config + existing contracts/sdk/expo-push-kit. shared-ui + database-package deferred (need cross-app migration) |
| 5  | Docker standardization | ✅ | each service has multi-stage non-root Dockerfile + HEALTHCHECK |
| 6  | Redis architecture | ✅ | `@gatimitra/redis` (client + lock + cache + pubsub) |
| 7  | BullMQ architecture | ✅ | `@gatimitra/queue` + 4 worker services (notif, payment, eta, outbox-relay) |
| 8  | Kafka event architecture | ✅ | `@gatimitra/event-contracts` + outbox table + outbox-relay with Kafka/Redis-stream fallback |
| 9  | Modular monolith strategy | ✅ | backend stays modular; only async work extracted |
| 10 | Business logic cleanup | 🟡 | audit verified rider+customer clean; merchant menu form does presentational commission preview (acceptable per the audit) |
| 11 | Payment architecture | 🟡 | Razorpay webhook + retry queue + reconciler ✅. Unified gateway abstraction across native + web = future when 2nd gateway lands |
| 12 | WebSocket + realtime | ✅ | `services/ws-gateway` with Redis pub/sub + ws-ticket auth + heartbeat |
| 13 | API gateway | ✅ | Nginx (per plan — Node gateway deferred until BFF pattern needed) |
| 14 | Observability | ✅ | structured logger, /metrics counters, Sentry init, Prometheus+Loki+Grafana+Promtail compose stack |
| 15 | CI/CD pipeline | ✅ | `.github/workflows/ci.yml` (gate) + `backend.yml` + `workers.yml` (matrix) |
| 16 | Deployment strategy | ✅ | docker-compose.dev + docker-compose.prod + nginx; k8s-ready but not k8s-dependent |
| 17 | Database strategy | ✅ | [`database-strategy.md`](database-strategy.md) |
| 18 | Security | ✅ | [`security-baseline.md`](security-baseline.md); JWT rotation, internal-token RPC, helmet, rate limit, /metrics blocked |
| 19 | Documentation | ✅ | roadmap + architecture-overview + database-strategy + security-baseline + CONTRIBUTING |
| 20 | Implementation rules followed | ✅ | no destructive changes, no `DROP COLUMN`, no folder rename of `backend/`, every stage independently deployable |

---

## 0. Repository today (audit snapshot)

| Surface | What exists | What's missing |
|---|---|---|
| **Monorepo** | npm workspaces (`apps/*`, `backend`, `packages/*`, `dashboard`, `partnersite`) | No build orchestrator (Turborepo / Nx) |
| **Mobile apps** | customer_app, gatimitra-riderApp, merchant_app (Expo SDK 54) | No shared TS / ESLint / Prettier configs |
| **Web apps** | dashboard (Next.js 16), partnersite (Next.js 16) — both have Dockerfiles | Health/readiness endpoints inconsistent |
| **Backend** | Fastify 5, Drizzle, postgres.js, Pino, 26 modules, 221 migrations | No Redis backend, no queue system, no websocket server, no event bus |
| **Shared packages** | `@gatimitra/contracts`, `@gatimitra/sdk`, `@gatimitra/expo-push-kit` | No shared logger/auth/api-sdk/event-contracts/database |
| **Realtime** | Supabase Realtime referenced in schema comments; clients poll via TanStack Query | No raw websocket layer, no Redis pub/sub |
| **Payments** | Razorpay webhook signature verify + `payment_webhook_events` UNIQUE dedup | No background retry queue; push send is sync‑in‑request |
| **Background work** | 3 `setInterval` ticks in `backend/src/index.ts`: store schedule (30 s), payment reconcile (env), order‑acceptance timeout (15 s) | **No distributed lock** — multi‑replica deploy will double‑fire |
| **Observability** | Pino structured logs with requestId | No Sentry, no OTel, no Prometheus, no Grafana, no tracing |
| **CI/CD** | Partnersite only: `.github/workflows/deploy.yml` (build image + SSH deploy) | No backend / dashboard CI, no monorepo cache, no affected‑builds, no preview deploys |
| **Infra** | 3 Dockerfiles (backend, dashboard, partnersite); partnersite has its own `docker-compose.yml` | No `docker-compose.dev.yml` / `docker-compose.prod.yml`, no Nginx, no Redis, no Kafka, no monitoring stack |

### Top 3 deployment risks (from audit)

1. **No distributed lock on the 3 polling ticks.** A second replica would re‑run the store schedule, the payment reconciler, and the acceptance timeout simultaneously. Today the timeline inserts are idempotent (`ON CONFLICT DO NOTHING`) so the data stays safe, but audit logs duplicate.
2. **In‑process caches** in the commission resolver and distance service don't share across replicas. Behind a load balancer, hit rates collapse → Mapbox cost spike + cold‑start latency.
3. **No graceful shutdown for in‑flight requests.** Rolling deploys mid‑checkout can orphan calls to `getRoute()`, `sendExpoPushWithRetry`, `verifyRazorpayPaymentDetails`.

### Confirmed strengths (don't break these)

- Idempotency on `pending_orders.idempotency_key`, `payment_intents.idempotency_key`, Razorpay webhook UNIQUE
- Order placement transaction is clean — **no network calls inside `db.transaction`**
- Auth model uniform via Fastify `preHandler` plugin (`req.auth`)
- ETA engine v2 + commission engine v2 recently shipped — used by checkout, list, detail, tracking
- Rider app reads ETA strictly from server (no local recompute)

---

## 1. Target architecture (eventual state)

```
expo_app/
├── apps/                       # Existing — moved unchanged
│   ├── customer_app
│   ├── gatimitra-riderApp
│   ├── merchant_app
│   ├── dashboard               # (kept here; logically a web app)
│   └── partnersite             # (kept here; logically a web app)
│
├── services/                   # NEW — extracted from backend over time
│   ├── backend-core            # The Fastify monolith (renamed from /backend)
│   ├── notification-worker     # BullMQ: push, SMS, email, batched expo dispatch
│   ├── payment-worker          # BullMQ: webhook retries, reconciler, payouts
│   ├── eta-worker              # BullMQ: ETA recalc on status change & periodic
│   ├── ws-gateway              # Standalone ws server, Redis pub/sub
│   └── outbox-relay            # Reads transactional outbox → Kafka
│
├── packages/                   # NEW + existing
│   ├── contracts               # EXISTING — Zod / TS contracts
│   ├── sdk                     # EXISTING — rider sdk
│   ├── expo-push-kit           # EXISTING — push wrapper
│   ├── shared-types            # NEW — domain types reused across apps
│   ├── shared-config           # NEW — TS/ESLint/Prettier base configs
│   ├── shared-utils            # NEW — date, currency, eta, money helpers
│   ├── logger                  # NEW — Pino wrapper with requestId helpers
│   ├── auth                    # NEW — JWT verify + Supabase session helpers
│   ├── api-sdk                 # NEW — generated client for /v1/* (one source of truth)
│   ├── event-contracts         # NEW — Kafka topic + payload schemas
│   ├── database                # NEW — Drizzle schema split + migrations runner
│   └── redis                   # NEW — ioredis singleton, lock / cache / pubsub
│
├── infra/                      # NEW
│   ├── docker/
│   │   ├── docker-compose.dev.yml
│   │   ├── docker-compose.prod.yml
│   │   └── base-images/        # node, expo
│   ├── nginx/
│   ├── github-actions/
│   ├── monitoring/             # Prometheus, Grafana, Loki, Tempo
│   └── kubernetes-ready/       # Manifests written but not required
│
└── docs/
    ├── modernization-roadmap.md   ← this file
    ├── architecture-diagrams/
    ├── runbook/
    └── on-call/
```

---

## 2. Execution plan — phased, incremental, reversible

Each stage **must compile, deploy, and run in production by itself**. No "big bang".

### Stage 0 — Foundations (zero behavior change)
**Duration:** 2–3 days. **Risk:** very low. **Touches:** root config + new files only.

- [ ] Add **Turborepo** (`turbo.json`, root devDep `turbo`). Wire pipeline: `build`, `lint`, `typecheck`, `dev`. Cache `.next`, `dist`, Expo `node_modules`.
- [ ] Create `packages/shared-config/` exporting:
  - `tsconfig.base.json`
  - `eslint-base.cjs`
  - `prettier-base.json`
- [ ] Migrate the 3 mobile apps + dashboard + partnersite + backend to `extends` the shared TS config.
- [ ] Add `.github/workflows/ci.yml` running `turbo run typecheck lint --filter=...[origin/main]` on PR. **No deploy yet** — just gates.
- [ ] Add `CONTRIBUTING.md` documenting the new layout.

**Exit criteria:** `turbo run typecheck` green on a fresh `npm ci`.

---

### Stage 1 — Redis foundation + distributed locks (kills deployment risk #1)
**Duration:** 2–3 days. **Risk:** low‑medium. **Touches:** `backend/src/index.ts`, `backend/src/lib/redis.ts`, polling ticks.

- [ ] Add `packages/redis/`:
  - `getRedis()` — single ioredis client with retry strategy
  - `withLock(key, ttlMs, fn)` — Redlock‑style distributed lock
  - `cacheGet` / `cacheSet` typed helpers with TTL + tag invalidation
- [ ] Replace 3 in‑process caches with Redis:
  - `commission.cache.ts` (in‑process LRU) → Redis hash, TTL 5 min, key `commission:store:{id}`
  - `distance.service.ts` memory cache → Redis, TTL 10 min, key `route:{originHash}:{destHash}`
  - `restaurantLoad.ts` 20 s cache → Redis, TTL 20 s, key `store_load:{storeId}`
- [ ] Wrap each polling tick in `withLock(...)`:
  - `runStoreScheduleTick` → lock `tick:store-schedule` (40 s TTL, 30 s tick)
  - `runOrderAcceptanceTimeoutTick` → lock `tick:acceptance-timeout` (25 s TTL, 15 s tick)
  - `reconcilePendingPayments` → lock `tick:payment-reconciler`
- [ ] Wire **graceful shutdown** in `backend/src/index.ts`:
  - Track in‑flight request count
  - On `SIGTERM`: stop accepting new conns → wait up to 20 s for inflight → close Redis + DB → exit

**Exit criteria:** spin up 2 backend replicas locally with docker‑compose; confirm only one tick run per interval via Redis lock logs.

---

### Stage 2 — BullMQ workers (decouple push + reconciler)
**Duration:** 3–4 days. **Risk:** medium. **Touches:** new `services/notification-worker/` and `services/payment-worker/`.

- [ ] Create `services/notification-worker/`:
  - Fastify health endpoint
  - BullMQ worker for queue `push-notifications`
  - Move `sendExpoPushWithRetry` from `backend/src/modules/push/expoPushSend.ts` into the worker
  - Producer side: backend route handlers now `pushQueue.add(jobName, payload, { jobId: dedupKey })`
- [ ] Create `services/payment-worker/`:
  - BullMQ worker for queue `payment-reconciliation` (delayed/repeatable job, every 60 s)
  - BullMQ worker for queue `payment-webhook-retry` (consumes failed webhook attempts, exponential backoff, max 8 retries → DLQ)
- [ ] Add **transactional outbox** lite (table `event_outbox` with `topic`, `payload jsonb`, `published_at` nullable). Producers write a row inside the same transaction; a tiny in‑backend relay polls every 2 s and pushes to BullMQ. (Kafka comes later — this gives us the contract now.)
- [ ] Add **bull‑board** mounted at `/__queues` on the dashboard (admin‑only) for visibility.

**Exit criteria:** push notifications no longer block checkout request; webhook retry queue visible on bull‑board; payment reconciler runs as a BullMQ scheduled job, not `setInterval`.

---

### Stage 3 — WebSocket gateway (kill the polling on rider tracking & order updates)
**Duration:** 4–6 days. **Risk:** medium. **Touches:** new `services/ws-gateway/`, customer + rider apps.

- [ ] Create `services/ws-gateway/`:
  - Fastify + `@fastify/websocket` (or raw `ws`)
  - Auth via short‑lived JWT minted by `/v1/auth/ws-ticket` (single‑use, 60 s TTL)
  - Subscribes to Redis channels: `order:{orderId}`, `rider:{riderId}`, `store:{storeId}`
  - Forwards messages to connected sockets
- [ ] Backend publishes to Redis when:
  - Order status changes (`status` column update trigger or in‑service hook)
  - ETA recalc happens (existing `appendEtaRecalc` adds a `PUBLISH order:{id} {...}`)
  - Rider location ping arrives (current REST polling → publish)
- [ ] Customer app + rider app: add `useOrderRealtime(orderId)` hook (TanStack Query stays as fallback; ws is the primary).
- [ ] Heartbeat ping/pong every 25 s; stale socket reaper.

**Exit criteria:** customer tracking screen updates without polling; closing/reopening app reconnects cleanly.

---

### Stage 4 — Observability stack
**Duration:** 3–4 days. **Risk:** low. **Touches:** all services + new `infra/monitoring/`.

- [ ] Add `@sentry/node` to backend + workers, `@sentry/nextjs` to dashboard + partnersite, `sentry-expo` to mobile apps. DSN via env.
- [ ] Add OpenTelemetry SDK (`@opentelemetry/sdk-node`) to backend + each worker. Auto‑instrument: Fastify, Postgres, Redis, BullMQ, HTTP.
- [ ] Wire **Prometheus exporter** on each service (`/metrics`). Track:
  - HTTP request duration histogram
  - BullMQ queue depth, processing duration, failure count
  - Redis hit/miss
  - Postgres pool utilization
  - WebSocket connected clients, messages/sec
- [ ] `infra/monitoring/docker-compose.monitoring.yml`: Prometheus + Grafana + Loki + Tempo. Pre‑provisioned dashboards.
- [ ] Add `X-Request-ID` header propagation across services (Pino already produces it; pass via Axios / fetch interceptors).

**Exit criteria:** a checkout request shows up as a single distributed trace across backend → notification‑worker → push API; Grafana dashboard for "Orders/min, ETA accuracy, Payment success %".

---

### Stage 5 — docker‑compose unification
**Duration:** 2 days. **Risk:** low. **Touches:** new `infra/docker/`.

- [ ] `docker-compose.dev.yml` with:
  - postgres (volume‑mounted)
  - redis
  - backend (hot reload via `tsx watch`)
  - notification‑worker, payment‑worker
  - ws‑gateway
  - dashboard (Next dev)
  - partnersite (Next dev)
  - bull‑board UI
- [ ] `docker-compose.prod.yml` with:
  - Same services in production mode
  - nginx reverse proxy with routes:
    - `api.gatimitra.com` → backend (port 3000)
    - `ws.gatimitra.com` → ws‑gateway
    - `control.gatimitra.com` → dashboard
    - `partner.gatimitra.com` → partnersite
  - Prometheus/Grafana from Stage 4
- [ ] Each Dockerfile: confirm multi‑stage, `USER node`, `HEALTHCHECK`, no dev deps in final image.
- [ ] Shared `infra/docker/base-images/node.Dockerfile` to centralize Node + corepack pinning.

**Exit criteria:** `docker compose up` (dev) brings everything online; `docker compose -f prod.yml up` deploys to the Hostinger VPS via SSH.

---

### Stage 6 — Service extraction (modular monolith → hybrid)
**Duration:** 1–2 weeks. **Risk:** medium‑high. **Touches:** backend → `services/backend-core`.

- [ ] Rename `backend/` → `services/backend-core/`. Update workspaces glob.
- [ ] Move push‑sending **out** of backend (already in notification‑worker from Stage 2); leave thin wrapper that enqueues.
- [ ] Extract **payment-worker** (Stage 2) — backend retains route handlers + DB writes; worker handles retry + reconcile.
- [ ] Extract **eta-worker** (small): subscribes to `order.status_changed` events, calls `appendEtaRecalc` with appropriate reason. Backend continues to expose the read endpoint `/v1/eta/orders/:id`.
- [ ] Extract **tracking-service** (large): rider location ingestion → Redis pub/sub → ws‑gateway. backend retains the historical query endpoint.
- [ ] Backend remains the modular monolith for: auth, merchants, menu, customer profile, onboarding, admin endpoints, order placement transaction, billing computation, ETA *engine* (worker just calls it).

**Exit criteria:** backend HTTP RPS drops; per‑service deploys possible; failure of notification‑worker doesn't take down checkout.

---

### Stage 7 — Kafka (event backbone, additive)
**Duration:** 1 week. **Risk:** medium. **Touches:** new `packages/event-contracts`, outbox relay.

- [ ] Add Kafka (`bitnami/kafka` image) to `docker-compose.dev.yml` + prod. Use KRaft mode (no Zookeeper) — Bitnami `kafka:3.7` works.
- [ ] `packages/event-contracts/`:
  - Zod schemas for: `order.created.v1`, `order.accepted.v1`, `order.cancelled.v1`, `payment.success.v1`, `payment.failed.v1`, `rider.location.updated.v1`, `merchant.status.updated.v1`
  - Topic naming convention `{domain}.{action}.{version}`
- [ ] Replace the BullMQ‑backed outbox relay (Stage 2) with a Kafka producer relay. Topics on Kafka; consumers in notification‑worker, analytics‑worker (new, optional), eta‑worker.
- [ ] **Stay event‑driven, not event‑sourced.** Postgres remains the source of truth; Kafka is for async fan‑out.

**Exit criteria:** publishing one `order.created` results in: notification worker pushes "order placed", eta worker locks ETA snapshot, analytics worker increments daily counter — without backend orchestrating any of it.

---

### Stage 8 — Business‑logic cleanup
**Duration:** 1 week. **Risk:** low. **Touches:** mobile + web apps only.

Findings from audit:
- ✅ Customer checkout: bill is server‑authoritative; client only recomputes presentational subtotals
- ✅ Rider app: ETA strictly from server
- ⚠️ Merchant menu form: computes `customerVisibleFromBase(base, commission)` client‑side as a *preview* (this is fine — it's a UI hint, server still authoritative on save)

Action:
- [ ] Add a backend endpoint `POST /v1/merchant-menu/preview` that returns the same commission‑included price the merchant form is computing — so the form just displays it instead of duplicating math.
- [ ] Add server‑authoritative bill replay assertion in customer app: on payment success, fetch `GET /v1/billing/replay?orderId=…` and compare `finalAmount` ± 1 paise; raise a Sentry warning if they diverge.
- [ ] Audit `apps/*/services/*.ts` for any remaining `computeXxx()` exports that should be backend calls. Convert to thin RPC wrappers.

**Exit criteria:** Sentry alert volume for "client/server bill mismatch" stays at zero for a week.

---

### Stage 9 — Full CI/CD per service
**Duration:** 3–4 days. **Risk:** low. **Touches:** `.github/workflows/`.

- [ ] One workflow per deployable service: backend, dashboard, partnersite, notification‑worker, payment‑worker, ws‑gateway.
- [ ] Trigger: `paths:` filter so changes in `apps/customer_app/**` don't rebuild backend.
- [ ] Steps: turbo cache restore → typecheck → lint → test → docker build → push to GHCR → ssh deploy to VPS (or `kubectl set image` later).
- [ ] Tag images `:{git-sha}` + `:latest`. Roll back = `docker compose pull && up -d` with old SHA.
- [ ] Add **preview deploys** for partnersite + dashboard on PRs (Vercel? or compose on a staging VPS).

**Exit criteria:** push to `main` deploys only what changed. Roll back is one `git revert` + workflow re‑run.

---

### Stage 10 — API gateway + security hardening
**Duration:** 3–5 days. **Risk:** medium. **Touches:** nginx + new gateway service or stay on nginx.

Decision point: do we *need* an API gateway service, or is Nginx + per‑service auth enough?

**Recommendation:** start with **Nginx as API gateway** (routing + rate limit + TLS + websocket upgrade). Move to a Node gateway only when we need request aggregation or BFF patterns. Avoids one more deployable for now.

- [ ] Centralize rate limiting in Nginx (already present in Fastify per route — keep both; Nginx is the cheap edge layer).
- [ ] JWT secret rotation: support `JWT_SECRET_CURRENT` + `JWT_SECRET_PREVIOUS`; auth plugin accepts both.
- [ ] Helmet / CSRF policies reviewed per service.
- [ ] Secrets via `.env.production` baked into image at build time **only for non‑secret config**; real secrets via Docker Swarm secrets or env from VPS systemd unit.

---

## 3. Order of execution (recommended)

```
Stage 0 ─┬─► Stage 1 ─┬─► Stage 2 ─┬─► Stage 3 ─┐
         │            │            │            ├─► Stage 5 ─► Stage 6 ─► Stage 7 ─► Stage 9
         │            │            └─► Stage 4 ─┘
         │            │
         └────────────┴─► Stage 8 (parallel, app‑side)
```

Stages 0 → 5 are roughly **3–4 weeks** and deliver:
- Multi‑replica safe backend
- Push and reconciler off the hot path
- Live order updates via websocket
- Sentry + traces + Grafana dashboards
- One‑command `docker compose up` brings everything online

Stages 6 → 9 are another **3–4 weeks** and deliver:
- Service extraction (notification, payment, eta, tracking, ws‑gateway as their own deployables)
- Kafka event backbone with typed contracts
- Per‑service CI/CD with monorepo cache

---

## 4. Constraints we will respect

- ✋ **Never break the order‑placement transaction.** Anything added inside `db.transaction` must stay in‑process.
- ✋ **Never block checkout on a third‑party.** Push, SMS, webhook retries, ETA recalc → queue, not inline.
- ✋ **Schema is backwards‑compatible.** Migrations add columns; never `DROP COLUMN` without a 2‑week deprecation window.
- ✋ **One PostgreSQL** stays as the system of record. Kafka is fan‑out, never the source of truth.
- ✋ **Mobile API shape stays stable.** New fields are additive; existing clients keep working.

---

## 5. What we won't do (and why)

- 🚫 **Microservices for everything.** auth, merchants, menu, onboarding stay inside backend‑core. Splitting them would multiply infra cost without scaling benefit at current volume.
- 🚫 **Kubernetes from day 1.** Hostinger KVM + docker‑compose handles current load. Architecture is k8s‑ready (12‑factor envs, health checks, no local state) but we don't deploy k8s until we exceed a single VPS comfortably.
- 🚫 **Rewriting the ETA / commission / billing engines.** They were just upgraded. They get caching + queues around them, not replacement.
- 🚫 **gRPC.** REST + Zod is fast enough; gRPC adds tooling cost we don't need yet.

---

## 6. Immediate next step

I recommend starting with **Stage 0 (foundations) + Stage 1 (Redis + locks)** as one combined work item. Both are low‑risk, deliver multi‑replica safety, and unblock everything that follows.

Time estimate: **~5–6 days** of focused work.

Approve and I'll execute Stage 0 + Stage 1 end‑to‑end with no further questions, then return for sign‑off before Stage 2.
