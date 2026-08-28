import { getSql } from "../../db/client.js";
import {
  getCustomerVisibleApprovalExpr,
  getCustomerVisibleItemImageExpr,
} from "../../lib/customer-menu-item-visibility.js";
import { haversineDistanceKm } from "../distance/distance.service.js";
import { effectiveServiceRadiusKm } from "./merchant.service.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";

const GLOBAL_LIST_RADIUS_KM = 15;
const MAX_CATEGORIES = 24;

export type GroceryHomeMenuCategory = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
};

function menuCategorySlug(name: string): string {
  return `mcat--${encodeURIComponent(name.trim())}`;
}

function validCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

function normalizeCategoryKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Nearby grocery stores → menu categories from store menus.
 * De-duped by normalized category name across stores.
 * Category image: first visible item image in that category, else category_image_url.
 */
export async function listGroceryHomeMenuCategories(params: {
  lat?: number | null;
  lng?: number | null;
  vegMode?: boolean;
  storeIds?: string[];
}): Promise<GroceryHomeMenuCategory[]> {
  const vegMode = params.vegMode === true;
  const hasGeo = validCoord(params.lat ?? NaN, params.lng ?? NaN);
  const lat = hasGeo ? params.lat! : null;
  const lng = hasGeo ? params.lng! : null;

  const pg = getSql();
  const approval = getCustomerVisibleApprovalExpr(pg, "m");
  const visibleImage = getCustomerVisibleItemImageExpr(pg, "m");

  type StoreRow = {
    id: number;
    public_id: string;
    latitude: number | string | null;
    longitude: number | string | null;
    delivery_radius_km: number | string | null;
  };

  let storeRows: StoreRow[] = [];

  const explicitIds = (params.storeIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (explicitIds.length > 0) {
    storeRows = await pg<StoreRow[]>`
      SELECT s.id, s.store_id AS public_id, s.latitude, s.longitude, s.delivery_radius_km
      FROM merchant_stores s
      WHERE s.is_active = true
        AND s.has_customer_visible_menu = true
        AND upper(trim(s.store_type::text)) = 'GROCERY'
        AND s.store_id = ANY(${explicitIds}::text[])
        ${vegMode ? pg`AND s.is_pure_veg = true` : pg``}
      LIMIT 40
    `;
  } else if (hasGeo && lat != null && lng != null) {
    storeRows = await pg<StoreRow[]>`
      SELECT s.id, s.store_id AS public_id, s.latitude, s.longitude, s.delivery_radius_km
      FROM merchant_stores s
      WHERE s.is_active = true
        AND s.has_customer_visible_menu = true
        AND upper(trim(s.store_type::text)) = 'GROCERY'
        ${vegMode ? pg`AND s.is_pure_veg = true` : pg``}
      LIMIT 80
    `;
  } else {
    return [];
  }

  const nearbyStorePks: number[] = [];
  const clientCuratedStores = explicitIds.length > 0;

  for (const row of storeRows ?? []) {
    if (clientCuratedStores) {
      nearbyStorePks.push(Number(row.id));
      continue;
    }
    if (!hasGeo || lat == null || lng == null) {
      nearbyStorePks.push(Number(row.id));
      continue;
    }
    const slat = Number(row.latitude);
    const slng = Number(row.longitude);
    if (!validCoord(slat, slng)) continue;
    const distanceKm = haversineDistanceKm({ lat, lng }, { lat: slat, lng: slng });
    const storeRadius = (() => {
      const raw = row.delivery_radius_km;
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();
    if (distanceKm <= effectiveServiceRadiusKm(GLOBAL_LIST_RADIUS_KM, storeRadius)) {
      nearbyStorePks.push(Number(row.id));
    }
  }

  if (nearbyStorePks.length === 0) return [];

  type CatRow = {
    category_name: string;
    item_image_url: string | null;
    category_image_url: string | null;
    display_order: number | null;
    item_id: number;
  };

  const catRows = await pg<CatRow[]>`
    SELECT
      trim(c.category_name) AS category_name,
      ${visibleImage} AS item_image_url,
      NULLIF(trim(c.category_image_url), '') AS category_image_url,
      c.display_order,
      m.id AS item_id
    FROM merchant_menu_items m
    INNER JOIN merchant_menu_categories c
      ON c.id = m.category_id
      AND c.store_id = m.store_id
    WHERE m.store_id = ANY(${nearbyStorePks}::bigint[])
      AND COALESCE(m.is_deleted, FALSE) = FALSE
      AND COALESCE(c.is_deleted, FALSE) = FALSE
      AND m.is_active = TRUE
      AND COALESCE(c.is_active, TRUE) = TRUE
      AND COALESCE(m.is_locked_by_plan, FALSE) = FALSE
      AND ${approval}
      AND trim(c.category_name) <> ''
    ORDER BY c.display_order NULLS LAST, lower(trim(c.category_name)), m.id
    LIMIT 500
  `;

  type CategoryOnlyRow = {
    category_name: string;
    category_image_url: string | null;
    display_order: number | null;
  };

  const categoryOnlyRows = await pg<CategoryOnlyRow[]>`
    SELECT
      trim(c.category_name) AS category_name,
      NULLIF(trim(c.category_image_url), '') AS category_image_url,
      c.display_order
    FROM merchant_menu_categories c
    WHERE c.store_id = ANY(${nearbyStorePks}::bigint[])
      AND COALESCE(c.is_deleted, FALSE) = FALSE
      AND COALESCE(c.is_active, TRUE) = TRUE
      AND trim(c.category_name) <> ''
    ORDER BY c.display_order NULLS LAST, lower(trim(c.category_name))
    LIMIT 120
  `;

  type RelaxedCatRow = {
    category_name: string;
    item_image_url: string | null;
    display_order: number | null;
    item_id: number;
  };

  const relaxedCatRows =
    (catRows?.length ?? 0) > 0
      ? []
      : await pg<RelaxedCatRow[]>`
          SELECT
            trim(c.category_name) AS category_name,
            ${visibleImage} AS item_image_url,
            c.display_order,
            m.id AS item_id
          FROM merchant_menu_items m
          INNER JOIN merchant_menu_categories c
            ON c.id = m.category_id
            AND c.store_id = m.store_id
          WHERE m.store_id = ANY(${nearbyStorePks}::bigint[])
            AND COALESCE(m.is_deleted, FALSE) = FALSE
            AND COALESCE(c.is_deleted, FALSE) = FALSE
            AND m.is_active = TRUE
            AND COALESCE(c.is_active, TRUE) = TRUE
            AND trim(c.category_name) <> ''
          ORDER BY c.display_order NULLS LAST, lower(trim(c.category_name)), m.id
          LIMIT 500
        `;

  type Acc = {
    name: string;
    displayOrder: number;
    itemImageUrl: string | null;
    categoryImageUrl: string | null;
  };

  const byKey = new Map<string, Acc>();

  for (const row of catRows ?? []) {
    const name = String(row.category_name ?? "").trim();
    if (!name) continue;
    const key = normalizeCategoryKey(name);
    const displayOrder =
      row.display_order != null && Number.isFinite(Number(row.display_order))
        ? Number(row.display_order)
        : 9999;
    const itemImg = row.item_image_url?.trim() || null;
    const catImg = row.category_image_url?.trim() || null;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        name,
        displayOrder,
        itemImageUrl: itemImg,
        categoryImageUrl: catImg,
      });
      continue;
    }

    if (existing.displayOrder > displayOrder) {
      existing.displayOrder = displayOrder;
      existing.name = name;
    }
    if (!existing.itemImageUrl && itemImg) {
      existing.itemImageUrl = itemImg;
    }
    if (!existing.categoryImageUrl && catImg) {
      existing.categoryImageUrl = catImg;
    }
  }

  for (const row of relaxedCatRows ?? []) {
    const name = String(row.category_name ?? "").trim();
    if (!name) continue;
    const key = normalizeCategoryKey(name);
    if (byKey.has(key)) continue;
    const displayOrder =
      row.display_order != null && Number.isFinite(Number(row.display_order))
        ? Number(row.display_order)
        : 9999;
    const itemImg = row.item_image_url?.trim() || null;
    byKey.set(key, {
      name,
      displayOrder,
      itemImageUrl: itemImg,
      categoryImageUrl: null,
    });
  }

  for (const row of categoryOnlyRows ?? []) {
    const name = String(row.category_name ?? "").trim();
    if (!name) continue;
    const key = normalizeCategoryKey(name);
    if (byKey.has(key)) continue;
    const displayOrder =
      row.display_order != null && Number.isFinite(Number(row.display_order))
        ? Number(row.display_order)
        : 9999;
    const catImg = row.category_image_url?.trim() || null;
    byKey.set(key, {
      name,
      displayOrder,
      itemImageUrl: null,
      categoryImageUrl: catImg,
    });
  }

  const out: GroceryHomeMenuCategory[] = [];

  for (const entry of byKey.values()) {
    const rawImage = entry.itemImageUrl || entry.categoryImageUrl || "";
    const imageUrl = rawImage
      ? (toAbsoluteClientMediaUrl(rawImage) ?? rawImage)
      : null;

    out.push({
      id: menuCategorySlug(entry.name),
      name: entry.name,
      slug: menuCategorySlug(entry.name),
      imageUrl,
    });
  }

  out.sort(
    (a, b) => {
      const aOrder = byKey.get(normalizeCategoryKey(a.name))?.displayOrder ?? 9999;
      const bOrder = byKey.get(normalizeCategoryKey(b.name))?.displayOrder ?? 9999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    }
  );

  return out.slice(0, MAX_CATEGORIES);
}

export { menuCategorySlug };
