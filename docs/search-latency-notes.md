# Catalog search — latency / verification notes

Measured surface: `GET /v1/search` (customer catalog). Mapbox must stay **~0** calls on this path (haversine only).

## Before (audit baseline)

| Signal | Expectation |
|--------|-------------|
| Nearby RPC + category ILIKE merge | No delivery_radius gate; far/undeliverable stores could leak |
| `storeType` | Post-RPC only → under-filled pages |
| `offset` | Ignored on nearby path |
| App re-rank | Absent (`search_score` discarded) |
| Typo / suggest | Absent |
| Mapbox on `/v1/search` | 0 (unchanged goal) |

## After (this series)

| Signal | Change |
|--------|--------|
| Serviceability | Haversine ≤ `min(15km, delivery_radius_km)` after candidates |
| Category merge | Same geo gate + early `store_type` SQL |
| Pagination | Nearby path oversamples then `slice(offset, offset+limit)` |
| Rank | TS re-score: exact → prefix → tokens → distance → popularity |
| Typo | Confidence-gated map; `didYouMean` / `searchInsteadOriginal` |
| Suggest | `GET /v1/search/suggest` ≤ 8 rows |
| Mapbox | Still unused for text search |

## Staging checklist

1. Capture p50/p95 for `/v1/search?q=biryani&lat=&lng=&storeType=FOOD` before deploy (or last release).
2. Re-run after deploy; query count should stay small (RPC ×2 + 1 geo enrich + optional typo retry).
3. Confirm Mapbox Metrics dashboard shows no spike attributable to search.
4. Manual: Customer A vs B different cells must not share wrong results (no cross-user cache on search yet).
5. Manual: store with `delivery_radius_km=2` must not appear for a user ~8 km away.

Indexes: see commented candidates in `backend/supabase/search_rpcs.sql` — apply only after `EXPLAIN (ANALYZE, BUFFERS)` on staging.
