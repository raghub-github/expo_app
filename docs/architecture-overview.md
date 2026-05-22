# GatiMitra — architecture overview

> Companion to [`modernization-roadmap.md`](modernization-roadmap.md). The
> roadmap is the *plan*; this doc is the *current state* after Stages 0–10.

## 1. High-level topology

```
                     ┌──────────────────────────────────┐
                     │           Customer apps          │
                     │   (Expo: customer / rider /      │
                     │    merchant — native + web)      │
                     └──────────────┬───────────────────┘
                                    │ HTTPS / WSS
                                    ▼
                     ┌──────────────────────────────────┐
                     │          Nginx (TLS, RL)         │
                     │  api / ws / dashboard / partner  │
                     └────┬─────────┬─────────┬─────────┘
                          │         │         │
                ┌─────────▼──┐  ┌───▼────┐ ┌──▼──────┐
                │  backend   │  │  ws-   │ │  Next   │
                │ (Fastify)  │  │gateway │ │ apps    │
                └────┬───────┘  └────┬───┘ └─────────┘
                     │ produces      │ subscribes
                     ▼               ▼
              ┌───────────────────────────┐
              │   Redis (cache + locks +  │
              │   pub/sub + BullMQ)       │
              └────┬──────────────┬───────┘
                   │              │
            ┌──────▼──────┐ ┌─────▼──────────┐
            │   workers   │ │ outbox-relay   │
            │ notif / pay │ │  → Kafka /     │
            │ eta         │ │    Redis stream│
            └─────────────┘ └────────────────┘
                   │
                   ▼
              ┌──────────────────────────┐
              │   PostgreSQL (Supabase)  │
              └──────────────────────────┘
```

## 2. Services + responsibility

| Service | Type | Owns |
|---|---|---|
| `backend` | HTTP (Fastify) | auth, merchants, menu, onboarding, orders, billing, ETA engine, commission engine, internal /v1/internal endpoints |
| `ws-gateway` | long-lived ws | ticket verify, channel multiplex, Redis pub/sub bridge, heartbeat |
| `notification-worker` | BullMQ consumer | `q.push.send` → Expo Push API |
| `payment-worker` | BullMQ consumer | scheduled reconcile + webhook-retry queue, calls backend `/v1/internal/payments/*` |
| `eta-worker` | BullMQ consumer | `q.eta.recalc` → backend `/v1/eta/orders/:id/recalc` |
| `outbox-relay` | poller | `event_outbox` → Kafka (prod) or Redis stream (dev fallback) |
| `dashboard` | Next.js | internal admin |
| `partnersite` | Next.js | merchant-facing |

## 3. Data flow — order placement (current state, post Stage 7)

```
1. customer-app  POST /v1/orders               (HTTPS)
2. backend       db.transaction:
                   INSERT orders_core (...)
                   INSERT order_items (...)
                   INSERT event_outbox topic='order.created.v1' payload={...}
                 commits
3. backend       enqueuePush({...}) → q.push.send
4. notif-worker  pulls q.push.send → Expo Push
5. outbox-relay  reads event_outbox WHERE published_at IS NULL
                 publishes to Kafka topic `order.created.v1`
                 marks row published
6. eta-worker    (when status changes later) consumes q.eta.recalc
                 hits backend /v1/eta/orders/:id/recalc
7. backend       publishes to Redis channel order:GM...
8. ws-gateway    forwards to connected customer socket
9. customer-app  receives realtime "Order placed" event
```

## 4. Failure modes + their containment

| Failure | Containment |
|---|---|
| Redis down | Locks fail → ticks SKIP for that interval; cache reads miss → fall through to DB; push enqueue fails → swallowed + counter incremented; no order placement is affected |
| Kafka down | outbox-relay marks rows unpublished, attempts++; rows persist in Postgres; relay catches up when Kafka returns |
| Backend down | Workers retry their backend calls with exponential backoff; ws-gateway rejects new tickets (can't verify) but existing sockets continue receiving pub/sub messages |
| One backend replica crashes | Distributed locks let the other replica take over the ticks; in-flight requests are 503'd cleanly via SIGTERM drain |
| Token rotation | CURRENT + PREVIOUS verify accepted during rotation window; zero session loss |

## 5. Realtime channels

| Channel | Published by | Consumed by |
|---|---|---|
| `order:GM10000042` | backend (status flips, eta recalcs) | customer-app tracking screen |
| `rider:42` | backend (rider movement ingestion, future) | rider-app + customer-app |
| `store:45` | backend (kitchen busy, schedule flip) | merchant-app, dashboard |

Backend publishes via [`publishOrderEvent`](../backend/src/modules/realtime/publish.ts) etc.; ws-gateway pattern-subscribes once per replica.

## 6. Queues + retention

| Queue | Producer | Consumer | Retention |
|---|---|---|---|
| `q.push.send` | backend `enqueuePush` | notification-worker | 24 h on success, forever on fail |
| `q.payment.reconcile` | payment-worker scheduler | payment-worker | same |
| `q.payment.webhook-retry` | backend (on webhook fail) | payment-worker | up to 8 attempts → DLQ |
| `q.eta.recalc` | backend (status flips) | eta-worker | same default |

Monitor via [bull-board](http://localhost:3300) (dev) or BullMQ Prometheus exporter (prod, Stage 4 metrics counters).

## 7. Migrations + schema strategy

- **One Postgres** (Supabase managed). Never split per service.
- All migrations live in `backend/drizzle/`. Naming pattern `NNNN_description.sql`. Drift fixed via the `db:migrate` script.
- **Additive only** — never `DROP COLUMN` or `DROP TABLE` without a 2-week deprecation window. Same for renames.
- Backups: Supabase point-in-time recovery enabled. Local dev: `pg-dev-data` volume in compose persists across restarts.
