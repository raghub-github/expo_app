import { ulid } from "ulid";
import { getSql } from "../../db/client.js";
import { getMenuItemEffectiveInStockExprFull } from "../../lib/menu-item-effective-stock.js";
import { expireTimedMenuOutOfStockForStore } from "../../lib/menu-oos-expiry.js";
import { getNextOpenIso, nowInStoreTz } from "../merchant-partner/store-schedule-engine.js";
import {
  buildFoodLegacyAttributesFromItemRow,
  loadItemAttributes,
  loadVariantAttributes,
  resolveStoreType,
  upsertVariantAttributes,
  upsertItemAttributes,
  type UnifiedAttributes,
} from "./unifiedCatalogAttributes.js";
import {
  validateCategoryCreate,
  validateCategoryUpdate,
  getMerchantParentIdForStore,
  createCustomCuisine as insertCustomCuisineRow,
  syncLegacyCuisineTypesToStoreLinks,
} from "./categoryRules.js";

export type StoreAccess = { storeIdNum: number; storeIdStr: string };

/**
 * Resolve store by string store_id or numeric id and ensure it belongs to the given parent (merchant).
 * Returns { storeIdNum, storeIdStr } or null if not found / not owned.
 */
export async function assertStoreAccess(
  parentMerchantId: string,
  storeIdParam: string
): Promise<StoreAccess | null> {
  const sql = getSql();
  const parentRows = await sql`
    SELECT id FROM merchant_parents WHERE parent_merchant_id = ${parentMerchantId} LIMIT 1
  `;
  const parentRow = parentRows[0];
  if (!parentRow) return null;
  const parentId = Number(parentRow.id);

  const isNumeric = /^\d+$/.test(storeIdParam);
  const storeRows = isNumeric
    ? await sql`
        SELECT id, store_id FROM merchant_stores
        WHERE id = ${parseInt(storeIdParam, 10)} AND parent_id = ${parentId} LIMIT 1
      `
    : await sql`
        SELECT id, store_id FROM merchant_stores
        WHERE store_id = ${storeIdParam} AND parent_id = ${parentId} LIMIT 1
      `;
  const store = storeRows[0];
  if (!store) return null;
  return {
    storeIdNum: Number(store.id),
    storeIdStr: String(store.store_id),
  };
}

/** List categories for a store (tree: root first, then by display_order). */
export async function listCategories(storeIdNum: number): Promise<
  Array<{
    id: number;
    category_name: string;
    category_description: string | null;
    category_image_url: string | null;
    parent_category_id: number | null;
    cuisine_id: number | null;
    display_order: number;
    is_active: boolean;
    out_of_stock_manual: boolean;
    out_of_stock_until: Date | string | null;
    out_of_stock_updated_at: Date | string | null;
    out_of_stock_active: boolean;
    created_at: Date;
    updated_at: Date;
  }>
> {
  const sql = getSql();
  await expireTimedMenuOutOfStockForStore(sql, storeIdNum);
  const rows = await sql`
    SELECT
      id,
      category_name,
      category_description,
      category_image_url,
      parent_category_id,
      cuisine_id,
      display_order,
      is_active,
      COALESCE(out_of_stock_manual, FALSE) AS out_of_stock_manual,
      out_of_stock_until,
      out_of_stock_updated_at,
      (
        COALESCE(out_of_stock_manual, FALSE) = TRUE
        OR (out_of_stock_until IS NOT NULL AND out_of_stock_until > NOW())
      ) AS out_of_stock_active,
      created_at,
      updated_at
    FROM merchant_menu_categories
    WHERE store_id = ${storeIdNum}
      AND COALESCE(is_deleted, FALSE) = FALSE
    ORDER BY parent_category_id NULLS FIRST, display_order ASC, id ASC
  `;
  return (rows as any[]).map((row) => ({
    ...row,
    out_of_stock_until: toApiIsoTimestamptz(row.out_of_stock_until),
    out_of_stock_updated_at: toApiIsoTimestamptz(row.out_of_stock_updated_at),
  }));
}

export type OutOfStockMode = "CLEAR" | "MANUAL" | "HOURS" | "NEXT_OPEN" | "CUSTOM";

function parsePositiveHours(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const hours = Math.floor(n);
  if (hours <= 0) return null;
  return Math.min(hours, 24 * 14); // cap to 14 days
}

function parseIsoDate(raw: unknown): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Bind timestamptz as ISO string — postgres.js can throw if a raw Date is interpolated (Node Buffer path). */
function sqlTimestamptz(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** JSON-safe ISO timestamps (pgbouncer may return "YYYY-MM-DD HH:mm:ss+00" which Hermes cannot parse). */
function toApiIsoTimestamptz(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const raw = String(value).trim();
  if (!raw) return null;
  let normalized = raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw;
  normalized = normalized.replace(/([+\-]\d{2})$/, "$1:00");
  normalized = normalized.replace(/([+\-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function computeNextOpenIsoForStore(storeIdNum: number): Promise<string | null> {
  const sql = getSql();
  const hoursRows = await sql`
    SELECT * FROM merchant_store_operating_hours
    WHERE store_id = ${storeIdNum}
    LIMIT 1
  `;
  const row = hoursRows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const now = new Date();
  const { dayOfWeek } = nowInStoreTz();
  // Product expectation: NEXT_OPEN means next business day opening,
  // not a later slot on the same day.
  return getNextOpenIso(row, dayOfWeek, 24 * 60, now);
}

function resolveOutOfStockUpdate(
  body: { mode: OutOfStockMode; hours?: unknown; until?: unknown }
): { out_of_stock_manual: boolean; out_of_stock_until: Date | null } {
  const mode = body.mode;
  if (mode === "CLEAR") return { out_of_stock_manual: false, out_of_stock_until: null };
  if (mode === "MANUAL") return { out_of_stock_manual: true, out_of_stock_until: null };
  if (mode === "HOURS") {
    const hours = parsePositiveHours(body.hours);
    if (!hours) throw new Error("invalid_hours");
    const until = new Date(Date.now() + hours * 60 * 60 * 1000);
    return { out_of_stock_manual: false, out_of_stock_until: until };
  }
  if (mode === "CUSTOM") {
    const until = parseIsoDate(body.until);
    if (!until) throw new Error("invalid_until");
    return { out_of_stock_manual: false, out_of_stock_until: until };
  }
  // NEXT_OPEN handled by caller (needs store schedule)
  return { out_of_stock_manual: false, out_of_stock_until: null };
}

export async function patchCategoryOutOfStock(
  categoryId: number,
  storeIdNum: number,
  body: { mode: OutOfStockMode; hours?: unknown; until?: unknown }
): Promise<{ ok: boolean; out_of_stock_until: string | null; out_of_stock_manual: boolean }> {
  const sql = getSql();
  await expireTimedMenuOutOfStockForStore(sql, storeIdNum);
  const [cat] = await sql`
    SELECT id, out_of_stock_updated_at, out_of_stock_until
    FROM merchant_menu_categories
    WHERE id = ${categoryId} AND store_id = ${storeIdNum}
      AND COALESCE(is_deleted, FALSE) = FALSE
    LIMIT 1
  `;
  if (!cat) return { ok: false, out_of_stock_until: null, out_of_stock_manual: false };

  let patch = resolveOutOfStockUpdate(body);
  if (body.mode === "NEXT_OPEN") {
    const nextIso = await computeNextOpenIsoForStore(storeIdNum);
    if (!nextIso) throw new Error("next_open_not_available");
    patch = { out_of_stock_manual: false, out_of_stock_until: new Date(nextIso) };
  }

  // Use a single timestamp for category + cascading item updates (acts as a marker).
  const markerIso = new Date().toISOString();
  const prevMarker = (cat as any)?.out_of_stock_updated_at ?? null;
  const prevUntil = (cat as any)?.out_of_stock_until ?? null;

  const [row] = await sql`
    UPDATE merchant_menu_categories
    SET
      out_of_stock_manual = ${patch.out_of_stock_manual},
      out_of_stock_until = ${sqlTimestamptz(patch.out_of_stock_until)},
      out_of_stock_updated_at = ${markerIso},
      updated_at = NOW()
    WHERE id = ${categoryId} AND store_id = ${storeIdNum}
      AND COALESCE(is_deleted, FALSE) = FALSE
    RETURNING out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at
  `;
  const r = row as any;

  // Cascade rules:
  // - When marking category OOS (manual/until): mark items under category as OOS using the same marker,
  //   but do not override items already independently out-of-stock.
  // - When clearing category OOS: restore (clear OOS) only for items that were last updated by the previous category marker.
  const categoryNowOos =
    Boolean(r?.out_of_stock_manual) ||
    (r?.out_of_stock_until != null && new Date(r.out_of_stock_until).getTime() > Date.now());

  if (categoryNowOos) {
    await sql`
      UPDATE merchant_menu_items
      SET
        out_of_stock_manual = FALSE,
        out_of_stock_until = ${sqlTimestamptz(r?.out_of_stock_until as Date | string | null | undefined)},
        out_of_stock_updated_at = ${markerIso},
        in_stock = FALSE,
        updated_at = NOW()
      WHERE store_id = ${storeIdNum}
        AND category_id = ${categoryId}
        AND (is_deleted IS NULL OR is_deleted = FALSE)
        AND (
          COALESCE(out_of_stock_manual, FALSE) = FALSE
          AND (out_of_stock_until IS NULL OR out_of_stock_until <= NOW())
        )
    `;
  } else if (body.mode === "CLEAR" && prevMarker) {
    const prevMarkerIso = sqlTimestamptz(prevMarker as Date | string | null | undefined);
    const prevUntilIso = sqlTimestamptz(prevUntil as Date | string | null | undefined);
    await sql`
      UPDATE merchant_menu_items
      SET
        out_of_stock_manual = FALSE,
        out_of_stock_until = NULL,
        out_of_stock_updated_at = ${markerIso},
        in_stock = TRUE,
        updated_at = NOW()
      WHERE store_id = ${storeIdNum}
        AND category_id = ${categoryId}
        AND (is_deleted IS NULL OR is_deleted = FALSE)
        AND COALESCE(out_of_stock_manual, FALSE) = FALSE
        AND out_of_stock_updated_at = ${prevMarkerIso}
        AND (
          (${prevUntilIso}::timestamptz IS NULL AND out_of_stock_until IS NULL)
          OR out_of_stock_until = ${prevUntilIso}
        )
    `;
  }

  return {
    ok: true,
    out_of_stock_manual: Boolean(r?.out_of_stock_manual),
    out_of_stock_until: r?.out_of_stock_until ? new Date(r.out_of_stock_until).toISOString() : null,
  };
}

export async function patchItemOutOfStock(
  itemId: number,
  storeIdNum: number,
  body: { mode: OutOfStockMode; hours?: unknown; until?: unknown }
): Promise<{ ok: boolean; out_of_stock_until: string | null; out_of_stock_manual: boolean }> {
  const sql = getSql();
  await expireTimedMenuOutOfStockForStore(sql, storeIdNum);
  const [it] = await sql`
    SELECT id FROM merchant_menu_items
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
      AND (is_deleted IS NULL OR is_deleted = FALSE)
    LIMIT 1
  `;
  if (!it) return { ok: false, out_of_stock_until: null, out_of_stock_manual: false };

  let patch = resolveOutOfStockUpdate(body);
  if (body.mode === "NEXT_OPEN") {
    const nextIso = await computeNextOpenIsoForStore(storeIdNum);
    if (!nextIso) throw new Error("next_open_not_available");
    patch = { out_of_stock_manual: false, out_of_stock_until: new Date(nextIso) };
  }

  const itemNowOos =
    patch.out_of_stock_manual ||
    (patch.out_of_stock_until != null && patch.out_of_stock_until.getTime() > Date.now());

  const [row] = await sql`
    UPDATE merchant_menu_items
    SET
      out_of_stock_manual = ${patch.out_of_stock_manual},
      out_of_stock_until = ${sqlTimestamptz(patch.out_of_stock_until)},
      out_of_stock_updated_at = NOW(),
      in_stock = ${!itemNowOos},
      updated_at = NOW()
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
      AND (is_deleted IS NULL OR is_deleted = FALSE)
    RETURNING out_of_stock_manual, out_of_stock_until
  `;
  const r = row as any;
  return {
    ok: true,
    out_of_stock_manual: Boolean(r?.out_of_stock_manual),
    out_of_stock_until: r?.out_of_stock_until ? new Date(r.out_of_stock_until).toISOString() : null,
  };
}

/** Map row to JSON-safe numbers (bigint-safe). */
function mapCuisineRow(r: { id: unknown; name: unknown; is_system_defined: unknown }): {
  id: number;
  name: string;
  is_system_defined: boolean;
} {
  const rawId = r.id;
  const id =
    typeof rawId === "bigint" ? Number(rawId) : typeof rawId === "number" ? rawId : Number(rawId);
  return {
    id: Number.isFinite(id) && id > 0 ? id : 0,
    name: typeof r.name === "string" ? r.name : String(r.name ?? ""),
    is_system_defined: Boolean(r.is_system_defined),
  };
}

/** Cuisines linked to the store (merchant_store_cuisines + cuisine_master); display name prefers custom_name. */
export async function listCuisinesForStore(storeIdNum: number): Promise<
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

export async function createMerchantCuisine(storeIdNum: number, name: string): Promise<{ id: number }> {
  const parentId = await getMerchantParentIdForStore(storeIdNum);
  if (parentId == null) throw new Error("store_parent_not_found");
  return insertCustomCuisineRow({ parentId, storeIdNum, name });
}

/**
 * Category name type-ahead: distinct names used by *other* stores, ranked by popularity.
 * Excludes names already used by this store (case-insensitive) so duplicates are not suggested.
 * When editing, pass editingCategoryId so the current row's name is not treated as a "taken" slot.
 */
function tokenizeCategoryQuery(q: string): string[] {
  return q
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]+/gi, ""))
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

function wordsFromCategoryName(nameLower: string): string[] {
  return nameLower
    .split(/[^a-z0-9]+/i)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

/** Every query token matches the start of some word in the category name (e.g. "bi ri" → Biryani). */
function allTokensMatchWordStarts(nameLower: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const words = wordsFromCategoryName(nameLower);
  return tokens.every((tok) => words.some((w) => w.startsWith(tok)));
}

export async function suggestPeerCategoryNames(
  storeIdNum: number,
  opts: { q: string; limit?: number; editingCategoryId?: number | null }
): Promise<string[]> {
  const sql = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 30);
  const qRaw = (opts.q ?? "").trim().slice(0, 30);
  const qNorm = qRaw.toLowerCase();
  const tokens = tokenizeCategoryQuery(qRaw);
  const editingId = opts.editingCategoryId ?? null;

  const forbiddenRows =
    editingId != null
      ? await sql<{ n: string }[]>`
          SELECT LOWER(TRIM(category_name)) AS n
          FROM merchant_menu_categories
          WHERE store_id = ${storeIdNum} AND id <> ${editingId}
            AND COALESCE(is_deleted, FALSE) = FALSE
        `
      : await sql<{ n: string }[]>`
          SELECT LOWER(TRIM(category_name)) AS n
          FROM merchant_menu_categories
          WHERE store_id = ${storeIdNum}
            AND COALESCE(is_deleted, FALSE) = FALSE
        `;
  const forbidden = new Set(
    forbiddenRows.map((r) => r.n).filter((x) => x != null && x !== "")
  );

  type Row = { name: string; store_count: number };
  let rows: Row[];

  if (tokens.length === 0) {
    rows = await sql<Row[]>`
      SELECT TRIM(category_name) AS name, COUNT(DISTINCT store_id)::int AS store_count
      FROM merchant_menu_categories
      WHERE store_id <> ${storeIdNum}
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND LENGTH(TRIM(category_name)) BETWEEN 1 AND 30
      GROUP BY TRIM(category_name)
      ORDER BY COUNT(DISTINCT store_id) DESC, LENGTH(TRIM(category_name)) ASC, TRIM(category_name) ASC
      LIMIT 250
    `;
  } else {
    let tokenCond = sql`TRUE`;
    for (const t of tokens) {
      tokenCond = sql`${tokenCond} AND POSITION(${t} IN LOWER(TRIM(category_name))) > 0`;
    }
    rows = await sql<Row[]>`
      SELECT TRIM(category_name) AS name, COUNT(DISTINCT store_id)::int AS store_count
      FROM merchant_menu_categories
      WHERE store_id <> ${storeIdNum}
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND LENGTH(TRIM(category_name)) BETWEEN 1 AND 30
        AND ${tokenCond}
      GROUP BY TRIM(category_name)
      ORDER BY COUNT(DISTINCT store_id) DESC, LENGTH(TRIM(category_name)) ASC, TRIM(category_name) ASC
      LIMIT 200
    `;
  }

  const filtered = rows.filter((r) => {
    const ln = String(r.name).toLowerCase().trim();
    return ln.length > 0 && !forbidden.has(ln);
  });

  const rank = (r: Row): [number, number, number, number, number, number, string] => {
    const name = String(r.name);
    const ln = name.toLowerCase().trim();
    const hasQ = tokens.length > 0 || qNorm.length > 0;

    const exact = hasQ && ln === qNorm ? 0 : 1;
    const prefix = hasQ && ln.startsWith(qNorm) ? 0 : 1;
    const wordStarts =
      tokens.length > 0 ? (allTokensMatchWordStarts(ln, tokens) ? 0 : 1) : 1;
    const contains =
      tokens.length > 0
        ? tokens.every((t) => ln.includes(t))
          ? 0
          : 1
        : 0;

    return [exact, prefix, wordStarts, contains, -r.store_count, name.length, name];
  };

  filtered.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  });

  return filtered.slice(0, limit).map((r) => r.name);
}

/**
 * Type-ahead for subcategory names: distinct names used as subcategories (parent set) on other stores.
 * Excludes names already used under the same parent on this store (matches unique index on store+parent+name).
 */
export async function suggestPeerSubcategoryNames(
  storeIdNum: number,
  opts: {
    q: string;
    limit?: number;
    parentCategoryId: number;
    editingCategoryId?: number | null;
  }
): Promise<string[]> {
  const parentId = opts.parentCategoryId;
  if (!Number.isFinite(parentId) || parentId <= 0) {
    return [];
  }

  const sql = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 30);
  const qRaw = (opts.q ?? "").trim().slice(0, 30);
  const qNorm = qRaw.toLowerCase();
  const tokens = tokenizeCategoryQuery(qRaw);
  const editingId = opts.editingCategoryId ?? null;

  const forbiddenRows =
    editingId != null
      ? await sql<{ n: string }[]>`
          SELECT LOWER(TRIM(category_name)) AS n
          FROM merchant_menu_categories
          WHERE store_id = ${storeIdNum}
            AND parent_category_id = ${parentId}
            AND id <> ${editingId}
            AND COALESCE(is_deleted, FALSE) = FALSE
        `
      : await sql<{ n: string }[]>`
          SELECT LOWER(TRIM(category_name)) AS n
          FROM merchant_menu_categories
          WHERE store_id = ${storeIdNum}
            AND parent_category_id = ${parentId}
            AND COALESCE(is_deleted, FALSE) = FALSE
        `;
  const forbidden = new Set(
    forbiddenRows.map((r) => r.n).filter((x) => x != null && x !== "")
  );

  type Row = { name: string; store_count: number };
  let rows: Row[];

  if (tokens.length === 0) {
    rows = await sql<Row[]>`
      SELECT TRIM(category_name) AS name, COUNT(DISTINCT store_id)::int AS store_count
      FROM merchant_menu_categories
      WHERE store_id <> ${storeIdNum}
        AND parent_category_id IS NOT NULL
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND LENGTH(TRIM(category_name)) BETWEEN 1 AND 30
      GROUP BY TRIM(category_name)
      ORDER BY COUNT(DISTINCT store_id) DESC, LENGTH(TRIM(category_name)) ASC, TRIM(category_name) ASC
      LIMIT 250
    `;
  } else {
    let tokenCond = sql`TRUE`;
    for (const t of tokens) {
      tokenCond = sql`${tokenCond} AND POSITION(${t} IN LOWER(TRIM(category_name))) > 0`;
    }
    rows = await sql<Row[]>`
      SELECT TRIM(category_name) AS name, COUNT(DISTINCT store_id)::int AS store_count
      FROM merchant_menu_categories
      WHERE store_id <> ${storeIdNum}
        AND parent_category_id IS NOT NULL
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND LENGTH(TRIM(category_name)) BETWEEN 1 AND 30
        AND ${tokenCond}
      GROUP BY TRIM(category_name)
      ORDER BY COUNT(DISTINCT store_id) DESC, LENGTH(TRIM(category_name)) ASC, TRIM(category_name) ASC
      LIMIT 200
    `;
  }

  const filtered = rows.filter((r) => {
    const ln = String(r.name).toLowerCase().trim();
    return ln.length > 0 && !forbidden.has(ln);
  });

  const rank = (r: Row): [number, number, number, number, number, number, string] => {
    const name = String(r.name);
    const ln = name.toLowerCase().trim();
    const hasQ = tokens.length > 0 || qNorm.length > 0;

    const exact = hasQ && ln === qNorm ? 0 : 1;
    const prefix = hasQ && ln.startsWith(qNorm) ? 0 : 1;
    const wordStarts =
      tokens.length > 0 ? (allTokensMatchWordStarts(ln, tokens) ? 0 : 1) : 1;
    const contains =
      tokens.length > 0
        ? tokens.every((t) => ln.includes(t))
          ? 0
          : 1
        : 0;

    return [exact, prefix, wordStarts, contains, -r.store_count, name.length, name];
  };

  filtered.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  });

  return filtered.slice(0, limit).map((r) => r.name);
}

/** Create category (store-type + plan rules applied in route layer via validateCategoryCreate). */
export async function createCategory(
  storeIdNum: number,
  body: {
    category_name: string;
    category_description?: string | null;
    category_image_url?: string | null;
    parent_category_id?: number | null;
    cuisine_id?: number | null;
    display_order?: number;
    is_active?: boolean;
  }
): Promise<{ id: number }> {
  const sql = getSql();
  const storeType = await resolveStoreType(storeIdNum);
  const { cuisine_id } = await validateCategoryCreate({
    storeIdNum,
    storeType,
    parent_category_id: body.parent_category_id,
    cuisine_id: body.cuisine_id,
    category_name: body.category_name,
  });
  const [row] = await sql`
    INSERT INTO merchant_menu_categories (
      store_id, category_name, category_description, category_image_url,
      parent_category_id, cuisine_id, display_order, is_active, is_deleted
    )
    VALUES (
      ${storeIdNum},
      ${body.category_name},
      ${body.category_description ?? null},
      ${body.category_image_url ?? null},
      ${body.parent_category_id ?? null},
      ${cuisine_id},
      ${body.display_order ?? 0},
      ${body.is_active ?? true},
      FALSE
    )
    RETURNING id
  `;
  return { id: Number((row as any).id) };
}

/** Update category. */
export async function updateCategory(
  categoryId: number,
  storeIdNum: number,
  body: {
    category_name?: string;
    category_description?: string | null;
    category_image_url?: string | null;
    parent_category_id?: number | null;
    cuisine_id?: number | null;
    display_order?: number;
    is_active?: boolean;
  }
): Promise<boolean> {
  const sql = getSql();
  const storeType = await resolveStoreType(storeIdNum);
  await validateCategoryUpdate({
    storeIdNum,
    storeType,
    categoryId,
    cuisine_id: body.cuisine_id,
  });

  const [existing] = await sql`
    SELECT category_name, category_description, category_image_url, parent_category_id, cuisine_id, display_order, is_active
    FROM merchant_menu_categories
    WHERE id = ${categoryId} AND store_id = ${storeIdNum}
      AND COALESCE(is_deleted, FALSE) = FALSE
  `;
  if (!existing) return false;
  const e = existing as any;
  const nextCuisine =
    body.cuisine_id !== undefined ? body.cuisine_id : e.cuisine_id != null ? Number(e.cuisine_id) : null;
  const result = await sql`
    UPDATE merchant_menu_categories
    SET category_name = ${body.category_name ?? e.category_name},
        category_description = ${body.category_description !== undefined ? body.category_description : e.category_description},
        category_image_url = ${body.category_image_url !== undefined ? body.category_image_url : e.category_image_url},
        parent_category_id = ${body.parent_category_id !== undefined ? body.parent_category_id : e.parent_category_id},
        cuisine_id = ${body.cuisine_id !== undefined ? body.cuisine_id : e.cuisine_id},
        display_order = ${body.display_order ?? e.display_order},
        is_active = ${body.is_active !== undefined ? body.is_active : e.is_active},
        updated_at = NOW()
    WHERE id = ${categoryId} AND store_id = ${storeIdNum}
      AND COALESCE(is_deleted, FALSE) = FALSE
  `;
  return (result.count ?? 0) > 0;
}

/** Soft-delete category when it has no items and no subcategories. */
export async function deleteCategory(
  categoryId: number,
  storeIdNum: number
): Promise<
  | { ok: true }
  | {
      ok: false;
      error: "category_not_found" | "category_has_items" | "category_has_subcategories";
      itemCount?: number;
      subcategoryCount?: number;
    }
> {
  const sql = getSql();
  const [exists] = await sql`
    SELECT 1 FROM merchant_menu_categories
    WHERE id = ${categoryId} AND store_id = ${storeIdNum}
      AND COALESCE(is_deleted, FALSE) = FALSE
  `;
  if (!exists) return { ok: false, error: "category_not_found" };

  const [subRow] = await sql<{ c: string }[]>`
    SELECT COUNT(*)::text AS c FROM merchant_menu_categories
    WHERE store_id = ${storeIdNum} AND parent_category_id = ${categoryId}
      AND COALESCE(is_deleted, FALSE) = FALSE
  `;
  const subCount = Number(subRow?.c ?? 0);
  if (subCount > 0) {
    return {
      ok: false,
      error: "category_has_subcategories",
      subcategoryCount: subCount,
    };
  }

  const [countRow] = await sql`
    SELECT COUNT(*)::int AS c FROM merchant_menu_items
    WHERE category_id = ${categoryId}
      AND (is_deleted IS NULL OR is_deleted = FALSE)
  `;
  const itemCount = Number((countRow as { c: number })?.c ?? 0);
  if (itemCount > 0) return { ok: false, error: "category_has_items", itemCount };

  const result = await sql`
    UPDATE merchant_menu_categories
    SET is_deleted = TRUE, updated_at = NOW()
    WHERE id = ${categoryId} AND store_id = ${storeIdNum}
      AND COALESCE(is_deleted, FALSE) = FALSE
  `;
  return (result.count ?? 0) > 0 ? { ok: true } : { ok: false, error: "category_not_found" };
}

/** List items with optional category, search, approval_status, in_stock, and changeRequestType filters. */
export async function listItems(
  storeIdNum: number,
  opts: {
    categoryId?: number | null;
    search?: string;
    limit?: number;
    offset?: number;
    approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
    inStock?: boolean | null;
    changeRequestType?: "DELETE" | "UPDATE" | null;
  }
): Promise<{
  items: Array<{
    id: number;
    item_id: string;
    item_name: string;
    item_description: string | null;
    item_image_url: string | null;
    category_id: number | null;
    food_type: string | null;
    base_price: string;
    selling_price: string;
    in_stock: boolean;
    effective_in_stock: boolean;
    out_of_stock_manual: boolean;
    out_of_stock_until: Date | string | null;
    out_of_stock_updated_at: Date | string | null;
    category_out_of_stock_manual: boolean;
    category_out_of_stock_until: Date | string | null;
    category_out_of_stock_updated_at: Date | string | null;
    is_active: boolean;
    is_deleted: boolean | null;
    display_order: number;
    has_customizations: boolean;
    has_addons: boolean;
    has_variants: boolean;
    preparation_time_minutes: number | null;
    serves: number | null;
    serves_label: string | null;
    item_size_value: number | null;
    item_size_unit: string | null;
    approval_status: string | null;
    has_pending_change_request: boolean;
    pending_change_request_type: string | null;
    is_locked_by_plan?: boolean;
    locked_reason?: string | null;
  }>;
  total: number;
}> {
  const sql = getSql();
  await expireTimedMenuOutOfStockForStore(sql, storeIdNum);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = Math.max(0, opts.offset ?? 0);
  const search = opts.search?.trim();
  const categoryId = opts.categoryId;
  const approvalStatus = opts.approvalStatus ?? null;
  const inStock = opts.inStock ?? null;
  const changeRequestType = opts.changeRequestType ?? null;

  const categoryCondition =
    categoryId == null ? sql`true` : sql`category_id = ${categoryId}`;
  const searchPattern = search ? "%" + search + "%" : null;
  const approvalCondition =
    approvalStatus == null
      ? sql`true`
      : sql`merchant_menu_items.approval_status = ${approvalStatus}::merchant_menu_item_approval_status`;
  // Partner Site parity: category OOS cascades via matching out_of_stock_updated_at; manual item OOS / CLEAR breaks the link.
  const effectiveStockExpr = getMenuItemEffectiveInStockExprFull(sql);
  const stockCondition = inStock == null ? sql`true` : sql`${effectiveStockExpr} = ${inStock}`;
  const changeRequestCondition =
    changeRequestType == null
      ? sql`true`
      : sql`EXISTS (SELECT 1 FROM merchant_menu_item_change_requests r WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING' AND r.request_type = ${changeRequestType}::merchant_menu_item_change_request_type)`;

  const baseWhere = sql`
    merchant_menu_items.store_id = ${storeIdNum} AND (merchant_menu_items.is_deleted IS NULL OR merchant_menu_items.is_deleted = false)
    AND ${categoryCondition}
    AND ${approvalCondition}
    AND ${stockCondition}
    AND ${changeRequestCondition}
  `;
  const searchCondition = searchPattern
    ? sql`AND (merchant_menu_items.item_name ILIKE ${searchPattern} OR merchant_menu_items.item_description ILIKE ${searchPattern})`
    : sql``;

  const countResult = await sql`
    SELECT COUNT(*)::int AS c
    FROM merchant_menu_items
    LEFT JOIN merchant_menu_categories c
      ON c.id = merchant_menu_items.category_id
      AND c.store_id = ${storeIdNum}
      AND COALESCE(c.is_deleted, FALSE) = FALSE
    WHERE ${baseWhere} ${searchCondition}
  `;

  const itemsResult = await sql`
    SELECT
           merchant_menu_items.id,
           merchant_menu_items.item_id,
           merchant_menu_items.item_name,
           merchant_menu_items.item_description,
           merchant_menu_items.item_image_url,
           merchant_menu_items.category_id,
           merchant_menu_items.food_type,
           merchant_menu_items.spice_level,
           merchant_menu_items.base_price,
           merchant_menu_items.selling_price,
           merchant_menu_items.discount_percentage,
           merchant_menu_items.tax_percentage,
           merchant_menu_items.in_stock,
           ${effectiveStockExpr} AS effective_in_stock,
           COALESCE(merchant_menu_items.out_of_stock_manual, FALSE) AS out_of_stock_manual,
           merchant_menu_items.out_of_stock_until,
           merchant_menu_items.out_of_stock_updated_at,
           COALESCE(c.out_of_stock_manual, FALSE) AS category_out_of_stock_manual,
           c.out_of_stock_until AS category_out_of_stock_until,
           c.out_of_stock_updated_at AS category_out_of_stock_updated_at,
           merchant_menu_items.is_active,
           merchant_menu_items.is_deleted,
           merchant_menu_items.display_order,
           merchant_menu_items.has_customizations,
           merchant_menu_items.has_addons,
           merchant_menu_items.has_variants,
           merchant_menu_items.is_popular,
           merchant_menu_items.is_recommended,
           merchant_menu_items.preparation_time_minutes,
           merchant_menu_items.packaging_charges,
           merchant_menu_items.serves,
           merchant_menu_items.serves_label,
           merchant_menu_items.item_size_value,
           merchant_menu_items.item_size_unit,
           merchant_menu_items.approval_status,
           merchant_menu_items.rejection_reason,
           COALESCE(merchant_menu_items.is_locked_by_plan, FALSE) AS is_locked_by_plan,
           merchant_menu_items.locked_reason,
           (SELECT EXISTS(SELECT 1 FROM merchant_menu_item_change_requests r WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING')) AS has_pending_change_request,
           (SELECT request_type::text FROM merchant_menu_item_change_requests r WHERE r.menu_item_id = merchant_menu_items.id AND r.status = 'PENDING' LIMIT 1) AS pending_change_request_type,
           (SELECT COUNT(*)::int FROM merchant_menu_item_images img WHERE img.menu_item_id = merchant_menu_items.id) AS image_count,
           (
             SELECT UPPER(TRIM(COALESCE(img.moderation_status, 'PENDING')))
             FROM merchant_menu_item_images img
             WHERE img.menu_item_id = merchant_menu_items.id AND img.is_primary = true
             LIMIT 1
           ) AS primary_image_moderation_status
    FROM merchant_menu_items
    LEFT JOIN merchant_menu_categories c
      ON c.id = merchant_menu_items.category_id
      AND c.store_id = ${storeIdNum}
      AND COALESCE(c.is_deleted, FALSE) = FALSE
    WHERE ${baseWhere} ${searchCondition}
    ORDER BY category_id NULLS FIRST, display_order ASC, id ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = Number((countResult[0] as any)?.c ?? 0);
  const items = (itemsResult as any[]).map((row) => ({
    ...row,
    out_of_stock_until: toApiIsoTimestamptz(row.out_of_stock_until),
    out_of_stock_updated_at: toApiIsoTimestamptz(row.out_of_stock_updated_at),
    category_out_of_stock_until: toApiIsoTimestamptz(row.category_out_of_stock_until),
    category_out_of_stock_updated_at: toApiIsoTimestamptz(row.category_out_of_stock_updated_at),
  }));
  return { items, total };
}

/** Get single item by numeric id; ensure it belongs to store. */
export async function getItem(
  itemId: number,
  storeIdNum: number
): Promise<{
  id: number;
  item_id: string;
  item_name: string;
  item_description: string | null;
  item_image_url: string | null;
  short_name: string | null;
  category_id: number | null;
  food_type: string | null;
  spice_level: string | null;
  cuisine_type: string | null;
  base_price: string;
  selling_price: string;
  discount_percentage: number | null;
  tax_percentage: number | null;
  in_stock: boolean;
  is_active: boolean;
  is_deleted: boolean | null;
  display_order: number;
  has_customizations: boolean;
  has_addons: boolean;
  has_variants: boolean;
  is_popular: boolean | null;
  is_recommended: boolean | null;
  preparation_time_minutes: number | null;
  serves: number | null;
  allergens: string[] | null;
  nutritional_info: object | null;
  variants: Array<{ id: number; variant_id: string; variant_name: string; variant_type: string | null; variant_price: string; is_default: boolean; display_order: number; in_stock: boolean }>;
  customizations: Array<{
    id: number;
    customization_id: string;
    customization_title: string;
    is_required: boolean;
    min_selection: number;
    max_selection: number;
    display_order: number;
    options: Array<{ id: number; addon_id: string; addon_name: string; addon_price: string; display_order: number; in_stock: boolean }>;
  }>;
  images: Array<{ id: number; image_url: string; is_primary: boolean; display_order: number }>;
} | null> {
  const sql = getSql();
  const [item] = await sql`
    SELECT id, item_id, item_name, item_description, item_image_url, short_name, category_id,
           food_type, spice_level, cuisine_type, base_price, selling_price,
           discount_percentage, tax_percentage,
           in_stock, is_active, is_deleted, display_order, has_customizations, has_addons, has_variants,
           is_popular, is_recommended,
           preparation_time_minutes, packaging_charges, serves, serves_label, allergens, nutritional_info,
           item_size_value, item_size_unit, available_for_delivery,
           weight_per_serving, weight_per_serving_unit, calories_kcal,
           protein, protein_unit, carbohydrates, carbohydrates_unit,
           fat, fat_unit, fibre, fibre_unit, item_tags,
           approval_status, approved_at, approved_by, rejection_reason
    FROM merchant_menu_items
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  if (!item) return null;
  const itemRow = item as any;

  const [variants, customizationsRows, imagesRows] = await Promise.all([
    sql`
      SELECT id, variant_id, variant_name, variant_type, variant_price, is_default, display_order, in_stock
      FROM merchant_menu_item_variants WHERE menu_item_id = ${itemId} ORDER BY display_order ASC, id ASC
    `,
    sql`
      SELECT id, customization_id, customization_title, is_required, min_selection, max_selection, display_order
      FROM merchant_menu_item_customizations WHERE menu_item_id = ${itemId} ORDER BY display_order ASC, id ASC
    `,
    sql`
      SELECT id, image_url, is_primary, display_order, moderation_status, rejection_reason, moderated_at, created_at
      FROM merchant_menu_item_images
      WHERE menu_item_id = ${itemId}
      ORDER BY created_at DESC, id DESC
    `,
  ]);

  const customizations = customizationsRows as any[];
  const optionRows = await Promise.all(
    customizations.map((c: any) =>
      sql`
        SELECT id, addon_id, addon_name, addon_price, display_order, in_stock
        FROM merchant_menu_item_addons WHERE customization_id = ${c.id} ORDER BY display_order ASC, id ASC
      `
    )
  );

  const customizationsWithOptions = customizations.map((c: any, i: number) => ({
    id: c.id,
    customization_id: c.customization_id,
    customization_title: c.customization_title,
    is_required: c.is_required ?? false,
    min_selection: c.min_selection ?? 0,
    max_selection: c.max_selection ?? 1,
    display_order: c.display_order ?? 0,
    options: (optionRows[i] as any[]).map((o: any) => ({
      id: o.id,
      addon_id: o.addon_id,
      addon_name: o.addon_name,
      addon_price: o.addon_price,
      display_order: o.display_order ?? 0,
      in_stock: o.in_stock ?? true,
    })),
  }));

  let linkedModifierGroups: Array<{
    id: number;
    modifier_group_id: number;
    display_order: number;
    title: string;
    description: string | null;
    is_required: boolean;
    min_selection: number;
    max_selection: number;
    options: Array<{ id: number; option_id: string; name: string; price_delta: string; in_stock: boolean; display_order: number }>;
  }> = [];
  try {
    const linkRows = await sql`
      SELECT img.id, img.modifier_group_id, img.display_order
      FROM merchant_item_modifier_groups img
      WHERE img.menu_item_id = ${itemId}
      ORDER BY img.display_order ASC, img.id ASC
    `;
    for (const link of linkRows as any[]) {
      const [g] = await sql`
        SELECT id, group_code, title, description, is_required, min_selection, max_selection
        FROM merchant_modifier_groups WHERE id = ${link.modifier_group_id}
      `;
      if (!g) continue;
      const opts = await sql`
        SELECT id, option_id, name, price_delta::text, in_stock, display_order
        FROM merchant_modifier_options WHERE modifier_group_id = ${link.modifier_group_id}
        ORDER BY display_order ASC, id ASC
      `;
      linkedModifierGroups.push({
        id: link.id,
        modifier_group_id: link.modifier_group_id,
        display_order: link.display_order,
        title: (g as any).title,
        description: (g as any).description,
        is_required: (g as any).is_required ?? false,
        min_selection: (g as any).min_selection ?? 0,
        max_selection: (g as any).max_selection ?? 1,
        options: (opts as any[]).map((o: any) => ({
          id: o.id,
          option_id: o.option_id,
          name: o.name,
          price_delta: o.price_delta,
          in_stock: o.in_stock ?? true,
          display_order: o.display_order ?? 0,
        })),
      });
    }
  } catch {
    linkedModifierGroups = [];
  }

  const storeType = (await resolveStoreType(storeIdNum)) ?? "FOOD";
  const legacyAttrs =
    storeType === "FOOD" ? buildFoodLegacyAttributesFromItemRow(itemRow) : {};
  const dbAttrs = await loadItemAttributes(itemId, storeType);
  const attributes: UnifiedAttributes = {
    ...legacyAttrs,
    ...dbAttrs,
  };

  // Per-item addon groups (legacy `merchant_menu_addon_groups` system).
  const perItemAddonGroups = (await sql`
    SELECT id, group_name, min_selection, max_selection, is_required, display_order
    FROM merchant_menu_addon_groups
    WHERE menu_item_id = ${itemId}
    ORDER BY display_order ASC, id ASC
  `) as any[];

  const perItemAddonOptionsRows = await Promise.all(
    perItemAddonGroups.map((g: any) =>
      sql`
        SELECT id, addon_name, addon_price, in_stock, display_order
        FROM merchant_menu_addons
        WHERE addon_group_id = ${g.id}
        ORDER BY display_order ASC, id ASC
      `
    )
  );

  const variantAttributesList = await Promise.all(
    (variants as any[]).map((v: any) => loadVariantAttributes(v.id, storeType))
  );

  const addon_groups = [
    ...customizationsWithOptions.map((c: any) => ({
      id: c.id,
      title: c.customization_title,
      description: null,
      selection_type: c.max_selection === 1 ? "single" : "multiple",
      required: c.is_required ?? false,
      min_selection: c.min_selection ?? 0,
      max_selection: c.max_selection ?? 1,
      addon_items: (c.options ?? []).map((o: any) => ({
        id: o.id,
        name: o.addon_name,
        price_delta: o.addon_price,
        in_stock: o.in_stock ?? true,
        display_order: o.display_order ?? 0,
      })),
    })),
    ...linkedModifierGroups.map((g: any) => ({
      id: g.id,
      title: g.title,
      description: g.description ?? null,
      selection_type: g.max_selection === 1 ? "single" : "multiple",
      required: g.is_required ?? false,
      min_selection: g.min_selection ?? 0,
      max_selection: g.max_selection ?? 1,
      addon_items: (g.options ?? []).map((o: any) => ({
        id: o.id,
        name: o.name,
        price_delta: o.price_delta,
        in_stock: o.in_stock ?? true,
        display_order: o.display_order ?? 0,
      })),
    })),
    ...perItemAddonGroups.map((g: any, idx: number) => ({
      id: g.id,
      title: g.group_name,
      description: null,
      selection_type: g.max_selection === 1 ? "single" : "multiple",
      required: g.is_required ?? false,
      min_selection: g.min_selection ?? 0,
      max_selection: g.max_selection ?? 1,
      addon_items: ((perItemAddonOptionsRows[idx] ?? []) as any[]).map((o: any) => ({
        id: o.id,
        name: o.addon_name,
        price_delta: o.addon_price,
        in_stock: o.in_stock ?? true,
        display_order: o.display_order ?? 0,
      })),
    })),
  ];

  return {
    ...itemRow,
    variants: (variants as any[]).map((v: any, idx: number) => ({
      id: v.id,
      variant_id: v.variant_id,
      variant_name: v.variant_name,
      variant_type: v.variant_type,
      variant_price: v.variant_price,
      is_default: v.is_default ?? false,
      display_order: v.display_order ?? 0,
      in_stock: v.in_stock ?? true,
      attributes: (variantAttributesList as any[])[idx] ?? {},
    })),
    customizations: customizationsWithOptions,
    images: (imagesRows as any[]).map((i: any) => ({
      id: i.id,
      image_url: i.image_url,
      is_primary: i.is_primary ?? false,
      display_order: i.display_order ?? 0,
      moderation_status: i.moderation_status ?? "PENDING",
      rejection_reason: i.rejection_reason ?? null,
      moderated_at: i.moderated_at ?? null,
      created_at: i.created_at ?? null,
    })),
    linked_modifier_groups: linkedModifierGroups,
    // Unified catalog fields (new):
    attributes,
    addon_groups,
  };
}

/** Generate unique item_id (e.g. ITEM_ulid). */
function newItemId(): string {
  return "ITEM_" + ulid();
}

export type ItemBodyFields = {
  item_name: string;
  item_description?: string | null;
  category_id?: number | null;
  food_type?: string | null;
  spice_level?: string | null;
  cuisine_type?: string | null;
  base_price: number;
  selling_price: number;
  preparation_time_minutes?: number | null;
  packaging_charges?: number | null;
  serves?: number | null;
  serves_label?: string | null;
  short_name?: string | null;
  display_order?: number;
  item_size_value?: number | null;
  item_size_unit?: string | null;
  available_for_delivery?: boolean;
  weight_per_serving?: number | null;
  weight_per_serving_unit?: string | null;
  calories_kcal?: number | null;
  protein?: number | null;
  protein_unit?: string | null;
  carbohydrates?: number | null;
  carbohydrates_unit?: string | null;
  fat?: number | null;
  fat_unit?: string | null;
  fibre?: number | null;
  fibre_unit?: string | null;
  allergens?: string[] | null;
  item_tags?: string[] | null;
  /**
   * Unified, schema-driven attributes.
   * If omitted, FOOD attributes are computed from legacy columns (backwards compatible).
   */
  attributes?: UnifiedAttributes;
};

/** Create item. When createdByRole is 'agent' or 'admin', item is APPROVED; otherwise PENDING. */
export async function createItem(
  storeIdNum: number,
  body: ItemBodyFields,
  opts: { createdByRole: string; createdBySub?: string | null }
): Promise<{ id: number; item_id: string }> {
  const sql = getSql();
  const itemId = newItemId();
  const isAgent = opts.createdByRole === "agent" || opts.createdByRole === "admin";
  const approvalStatus = isAgent ? "APPROVED" : "PENDING";
  const approvedAt = isAgent ? new Date() : null;
  const approvedBy = isAgent ? opts.createdBySub ?? null : null;

  const [row] = await sql`
    INSERT INTO merchant_menu_items (
      store_id, category_id, item_id, item_name, item_description, food_type, spice_level, cuisine_type,
      base_price, selling_price, preparation_time_minutes, packaging_charges, serves, serves_label, short_name, display_order,
      item_size_value, item_size_unit, available_for_delivery,
      weight_per_serving, weight_per_serving_unit, calories_kcal,
      protein, protein_unit, carbohydrates, carbohydrates_unit,
      fat, fat_unit, fibre, fibre_unit, allergens, item_tags,
      approval_status, approved_at, approved_by
    )
    VALUES (
      ${storeIdNum}, ${body.category_id ?? null}, ${itemId}, ${body.item_name}, ${body.item_description ?? null},
      ${body.food_type ?? null}, ${body.spice_level ?? null}, ${body.cuisine_type ?? null},
      ${body.base_price}, ${body.selling_price}, ${body.preparation_time_minutes ?? null}, ${body.packaging_charges ?? null}, ${body.serves ?? null},
      ${body.serves_label ?? null}, ${body.short_name ?? null}, ${body.display_order ?? 0},
      ${body.item_size_value ?? null}, ${body.item_size_unit ?? null}, ${body.available_for_delivery ?? true},
      ${body.weight_per_serving ?? null}, ${body.weight_per_serving_unit ?? null}, ${body.calories_kcal ?? null},
      ${body.protein ?? null}, ${body.protein_unit ?? null}, ${body.carbohydrates ?? null}, ${body.carbohydrates_unit ?? null},
      ${body.fat ?? null}, ${body.fat_unit ?? null}, ${body.fibre ?? null}, ${body.fibre_unit ?? null},
      ${body.allergens ?? null}, ${body.item_tags ?? null},
      ${approvalStatus}::merchant_menu_item_approval_status, ${approvedAt}, ${approvedBy}
    )
    RETURNING id, item_id
  `;
  const r = row as any;
  const createdId = Number(r.id);

  // Persist unified attribute values when definitions exist.
  // FOOD remains backwards compatible: if `body.attributes` is omitted, we derive from legacy columns.
  const storeType = (await resolveStoreType(storeIdNum)) ?? "FOOD";
  const legacyAttrs = buildFoodLegacyAttributesFromItemRow(body as any);
  const attrsToPersist: UnifiedAttributes =
    body.attributes ?? (storeType === "FOOD" ? legacyAttrs : {});
  await upsertItemAttributes(createdId, storeType, attrsToPersist);

  return { id: createdId, item_id: r.item_id };
}

/** Update item. When updatedByRole is 'merchant', item is set back to PENDING and logged. */
export async function updateItem(
  itemId: number,
  storeIdNum: number,
  body: Partial<ItemBodyFields> & { is_active?: boolean },
  opts?: { updatedByRole?: string; updatedBySub?: string | null }
): Promise<boolean> {
  const sql = getSql();
  const [existing] = await sql`
    SELECT item_name, item_description, category_id, food_type, spice_level, cuisine_type,
           base_price, selling_price, preparation_time_minutes, packaging_charges, serves, serves_label, short_name,
           display_order, is_active, allergens,
           item_size_value, item_size_unit, available_for_delivery,
           weight_per_serving, weight_per_serving_unit, calories_kcal,
           protein, protein_unit, carbohydrates, carbohydrates_unit,
           fat, fat_unit, fibre, fibre_unit, item_tags
    FROM merchant_menu_items WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  if (!existing) return false;
  const e = existing as any;
  const v = (field: keyof typeof body, fallback: any) =>
    (body as any)[field] !== undefined ? (body as any)[field] : fallback;
  const result = await sql`
    UPDATE merchant_menu_items
    SET
      item_name = ${body.item_name ?? e.item_name},
      item_description = ${v("item_description", e.item_description)},
      category_id = ${v("category_id", e.category_id)},
      food_type = ${v("food_type", e.food_type)},
      spice_level = ${v("spice_level", e.spice_level)},
      cuisine_type = ${v("cuisine_type", e.cuisine_type)},
      base_price = ${body.base_price ?? e.base_price},
      selling_price = ${body.selling_price ?? e.selling_price},
      preparation_time_minutes = ${v("preparation_time_minutes", e.preparation_time_minutes)},
      packaging_charges = ${v("packaging_charges", e.packaging_charges)},
      serves = ${v("serves", e.serves)},
      serves_label = ${v("serves_label", e.serves_label)},
      short_name = ${v("short_name", e.short_name)},
      display_order = ${body.display_order ?? e.display_order},
      is_active = ${body.is_active !== undefined ? body.is_active : e.is_active},
      allergens = ${v("allergens", e.allergens)},
      item_size_value = ${v("item_size_value", e.item_size_value)},
      item_size_unit = ${v("item_size_unit", e.item_size_unit)},
      available_for_delivery = ${v("available_for_delivery", e.available_for_delivery)},
      weight_per_serving = ${v("weight_per_serving", e.weight_per_serving)},
      weight_per_serving_unit = ${v("weight_per_serving_unit", e.weight_per_serving_unit)},
      calories_kcal = ${v("calories_kcal", e.calories_kcal)},
      protein = ${v("protein", e.protein)},
      protein_unit = ${v("protein_unit", e.protein_unit)},
      carbohydrates = ${v("carbohydrates", e.carbohydrates)},
      carbohydrates_unit = ${v("carbohydrates_unit", e.carbohydrates_unit)},
      fat = ${v("fat", e.fat)},
      fat_unit = ${v("fat_unit", e.fat_unit)},
      fibre = ${v("fibre", e.fibre)},
      fibre_unit = ${v("fibre_unit", e.fibre_unit)},
      item_tags = ${v("item_tags", e.item_tags)},
      updated_at = NOW()
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  const updated = (result.count ?? 0) > 0;

  // Persist unified attribute values when definitions exist.
  if (updated) {
    const storeType = (await resolveStoreType(storeIdNum)) ?? "FOOD";
    const existingAttrs = await loadItemAttributes(itemId, storeType);

    if (storeType === "FOOD") {
      // Derive from legacy columns so FOOD behavior stays consistent.
      const legacyAttrs: UnifiedAttributes = buildFoodLegacyAttributesFromItemRow({
        food_type: v("food_type", e.food_type),
        spice_level: v("spice_level", e.spice_level),
        cuisine_type: v("cuisine_type", e.cuisine_type),
        serves: v("serves", e.serves),
        serves_label: v("serves_label", e.serves_label),
        item_size_value: v("item_size_value", e.item_size_value),
        item_size_unit: v("item_size_unit", e.item_size_unit),
        available_for_delivery: v("available_for_delivery", e.available_for_delivery),
        weight_per_serving: v("weight_per_serving", e.weight_per_serving),
        weight_per_serving_unit: v("weight_per_serving_unit", e.weight_per_serving_unit),
        calories_kcal: v("calories_kcal", e.calories_kcal),
        protein: v("protein", e.protein),
        protein_unit: v("protein_unit", e.protein_unit),
        carbohydrates: v("carbohydrates", e.carbohydrates),
        carbohydrates_unit: v("carbohydrates_unit", e.carbohydrates_unit),
        fat: v("fat", e.fat),
        fat_unit: v("fat_unit", e.fat_unit),
        fibre: v("fibre", e.fibre),
        fibre_unit: v("fibre_unit", e.fibre_unit),
        allergens: v("allergens", e.allergens),
        item_tags: v("item_tags", e.item_tags),
      });

      const merged = { ...existingAttrs, ...legacyAttrs };
      await upsertItemAttributes(itemId, storeType, merged);
    } else {
      // For non-FOOD store types:
      // - If client sends `attributes`, merge patch onto existing values.
      // - If client omits `attributes`, keep existing values but still validate required fields.
      const merged = body.attributes ? { ...existingAttrs, ...body.attributes } : existingAttrs;
      await upsertItemAttributes(itemId, storeType, merged);
    }
  }

  if (updated && opts?.updatedByRole === "merchant" && opts?.updatedBySub) {
    await setItemPendingForReReview(itemId, storeIdNum, { changed_by: opts.updatedBySub, changed_by_role: "merchant" });
  }
  return updated;
}

/** Delete logic:
 * - If item is still PENDING/REJECTED => hard delete full record + images (DB + R2).
 * - If item is APPROVED => soft delete only (mark is_deleted=true, keep images for history).
 */
export async function deleteItem(itemId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [item] = await sql`
    SELECT id, approval_status::text AS approval_status
    FROM merchant_menu_items
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  if (!item) return false;

  const approvalStatus = (item as any).approval_status as string | null;

  // Approved item: soft delete only
  if (approvalStatus === "APPROVED") {
    const result = await sql`
      UPDATE merchant_menu_items
      SET is_deleted = true, updated_at = NOW()
      WHERE id = ${itemId} AND store_id = ${storeIdNum}
    `;
    return (result.count ?? 0) > 0;
  }

  // Not yet approved (PENDING/REJECTED/etc.): hard delete everything including images from R2.
  // Fetch image rows first so we can delete R2 objects after DB changes.
  const images = (await sql`
    SELECT id, r2_key
    FROM merchant_menu_item_images
    WHERE menu_item_id = ${itemId}
  `) as { id: number; r2_key: string | null }[];

  // Delete DB rows in a transaction.
  await sql.begin(async (trx) => {
    const trxSql = trx as unknown as typeof sql;
    await trxSql`
      DELETE FROM merchant_menu_item_images
      WHERE menu_item_id = ${itemId}
    `;
    await trxSql`
      DELETE FROM merchant_menu_items
      WHERE id = ${itemId} AND store_id = ${storeIdNum}
    `;
  });

  // Best-effort delete of R2 objects; ignore failures so the API still succeeds.
  if (images.length > 0) {
    try {
      const { deleteFromR2 } = await import("../../services/r2/r2Service.js");
      await Promise.all(
        images
          .map((img) => img.r2_key)
          .filter((key): key is string => !!key)
          .map((key) => deleteFromR2(key).catch(() => undefined))
      );
    } catch {
      // R2 service not available or delete failed; ignore.
    }
  }

  return true;
}

/** Agent/Admin: set approval_status to APPROVED or REJECTED and log. */
export async function setItemApproval(
  itemId: number,
  storeIdNum: number,
  body: {
    approval_status: "APPROVED" | "REJECTED";
    approved_by: string;
    approved_by_role?: string;
    rejection_reason?: string | null;
  }
): Promise<boolean> {
  const sql = getSql();
  const [before] = await sql`
    SELECT approval_status::text FROM merchant_menu_items WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  const previousStatus = before ? (before as any).approval_status : null;
  const rejectionReason =
    body.approval_status === "REJECTED" ? (body.rejection_reason?.trim() || null) : null;
  const result = await sql`
    UPDATE merchant_menu_items
    SET approval_status = ${body.approval_status}::merchant_menu_item_approval_status,
        approved_at = ${body.approval_status === "APPROVED" ? sql`NOW()` : null},
        approved_by = ${body.approval_status === "APPROVED" ? body.approved_by : null},
        rejection_reason = ${body.approval_status === "REJECTED" ? rejectionReason : null},
        updated_at = NOW()
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  if ((result.count ?? 0) > 0) {
    const imageModerationStatus = body.approval_status === "APPROVED" ? "APPROVED" : "REJECTED";
    await sql`
      UPDATE merchant_menu_item_images
      SET moderation_status = ${imageModerationStatus},
          rejection_reason = ${body.approval_status === "REJECTED" ? rejectionReason : null},
          moderated_at = NOW(),
          moderated_by = ${body.approved_by},
          updated_at = NOW()
      WHERE menu_item_id = ${itemId} AND is_primary = true
    `;
    try {
      await sql`
        INSERT INTO merchant_menu_item_approval_log (menu_item_id, previous_status, new_status, changed_by, changed_by_role, note)
        VALUES (
          ${itemId},
          ${previousStatus},
          ${body.approval_status},
          ${body.approved_by},
          ${body.approved_by_role ?? "agent"},
          ${body.approval_status === "REJECTED" ? rejectionReason : null}
        )
      `;
    } catch {
      /* log table may not exist yet */
    }
  }
  return (result.count ?? 0) > 0;
}

/** When merchant edits an item or its variants/addons/customizations, set item back to PENDING and log. */
export async function setItemPendingForReReview(
  itemId: number,
  storeIdNum: number,
  opts: { changed_by: string; changed_by_role?: string }
): Promise<boolean> {
  const sql = getSql();
  const [before] = await sql`
    SELECT approval_status::text FROM merchant_menu_items WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  const previousStatus = before ? (before as any).approval_status : null;
  const result = await sql`
    UPDATE merchant_menu_items
    SET approval_status = 'PENDING'::merchant_menu_item_approval_status,
        approved_at = NULL,
        approved_by = NULL,
        updated_at = NOW()
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  if ((result.count ?? 0) > 0 && previousStatus !== "PENDING") {
    try {
      await sql`
        INSERT INTO merchant_menu_item_approval_log (menu_item_id, previous_status, new_status, changed_by, changed_by_role, note)
        VALUES (${itemId}, ${previousStatus}, 'PENDING', ${opts.changed_by}, ${opts.changed_by_role ?? "merchant"}, 'Edited by merchant – pending re-review')
      `;
    } catch {
      /* log table may not exist */
    }
  }
  return (result.count ?? 0) > 0;
}

/** Resolve menu_item_id for approval re-review (variant/customization/addon edits). */
export async function getMenuItemIdByVariantId(variantId: number): Promise<number | null> {
  const sql = getSql();
  const [r] = await sql`SELECT menu_item_id FROM merchant_menu_item_variants WHERE id = ${variantId}`;
  return r ? Number((r as any).menu_item_id) : null;
}
export async function getMenuItemIdByCustomizationGroupId(groupId: number): Promise<number | null> {
  const sql = getSql();
  const [r] = await sql`SELECT menu_item_id FROM merchant_menu_item_customizations WHERE id = ${groupId}`;
  return r ? Number((r as any).menu_item_id) : null;
}
export async function getMenuItemIdByCustomizationOptionId(optionId: number): Promise<number | null> {
  const sql = getSql();
  const [r] = await sql`
    SELECT c.menu_item_id FROM merchant_menu_item_addons a
    INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id WHERE a.id = ${optionId}
  `;
  return r ? Number((r as any).menu_item_id) : null;
}
export async function getMenuItemIdByAddonGroupId(groupId: number): Promise<number | null> {
  const sql = getSql();
  const [r] = await sql`SELECT menu_item_id FROM merchant_menu_addon_groups WHERE id = ${groupId}`;
  return r ? Number((r as any).menu_item_id) : null;
}
export async function getMenuItemIdByAddonId(addonId: number): Promise<number | null> {
  const sql = getSql();
  const [r] = await sql`
    SELECT ag.menu_item_id FROM merchant_menu_addons ad
    INNER JOIN merchant_menu_addon_groups ag ON ag.id = ad.addon_group_id WHERE ad.id = ${addonId}
  `;
  return r ? Number((r as any).menu_item_id) : null;
}
export async function getMenuItemIdByImageId(imageId: number): Promise<number | null> {
  const sql = getSql();
  const [r] = await sql`SELECT menu_item_id FROM merchant_menu_item_images WHERE id = ${imageId}`;
  return r ? Number((r as any).menu_item_id) : null;
}

/** Toggle in_stock or set available_quantity. */
export async function patchItemStock(
  itemId: number,
  storeIdNum: number,
  body: { in_stock?: boolean; available_quantity?: number | null }
): Promise<boolean> {
  const sql = getSql();
  if (body.in_stock !== undefined) {
    // Match Partner Site menu: availability is driven by out_of_stock_*; legacy in_stock alone is not enough.
    if (body.in_stock) {
      const result = await sql`
        UPDATE merchant_menu_items
        SET
          in_stock = TRUE,
          out_of_stock_manual = FALSE,
          out_of_stock_until = NULL,
          out_of_stock_updated_at = NOW(),
          updated_at = NOW()
        WHERE id = ${itemId} AND store_id = ${storeIdNum}
      `;
      return (result.count ?? 0) > 0;
    }
    const result = await sql`
      UPDATE merchant_menu_items
      SET
        in_stock = FALSE,
        out_of_stock_manual = TRUE,
        out_of_stock_until = NULL,
        out_of_stock_updated_at = NOW(),
        updated_at = NOW()
      WHERE id = ${itemId} AND store_id = ${storeIdNum}
    `;
    return (result.count ?? 0) > 0;
  }
  if (body.available_quantity !== undefined) {
    const result = await sql`
      UPDATE merchant_menu_items SET available_quantity = ${body.available_quantity}, updated_at = NOW() WHERE id = ${itemId} AND store_id = ${storeIdNum}
    `;
    return (result.count ?? 0) > 0;
  }
  return false;
}

export async function patchItemFlags(
  itemId: number,
  storeIdNum: number,
  body: { is_recommended?: boolean; is_popular?: boolean }
): Promise<boolean> {
  const sql = getSql();
  if (body.is_recommended === undefined && body.is_popular === undefined) return false;
  if (body.is_recommended !== undefined && body.is_popular !== undefined) {
    const result = await sql`
      UPDATE merchant_menu_items
      SET
        is_recommended = ${body.is_recommended},
        is_popular = ${body.is_popular},
        updated_at = NOW()
      WHERE id = ${itemId} AND store_id = ${storeIdNum}
    `;
    return (result.count ?? 0) > 0;
  }
  if (body.is_recommended !== undefined) {
    const result = await sql`
      UPDATE merchant_menu_items
      SET is_recommended = ${body.is_recommended}, updated_at = NOW()
      WHERE id = ${itemId} AND store_id = ${storeIdNum}
    `;
    return (result.count ?? 0) > 0;
  }
  // Only `is_popular` is defined here (the top guard rejected both-undefined),
  // but TypeScript can't chain those two narrows, so pin it explicitly.
  const isPopular = body.is_popular as boolean;
  const result = await sql`
    UPDATE merchant_menu_items
    SET is_popular = ${isPopular}, updated_at = NOW()
    WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  return (result.count ?? 0) > 0;
}

// --- Variants
export async function addVariant(
  menuItemId: number,
  storeIdNum: number,
  body: {
    variant_name: string;
    variant_type?: string | null;
    variant_price: number;
    is_default?: boolean;
    display_order?: number;
    attributes?: UnifiedAttributes;
  }
): Promise<{ id: number }> {
  const sql = getSql();
  await assertItemOwnership(menuItemId, storeIdNum);
  const variantId = "VAR_" + ulid();
  const [row] = await sql`
    INSERT INTO merchant_menu_item_variants (menu_item_id, variant_id, variant_name, variant_type, variant_price, is_default, display_order)
    VALUES (${menuItemId}, ${variantId}, ${body.variant_name}, ${body.variant_type ?? null}, ${body.variant_price}, ${body.is_default ?? false}, ${body.display_order ?? 0})
    RETURNING id
  `;
  const createdVariantRowId = Number((row as any).id);

  // Persist unified variant-scope attributes (when seeded for this store type).
  const storeType = (await resolveStoreType(storeIdNum)) ?? "GENERAL";
  await upsertVariantAttributes(createdVariantRowId, storeType, body.attributes ?? {});

  return { id: createdVariantRowId };
}

async function assertItemOwnership(menuItemId: number, storeIdNum: number): Promise<void> {
  const sql = getSql();
  const [r] = await sql`SELECT 1 FROM merchant_menu_items WHERE id = ${menuItemId} AND store_id = ${storeIdNum} LIMIT 1`;
  if (!r) throw new Error("ITEM_NOT_FOUND");
}

export async function updateVariant(
  variantId: number,
  storeIdNum: number,
  body: {
    variant_name?: string;
    variant_type?: string | null;
    variant_price?: number;
    is_default?: boolean;
    display_order?: number;
    in_stock?: boolean;
    attributes?: UnifiedAttributes;
  }
): Promise<boolean> {
  const sql = getSql();
  const [v] = await sql`
    SELECT menu_item_id, variant_name, variant_type, variant_price, is_default, display_order, in_stock
    FROM merchant_menu_item_variants WHERE id = ${variantId}
  `;
  if (!v) return false;
  await assertItemOwnership(Number((v as any).menu_item_id), storeIdNum);
  const e = v as any;
  const result = await sql`
    UPDATE merchant_menu_item_variants
    SET variant_name = ${body.variant_name ?? e.variant_name},
        variant_type = ${body.variant_type !== undefined ? body.variant_type : e.variant_type},
        variant_price = ${body.variant_price ?? e.variant_price},
        is_default = ${body.is_default !== undefined ? body.is_default : e.is_default},
        display_order = ${body.display_order !== undefined ? body.display_order : e.display_order},
        in_stock = ${body.in_stock !== undefined ? body.in_stock : e.in_stock},
        updated_at = NOW()
    WHERE id = ${variantId}
  `;
  const updated = (result.count ?? 0) > 0;
  if (updated) {
    const storeType = (await resolveStoreType(storeIdNum)) ?? "GENERAL";
    const existingAttrs = await loadVariantAttributes(variantId, storeType);
    const merged = body.attributes ? { ...existingAttrs, ...body.attributes } : existingAttrs;
    await upsertVariantAttributes(variantId, storeType, merged);
  }
  return updated;
}

export async function deleteVariant(variantId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [v] = await sql`SELECT menu_item_id FROM merchant_menu_item_variants WHERE id = ${variantId}`;
  if (!v) return false;
  await assertItemOwnership(Number((v as any).menu_item_id), storeIdNum);
  const result = await sql`DELETE FROM merchant_menu_item_variants WHERE id = ${variantId}`;
  return (result.count ?? 0) > 0;
}

// --- Customization groups (merchant_menu_item_customizations)
export async function addCustomizationGroup(
  menuItemId: number,
  storeIdNum: number,
  body: { customization_title: string; customization_type?: string | null; is_required?: boolean; min_selection?: number; max_selection?: number; display_order?: number }
): Promise<{ id: number; customization_id: string }> {
  const sql = getSql();
  await assertItemOwnership(menuItemId, storeIdNum);
  const customizationId = "CUST_" + ulid();
  const [row] = await sql`
    INSERT INTO merchant_menu_item_customizations (menu_item_id, customization_id, customization_title, customization_type, is_required, min_selection, max_selection, display_order)
    VALUES (${menuItemId}, ${customizationId}, ${body.customization_title}, ${body.customization_type ?? null}, ${body.is_required ?? false}, ${body.min_selection ?? 0}, ${body.max_selection ?? 1}, ${body.display_order ?? 0})
    RETURNING id, customization_id
  `;
  const r = row as any;
  return { id: Number(r.id), customization_id: r.customization_id };
}

export async function updateCustomizationGroup(
  groupId: number,
  storeIdNum: number,
  body: { customization_title?: string; is_required?: boolean; min_selection?: number; max_selection?: number; display_order?: number }
): Promise<boolean> {
  const sql = getSql();
  const [g] = await sql`
    SELECT c.id, c.customization_title, c.is_required, c.min_selection, c.max_selection, c.display_order
    FROM merchant_menu_item_customizations c
    INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE c.id = ${groupId}
  `;
  if (!g) return false;
  const e = g as any;
  const result = await sql`
    UPDATE merchant_menu_item_customizations
    SET customization_title = ${body.customization_title ?? e.customization_title},
        is_required = ${body.is_required !== undefined ? body.is_required : e.is_required},
        min_selection = ${body.min_selection ?? e.min_selection},
        max_selection = ${body.max_selection ?? e.max_selection},
        display_order = ${body.display_order ?? e.display_order},
        updated_at = NOW()
    WHERE id = ${groupId}
  `;
  return (result.count ?? 0) > 0;
}

export async function deleteCustomizationGroup(groupId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [g] = await sql`
    SELECT c.id FROM merchant_menu_item_customizations c
    INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE c.id = ${groupId}
  `;
  if (!g) return false;
  const result = await sql`DELETE FROM merchant_menu_item_customizations WHERE id = ${groupId}`;
  return (result.count ?? 0) > 0;
}

// --- Customization options (merchant_menu_item_addons)
export async function addCustomizationOption(
  customizationId: number,
  storeIdNum: number,
  body: { addon_name: string; addon_price?: number; addon_image_url?: string | null; display_order?: number }
): Promise<{ id: number; addon_id: string }> {
  const sql = getSql();
  const [c] = await sql`
    SELECT c.id, c.menu_item_id FROM merchant_menu_item_customizations c
    INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE c.id = ${customizationId}
  `;
  if (!c) throw new Error("CUSTOMIZATION_GROUP_NOT_FOUND");
  const addonId = "ADDON_" + ulid();
  const [row] = await sql`
    INSERT INTO merchant_menu_item_addons (customization_id, addon_id, addon_name, addon_price, addon_image_url, display_order)
    VALUES (${customizationId}, ${addonId}, ${body.addon_name}, ${body.addon_price ?? 0}, ${body.addon_image_url ?? null}, ${body.display_order ?? 0})
    RETURNING id, addon_id
  `;
  const r = row as any;
  return { id: Number(r.id), addon_id: r.addon_id };
}

export async function updateCustomizationOption(
  optionId: number,
  storeIdNum: number,
  body: { addon_name?: string; addon_price?: number; addon_image_url?: string | null; display_order?: number; in_stock?: boolean }
): Promise<boolean> {
  const sql = getSql();
  const [o] = await sql`
    SELECT a.id, a.addon_name, a.addon_price, a.addon_image_url, a.display_order, a.in_stock
    FROM merchant_menu_item_addons a
    INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
    INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE a.id = ${optionId}
  `;
  if (!o) return false;
  const e = o as any;
  const result = await sql`
    UPDATE merchant_menu_item_addons
    SET addon_name = ${body.addon_name ?? e.addon_name},
        addon_price = ${body.addon_price ?? e.addon_price},
        addon_image_url = ${body.addon_image_url !== undefined ? body.addon_image_url : e.addon_image_url},
        display_order = ${body.display_order ?? e.display_order},
        in_stock = ${body.in_stock !== undefined ? body.in_stock : e.in_stock},
        updated_at = NOW()
    WHERE id = ${optionId}
  `;
  return (result.count ?? 0) > 0;
}

export async function deleteCustomizationOption(optionId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [o] = await sql`
    SELECT a.id
    FROM merchant_menu_item_addons a
    INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
    INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE a.id = ${optionId}
  `;
  if (!o) return false;
  const result = await sql`DELETE FROM merchant_menu_item_addons WHERE id = ${optionId}`;
  return (result.count ?? 0) > 0;
}

// --- Images: add row (URL set by upload route), delete, set primary
export async function addItemImageRow(
  menuItemId: number,
  storeIdNum: number,
  data: { image_url: string; r2_key?: string | null; is_primary?: boolean; format?: string | null; display_order?: number }
): Promise<{ id: number }> {
  await assertItemOwnership(menuItemId, storeIdNum);
  const sql = getSql();
  const makePrimary = data.is_primary !== false;
  const [orderRow] = await sql`
    SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
    FROM merchant_menu_item_images
    WHERE menu_item_id = ${menuItemId}
  `;
  const nextOrder = data.display_order ?? Number((orderRow as any)?.next_order ?? 0);
  if (makePrimary) {
    await sql`
      UPDATE merchant_menu_item_images
      SET is_primary = false, updated_at = NOW()
      WHERE menu_item_id = ${menuItemId} AND is_primary = true
    `;
  }
  const [row] = await sql`
    INSERT INTO merchant_menu_item_images (
      menu_item_id, image_url, r2_key, is_primary, format, display_order,
      moderation_status, rejection_reason, moderated_at, moderated_by
    )
    VALUES (
      ${menuItemId}, ${data.image_url}, ${data.r2_key ?? null}, ${makePrimary}, ${data.format ?? null}, ${nextOrder},
      ${makePrimary ? "PENDING" : "PENDING"}, NULL, NULL, NULL
    )
    RETURNING id
  `;
  const imageId = Number((row as any).id);
  if (makePrimary) {
    const [itemRow] = await sql`
      SELECT approval_status::text AS approval_status, approved_at, approved_by
      FROM merchant_menu_items
      WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      LIMIT 1
    `;
    const prevStatus = String((itemRow as { approval_status?: string })?.approval_status ?? "").toUpperCase();
    const wasApproved = prevStatus === "APPROVED";

    if (wasApproved) {
      await sql`
        UPDATE merchant_menu_items
        SET item_image_url = ${data.image_url},
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    } else {
      await sql`
        UPDATE merchant_menu_items
        SET item_image_url = ${data.image_url},
            approval_status = 'PENDING'::merchant_menu_item_approval_status,
            rejection_reason = NULL,
            approved_at = NULL,
            approved_by = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    }
  }
  return { id: imageId };
}

export async function deleteItemImage(
  imageId: number,
  storeIdNum: number,
  r2Key?: string | null
): Promise<boolean> {
  const sql = getSql();
  const [img] = await sql`
    SELECT i.id, i.r2_key, i.is_primary, i.menu_item_id
    FROM merchant_menu_item_images i
    INNER JOIN merchant_menu_items m ON m.id = i.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE i.id = ${imageId}
  `;
  if (!img) return false;
  const menuItemId = Number((img as any).menu_item_id);
  const wasPrimary = !!(img as any).is_primary;
  const keyToDelete = r2Key ?? (img as any).r2_key;
  if (keyToDelete && typeof keyToDelete === "string") {
    try {
      const { deleteFromR2 } = await import("../../services/r2/r2Service.js");
      await deleteFromR2(keyToDelete);
    } catch {
      // Log but still remove DB row
    }
  }
  const result = await sql`DELETE FROM merchant_menu_item_images WHERE id = ${imageId}`;
  if ((result.count ?? 0) > 0 && wasPrimary) {
    const [nextPrimary] = await sql`
      SELECT id, image_url, moderation_status, rejection_reason
      FROM merchant_menu_item_images
      WHERE menu_item_id = ${menuItemId}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    if (nextPrimary) {
      await sql`
        UPDATE merchant_menu_item_images
        SET is_primary = true, updated_at = NOW()
        WHERE id = ${(nextPrimary as any).id}
      `;
      const modStatus = String((nextPrimary as any).moderation_status ?? "PENDING").toUpperCase();
      const itemStatus = modStatus === "APPROVED" || modStatus === "REJECTED" ? modStatus : "PENDING";
      await sql`
        UPDATE merchant_menu_items
        SET item_image_url = ${(nextPrimary as any).image_url},
            approval_status = ${itemStatus}::merchant_menu_item_approval_status,
            rejection_reason = ${itemStatus === "REJECTED" ? (nextPrimary as any).rejection_reason : null},
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    } else {
      await sql`
        UPDATE merchant_menu_items
        SET item_image_url = NULL,
            approval_status = 'PENDING'::merchant_menu_item_approval_status,
            rejection_reason = NULL,
            approved_at = NULL,
            approved_by = NULL,
            updated_at = NOW()
        WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
      `;
    }
  }
  return (result.count ?? 0) > 0;
}

export async function setPrimaryImage(imageId: number, menuItemId: number, storeIdNum: number): Promise<boolean> {
  await assertItemOwnership(menuItemId, storeIdNum);
  const sql = getSql();
  await sql`UPDATE merchant_menu_item_images SET is_primary = false WHERE menu_item_id = ${menuItemId}`;
  const result = await sql`
    UPDATE merchant_menu_item_images SET is_primary = true, updated_at = NOW() WHERE id = ${imageId} AND menu_item_id = ${menuItemId}
  `;
  return (result.count ?? 0) > 0;
}

// --- Addon groups (merchant_menu_addon_groups, per-item)
export async function listAddonGroups(menuItemId: number, storeIdNum: number): Promise<
  Array<{ id: number; group_name: string; min_selection: number; max_selection: number; is_required: boolean; display_order: number }>
> {
  await assertItemOwnership(menuItemId, storeIdNum);
  const sql = getSql();
  const rows = await sql`
    SELECT id, group_name, min_selection, max_selection, is_required, display_order
    FROM merchant_menu_addon_groups WHERE menu_item_id = ${menuItemId} ORDER BY display_order ASC, id ASC
  `;
  return rows as any;
}

export async function addAddonGroup(
  menuItemId: number,
  storeIdNum: number,
  body: { group_name: string; min_selection?: number; max_selection?: number; is_required?: boolean; display_order?: number }
): Promise<{ id: number }> {
  await assertItemOwnership(menuItemId, storeIdNum);
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO merchant_menu_addon_groups (menu_item_id, group_name, min_selection, max_selection, is_required, display_order)
    VALUES (${menuItemId}, ${body.group_name}, ${body.min_selection ?? 0}, ${body.max_selection ?? 1}, ${body.is_required ?? false}, ${body.display_order ?? 0})
    RETURNING id
  `;
  return { id: Number((row as any).id) };
}

export async function updateAddonGroup(
  groupId: number,
  storeIdNum: number,
  body: { group_name?: string; min_selection?: number; max_selection?: number; is_required?: boolean; display_order?: number }
): Promise<boolean> {
  const sql = getSql();
  const [g] = await sql`
    SELECT ag.id, ag.group_name, ag.min_selection, ag.max_selection, ag.is_required, ag.display_order
    FROM merchant_menu_addon_groups ag
    INNER JOIN merchant_menu_items m ON m.id = ag.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE ag.id = ${groupId}
  `;
  if (!g) return false;
  const e = g as any;
  const result = await sql`
    UPDATE merchant_menu_addon_groups
    SET group_name = ${body.group_name ?? e.group_name},
        min_selection = ${body.min_selection ?? e.min_selection},
        max_selection = ${body.max_selection ?? e.max_selection},
        is_required = ${body.is_required !== undefined ? body.is_required : e.is_required},
        display_order = ${body.display_order ?? e.display_order},
        updated_at = NOW()
    WHERE id = ${groupId}
  `;
  return (result.count ?? 0) > 0;
}

export async function deleteAddonGroup(groupId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [g] = await sql`
    SELECT ag.id FROM merchant_menu_addon_groups ag
    INNER JOIN merchant_menu_items m ON m.id = ag.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE ag.id = ${groupId}
  `;
  if (!g) return false;
  const result = await sql`DELETE FROM merchant_menu_addon_groups WHERE id = ${groupId}`;
  return (result.count ?? 0) > 0;
}

// --- Addons (merchant_menu_addons, within addon group)
export async function addAddon(
  addonGroupId: number,
  storeIdNum: number,
  body: { addon_name: string; addon_price?: number; image_url?: string | null; in_stock?: boolean; display_order?: number }
): Promise<{ id: number }> {
  const sql = getSql();
  const [gr] = await sql`
    SELECT ag.id FROM merchant_menu_addon_groups ag
    INNER JOIN merchant_menu_items m ON m.id = ag.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE ag.id = ${addonGroupId}
  `;
  if (!gr) throw new Error("ADDON_GROUP_NOT_FOUND");
  const [row] = await sql`
    INSERT INTO merchant_menu_addons (addon_group_id, addon_name, addon_price, image_url, in_stock, display_order)
    VALUES (${addonGroupId}, ${body.addon_name}, ${body.addon_price ?? 0}, ${body.image_url ?? null}, ${body.in_stock ?? true}, ${body.display_order ?? 0})
    RETURNING id
  `;
  return { id: Number((row as any).id) };
}

export async function updateAddon(
  addonId: number,
  storeIdNum: number,
  body: { addon_name?: string; addon_price?: number; image_url?: string | null; in_stock?: boolean; display_order?: number }
): Promise<boolean> {
  const sql = getSql();
  const [a] = await sql`
    SELECT ad.id, ad.addon_name, ad.addon_price, ad.image_url, ad.in_stock, ad.display_order
    FROM merchant_menu_addons ad
    INNER JOIN merchant_menu_addon_groups ag ON ag.id = ad.addon_group_id
    INNER JOIN merchant_menu_items m ON m.id = ag.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE ad.id = ${addonId}
  `;
  if (!a) return false;
  const e = a as any;
  const result = await sql`
    UPDATE merchant_menu_addons
    SET addon_name = ${body.addon_name ?? e.addon_name},
        addon_price = ${body.addon_price ?? e.addon_price},
        image_url = ${body.image_url !== undefined ? body.image_url : e.image_url},
        in_stock = ${body.in_stock !== undefined ? body.in_stock : e.in_stock},
        display_order = ${body.display_order ?? e.display_order},
        updated_at = NOW()
    WHERE id = ${addonId}
  `;
  return (result.count ?? 0) > 0;
}

export async function deleteAddon(addonId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [a] = await sql`
    SELECT ad.id FROM merchant_menu_addons ad
    INNER JOIN merchant_menu_addon_groups ag ON ag.id = ad.addon_group_id
    INNER JOIN merchant_menu_items m ON m.id = ag.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE ad.id = ${addonId}
  `;
  if (!a) return false;
  const result = await sql`DELETE FROM merchant_menu_addons WHERE id = ${addonId}`;
  return (result.count ?? 0) > 0;
}

// --- Combos
export async function listCombos(storeIdNum: number): Promise<
  Array<{
    id: number;
    combo_name: string;
    description: string | null;
    combo_price: string;
    image_url: string | null;
    is_active: boolean;
    is_deleted: boolean;
    display_order: number;
    combo_type: string;
    pricing_strategy: string;
    combo_metadata: object;
    out_of_stock_manual: boolean;
    out_of_stock_until: Date | string | null;
    out_of_stock_active: boolean;
    effective_in_stock: boolean;
  }>
> {
  const sql = getSql();
  await expireTimedMenuOutOfStockForStore(sql, storeIdNum);
  const rows = await sql`
    SELECT id, combo_name, description, combo_price, image_url, is_active, is_deleted, display_order,
           combo_type, pricing_strategy, combo_metadata,
           COALESCE(out_of_stock_manual, FALSE) AS out_of_stock_manual,
           out_of_stock_until,
           (
             COALESCE(out_of_stock_manual, FALSE) = TRUE
             OR (out_of_stock_until IS NOT NULL AND out_of_stock_until > NOW())
           ) AS out_of_stock_active,
           (
             COALESCE(is_active, TRUE) = TRUE
             AND NOT (
               COALESCE(out_of_stock_manual, FALSE) = TRUE
               OR (out_of_stock_until IS NOT NULL AND out_of_stock_until > NOW())
             )
           ) AS effective_in_stock
    FROM merchant_menu_combos WHERE store_id = ${storeIdNum} AND (is_deleted IS NULL OR is_deleted = false)
    ORDER BY display_order ASC, id ASC
  `;
  return rows as any;
}

export async function createCombo(
  storeIdNum: number,
  body: {
    combo_name: string;
    description?: string | null;
    combo_price: number;
    image_url?: string | null;
    display_order?: number;
    combo_type?: string | null;
    pricing_strategy?: string | null;
    combo_metadata?: object | null;
  }
): Promise<{ id: number }> {
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO merchant_menu_combos (
      store_id, combo_name, description, combo_price, image_url, display_order,
      combo_type, pricing_strategy, combo_metadata
    )
    VALUES (
      ${storeIdNum},
      ${body.combo_name},
      ${body.description ?? null},
      ${body.combo_price},
      ${body.image_url ?? null},
      ${body.display_order ?? 0},
      ${body.combo_type ?? "FIXED"},
      ${body.pricing_strategy ?? "FIXED_PRICE"},
      ${JSON.stringify(body.combo_metadata ?? {})}::jsonb
    )
    RETURNING id
  `;
  return { id: Number((row as any).id) };
}

export async function getCombo(comboId: number, storeIdNum: number): Promise<{
  id: number;
  combo_name: string;
  description: string | null;
  combo_price: string;
  image_url: string | null;
  is_active: boolean;
  is_deleted: boolean;
  display_order: number;
  combo_type: string;
  pricing_strategy: string;
  combo_metadata: object;
  out_of_stock_manual: boolean;
  out_of_stock_until: Date | string | null;
  out_of_stock_active: boolean;
  effective_in_stock: boolean;
  components: Array<{ id: number; menu_item_id: number; variant_id: number | null; quantity: number; display_order: number }>;
} | null> {
  const sql = getSql();
  const [c] = await sql`
    SELECT id, combo_name, description, combo_price, image_url, is_active, is_deleted, display_order,
           combo_type, pricing_strategy, combo_metadata,
           COALESCE(out_of_stock_manual, FALSE) AS out_of_stock_manual,
           out_of_stock_until,
           (
             COALESCE(out_of_stock_manual, FALSE) = TRUE
             OR (out_of_stock_until IS NOT NULL AND out_of_stock_until > NOW())
           ) AS out_of_stock_active,
           (
             COALESCE(is_active, TRUE) = TRUE
             AND NOT (
               COALESCE(out_of_stock_manual, FALSE) = TRUE
               OR (out_of_stock_until IS NOT NULL AND out_of_stock_until > NOW())
             )
           ) AS effective_in_stock
    FROM merchant_menu_combos WHERE id = ${comboId} AND store_id = ${storeIdNum}
  `;
  if (!c) return null;
  const components = await sql`
    SELECT id, menu_item_id, variant_id, quantity, display_order
    FROM merchant_menu_combo_components WHERE combo_id = ${comboId} ORDER BY display_order ASC, id ASC
  `;
  return { ...(c as any), components: components as any };
}

export async function patchComboOutOfStock(
  comboId: number,
  storeIdNum: number,
  body: { mode: OutOfStockMode; hours?: unknown; until?: unknown }
): Promise<{ ok: boolean; out_of_stock_until: string | null; out_of_stock_manual: boolean }> {
  const sql = getSql();
  await expireTimedMenuOutOfStockForStore(sql, storeIdNum);
  const [c] = await sql`
    SELECT id FROM merchant_menu_combos
    WHERE id = ${comboId} AND store_id = ${storeIdNum}
      AND (is_deleted IS NULL OR is_deleted = FALSE)
    LIMIT 1
  `;
  if (!c) return { ok: false, out_of_stock_until: null, out_of_stock_manual: false };

  let patch = resolveOutOfStockUpdate(body);
  if (body.mode === "NEXT_OPEN") {
    const nextIso = await computeNextOpenIsoForStore(storeIdNum);
    if (!nextIso) throw new Error("next_open_not_available");
    patch = { out_of_stock_manual: false, out_of_stock_until: new Date(nextIso) };
  }
  const markerIso = new Date().toISOString();
  const [row] = await sql`
    UPDATE merchant_menu_combos
    SET
      out_of_stock_manual = ${patch.out_of_stock_manual},
      out_of_stock_until = ${sqlTimestamptz(patch.out_of_stock_until)},
      out_of_stock_updated_at = ${markerIso},
      updated_at = NOW()
    WHERE id = ${comboId} AND store_id = ${storeIdNum}
      AND (is_deleted IS NULL OR is_deleted = FALSE)
    RETURNING out_of_stock_manual, out_of_stock_until
  `;
  const r = row as any;
  return {
    ok: true,
    out_of_stock_manual: Boolean(r?.out_of_stock_manual),
    out_of_stock_until: r?.out_of_stock_until ? new Date(r.out_of_stock_until).toISOString() : null,
  };
}

export async function updateCombo(
  comboId: number,
  storeIdNum: number,
  body: {
    combo_name?: string;
    description?: string | null;
    combo_price?: number;
    image_url?: string | null;
    is_active?: boolean;
    display_order?: number;
    combo_type?: string | null;
    pricing_strategy?: string | null;
    combo_metadata?: object | null;
  }
): Promise<boolean> {
  const sql = getSql();
  const [existing] = await sql`
    SELECT combo_name, description, combo_price, image_url, is_active, display_order,
           combo_type, pricing_strategy, combo_metadata
    FROM merchant_menu_combos WHERE id = ${comboId} AND store_id = ${storeIdNum}
  `;
  if (!existing) return false;
  const e = existing as any;
  const result = await sql`
    UPDATE merchant_menu_combos
    SET combo_name = ${body.combo_name ?? e.combo_name},
        description = ${body.description !== undefined ? body.description : e.description},
        combo_price = ${body.combo_price ?? e.combo_price},
        image_url = ${body.image_url !== undefined ? body.image_url : e.image_url},
        is_active = ${body.is_active !== undefined ? body.is_active : e.is_active},
        display_order = ${body.display_order ?? e.display_order},
        combo_type = ${body.combo_type !== undefined ? body.combo_type : e.combo_type},
        pricing_strategy = ${body.pricing_strategy !== undefined ? body.pricing_strategy : e.pricing_strategy},
        combo_metadata = ${
          body.combo_metadata !== undefined
            ? JSON.stringify(body.combo_metadata ?? {})
            : JSON.stringify(e.combo_metadata ?? {})
        }::jsonb,
        updated_at = NOW()
    WHERE id = ${comboId} AND store_id = ${storeIdNum}
  `;
  return (result.count ?? 0) > 0;
}

export async function deleteCombo(comboId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const result = await sql`
    UPDATE merchant_menu_combos SET is_deleted = true, updated_at = NOW() WHERE id = ${comboId} AND store_id = ${storeIdNum}
  `;
  return (result.count ?? 0) > 0;
}

export async function addComboComponent(
  comboId: number,
  storeIdNum: number,
  body: { menu_item_id: number; variant_id?: number | null; quantity?: number; display_order?: number }
): Promise<{ id: number }> {
  const sql = getSql();
  const [c] = await sql`SELECT id FROM merchant_menu_combos WHERE id = ${comboId} AND store_id = ${storeIdNum}`;
  if (!c) throw new Error("COMBO_NOT_FOUND");
  const [row] = await sql`
    INSERT INTO merchant_menu_combo_components (combo_id, menu_item_id, variant_id, quantity, display_order)
    VALUES (${comboId}, ${body.menu_item_id}, ${body.variant_id ?? null}, ${body.quantity ?? 1}, ${body.display_order ?? 0})
    RETURNING id
  `;
  const createdId = Number((row as any).id);
  // Keep combo_price consistent with derived components pricing.
  await recomputeComboPriceFromComponents(comboId, storeIdNum);
  return { id: createdId };
}

export async function deleteComboComponent(componentId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [comp] = await sql`
    SELECT cc.id FROM merchant_menu_combo_components cc
    INNER JOIN merchant_menu_combos c ON c.id = cc.combo_id AND c.store_id = ${storeIdNum}
    WHERE cc.id = ${componentId}
  `;
  if (!comp) return false;
  const [comboLookup] = await sql`
    SELECT cc.combo_id
    FROM merchant_menu_combo_components cc
    INNER JOIN merchant_menu_combos c ON c.id = cc.combo_id AND c.store_id = ${storeIdNum}
    WHERE cc.id = ${componentId}
    LIMIT 1
  `;
  const comboId = comboLookup ? (comboLookup as any).combo_id : null;

  const result = await sql`DELETE FROM merchant_menu_combo_components WHERE id = ${componentId}`;
  if ((result.count ?? 0) > 0 && comboId != null) {
    await recomputeComboPriceFromComponents(comboId, storeIdNum);
  }
  return (result.count ?? 0) > 0;
}

async function recomputeComboPriceFromComponents(comboId: number, storeIdNum: number): Promise<void> {
  const sql = getSql();
  // Pricing model: derived combo_price = SUM(component_item.selling_price * quantity).
  // Note: selling_price is NUMERIC so cast to numeric for multiplication.
  const [row] = await sql`
    SELECT COALESCE(SUM((m.selling_price::numeric) * cc.quantity), 0)::numeric AS derived_price
    FROM merchant_menu_combo_components cc
    INNER JOIN merchant_menu_items m ON m.id = cc.menu_item_id AND m.store_id = ${storeIdNum}
    WHERE cc.combo_id = ${comboId}
  `;

  const derivedPrice = (row as any)?.derived_price ?? 0;
  await sql`
    UPDATE merchant_menu_combos
    SET combo_price = ${derivedPrice},
        updated_at = NOW()
    WHERE id = ${comboId} AND store_id = ${storeIdNum}
  `;
}

// --- Category availability
export async function listCategoryAvailability(categoryId: number, storeIdNum: number): Promise<
  Array<{ id: number; category_id: number; day_of_week: number; start_time: string; end_time: string }>
> {
  const sql = getSql();
  const [cat] = await sql`SELECT id FROM merchant_menu_categories WHERE id = ${categoryId} AND store_id = ${storeIdNum}`;
  if (!cat) return [];
  const rows = await sql`
    SELECT id, category_id, day_of_week, start_time::text, end_time::text
    FROM merchant_menu_category_availability WHERE category_id = ${categoryId} ORDER BY day_of_week, start_time
  `;
  return rows as any;
}

export async function addCategoryAvailability(
  categoryId: number,
  storeIdNum: number,
  body: { day_of_week: number; start_time: string; end_time: string }
): Promise<{ id: number }> {
  const sql = getSql();
  const [cat] = await sql`SELECT id FROM merchant_menu_categories WHERE id = ${categoryId} AND store_id = ${storeIdNum}`;
  if (!cat) throw new Error("CATEGORY_NOT_FOUND");
  const [row] = await sql`
    INSERT INTO merchant_menu_category_availability (category_id, day_of_week, start_time, end_time)
    VALUES (${categoryId}, ${body.day_of_week}, ${body.start_time}, ${body.end_time})
    RETURNING id
  `;
  return { id: Number((row as any).id) };
}

export async function deleteCategoryAvailability(windowId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [w] = await sql`
    SELECT ca.id FROM merchant_menu_category_availability ca
    INNER JOIN merchant_menu_categories c ON c.id = ca.category_id AND c.store_id = ${storeIdNum}
    WHERE ca.id = ${windowId}
  `;
  if (!w) return false;
  const result = await sql`DELETE FROM merchant_menu_category_availability WHERE id = ${windowId}`;
  return (result.count ?? 0) > 0;
}

/** Returns category_id -> count of availability windows for all categories of a store (for UI badges). */
export async function getCategoryAvailabilityCounts(storeIdNum: number): Promise<Record<number, number>> {
  const sql = getSql();
  const rows = await sql`
    SELECT ca.category_id, COUNT(*)::int AS cnt
    FROM merchant_menu_category_availability ca
    INNER JOIN merchant_menu_categories c ON c.id = ca.category_id AND c.store_id = ${storeIdNum}
    GROUP BY ca.category_id
  `;
  const out: Record<number, number> = {};
  for (const r of rows as unknown as Array<{ category_id: number; cnt: number }>) {
    out[r.category_id] = r.cnt;
  }
  return out;
}

// --- Change requests (Swiggy/Zomato-style: merchant requests, agent approves)
export type ChangeRequestType = "CREATE" | "UPDATE" | "DELETE";
export type ChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export async function getItemApprovalStatus(
  itemId: number,
  storeIdNum: number
): Promise<"PENDING" | "APPROVED" | "REJECTED" | null> {
  const sql = getSql();
  const [r] = await sql`
    SELECT approval_status::text FROM merchant_menu_items WHERE id = ${itemId} AND store_id = ${storeIdNum}
  `;
  return r ? (r as any).approval_status : null;
}

export async function createChangeRequest(
  storeIdNum: number,
  menuItemId: number | null,
  requestType: ChangeRequestType,
  requestedPayload: Record<string, unknown>,
  opts: { created_by: string; created_by_role?: string; reason?: string | null }
): Promise<{ id: number }> {
  const sql = getSql();
  let currentSnapshot: Record<string, unknown> | null = null;
  if (menuItemId != null && (requestType === "UPDATE" || requestType === "DELETE")) {
    const [row] = await sql`
      SELECT id, item_id, item_name, item_description, item_image_url, category_id, food_type, spice_level, cuisine_type,
             base_price, selling_price, preparation_time_minutes, serves, serves_label, short_name, display_order,
             is_active, approval_status
      FROM merchant_menu_items WHERE id = ${menuItemId} AND store_id = ${storeIdNum}
    `;
    if (row) currentSnapshot = row as any;
  }
  const [inserted] = await sql`
    INSERT INTO merchant_menu_item_change_requests
      (store_id, menu_item_id, request_type, status, requested_payload, current_snapshot, reason, created_by, created_by_role, updated_at)
    VALUES
      (${storeIdNum}, ${menuItemId}, ${requestType}::merchant_menu_item_change_request_type, 'PENDING'::merchant_menu_item_change_request_status,
       ${JSON.stringify(requestedPayload)}::jsonb, ${currentSnapshot ? JSON.stringify(currentSnapshot) : null}::jsonb,
       ${opts.reason ?? null}, ${opts.created_by}, ${opts.created_by_role ?? "merchant"}, NOW())
    RETURNING id
  `;
  return { id: Number((inserted as any).id) };
}

export async function listChangeRequestsForItem(
  menuItemId: number,
  storeIdNum: number
): Promise<
  Array<{
    id: number;
    request_type: string;
    status: string;
    created_at: Date;
    reviewed_at: Date | null;
    reviewed_reason: string | null;
  }>
> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, request_type::text, status::text, created_at, updated_at AS reviewed_at, reviewed_reason
    FROM merchant_menu_item_change_requests
    WHERE menu_item_id = ${menuItemId} AND store_id = ${storeIdNum}
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return rows as any;
}

export async function listChangeRequests(filters: {
  storeIdNum?: number | null;
  status?: ChangeRequestStatus | null;
  request_type?: ChangeRequestType | null;
  limit: number;
  offset: number;
}): Promise<{ requests: any[]; total: number }> {
  const sql = getSql();
  const storeCond = filters.storeIdNum != null ? sql`AND store_id = ${filters.storeIdNum}` : sql``;
  const statusCond = filters.status != null ? sql`AND status = ${filters.status}::merchant_menu_item_change_request_status` : sql``;
  const typeCond = filters.request_type != null ? sql`AND request_type = ${filters.request_type}::merchant_menu_item_change_request_type` : sql``;
  const countResult = await sql`
    SELECT COUNT(*)::int AS c FROM merchant_menu_item_change_requests WHERE 1=1 ${storeCond} ${statusCond} ${typeCond}
  `;
  const total = Number((countResult[0] as any)?.c ?? 0);
  const rows = await sql`
    SELECT id, store_id, menu_item_id, request_type::text, status::text, requested_payload, current_snapshot,
           reason, created_by, created_by_role, reviewed_by, reviewed_by_role, reviewed_reason,
           created_at, updated_at
    FROM merchant_menu_item_change_requests
    WHERE 1=1 ${storeCond} ${statusCond} ${typeCond}
    ORDER BY created_at DESC
    LIMIT ${filters.limit} OFFSET ${filters.offset}
  `;
  return { requests: rows as any[], total };
}

export async function getChangeRequestById(
  id: number,
  storeIdNum?: number | null
): Promise<{
  id: number;
  store_id: number;
  menu_item_id: number | null;
  request_type: string;
  status: string;
  requested_payload: object;
  current_snapshot: object | null;
  reason: string | null;
  created_by: string;
  created_by_role: string | null;
  reviewed_by: string | null;
  reviewed_reason: string | null;
  created_at: Date;
  updated_at: Date;
} | null> {
  const sql = getSql();
  const storeCond = storeIdNum != null ? sql`AND store_id = ${storeIdNum}` : sql``;
  const [row] = await sql`
    SELECT id, store_id, menu_item_id, request_type::text, status::text, requested_payload, current_snapshot,
           reason, created_by, created_by_role, reviewed_by, reviewed_by_role, reviewed_reason, created_at, updated_at
    FROM merchant_menu_item_change_requests WHERE id = ${id} ${storeCond}
  `;
  if (!row) return null;
  return row as any;
}

export async function approveChangeRequest(
  requestId: number,
  opts: { reviewed_by: string; reviewed_by_role?: string }
): Promise<{ ok: boolean; error?: string }> {
  const sql = getSql();
  const [req] = await sql`
    SELECT id, store_id, menu_item_id, request_type::text, status::text, requested_payload, current_snapshot
    FROM merchant_menu_item_change_requests WHERE id = ${requestId}
  `;
  if (!req) return { ok: false, error: "request_not_found" };
  const r = req as any;
  if (r.status !== "PENDING") return { ok: false, error: "request_not_pending" };
  const storeIdNum = Number(r.store_id);
  const menuItemId = r.menu_item_id != null ? Number(r.menu_item_id) : null;
  const payload = (r.requested_payload ?? {}) as Record<string, unknown>;

  if (r.request_type === "UPDATE" && menuItemId != null) {
    const updated = await updateItem(menuItemId, storeIdNum, payload as any, {
      updatedByRole: opts.reviewed_by_role ?? "agent",
      updatedBySub: opts.reviewed_by,
    });
    if (!updated) return { ok: false, error: "item_update_failed" };
    await setItemApproval(menuItemId, storeIdNum, {
      approval_status: "APPROVED",
      approved_by: opts.reviewed_by,
      approved_by_role: opts.reviewed_by_role ?? "agent",
    });
  } else if (r.request_type === "DELETE" && menuItemId != null) {
    const deleted = await deleteItem(menuItemId, storeIdNum);
    if (!deleted) return { ok: false, error: "item_delete_failed" };
  }
  await sql`
    UPDATE merchant_menu_item_change_requests
    SET status = 'APPROVED'::merchant_menu_item_change_request_status,
        reviewed_by = ${opts.reviewed_by}, reviewed_by_role = ${opts.reviewed_by_role ?? "agent"},
        updated_at = NOW()
    WHERE id = ${requestId}
  `;
  return { ok: true };
}

export async function rejectChangeRequest(
  requestId: number,
  opts: { reviewed_by: string; reviewed_by_role?: string; reviewed_reason?: string | null }
): Promise<boolean> {
  const sql = getSql();
  const result = await sql`
    UPDATE merchant_menu_item_change_requests
    SET status = 'REJECTED'::merchant_menu_item_change_request_status,
        reviewed_by = ${opts.reviewed_by}, reviewed_by_role = ${opts.reviewed_by_role ?? "agent"},
        reviewed_reason = ${opts.reviewed_reason ?? null}, updated_at = NOW()
    WHERE id = ${requestId} AND status = 'PENDING'::merchant_menu_item_change_request_status
  `;
  return (result.count ?? 0) > 0;
}

/** Returns true if item has at least one PENDING change request. */
export async function hasPendingChangeRequest(menuItemId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [r] = await sql`
    SELECT 1 FROM merchant_menu_item_change_requests
    WHERE menu_item_id = ${menuItemId} AND store_id = ${storeIdNum} AND status = 'PENDING'
    LIMIT 1
  `;
  return !!r;
}

// --- Ranking: increment order_count when order is placed (call from order placement)
export async function incrementRankingOrderCount(menuItemIds: number[]): Promise<void> {
  if (menuItemIds.length === 0) return;
  const sql = getSql();
  for (const menuItemId of menuItemIds) {
    const [item] = await sql`SELECT id, store_id FROM merchant_menu_items WHERE id = ${menuItemId}`;
    if (!item) continue;
    const storeIdNum = Number((item as any).store_id);
    await sql`
      INSERT INTO merchant_menu_item_ranking (menu_item_id, store_id, order_count, last_ordered_at, updated_at)
      VALUES (${menuItemId}, ${storeIdNum}, 1, NOW(), NOW())
      ON CONFLICT (menu_item_id) DO UPDATE SET
        order_count = merchant_menu_item_ranking.order_count + 1,
        last_ordered_at = NOW(),
        updated_at = NOW()
    `;
  }
}

// --- Reusable modifier groups (store-level addon library)
const DEFAULT_PLAN = "basic";
const MAX_GROUPS_DEFAULT = 20;
const MAX_OPTIONS_DEFAULT = 100;
const MAX_GROUPS_PER_ITEM_DEFAULT = 10;
const MAX_OPTIONS_PER_GROUP_DEFAULT = 20;

async function getModifierLimits(_storeIdNum: number): Promise<{
  max_modifier_groups: number;
  max_modifier_options: number;
  max_modifier_groups_per_item: number;
  max_options_per_group: number;
}> {
  const sql = getSql();
  const [limits] = await sql`
    SELECT max_modifier_groups, max_modifier_options, max_modifier_groups_per_item, max_options_per_group
    FROM merchant_modifier_subscription_limits WHERE plan_key = ${DEFAULT_PLAN}
  `;
  if (limits) {
    const L = limits as any;
    return {
      max_modifier_groups: Number(L.max_modifier_groups) ?? MAX_GROUPS_DEFAULT,
      max_modifier_options: Number(L.max_modifier_options) ?? MAX_OPTIONS_DEFAULT,
      max_modifier_groups_per_item: Number(L.max_modifier_groups_per_item) ?? MAX_GROUPS_PER_ITEM_DEFAULT,
      max_options_per_group: Number(L.max_options_per_group) ?? MAX_OPTIONS_PER_GROUP_DEFAULT,
    };
  }
  return {
    max_modifier_groups: MAX_GROUPS_DEFAULT,
    max_modifier_options: MAX_OPTIONS_DEFAULT,
    max_modifier_groups_per_item: MAX_GROUPS_PER_ITEM_DEFAULT,
    max_options_per_group: MAX_OPTIONS_PER_GROUP_DEFAULT,
  };
}

export async function listModifierGroups(storeIdNum: number): Promise<
  Array<{
    id: number;
    group_id: string;
    title: string;
    description: string | null;
    is_required: boolean;
    min_selection: number;
    max_selection: number;
    display_order: number;
    options_count: number;
    used_in_items_count: number;
  }>
> {
  const sql = getSql();
  const rows = await sql`
    SELECT g.id, g.group_code, g.title, g.description, g.is_required, g.min_selection, g.max_selection, g.display_order
    FROM merchant_modifier_groups g
    WHERE g.store_id = ${storeIdNum}
    ORDER BY g.display_order ASC, g.id ASC
  `;
  const result: Array<any> = [];
  for (const r of rows as any[]) {
    const [optCount] = await sql`SELECT COUNT(*)::int AS c FROM merchant_modifier_options WHERE modifier_group_id = ${r.id}`;
    const [linkCount] = await sql`SELECT COUNT(*)::int AS c FROM merchant_item_modifier_groups WHERE modifier_group_id = ${r.id}`;
    const code = r.group_code ?? r.group_id;
    result.push({
      ...r,
      group_id: code,
      options_count: Number(optCount?.c ?? 0),
      used_in_items_count: Number(linkCount?.c ?? 0),
    });
  }
  return result;
}

export async function createModifierGroup(
  storeIdNum: number,
  body: { title: string; description?: string | null; is_required?: boolean; min_selection?: number; max_selection?: number; display_order?: number }
): Promise<{ id: number; group_id: string }> {
  const sql = getSql();
  const limits = await getModifierLimits(storeIdNum);
  const [countRow] = await sql`SELECT COUNT(*)::int AS c FROM merchant_modifier_groups WHERE store_id = ${storeIdNum}`;
  const currentGroups = Number((countRow as any)?.c ?? 0);
  if (currentGroups >= limits.max_modifier_groups) {
    throw new Error(`LIMIT_MODIFIER_GROUPS: Maximum ${limits.max_modifier_groups} addon groups allowed for your plan.`);
  }
  const groupCode = "MG_" + ulid();
  const [row] = await sql`
    INSERT INTO merchant_modifier_groups (store_id, group_code, title, description, is_required, min_selection, max_selection, display_order)
    VALUES (${storeIdNum}, ${groupCode}, ${body.title}, ${body.description ?? null}, ${body.is_required ?? false}, ${body.min_selection ?? 0}, ${body.max_selection ?? 1}, ${body.display_order ?? 0})
    RETURNING id, group_code
  `;
  const r = row as any;
  return { id: Number(r.id), group_id: r.group_code ?? r.group_id };
}

export async function updateModifierGroup(
  groupId: number,
  storeIdNum: number,
  body: { title?: string; description?: string | null; is_required?: boolean; min_selection?: number; max_selection?: number; display_order?: number }
): Promise<boolean> {
  const sql = getSql();
  const [g] = await sql`SELECT id, title, description, is_required, min_selection, max_selection, display_order FROM merchant_modifier_groups WHERE id = ${groupId} AND store_id = ${storeIdNum}`;
  if (!g) return false;
  const e = g as any;
  await sql`
    UPDATE merchant_modifier_groups
    SET title = ${body.title ?? e.title},
        description = ${body.description !== undefined ? body.description : e.description},
        is_required = ${body.is_required !== undefined ? body.is_required : e.is_required},
        min_selection = ${body.min_selection ?? e.min_selection},
        max_selection = ${body.max_selection ?? e.max_selection},
        display_order = ${body.display_order ?? e.display_order},
        updated_at = NOW()
    WHERE id = ${groupId}
  `;
  return true;
}

export async function deleteModifierGroup(groupId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [g] = await sql`SELECT id FROM merchant_modifier_groups WHERE id = ${groupId} AND store_id = ${storeIdNum}`;
  if (!g) return false;
  await sql`DELETE FROM merchant_modifier_groups WHERE id = ${groupId}`;
  return true;
}

export async function listModifierOptions(
  modifierGroupId: number,
  storeIdNum: number
): Promise<
  Array<{
    id: number;
    option_id: string;
    name: string;
    price_delta: string;
    image_url: string | null;
    in_stock: boolean;
    default_quantity: number;
    display_order: number;
  }>
> {
  const sql = getSql();
  const [g] = await sql`SELECT id FROM merchant_modifier_groups WHERE id = ${modifierGroupId} AND store_id = ${storeIdNum}`;
  if (!g) return [];
  const rows = await sql`
    SELECT id, option_id, name, price_delta::text, image_url, in_stock, default_quantity, display_order
    FROM merchant_modifier_options
    WHERE modifier_group_id = ${modifierGroupId}
    ORDER BY display_order ASC, id ASC
  `;
  return rows as any;
}

export async function addModifierOption(
  modifierGroupId: number,
  storeIdNum: number,
  body: { name: string; price_delta?: number; image_url?: string | null; in_stock?: boolean; default_quantity?: number; display_order?: number }
): Promise<{ id: number; option_id: string }> {
  const sql = getSql();
  const [g] = await sql`SELECT id FROM merchant_modifier_groups WHERE id = ${modifierGroupId} AND store_id = ${storeIdNum}`;
  if (!g) throw new Error("MODIFIER_GROUP_NOT_FOUND");
  const limits = await getModifierLimits(storeIdNum);
  const [countRow] = await sql`SELECT COUNT(*)::int AS c FROM merchant_modifier_options WHERE modifier_group_id = ${modifierGroupId}`;
  const currentOptions = Number((countRow as any)?.c ?? 0);
  if (currentOptions >= limits.max_options_per_group) {
    throw new Error(`LIMIT_OPTIONS_PER_GROUP: Maximum ${limits.max_options_per_group} options per addon group.`);
  }
  const totalOptions = await sql`SELECT COUNT(*)::int AS c FROM merchant_modifier_options o INNER JOIN merchant_modifier_groups g ON g.id = o.modifier_group_id WHERE g.store_id = ${storeIdNum}`;
  if (Number((totalOptions[0] as any)?.c ?? 0) >= limits.max_modifier_options) {
    throw new Error(`LIMIT_MODIFIER_OPTIONS: Maximum ${limits.max_modifier_options} total addon options for your plan.`);
  }
  const optionCode = "MO_" + ulid();
  const [row] = await sql`
    INSERT INTO merchant_modifier_options (modifier_group_id, option_code, name, price_delta, image_url, in_stock, default_quantity, display_order)
    VALUES (${modifierGroupId}, ${optionCode}, ${body.name}, ${body.price_delta ?? 0}, ${body.image_url ?? null}, ${body.in_stock ?? true}, ${body.default_quantity ?? 0}, ${body.display_order ?? 0})
    RETURNING id, option_code
  `;
  const r = row as any;
  return { id: Number(r.id), option_id: r.option_code ?? r.option_id };
}

export async function updateModifierOption(
  optionId: number,
  storeIdNum: number,
  body: { name?: string; price_delta?: number; image_url?: string | null; in_stock?: boolean; default_quantity?: number; display_order?: number }
): Promise<boolean> {
  const sql = getSql();
  const [o] = await sql`
    SELECT o.id, o.name, o.price_delta, o.image_url, o.in_stock, o.default_quantity, o.display_order
    FROM merchant_modifier_options o
    INNER JOIN merchant_modifier_groups g ON g.id = o.modifier_group_id AND g.store_id = ${storeIdNum}
    WHERE o.id = ${optionId}
  `;
  if (!o) return false;
  const e = o as any;
  await sql`
    UPDATE merchant_modifier_options
    SET name = ${body.name ?? e.name},
        price_delta = ${body.price_delta ?? e.price_delta},
        image_url = ${body.image_url !== undefined ? body.image_url : e.image_url},
        in_stock = ${body.in_stock !== undefined ? body.in_stock : e.in_stock},
        default_quantity = ${body.default_quantity ?? e.default_quantity},
        display_order = ${body.display_order ?? e.display_order},
        updated_at = NOW()
    WHERE id = ${optionId}
  `;
  return true;
}

export async function deleteModifierOption(optionId: number, storeIdNum: number): Promise<boolean> {
  const sql = getSql();
  const [o] = await sql`
    SELECT o.id FROM merchant_modifier_options o
    INNER JOIN merchant_modifier_groups g ON g.id = o.modifier_group_id AND g.store_id = ${storeIdNum}
    WHERE o.id = ${optionId}
  `;
  if (!o) return false;
  await sql`DELETE FROM merchant_modifier_options WHERE id = ${optionId}`;
  return true;
}

export async function listItemModifierGroups(
  menuItemId: number,
  storeIdNum: number
): Promise<
  Array<{
    id: number;
    modifier_group_id: number;
    display_order: number;
    group: {
      id: number;
      group_id: string;
      title: string;
      description: string | null;
      is_required: boolean;
      min_selection: number;
      max_selection: number;
      options: Array<{ id: number; option_id: string; name: string; price_delta: string; in_stock: boolean; display_order: number }>;
    };
  }>
> {
  await assertItemOwnership(menuItemId, storeIdNum);
  const sql = getSql();
  const links = await sql`
    SELECT id, modifier_group_id, display_order
    FROM merchant_item_modifier_groups
    WHERE menu_item_id = ${menuItemId}
    ORDER BY display_order ASC, id ASC
  `;
  const result: Array<any> = [];
  for (const link of links as any[]) {
    const [g] = await sql`
      SELECT id, group_code, title, description, is_required, min_selection, max_selection
      FROM merchant_modifier_groups
      WHERE id = ${link.modifier_group_id} AND store_id = ${storeIdNum}
    `;
    if (!g) continue;
    const opts = (await sql`
      SELECT id, option_code, name, price_delta::text, in_stock, display_order
      FROM merchant_modifier_options
      WHERE modifier_group_id = ${link.modifier_group_id}
      ORDER BY display_order ASC, id ASC
    `) as any[];
    const gAny = g as any;
    result.push({
      id: link.id,
      modifier_group_id: link.modifier_group_id,
      display_order: link.display_order,
      group: {
        ...gAny,
        group_id: gAny.group_code ?? gAny.group_id,
        options: opts.map((o: any) => ({ ...o, option_id: o.option_code ?? o.option_id })),
      },
    });
  }
  return result;
}

export async function linkModifierGroupToItem(
  menuItemId: number,
  modifierGroupId: number,
  storeIdNum: number,
  body?: { display_order?: number }
): Promise<{ id: number }> {
  await assertItemOwnership(menuItemId, storeIdNum);
  const sql = getSql();
  const [g] = await sql`SELECT id FROM merchant_modifier_groups WHERE id = ${modifierGroupId} AND store_id = ${storeIdNum}`;
  if (!g) throw new Error("MODIFIER_GROUP_NOT_FOUND");
  const limits = await getModifierLimits(storeIdNum);
  const [countRow] = await sql`SELECT COUNT(*)::int AS c FROM merchant_item_modifier_groups WHERE menu_item_id = ${menuItemId}`;
  if (Number((countRow as any)?.c ?? 0) >= limits.max_modifier_groups_per_item) {
    throw new Error(`LIMIT_GROUPS_PER_ITEM: Maximum ${limits.max_modifier_groups_per_item} addon groups per item.`);
  }
  const [existing] = await sql`
    SELECT id FROM merchant_item_modifier_groups WHERE menu_item_id = ${menuItemId} AND modifier_group_id = ${modifierGroupId}
  `;
  if (existing) throw new Error("ALREADY_LINKED");
  const [row] = await sql`
    INSERT INTO merchant_item_modifier_groups (menu_item_id, modifier_group_id, display_order)
    VALUES (${menuItemId}, ${modifierGroupId}, ${body?.display_order ?? 0})
    RETURNING id
  `;
  return { id: Number((row as any).id) };
}

export async function unlinkModifierGroupFromItem(linkId: number, menuItemId: number, storeIdNum: number): Promise<boolean> {
  await assertItemOwnership(menuItemId, storeIdNum);
  const sql = getSql();
  const [r] = await sql`
    SELECT id FROM merchant_item_modifier_groups
    WHERE id = ${linkId} AND menu_item_id = ${menuItemId}
  `;
  if (!r) return false;
  await sql`DELETE FROM merchant_item_modifier_groups WHERE id = ${linkId}`;
  return true;
}

export async function getModifierGroupUsageCount(groupId: number, storeIdNum: number): Promise<number> {
  const sql = getSql();
  const [g] = await sql`SELECT id FROM merchant_modifier_groups WHERE id = ${groupId} AND store_id = ${storeIdNum}`;
  if (!g) return 0;
  const [r] = await sql`SELECT COUNT(*)::int AS c FROM merchant_item_modifier_groups WHERE modifier_group_id = ${groupId}`;
  return Number((r as any)?.c ?? 0);
}
