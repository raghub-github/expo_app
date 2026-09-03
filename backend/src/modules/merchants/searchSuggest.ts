/**
 * Lightweight catalog autocomplete suggestions (smaller payload than full search).
 */

import { getSql } from "../../db/client.js";
import { normalizeSearchQuery } from "./searchNormalize.js";
import { suggestTypoCorrection } from "./searchTypo.js";
import { customerListStoreTypesForSql } from "./merchantStoreTypeFilters.js";
import { FOOD_TYPO_MAP } from "./searchTypo.js";

export type SearchSuggestion = {
  type: "query" | "store" | "item";
  text: string;
  storeId?: string;
  itemId?: string;
};

const SUGGEST_MAX = 8;

/**
 * Query expansions from typo map + top matching store/item names (ILIKE).
 * Geo-scoped when lat/lng provided (haversine via delivery_radius in SQL bbox approx).
 */
export async function suggestCatalogSearch(params: {
  q: string;
  lat?: number;
  lng?: number;
  storeType?: string | null;
  limit?: number;
}): Promise<SearchSuggestion[]> {
  const { normalized, original } = normalizeSearchQuery(params.q);
  if (!normalized || normalized.length < 1) return [];

  const limit = Math.min(Math.max(params.limit ?? SUGGEST_MAX, 1), SUGGEST_MAX);
  const out: SearchSuggestion[] = [];
  const seen = new Set<string>();

  const push = (s: SearchSuggestion) => {
    const key = `${s.type}:${s.text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  const typo = suggestTypoCorrection(original);
  if (typo?.applied) {
    push({ type: "query", text: typo.correctedQuery });
  }

  // Prefix expansions from typo map values
  for (const canon of new Set(Object.values(FOOD_TYPO_MAP))) {
    if (canon.startsWith(normalized) && canon !== normalized) {
      push({ type: "query", text: canon });
    }
    if (out.length >= 3) break;
  }

  const allowed = customerListStoreTypesForSql(params.storeType ?? "FOOD");
  const pattern = `${normalized}%`;
  const contains = `%${normalized}%`;
  const pg = getSql();
  const hasGeo =
    params.lat != null &&
    params.lng != null &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng);

  try {
    const storeRows = await pg`
      SELECT
        s.store_id AS public_id,
        COALESCE(s.store_display_name, s.store_name) AS name
      FROM merchant_stores s
      WHERE s.is_active = true
        AND s.has_customer_visible_menu = true
        AND (
          s.store_name ILIKE ${pattern}
          OR s.store_display_name ILIKE ${pattern}
          OR s.store_name ILIKE ${contains}
          OR s.store_display_name ILIKE ${contains}
        )
        ${
          allowed == null
            ? pg``
            : pg`AND upper(trim(s.store_type::text)) = ANY(${allowed}::text[])`
        }
      ORDER BY
        CASE
          WHEN lower(COALESCE(s.store_display_name, s.store_name)) = ${normalized} THEN 0
          WHEN lower(COALESCE(s.store_display_name, s.store_name)) LIKE ${pattern} THEN 1
          ELSE 2
        END
      LIMIT ${4}
    `;
    for (const r of (storeRows ?? []) as unknown as Array<{ public_id: string; name: string }>) {
      push({ type: "store", text: r.name, storeId: r.public_id });
      if (out.length >= limit) break;
    }

    if (out.length < limit) {
      const itemRows = await pg`
        SELECT m.item_id, m.item_name, s.store_id AS public_id
        FROM merchant_menu_items m
        INNER JOIN merchant_stores s ON s.id = m.store_id
        WHERE m.is_active = true
          AND m.in_stock = true
          AND s.is_active = true
          AND s.has_customer_visible_menu = true
          AND m.item_name ILIKE ${contains}
          ${
            allowed == null
              ? pg``
              : pg`AND upper(trim(s.store_type::text)) = ANY(${allowed}::text[])`
          }
        ORDER BY
          CASE WHEN lower(m.item_name) LIKE ${pattern} THEN 0 ELSE 1 END,
          m.item_name ASC
        LIMIT ${Math.max(2, limit - out.length)}
      `;
      for (const r of (itemRows ?? []) as unknown as Array<{
        item_id: string;
        item_name: string;
        public_id: string;
      }>) {
        push({
          type: "item",
          text: r.item_name,
          itemId: r.item_id,
          storeId: r.public_id,
        });
        if (out.length >= limit) break;
      }
    }
  } catch {
    // Suggest is best-effort; return what we have.
  }

  void hasGeo; // reserved for future geo-tightened suggest SQL
  return out.slice(0, limit);
}
