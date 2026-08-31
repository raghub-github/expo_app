/**
 * Mirror of backend/src/modules/merchant-menu/categoryRules.ts — keep in sync.
 */
import { getSql } from "../client";

export type PlanLimits = {
  max_menu_items: number | null;
  max_menu_categories: number | null;
  max_menu_subcategories: number | null;
  max_cuisines: number | null;
  plan_code: string | null;
};

export type CategoryUiConfig = {
  store_type: string | null;
  cuisine_field: {
    visible: boolean;
    required_for_root: boolean;
    inherit_on_subcategory: boolean;
  };
  /** When true, merchant may link more cuisines from `cuisine_master` (plan limits apply). No free-text new cuisines. */
  allow_create_custom_cuisine: boolean;
  /**
   * Item form profile by store type.
   * - grocery: simplified fields + expiry_date (name/category/image/desc/prices/stock/prep/delivery+nutrition)
   * - standard: existing food/restaurant form (CLOUD_KITCHEN, CAFE, BAKERY, RESTAURANT, …) — unchanged
   */
  item_form: {
    variant: "grocery" | "standard";
    show_expiry: boolean;
    show_food_attrs: boolean;
  };
  limits: PlanLimits & {
    current_category_count: number;
    current_subcategory_count: number;
    /** Rows in merchant_store_cuisines for this store (vs plan max_cuisines) */
    current_custom_cuisine_count: number;
  };
};

export function isGroceryStoreType(storeType: string | null | undefined): boolean {
  return normalizeStoreTypeForCuisineFlag(storeType) === "GROCERY";
}

export function isFoodStoreType(storeType: string | null | undefined): boolean {
  const t = (storeType ?? "").trim().toUpperCase();
  if (!t) return false;
  if (t === "FOOD" || t === "RESTAURANT") return true;
  if (t.includes("FOOD")) return true;
  return false;
}

function normalizeStoreTypeForCuisineFlag(storeType: string | null | undefined): string {
  return (storeType ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

/** Defaults when no super-admin row exists yet — keep in sync with onboarding-store-types. */
const DEFAULT_CUISINE_ENABLED_STORE_TYPES = new Set([
  "FOOD",
  "RESTAURANT",
  "CAFE",
  "BAKERY",
  "CLOUD_KITCHEN",
  "FOOD_TRUCK",
  "ICE_CREAM_PARLOR",
  "GROCERY",
]);

export function defaultCuisineEnabledForStoreType(storeType: string | null | undefined): boolean {
  return DEFAULT_CUISINE_ENABLED_STORE_TYPES.has(normalizeStoreTypeForCuisineFlag(storeType));
}

/**
 * Super-admin "Cuisine list in onboarding" flag for this store type.
 * Same flag gates category cuisine_id and the item cuisine picker.
 */
export async function isCuisineEnabledForStoreType(
  storeType: string | null | undefined
): Promise<boolean> {
  const t = normalizeStoreTypeForCuisineFlag(storeType);
  if (!t) return false;
  try {
    const sql = getSql();
    const [row] = await sql<{ cuisine_list_enabled: boolean }[]>`
      SELECT cuisine_list_enabled
      FROM merchant_store_type_onboarding_flags
      WHERE UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_')) = ${t}
      LIMIT 1
    `;
    if (row) return row.cuisine_list_enabled === true;
  } catch {
    /* table may not exist yet */
  }
  return defaultCuisineEnabledForStoreType(t);
}

export async function getMerchantParentIdForStore(storeIdNum: number): Promise<number | null> {
  const sql = getSql();
  const [row] = await sql<{ parent_id: number | null }[]>`
    SELECT parent_id FROM merchant_stores WHERE id = ${storeIdNum} LIMIT 1
  `;
  return row?.parent_id != null ? Number(row.parent_id) : null;
}

export async function resolveStoreTypeForMenu(storeIdNum: number): Promise<string | null> {
  const sql = getSql();
  const [row] = await sql<{ store_type: string | null }[]>`
    SELECT store_type FROM merchant_stores WHERE id = ${storeIdNum} LIMIT 1
  `;
  return row?.store_type ?? null;
}

export async function getEffectivePlanLimits(storeIdNum: number): Promise<PlanLimits> {
  const sql = getSql();
  const parentId = await getMerchantParentIdForStore(storeIdNum);
  if (parentId == null) {
    return {
      max_menu_items: null,
      max_menu_categories: null,
      max_menu_subcategories: null,
      max_cuisines: null,
      plan_code: null,
    };
  }

  const [sub] = await sql<
    {
      max_menu_items: number | null;
      max_menu_categories: number | null;
      max_menu_subcategories: number | null;
      max_cuisines: number | null;
      plan_code: string | null;
    }[]
  >`
    SELECT mp.max_menu_items, mp.max_menu_categories,
           mp.max_menu_subcategories, mp.max_cuisines, mp.plan_code
    FROM merchant_subscriptions ms
    JOIN merchant_plans mp ON mp.id = ms.plan_id
    WHERE ms.merchant_id = ${parentId}
      AND (ms.store_id IS NULL OR ms.store_id = ${storeIdNum})
      AND ms.is_active = TRUE
      AND ms.subscription_status = 'ACTIVE'
      AND ms.expiry_date > NOW()
    ORDER BY ms.expiry_date DESC
    LIMIT 1
  `;

  if (sub) {
    return {
      max_menu_items: sub.max_menu_items,
      max_menu_categories: sub.max_menu_categories,
      max_menu_subcategories: sub.max_menu_subcategories ?? null,
      max_cuisines: sub.max_cuisines,
      plan_code: sub.plan_code,
    };
  }

  const [free] = await sql<
    {
      max_menu_items: number | null;
      max_menu_categories: number | null;
      max_menu_subcategories: number | null;
      max_cuisines: number | null;
      plan_code: string | null;
    }[]
  >`
    SELECT max_menu_items, max_menu_categories, max_menu_subcategories, max_cuisines, plan_code
    FROM merchant_plans
    WHERE plan_code = 'FREE' AND is_active = TRUE
    LIMIT 1
  `;

  return {
    max_menu_items: free?.max_menu_items ?? null,
    max_menu_categories: free?.max_menu_categories ?? null,
    max_menu_subcategories: free?.max_menu_subcategories ?? null,
    max_cuisines: free?.max_cuisines ?? null,
    plan_code: free?.plan_code ?? "FREE",
  };
}

export async function countLiveCategories(storeIdNum: number): Promise<{
  total: number;
  subcategories: number;
}> {
  const sql = getSql();
  const [row] = await sql<{ total: string; subs: string }[]>`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE parent_category_id IS NOT NULL)::text AS subs
    FROM merchant_menu_categories
    WHERE store_id = ${storeIdNum}
      AND COALESCE(is_deleted, FALSE) = FALSE
  `;
  return {
    total: Number(row?.total ?? 0),
    subcategories: Number(row?.subs ?? 0),
  };
}

export async function countLinkedCuisinesForStore(storeIdNum: number): Promise<number> {
  const sql = getSql();
  const [row] = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM merchant_store_cuisines WHERE store_id = ${storeIdNum}
  `;
  return Number(row?.c ?? 0);
}

export async function buildCategoryUiConfig(storeIdNum: number, storeType: string | null): Promise<CategoryUiConfig> {
  const grocery = isGroceryStoreType(storeType);
  const [limits, counts, linkedCuisines, cuisineEnabled] = await Promise.all([
    getEffectivePlanLimits(storeIdNum),
    countLiveCategories(storeIdNum),
    countLinkedCuisinesForStore(storeIdNum),
    isCuisineEnabledForStoreType(storeType),
  ]);

  return {
    store_type: storeType,
    cuisine_field: {
      visible: cuisineEnabled,
      required_for_root: false,
      inherit_on_subcategory: true,
    },
    allow_create_custom_cuisine:
      cuisineEnabled && (limits.max_cuisines == null || linkedCuisines < limits.max_cuisines),
    item_form: {
      variant: grocery ? "grocery" : "standard",
      show_expiry: grocery,
      show_food_attrs: !grocery,
    },
    limits: {
      ...limits,
      current_category_count: counts.total,
      current_subcategory_count: counts.subcategories,
      current_custom_cuisine_count: linkedCuisines,
    },
  };
}

export type CategoryRuleErrorCode =
  | "cuisine_required"
  | "cuisine_not_allowed"
  | "cuisine_not_found"
  | "cuisine_in_use"
  | "category_limit_exceeded"
  | "subcategory_limit_exceeded"
  | "custom_cuisine_limit_exceeded"
  | "parent_invalid"
  | "parent_must_be_root"
  | "cannot_change_cuisine_with_items"
  | "duplicate_category_name";

export class CategoryRuleError extends Error {
  constructor(
    public code: CategoryRuleErrorCode,
    message: string,
    public httpStatus = 400
  ) {
    super(message);
    this.name = "CategoryRuleError";
  }
}

export async function assertCuisineLinkedToStore(opts: { storeIdNum: number; cuisineId: number }): Promise<void> {
  const sql = getSql();
  const [cm] = await sql<{ id: number }[]>`
    SELECT id FROM cuisine_master WHERE id = ${opts.cuisineId} AND is_active = TRUE LIMIT 1
  `;
  if (!cm) throw new CategoryRuleError("cuisine_not_found", "Cuisine not found", 400);
  const [link] = await sql`
    SELECT 1 FROM merchant_store_cuisines
    WHERE store_id = ${opts.storeIdNum} AND cuisine_id = ${opts.cuisineId}
    LIMIT 1
  `;
  if (!link) {
    throw new CategoryRuleError(
      "cuisine_not_allowed",
      "This cuisine is not enabled for this store. Add it under store cuisines (onboarding / settings) first.",
      403
    );
  }
}

function slugifyCuisine(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "cuisine";
}

export async function validateCategoryCreate(opts: {
  storeIdNum: number;
  storeType: string | null;
  parent_category_id: number | null | undefined;
  cuisine_id: number | null | undefined;
  category_name: string;
}): Promise<{ cuisine_id: number | null }> {
  const limits = await getEffectivePlanLimits(opts.storeIdNum);
  const counts = await countLiveCategories(opts.storeIdNum);
  const cuisineEnabled = await isCuisineEnabledForStoreType(opts.storeType);
  const sql = getSql();

  if (limits.max_menu_categories != null && counts.total >= limits.max_menu_categories) {
    throw new CategoryRuleError(
      "category_limit_exceeded",
      `Category limit reached (${limits.max_menu_categories}) for your plan`,
      400
    );
  }

  const parentIdCat = opts.parent_category_id ?? null;
  if (parentIdCat != null) {
    const [p] = await sql<{ id: number; parent_category_id: number | null; cuisine_id: number | null }[]>`
      SELECT id, parent_category_id, cuisine_id FROM merchant_menu_categories
      WHERE id = ${parentIdCat} AND store_id = ${opts.storeIdNum}
        AND COALESCE(is_deleted, FALSE) = FALSE
      LIMIT 1
    `;
    if (!p) throw new CategoryRuleError("parent_invalid", "Parent category not found", 400);
    if (p.parent_category_id != null) {
      throw new CategoryRuleError("parent_must_be_root", "Subcategories can only be created under a top-level category", 400);
    }
    if (limits.max_menu_subcategories != null && counts.subcategories >= limits.max_menu_subcategories) {
      throw new CategoryRuleError(
        "subcategory_limit_exceeded",
        `Subcategory limit reached (${limits.max_menu_subcategories}) for your plan`,
        400
      );
    }
    if (cuisineEnabled) {
      const cid = p.cuisine_id != null ? Number(p.cuisine_id) : opts.cuisine_id ?? null;
      if (cid != null) {
        await assertCuisineLinkedToStore({ storeIdNum: opts.storeIdNum, cuisineId: cid });
      }
      return { cuisine_id: cid };
    }
    return { cuisine_id: null };
  }

  if (cuisineEnabled) {
    const cid = opts.cuisine_id ?? null;
    if (cid != null) {
      await assertCuisineLinkedToStore({ storeIdNum: opts.storeIdNum, cuisineId: cid });
    }
    return { cuisine_id: cid };
  }

  if (opts.cuisine_id != null) {
    throw new CategoryRuleError(
      "cuisine_not_allowed",
      "cuisine_id is only allowed when cuisine list is enabled for this store type",
      400
    );
  }
  return { cuisine_id: null };
}

export async function validateCategoryUpdate(opts: {
  storeIdNum: number;
  storeType: string | null;
  categoryId: number;
  cuisine_id: number | null | undefined;
}): Promise<void> {
  if (opts.cuisine_id === undefined) return;
  const cuisineEnabled = await isCuisineEnabledForStoreType(opts.storeType);
  const sql = getSql();

  const [row] = await sql<{ cuisine_id: number | null; parent_category_id: number | null }[]>`
    SELECT cuisine_id, parent_category_id FROM merchant_menu_categories
    WHERE id = ${opts.categoryId} AND store_id = ${opts.storeIdNum}
      AND COALESCE(is_deleted, FALSE) = FALSE
    LIMIT 1
  `;
  if (!row) return;

  const nextCuisine = opts.cuisine_id;
  if (!cuisineEnabled && nextCuisine != null) {
    throw new CategoryRuleError(
      "cuisine_not_allowed",
      "cuisine_id is only allowed when cuisine list is enabled for this store type",
      400
    );
  }

  if (!cuisineEnabled) return;

  const oldC = row.cuisine_id != null ? Number(row.cuisine_id) : null;
  const newC = nextCuisine;
  if (oldC === newC) return;

  if (row.parent_category_id != null) {
    throw new CategoryRuleError("cuisine_not_allowed", "Use parent category to change cuisine for subcategories", 400);
  }

  const [cnt] = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM merchant_menu_items
    WHERE category_id = ${opts.categoryId} AND store_id = ${opts.storeIdNum}
      AND (is_deleted IS NULL OR is_deleted = FALSE)
  `;
  const n = Number(cnt?.c ?? 0);
  if (n > 0) {
    throw new CategoryRuleError(
      "cannot_change_cuisine_with_items",
      "Cannot change cuisine while the category has menu items",
      400
    );
  }
  if (newC != null) {
    await assertCuisineLinkedToStore({ storeIdNum: opts.storeIdNum, cuisineId: newC });
  }
}

export async function createCustomCuisine(opts: {
  parentId: number;
  storeIdNum: number;
  name: string;
}): Promise<{ id: number }> {
  void opts.parentId;
  const sql = getSql();
  const limits = await getEffectivePlanLimits(opts.storeIdNum);
  const name = opts.name.trim();
  if (!name) throw new CategoryRuleError("cuisine_not_found", "Cuisine name is required", 400);

  const slug = slugifyCuisine(name);
  let masterId: number | null = null;

  // Already linked under a store custom_name (e.g. "Chines" → master Chinese).
  const [byCustom] = await sql<{ cuisine_id: number }[]>`
    SELECT cuisine_id
    FROM merchant_store_cuisines
    WHERE store_id = ${opts.storeIdNum}
      AND lower(trim(COALESCE(custom_name, ''))) = lower(trim(${name}))
    LIMIT 1
  `;
  if (byCustom) masterId = Number(byCustom.cuisine_id);

  if (masterId == null) {
    const [bySlug] = await sql<{ id: number }[]>`
      SELECT id FROM cuisine_master WHERE slug = ${slug} LIMIT 1
    `;
    if (bySlug) masterId = Number(bySlug.id);
  }

  if (masterId == null) {
    const [byName] = await sql<{ id: number }[]>`
      SELECT id FROM cuisine_master WHERE lower(trim(name)) = lower(trim(${name})) LIMIT 1
    `;
    if (byName) masterId = Number(byName.id);
  }

  // Prefix / close match: "Chines" → "Chinese", "North" → "North Indian"
  if (masterId == null && name.length >= 3) {
    const [byPrefix] = await sql<{ id: number }[]>`
      SELECT id
      FROM cuisine_master
      WHERE is_active = TRUE
        AND (
          lower(trim(name)) LIKE lower(trim(${name})) || '%'
          OR lower(trim(${name})) LIKE lower(trim(name)) || '%'
        )
      ORDER BY length(trim(name)) ASC
      LIMIT 1
    `;
    if (byPrefix) masterId = Number(byPrefix.id);
  }

  if (masterId == null) {
    throw new CategoryRuleError(
      "cuisine_not_found",
      "Cuisine is not in the master list. Pick from the store cuisine list or ask an admin to add it to cuisine_master.",
      400
    );
  }

  const [existingLink] = await sql`
    SELECT 1 FROM merchant_store_cuisines
    WHERE store_id = ${opts.storeIdNum} AND cuisine_id = ${masterId}
    LIMIT 1
  `;
  if (!existingLink) {
    const linked = await countLinkedCuisinesForStore(opts.storeIdNum);
    if (limits.max_cuisines != null && linked >= limits.max_cuisines) {
      throw new CategoryRuleError(
        "custom_cuisine_limit_exceeded",
        `Cuisine limit reached (${limits.max_cuisines}) for your plan`,
        400
      );
    }
  }
  await sql`
    INSERT INTO merchant_store_cuisines (store_id, cuisine_id, custom_name)
    VALUES (${opts.storeIdNum}, ${masterId}, ${name})
    ON CONFLICT (store_id, cuisine_id) DO UPDATE SET custom_name = EXCLUDED.custom_name
  `;
  return { id: masterId };
}

/** Map Postgres row to JSON-safe numbers (avoids bigint serialization issues in API responses). */
function mapCuisineRow(r: { id: unknown; name: unknown; is_system_defined: unknown }): {
  id: number;
  name: string;
  is_system_defined: boolean;
} {
  const rawId = r.id;
  const id =
    typeof rawId === "bigint"
      ? Number(rawId)
      : typeof rawId === "number"
        ? rawId
        : Number(rawId);
  return {
    id: Number.isFinite(id) && id > 0 ? id : 0,
    name: typeof r.name === "string" ? r.name : String(r.name ?? ""),
    is_system_defined: Boolean(r.is_system_defined),
  };
}

export async function listCuisinesForStoreDashboard(storeIdNum: number): Promise<
  Array<{ id: number; name: string; is_system_defined: boolean }>
> {
  await syncLegacyCuisineTypesToStoreLinks(storeIdNum);
  const sql = getSql();
  const rows = await sql`
    SELECT
      cm.id,
      COALESCE(NULLIF(trim(msc.custom_name), ''), cm.name) AS name,
      cm.is_default AS is_system_defined
    FROM merchant_store_cuisines msc
    JOIN cuisine_master cm ON cm.id = msc.cuisine_id
    WHERE msc.store_id = ${storeIdNum}
      AND cm.is_active = TRUE
    ORDER BY cm.is_default DESC, lower(trim(COALESCE(NULLIF(trim(msc.custom_name), ''), cm.name))) ASC
  `;
  const arr = Array.isArray(rows) ? rows : [];
  return arr
    .map((r) => mapCuisineRow(r as { id: unknown; name: unknown; is_system_defined: unknown }))
    .filter((r) => r.id > 0 && r.name.trim().length > 0);
}

/** Backfill merchant_store_cuisines from legacy merchant_stores.cuisine_types (text[]). */
export async function syncLegacyCuisineTypesToStoreLinks(storeIdNum: number): Promise<void> {
  const sql = getSql();
  const [store] = await sql<{ cuisine_types: unknown }[]>`
    SELECT cuisine_types FROM merchant_stores WHERE id = ${storeIdNum} LIMIT 1
  `;
  const raw = store?.cuisine_types;
  if (raw == null) return;
  const arr = Array.isArray(raw) ? raw : [];
  const names = [
    ...new Set(
      arr
        .map((x) => (typeof x === "string" ? x.trim() : String(x).trim()))
        .filter((s) => s.length > 0)
    ),
  ];
  if (names.length === 0) return;

  for (const name of names) {
    const slug = slugifyCuisine(name);
    let masterId: number | null = null;
    const [bySlug] = await sql<{ id: number }[]>`
      SELECT id FROM cuisine_master WHERE slug = ${slug} LIMIT 1
    `;
    if (bySlug) masterId = Number(bySlug.id);
    else {
      const [byName] = await sql<{ id: number }[]>`
        SELECT id FROM cuisine_master WHERE lower(trim(name)) = lower(trim(${name})) LIMIT 1
      `;
      if (byName) masterId = Number(byName.id);
    }
    /* Only link legacy strings that resolve to an existing cuisine_master row — never insert new master rows. */
    if (masterId == null) continue;
    await sql`
      INSERT INTO merchant_store_cuisines (store_id, cuisine_id, custom_name)
      VALUES (${storeIdNum}, ${masterId}, ${name})
      ON CONFLICT (store_id, cuisine_id) DO UPDATE SET
        custom_name = COALESCE(
          NULLIF(trim(EXCLUDED.custom_name), ''),
          NULLIF(trim(merchant_store_cuisines.custom_name), ''),
          merchant_store_cuisines.custom_name
        )
    `;
  }
}

export async function listCatalogCuisinesNotLinkedForStore(storeIdNum: number): Promise<
  Array<{ id: number; name: string; is_system_defined: boolean }>
> {
  const sql = getSql();
  const rows = await sql`
    SELECT cm.id, cm.name, cm.is_default AS is_system_defined
    FROM cuisine_master cm
    WHERE cm.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM merchant_store_cuisines msc
        WHERE msc.store_id = ${storeIdNum} AND msc.cuisine_id = cm.id
      )
    ORDER BY cm.is_default DESC, lower(trim(cm.name)) ASC
  `;
  const arr = Array.isArray(rows) ? rows : [];
  return arr
    .map((r) => mapCuisineRow(r as { id: unknown; name: unknown; is_system_defined: unknown }))
    .filter((r) => r.id > 0 && r.name.trim().length > 0);
}

/** Names from merchant_stores.cuisine_types (text[]) for display / diagnostics. */
export async function getLegacyCuisineNamesForStore(storeIdNum: number): Promise<string[]> {
  const sql = getSql();
  const [store] = await sql<{ cuisine_types: unknown }[]>`
    SELECT cuisine_types FROM merchant_stores WHERE id = ${storeIdNum} LIMIT 1
  `;
  const raw = store?.cuisine_types;
  if (raw == null || !Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((x) => (typeof x === "string" ? x.trim() : String(x).trim()))
        .filter((s) => s.length > 0)
    ),
  ];
}

/** Profile cuisine strings that do not match any row in cuisine_master (cannot link until seeded). */
export async function listLegacyCuisineNamesNotInMaster(storeIdNum: number): Promise<string[]> {
  const names = await getLegacyCuisineNamesForStore(storeIdNum);
  if (names.length === 0) return [];
  const sql = getSql();
  const missing: string[] = [];
  for (const name of names) {
    const slug = slugifyCuisine(name);
    const [bySlug] = await sql<{ id: number }[]>`
      SELECT id FROM cuisine_master WHERE slug = ${slug} LIMIT 1
    `;
    if (bySlug) continue;
    const [byName] = await sql<{ id: number }[]>`
      SELECT id FROM cuisine_master WHERE lower(trim(name)) = lower(trim(${name})) LIMIT 1
    `;
    if (!byName) missing.push(name);
  }
  return missing;
}

export async function linkExistingCuisineToStore(storeIdNum: number, cuisineId: number): Promise<void> {
  const sql = getSql();
  const limits = await getEffectivePlanLimits(storeIdNum);
  const [cm] = await sql<{ id: number }[]>`
    SELECT id FROM cuisine_master WHERE id = ${cuisineId} AND is_active = TRUE LIMIT 1
  `;
  if (!cm) throw new CategoryRuleError("cuisine_not_found", "Cuisine not found", 400);
  const [exists] = await sql`
    SELECT 1 FROM merchant_store_cuisines
    WHERE store_id = ${storeIdNum} AND cuisine_id = ${cuisineId}
    LIMIT 1
  `;
  if (exists) return;
  const linked = await countLinkedCuisinesForStore(storeIdNum);
  if (limits.max_cuisines != null && linked >= limits.max_cuisines) {
    throw new CategoryRuleError(
      "custom_cuisine_limit_exceeded",
      `Cuisine limit reached (${limits.max_cuisines}) for your plan`,
      400
    );
  }
  await sql`
    INSERT INTO merchant_store_cuisines (store_id, cuisine_id, custom_name)
    VALUES (${storeIdNum}, ${cuisineId}, NULL)
    ON CONFLICT (store_id, cuisine_id) DO NOTHING
  `;
}

async function assertNoOrderItemsLockingCuisineRemoval(
  storeIdNum: number,
  cuisineId: number
): Promise<void> {
  const sql = getSql();
  try {
    const [row] = await sql<{ x: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM order_items oi
        INNER JOIN merchant_menu_items mmi ON mmi.id = oi.merchant_menu_item_id
        INNER JOIN merchant_menu_categories mmc ON mmc.id = mmi.category_id
        INNER JOIN orders o ON o.id = oi.order_id
        WHERE mmi.store_id = ${storeIdNum}
          AND mmc.cuisine_id = ${cuisineId}
          AND oi.merchant_menu_item_id IS NOT NULL
          AND lower(o.status::text) NOT IN ('cancelled', 'failed', 'rejected')
      ) AS x
    `;
    if (row?.x) {
      throw new CategoryRuleError(
        "cuisine_in_use",
        "This cuisine cannot be removed while linked menu items appear on active or completed orders.",
        400
      );
    }
  } catch (e) {
    if (e instanceof CategoryRuleError) throw e;
    /* orders/order_items schema may differ; category-only guard still applies */
  }
}

export async function unlinkCuisineFromStore(storeIdNum: number, cuisineId: number): Promise<void> {
  const sql = getSql();
  const [cnt] = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM merchant_menu_categories
    WHERE store_id = ${storeIdNum} AND cuisine_id = ${cuisineId}
      AND COALESCE(is_deleted, FALSE) = FALSE
  `;
  if (Number(cnt?.c ?? 0) > 0) {
    throw new CategoryRuleError(
      "cuisine_in_use",
      "Remove or reassign categories that use this cuisine before removing it from the store.",
      400
    );
  }
  await assertNoOrderItemsLockingCuisineRemoval(storeIdNum, cuisineId);
  await sql`
    DELETE FROM merchant_store_cuisines
    WHERE store_id = ${storeIdNum} AND cuisine_id = ${cuisineId}
  `;
}
