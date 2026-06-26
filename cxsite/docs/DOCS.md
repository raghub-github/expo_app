# Project Documentation (Single Doc)

All feature/API docs live in this file. Add new sections below; do not create a new .md file until this file reaches 5000 lines.

---

# 1. Brands API – Location-Based (Swiggy/Zomato Style)

## Overview

- **Initially (no location set):** All brands are shown so users can browse the full list.
- **When user sets location:** The list is filtered by location. Only brands that have at least one **active child store within 8–10 km** of the user are shown. If none are in range, a “No brands available in your area yet” message is shown.

## Database

- **Tables:** `public.merchant_parents` (brands), `public.merchant_stores` (child stores with lat/lon).
- **merchant_parents:** `id`, `parent_merchant_id`, `parent_name`, `brand_name`, `merchant_type`, `store_logo`, `business_category`, `is_active`, `approval_status`, `city`, `state`, `registration_status`.
- **merchant_stores (for geo):** `parent_id`, `parent_merchant_id`, `latitude`, `longitude`, `is_active`, `status` (store_status), `approval_status` (store_approval_status). Filter: `is_active = true`, `status = 'ACTIVE'`, `approval_status = 'APPROVED'`, lat/lon not null. If `parent_merchant_id` is null, it is resolved from `merchant_parents.id`.

**Indexes:** `merchant_stores_location_idx` on `(latitude, longitude)`; `merchant_stores_parent_merchant_id_idx`; same as before on `merchant_parents`.

## Geo filtering rules

- **User location:** Passed as `lat` and `lon` query params.
- **Distance:** Haversine formula; default radius **10 km** (configurable `radius_km`, max 50).
- **Child stores:** Only stores with `is_active = true`, `status = 'ACTIVE'`, `approval_status = 'APPROVED'`, and within radius are considered. Distinct `parent_merchant_id` (or resolved via `parent_id` → `merchant_parents`) → then fetch those brands from `merchant_parents`.
- **Fallback:** If no brands in 10 km, backend automatically tries **15 km** once before returning empty.
- **No location:** If `lat`/`lon` missing or invalid, API returns **all brands** (`location_filter_applied: false`). This is the initial state before the user sets location.

## API: GET /api/brands

- **Query params:** `lat`, `lon` (geo); `city`, `area` (location slugs for URL-based filtering); `category` (e.g. `food`, `fashion`, `pharma`, `electronics`); `radius_km`, `page`, `limit`.
- **Returns:** `{ brands: [...], location_filter_applied?: boolean, message?: string }`. When `city` (and optional `area`) provided: only brands with a store in that city/area. When lat/lon provided: only nearby brands. When neither: all brands.
- **Cache:** `Cache-Control: no-store, max-age=0`.

## API: GET /api/brands/[parent_merchant_id]

- Unchanged: single BRAND by id; same filters. 404 if not found.

## UI (location-based, dynamic)

- **Initially:** No location → `BrandSections` calls `/api/brands` (no params) and shows **all brands**.
- **When user sets location:** Header/geolocation or manual search updates `LocationProvider` → `BrandSections` calls `/api/brands?lat=...&lon=...` and shows only **brands near that location**. If none in range, shows “No brands available in your area yet” with suggestion to change location.
- **Sections:** Same category-wise sections (Food, Fashion, Pharma, Electronics, More). When location is set, only nearby brands appear in sections; when not set, all brands appear.
- **Empty states:**
  - **Location set but no brands in range:** “No brands available in your area yet” (first section) with hint to change location.
  - **Section has no brands (in that category):** “Coming Soon” for that section.
- **Refresh:** Polling every 30s; refetch on tab focus.

## Behaviour summary

- **No location:** All brands shown (browse full list).
- **Location set (e.g. Chennai):** Only brands with a store within 10 km of Chennai; if none, show “No brands in your area yet”.
- **Location set (e.g. Delhi):** Only Delhi nearby brands. Distance-based when location is set; production-ready.

## Dynamic URL routing (Zomato-style)

- **URL format:** `/{city}/{area}?category={category_id}` (e.g. `/chennai/omr?category=food`, `/patna/agam-kuan`).
- **Slug rules:** City and area are lowercase; spaces become hyphens; SEO-friendly. See `lib/slug.ts` (`toSlug`, `slugToTitle`).
- **When user selects or searches location:** Header calls `router.push(\`/${citySlug}/${areaSlug}\`)` so the URL updates without full page reload (SPA).
- **Page:** `app/[city]/[area]/page.tsx` – validates slug, renders `BrandsByLocationView` with city/area/category from URL and searchParams.
- **Backend:** `GET /api/brands?city=...&area=...&category=...` filters by `merchant_stores.city` (and optional area via `landmark` / `full_address`), then returns brands. No global listing; only location-specific brands.
- **Fallbacks:** City exists but no brands → “Coming Soon in {City}”. Area with no brands → “No brands available in this location”. Invalid slug → redirect to `/`.
- **SEO:** `generateMetadata` sets title “Brands in {Area}, {City} | GatiMitra”, description, and canonical URL (when `NEXT_PUBLIC_SITE_URL` is set).
- **Context sync:** `LocationFromUrlSync` on the city/area page updates `LocationProvider` so the header shows the current location (e.g. “Agam Kuan, Patna”).

---

# 2. Location Search – Documentation

This section describes **location search** behaviour: manual address search, worldwide results, and how the UI works.

## Overview

Users can set their delivery/location in two ways:

1. **Auto-detect** – Browser geolocation + reverse geocoding to show address.
2. **Manual search** – Type any address; results come from both **local service points** (Supabase) and **worldwide geocoding** (Nominatim/OpenStreetMap).

Manual search now returns results for **any address worldwide** (e.g. "gaya", "Mumbai", "London"), not only pre-stored service points.

## Behaviour

### Manual search flow

1. User focuses the location input (or types in it).
2. `LocationPopup` opens and shows:
   - **Auto-detect current location** (with map pin).
   - **Popular localities** (from `/api/locations/popular`) when the input is empty.
   - **Live search results** when the user types (debounced ~300ms).

3. Search request goes to:
   ```
   GET /api/locations/search?q={query}&limit=15
   ```

4. Backend:
   - Queries **Supabase** `service_points` (active only) by `name` / `city` (ilike).
   - In parallel calls **Nominatim** (OpenStreetMap) for worldwide geocoding.
   - Merges both, dedupes by `location_name` + `city`, and returns a single list.

5. Each result has:
   - `id` (number; negative for Nominatim to avoid clashes with DB IDs)
   - `location_name` (display name)
   - `city`
   - `latitude`, `longitude`

6. User selects a result → display text and `localStorage` are updated; popup closes.

### Auto-detect flow

- Uses browser `geolocation` and then:
  ```
  GET /api/locations/reverse-geocode?lat={lat}&lon={lon}&nocache=1
  ```
- Response `displayName` is shown as the location and can be stored.

## API: Worldwide search

**Endpoint:** `GET /api/locations/search`

| Query param | Type   | Description                    |
|------------|--------|--------------------------------|
| `q`        | string | Search query (trimmed, length-capped) |
| `limit`    | number | Max results (default 15, max 20)      |

**Response:** JSON array of:

```ts
{
  id: number
  location_name: string
  city: string
  latitude: number
  longitude: number
}
```

**Implementation details:**

- **Local:** Supabase `service_points` with `is_active = true`, `name` / `city` ilike match.
- **Worldwide:** Nominatim `https://nominatim.openstreetmap.org/search` with:
  - `format=json`, `addressdetails=1`, `limit`
  - Required `User-Agent` header (e.g. `GatiMitraLocationSearch/1.0`).
- Results are merged: local first, then Nominatim; duplicates (same `location_name` + `city`) are skipped.
- Final list is limited by `limit`.

## UI components (location)

- **Header** – Uses `LocationPopup` with `searchQuery={locationSearchQuery}` and `onSelectLocation` to update the displayed location and close the popup.
- **LocationPopup** (`components/location-search/LocationPopup.tsx`) – Renders:
  - Auto-detect option
  - Popular localities (when no query)
  - "Search results" section with "No locations found" when the list is empty, or a list of clickable results (map pin + `location_name`, `city`).
- **LocationSearchBar** – Can also use `LocationPopup` for a standalone location search bar.

## Files touched (location)

| Path | Role |
|------|------|
| `app/api/locations/search/route.ts` | Search API: Supabase + Nominatim merge, response shape |
| `components/location-search/LocationPopup.tsx` | Popup UI, calls `/api/locations/search` for live results |
| `components/layout/Header.tsx` | Wires location state and `LocationPopup` |

## Summary (location)

- **Manual location search** uses both **local service points** and **Nominatim** so users get results for any address worldwide.
- Same response shape and same popup UI; no extra config or API key for Nominatim (respect its usage policy and rate limits).

---

# 3. Search Bar (Global Search) – Documentation

This section describes the **global search bar** on the homepage: score-based suggestions (dishes + restaurants) and the suggestions modal behaviour.

## Overview

The main search bar (next to the location input) is a **global search** that returns:

- **Dishes** – From `menu_items` (item name, category, category_item).
- **Restaurants** – From `restaurants` (restaurant name, address).

Results are **score-based** (relevance) and shown in a **suggestions modal** below the search bar. The **search bar's style does not change** when the modal is open.

## User flow

1. User types in the search input (e.g. "coffee", "biryani").
2. Input is **debounced** (~300ms); then:
   ```
   GET /api/search?q={encodedQuery}
   ```
3. A **suggestions modal** appears below the search bar with:
   - **Header:** "Results for 'query'" and "X found".
   - **List:** Dishes and restaurants in one scrollable list (no separate section headers).
4. Each row:
   - **Circular thumbnail** (dish/restaurant image or fallback icon).
   - **Line 1 (bold):** Dish name or restaurant name.
   - **Line 2 (muted):** Secondary info with ` • ` separator (e.g. restaurant name, category, price for dishes; address or "View menu" for restaurants).
5. Clicking a row:
   - **Dish** → `/order?restaurant={restaurant_id}` and modal closes.
   - **Restaurant** → `/restaurant/{restaurant_id}` and modal closes.
6. Modal closes when user clicks **outside** the search bar or the modal (no overlap; small gap between bar and modal). Search bar styling stays the same when modal is open.

## API: Global search

**Endpoint:** `GET /api/search`

| Query param | Type   | Description        |
|------------|--------|--------------------|
| `q`        | string | Search query (required, trimmed) |

**Response:** JSON array of mixed items. Each item has `type` and `score`:

**Dish (`type: 'dish'`):**

```ts
{
  type: 'dish'
  id: number
  item_name: string
  category: string
  category_item: string
  restaurant_id: number
  price?: number
  image_url?: string
  score: number  // 100 | 80 | 60 | 40
}
```

**Restaurant (`type: 'restaurant'`):**

```ts
{
  type: 'restaurant'
  restaurant_id: string
  restaurant_name: string
  image_url?: string
  address?: string
  score: number
}
```

**Scoring (relevance):**

- **100** – Exact match (query equals field).
- **80** – Field starts with query.
- **60** – Field contains query.
- **40** – Fallback when matched via DB but no stronger rule.

Dishes: score = max of scores from `item_name`, `category`, `category_item`.  
Restaurants: score from `restaurant_name` or `address`.  
Results are **sorted by score descending**. Limits: up to 20 dishes, 10 restaurants, then combined and re-sorted.

## Suggestions modal (UI)

- **Position:** Fixed; placed with `top: rect.bottom + 10` so there is a **10px gap** between the search bar and the modal (no overlap).
- **Search bar:** Always the same style (rounded, border) whether the modal is open or not; no conditional classes on the bar when results are shown.
- **Layout:** Magicpin-style:
  - Circular thumbnails.
  - Bold primary line (name).
  - Secondary line with ` • ` (e.g. "Restaurant • Category • ₹price" or address).
- **States:**
  - Loading: Spinner + "Searching for 'query'…".
  - Results: Scrollable list (max height ~440px).
  - No results: "No results for 'query'", "Try different keywords or check spelling", "Clear search" link.
- **Click outside:** Modal closes if click is outside both the search bar and the modal container (`searchRef` and `searchResultsRef`).

## Implementation details (search)

### Backend (`app/api/search/route.ts`)

- **Dishes:** Supabase `menu_items`, `is_active = true`, ilike on `item_name`, `category`, `category_item`; then score computed and top 20 taken.
- **Restaurants:** Supabase `restaurants`, ilike on `restaurant_name`; then score (and optional address); top 10.
- Both run in parallel (`Promise.all`). Query string is escaped for ilike (e.g. `%`, `_`).
- Combined list sorted by `score` desc and returned (no global limit beyond the per-type limits above).

### Frontend (`components/layout/Header.tsx`)

- **State:** `searchQuery`, `debouncedSearchQuery`, `searchResults`, `searchLoading`, `showSearchResults`, `searchDropdownRect`, `searchRef`, `searchResultsRef`.
- **Fetch:** On `debouncedSearchQuery` change, call `/api/search?q=...`; if response is an array and not `{ error }`, set `searchResults`; else set `[]`.
- **Dropdown position:** When `showSearchResults` and `searchQuery` are set, measure `searchRef` with `getBoundingClientRect()` and set `searchDropdownRect` with `top: rect.bottom + 10` so the modal sits 10px below the bar with no overlap.
- **Modal:** Renders only when `showSearchResults && searchQuery`. Splits `searchResults` into dishes and restaurants by `type`, then renders a single list (dishes first, then restaurants) with circular image, title, secondary line, and link.

## Files touched (search)

| Path | Role |
|------|------|
| `app/api/search/route.ts` | Global search API: dishes + restaurants, scoring, response shape |
| `components/layout/Header.tsx` | Search input, debounce, fetch, suggestions modal, positioning, click-outside, links |

## Summary (search)

- **Global search** returns **dishes** and **restaurants** with **score-based** relevance (exact > starts with > contains).
- **Suggestions modal** shows a single list with circular thumbs and two-line layout; **10px gap** below the search bar, **no overlap**; **search bar style unchanged** when modal is open.
- **Error handling:** API errors or non-array response → empty results, no crash.
- **Navigation:** Dish → order page for that restaurant; restaurant → restaurant page.

---

*End of doc. Add new sections above this line; keep a single DOCS.md until it reaches 5000 lines.*
