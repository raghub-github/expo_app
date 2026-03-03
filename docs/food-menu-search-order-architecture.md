# Food Menu, Search & Order Flow – Architecture

Design for menu data source, search engine, and ordering flow based on **`public.merchant_menu_items`** and **`public.merchant_stores`**. Target: scalable, production-ready, Swiggy/Zomato-scale behaviour.

---

## 1. Menu Data Source

**Table:** `public.merchant_menu_items`

**Visibility rule (always apply):**
```sql
WHERE is_active = true AND in_stock = true
```

**Field usage:**

| Column | Usage |
|--------|--------|
| `store_id` | Link item to store; join to `merchant_stores.id` |
| `category_id` | Category filtering (e.g. by menu category) |
| `item_name` | Search + display |
| `item_description` | Search relevance |
| `cuisine_type` | Smart filtering (e.g. North Indian, Chinese) |
| `food_type` | Veg / Non-veg filter |
| `spice_level` | UI tags |
| `selling_price` | Display price |
| `base_price` | Discount calculation |
| `discount_percentage` | Offer badge |
| `in_stock` | Availability |
| `is_active` | Visibility |
| `item_image_url` | UI image |
| `is_popular` | Search/listing priority |
| `is_recommended` | Search/listing priority |

Only rows with `is_active = true` and `in_stock = true` are exposed to customers.

---

## 2. Store Relation (Critical)

**Link:** `merchant_menu_items.store_id` → `merchant_stores.id`

**Requirements:**
- Every menu fetch must resolve store (e.g. for header, delivery info).
- Search returns **both**:
  - **Dishes** (menu items matching query)
  - **Stores** (stores that have at least one matching menu item)

**Example flow:**
```
User searches "biryani"
  → Find menu_items matching "biryani" (item_name, cuisine_type, item_description)
  → Collect distinct store_id from those items
  → Fetch store rows for those store_ids
  → Return { dishes: [...], stores: [...] }
```

Store list is **dynamic** from search results, not a separate “all stores” call for the search page.

---

## 3. Smart Search Engine

**Search targets:**
- `item_name`
- `item_description`
- `cuisine_type`
- Store name (via join to `merchant_stores.store_name` or `store_display_name`)

**Implementation options:**
1. **PostgreSQL Full-Text Search (tsvector)**  
   - Add computed column, e.g.  
     `to_tsvector('english', coalesce(item_name,'') || ' ' || coalesce(item_description,'') || ' ' || coalesce(cuisine_type,''))`  
   - GIN index on that column.  
   - Query with `to_tsquery` / `plainto_tsquery`.
2. **Trigram similarity**  
   - `pg_trgm` extension, `similarity()` / `%` on `item_name`, `item_description`, `cuisine_type`, and store name in joined query.

**Result priority (ordering):**
1. Exact item name match
2. Popular items (`is_popular = true`)
3. Recommended items (`is_recommended = true`)
4. Nearby stores (when lat/lng available; sort by distance)
5. Category match

**Indexes to use:**
- `merchant_menu_items_store_id_idx`
- `merchant_menu_items_category_id_idx`
- `merchant_menu_items_is_active_idx`
- `merchant_menu_items_in_stock_idx`
- `merchant_menu_items_store_active_idx`
- **New:** FTS index on search vector (see migration).

---

## 4. High-Performance Query Rules

- **Pagination:** All list/search endpoints use `LIMIT` + `OFFSET` (or cursor).
- **Indexed-only:** No full table scans; filters on indexed columns + FTS.
- **Lazy loading:** Menu by store: load categories first, then items per category or on scroll.
- **Search:** Debounced (e.g. 300 ms); single round-trip for items + stores.

---

## 5. Order Flow Engine

**Flow:**  
Search → Item → Store → Add to cart → Checkout → Order created.

**Rules:**
1. **Single-store cart:** Cart must contain items from **one** `store_id` only. On add from another store, replace cart or prompt.
2. **Stock check:** Before order creation, re-check `in_stock` and (if used) `available_quantity` for each line item.
3. **Quantity lock:** During checkout (e.g. from “Place Order” to payment confirmation), reserve or lock quantity so concurrent orders don’t oversell (e.g. short-lived hold or optimistic lock on `available_quantity`).
4. **Double order:** Idempotency key (e.g. client-generated) or unique constraint on (user, cart snapshot, timestamp window) to prevent duplicate orders.

---

## 6. Traffic & Security

- **Rate limiting:** Per IP and/or per user (e.g. 100 req/min per user for search/API).
- **Caching:** Redis for hot paths (e.g. search results by normalized query, trending/popular items).
- **CDN:** Static assets and `item_image_url` behind CDN.
- **Read replicas:** Use for search and list endpoints; primary for writes and checkout.
- **Connection pooling:** PgBouncer or Supabase pooler for DB.

**DDoS / abuse:**
- API gateway throttling.
- Limit requests per IP/user.
- Cache search responses for repeated queries.
- Reject abnormal bursts (e.g. 429 after threshold).

---

## 7. Performance Optimizations

- **Debounced search API:** 300 ms client-side debounce before calling search.
- **Server-side filtering:** Veg/non-veg, cuisine, category applied in DB.
- **Indexed search columns:** FTS + btree indexes as above.
- **Cached popular searches:** Redis key e.g. `search:popular` or per-query cache.
- **Preload trending items:** Homepage/explore can preload items with `is_popular = true` or `is_recommended = true` by store/city.

---

## 8. Frontend Behaviour (Search Page)

| Condition | Show |
|----------|------|
| No search query | Categories (and optionally trending items) |
| User typing | Debounced suggestions (e.g. items + store names) |
| Has results | Items + Stores sections |
| No results | Empty state UI (e.g. “Wrong way” / explore popular) |

---

## API Summary (Stateless, Horizontal Scaling)

- `GET /v1/merchants` – List stores (optional: lat/lng, limit, offset). Uses `merchant_stores` + only stores that have at least one active, in-stock menu item.
- `GET /v1/merchants/:id/menu` – Menu for one store; categories + items from `merchant_menu_items` (and `merchant_menu_categories`) with `is_active = true`, `in_stock = true`.
- `GET /v1/search?q=...&limit=...&offset=...` – Unified search: returns matching **dishes** (menu items) and **stores** (stores that have those items). Uses FTS/trigram on items + store name.
- `POST /v1/orders` – Create order (idempotency, stock check, single-store validation).

All APIs stateless; horizontal scaling without downtime.

---

## Implementation Summary

- **DB (Supabase/Postgres):** Run `merchant_db/drizzle/0045_merchant_menu_items_fulltext_search.sql` to add `search_vector`, trigger, GIN index, and `search_menu_items(query_text, lim, off)` RPC. Until then, search falls back to `ilike` on item_name/description/cuisine_type.
- **Backend (Fastify):** `GET /v1/merchants`, `GET /v1/merchants/:id/menu`, `GET /v1/search` in `backend/src/modules/merchants/`. Uses Supabase (service role) and `merchant_menu_items` + `merchant_stores`. Set `PORT=3001` (or match customer app’s `EXPO_PUBLIC_DEV_HOST` port) so the app can reach the API.
- **Customer app:** `useDebouncedSearch` calls `merchantService.search()` (300 ms debounce). Dish tap navigates to store via `dish.storeId`. Cart remains single-store (existing `cartStore`). Menu and merchant list come from the new backend routes.
