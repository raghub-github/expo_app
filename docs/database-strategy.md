# Database strategy

Covers Phase 17 of the modernization plan.

## Principle: one Postgres until proven otherwise

We deliberately use **one PostgreSQL instance** for the entire platform.
Splitting per service is tempting but premature:

- Cross-service joins (orders × stores × commission_rules) stay free
- Transactions across domains stay possible (the outbox pattern relies on this)
- Backup + restore is one workflow, not seven
- Local dev needs one container, not seven

We split databases **only** when a single domain's write rate or storage
profile diverges so far from the others that it becomes a bottleneck. As of
Stage 10, nothing comes close.

## Connection pooling

| Service | Driver | Pool size | Idle timeout |
|---|---|---|---|
| backend (prod) | postgres.js | 20 | 20 s |
| backend (dev) | postgres.js | 5 | 20 s |
| outbox-relay | postgres.js | 4 | 20 s |
| dashboard / partnersite | postgres.js (Drizzle) | per Next worker | 20 s |

Pool sizes are conservative — Supabase Pooler-mode connections cap around
200 globally. Stay well under that with replicas multiplied.

## Indexing audit (status)

The Drizzle migrations create indexes for the hot lookups:

- `merchant_store_commission_rules (store_id, is_active, effective_from DESC) WHERE is_active`
- `order_item_commission_snapshots (order_id)`
- `commission_audit_log (store_id, created_at DESC) WHERE store_id NOT NULL`
- `event_outbox (created_at ASC) WHERE published_at IS NULL` — hot path for the relay
- `orders_core.actual_delivered_at` — ETA accuracy queries

When adding a new query path, add an index in the same migration. No new
EXPLAIN ANALYZE budget agreed yet — establish one when read query latency
shows up on Grafana dashboards.

## Migrations

- Folder: `backend/drizzle/*.sql`
- Naming: `NNNN_description.sql` (4-digit zero-padded; max number in repo
  is currently 0236)
- Run via: `npx tsx backend/scripts/run-sql-migration.ts drizzle/<file>.sql`
  (the file applies the named migration only — no automatic walk yet)
- **Additive only**. Never `DROP COLUMN`/`DROP TABLE` without a 2-week
  deprecation window documented in the PR description.
- Drift discovered via `verify-commission-schema.ts` style scripts (per
  module). When a column is expected by code but missing, the engine
  degrades softly (`42703` / `42P01` codes are caught and treated as
  feature-off).

## Backup + restore

- **Supabase managed**: point-in-time recovery enabled (retention 7 days
  on the free tier; bump on paid). Verify in Supabase dashboard.
- **Local dev**: `pg-dev-data` Docker volume. Reset with
  `docker compose -f infra/docker/docker-compose.dev.yml down -v`.
- **Schema-only export** for new contributors:
  ```bash
  pg_dump --schema-only --no-owner --no-privileges \
    "$DATABASE_URL" > docs/db/schema-snapshot.sql
  ```

## Read replicas

Not yet — single primary handles current load. Read replica becomes useful
when:

1. Analytics queries start interfering with hot transactional reads, **or**
2. Dashboard heavy queries (commission audit, payment events) saturate
   the connection pool

Both will show up as p95 latency spikes on the Grafana backend dashboard
before they become user-visible.

## Outbox table maintenance

`event_outbox` is the only table that grows monotonically with no built-in
TTL. Mitigate via a nightly job (Stage 10b TODO):

```sql
DELETE FROM event_outbox
WHERE published_at IS NOT NULL
  AND published_at < NOW() - INTERVAL '14 days';
```

Until that's wired, monitor with:

```sql
SELECT COUNT(*) FROM event_outbox WHERE published_at IS NULL;     -- backlog
SELECT pg_size_pretty(pg_total_relation_size('event_outbox'));    -- table size
```
