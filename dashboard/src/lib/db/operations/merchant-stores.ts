/**
 * Area Manager: operations on merchant_stores and merchant_parents (raw SQL).
 * Parent–AM association is via parent_area_managers; merchant_stores has area_manager_id.
 */

import { getSql } from "../client";

export interface MerchantStoreRow {
  id: number;
  store_id: string;
  parent_id: number;
  store_name: string;
  store_display_name: string | null;
  store_description: string | null;
  store_email: string | null;
  store_phones: string[] | null;
  full_address: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  banner_url: string | null;
  gallery_images: string[] | null;
  cuisine_types: string[] | null;
  avg_preparation_time_minutes: number | null;
  /** Default packaging fee (₹) for the store; per-item overrides use merchant_menu_items.packaging_charges */
  packaging_charge_amount: number | null;
  min_order_amount: number | null;
  delivery_radius_km: number | null;
  is_pure_veg: boolean | null;
  accepts_online_payment: boolean | null;
  accepts_cash: boolean | null;
  area_manager_id: number | null;
  status: string;
  approval_status: string;
  approval_reason: string | null;
  approved_by: number | null;
  approved_at: Date | null;
  rejected_reason: string | null;
  current_onboarding_step: number | null;
  onboarding_completed: boolean | null;
  onboarding_completed_at: Date | null;
  is_active: boolean | null;
  is_accepting_orders: boolean | null;
  is_available: boolean | null;
  last_activity_at: Date | null;
  deleted_at: Date | null;
  deleted_by: number | null;
  delist_reason: string | null;
  delisted_at: Date | null;
  store_type: string | null;
  operational_status: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}

export interface StoreDelistingLogSummary {
  store_id: number;
  delist_type: string;
  reason_category: string;
  reason_description: string;
  action_by_user_id: number;
  action_by_role: string;
  created_at: Date;
  actor_name: string | null;
  actor_email: string | null;
}

export interface MerchantParentRow {
  id: number;
  parent_merchant_id: string;
  parent_name: string;
  area_manager_id?: number | null;
  created_by_name?: string | null;
  owner_name: string | null;
  registered_phone: string | null;
  city: string | null;
  approval_status: string;
}

export type DelistType = "temporary_delisted" | "permanently_delisted" | "compliance_hold";

/**
 * Count parent merchants visible to this area manager.
 * merchant_parents has no area_manager_id; count only parents that have at least
 * one child store (merchant_stores) under this area_manager_id.
 * When areaManagerId is null (super admin), return overall count: distinct parents that have at least one child store.
 */
export async function countMerchantParents(
  areaManagerId: number | null
): Promise<number> {
  const sql = getSql();
  const result =
    areaManagerId != null
      ? await sql`
    SELECT count(DISTINCT ms.parent_id)::int AS total
    FROM merchant_stores ms
    WHERE ms.deleted_at IS NULL AND ms.area_manager_id = ${areaManagerId} AND ms.parent_id IS NOT NULL
  `
      : await sql`
    SELECT count(DISTINCT parent_id)::int AS total
    FROM merchant_stores
    WHERE deleted_at IS NULL AND parent_id IS NOT NULL
  `;
  const row = Array.isArray(result) ? result[0] : result;
  return Number(row?.total ?? 0);
}

/**
 * Count child stores (stores with parent_id). When areaManagerId is set, only those assigned to that area manager.
 * When areaManagerId is null (super admin), return overall count of all child stores.
 */
export async function countChildStores(
  areaManagerId: number | null
): Promise<number> {
  const sql = getSql();
  const result =
    areaManagerId != null
      ? await sql`
    SELECT count(*)::int AS total
    FROM merchant_stores
    WHERE deleted_at IS NULL AND area_manager_id = ${areaManagerId} AND parent_id IS NOT NULL
  `
      : await sql`
    SELECT count(*)::int AS total
    FROM merchant_stores
    WHERE deleted_at IS NULL AND parent_id IS NOT NULL
  `;
  const row = Array.isArray(result) ? result[0] : result;
  return Number(row?.total ?? 0);
}

/**
 * Count child stores for a specific parent (same filters as listMerchantStores when parentId is set).
 */
export async function countChildStoresForParent(params: {
  areaManagerId: number | null;
  parentId: number;
  approval_status?: string;
  status?: string;
  search?: string;
}): Promise<number> {
  const sql = getSql();
  const searchRaw = params.search?.trim() ?? "";
  const search = searchRaw ? `%${searchRaw}%` : null;
  let searchCondition = sql``;
  if (search) {
    const parentIdNum = /^\d+$/.test(searchRaw) ? parseInt(searchRaw, 10) : null;
    if (parentIdNum != null && !Number.isNaN(parentIdNum)) {
      searchCondition = sql`AND (store_id ILIKE ${search} OR store_name ILIKE ${search} OR store_display_name ILIKE ${search} OR array_to_string(COALESCE(store_phones, ARRAY[]::text[]), ' ') ILIKE ${search} OR parent_id = ${parentIdNum})`;
    } else {
      searchCondition = sql`AND (store_id ILIKE ${search} OR store_name ILIKE ${search} OR store_display_name ILIKE ${search} OR array_to_string(COALESCE(store_phones, ARRAY[]::text[]), ' ') ILIKE ${search})`;
    }
  }
  let statusCondition = sql``;
  if (params.approval_status) {
    if (params.approval_status === "SUBMITTED" || params.approval_status === "PENDING") {
      statusCondition = sql`AND approval_status IN ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION')`;
    } else if (params.approval_status === "REJECTED") {
      statusCondition = sql`AND approval_status IN ('REJECTED', 'BLOCKED', 'SUSPENDED')`;
    } else {
      statusCondition = sql`AND approval_status = ${params.approval_status}`;
    }
  }
  let storeStatusCondition = sql``;
  if (params.status === "ACTIVE") {
    storeStatusCondition = sql`AND status = 'ACTIVE'`;
  } else if (params.status === "INACTIVE") {
    storeStatusCondition = sql`AND status = 'INACTIVE'`;
  }
  const result = await sql`
    SELECT count(*)::int AS total
    FROM merchant_stores
    WHERE deleted_at IS NULL
    AND parent_id = ${params.parentId}
    ${params.areaManagerId != null ? sql`AND area_manager_id = ${params.areaManagerId}` : sql``}
    ${statusCondition}
    ${storeStatusCondition}
    ${searchCondition}
  `;
  const row = Array.isArray(result) ? result[0] : result;
  return Number(row?.total ?? 0);
}

/**
 * Count merchant_stores by area_manager_id and by approval_status/status for dashboard metrics.
 * Only counts child stores (parent_id IS NOT NULL). When areaManagerId is null (super admin), overall counts.
 */
export async function countMerchantStoresByStatus(
  areaManagerId: number | null,
  options?: { createdFrom?: string; createdTo?: string }
): Promise<{
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  active: number;
  new: number;
}> {
  const sql = getSql();
  const baseCondition =
    areaManagerId != null
      ? sql`deleted_at IS NULL AND area_manager_id = ${areaManagerId}`
      : sql`deleted_at IS NULL`;
  const childCondition = sql`AND parent_id IS NOT NULL`;
  const fromDate = options?.createdFrom?.trim();
  const toDate = options?.createdTo?.trim();
  const dateFromCondition = fromDate ? sql`AND created_at >= (${fromDate}::date)` : sql``;
  const dateToCondition = toDate ? sql`AND created_at <= (${toDate}::date + interval '1 day')` : sql``;

  const scope = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE approval_status = 'APPROVED')::int AS verified,
      count(*) FILTER (WHERE approval_status IN ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION'))::int AS pending,
      count(*) FILTER (WHERE approval_status IN ('REJECTED', 'BLOCKED', 'SUSPENDED'))::int AS rejected,
      count(*) FILTER (WHERE is_active = true AND status = 'ACTIVE')::int AS active,
      count(*) FILTER (WHERE created_at >= (now() - interval '30 days'))::int AS new
    FROM merchant_stores
    WHERE ${baseCondition} ${childCondition} ${dateFromCondition} ${dateToCondition}
  `;
  const row = Array.isArray(scope) ? scope[0] : scope;
  return {
    total: Number(row?.total ?? 0),
    verified: Number(row?.verified ?? 0),
    pending: Number(row?.pending ?? 0),
    rejected: Number(row?.rejected ?? 0),
    active: Number(row?.active ?? 0),
    new: Number(row?.new ?? 0),
  };
}

/**
 * Delist a merchant store: update core flags (inactive + not accepting orders),
 * set approval_status to DELISTED, and insert an audit row into store_delisting_logs.
 *
 * This does NOT currently auto-unblock or relist; a separate relist helper should reverse this.
 */
export async function delistMerchantStore(params: {
  storeId: number;
  delistType: DelistType;
  reasonCategory: string;
  reasonDescription: string;
  actorUserId: number;
  actorRole: string;
}): Promise<void> {
  const sql = getSql();

  const [store] = await sql<MerchantStoreRow[]>`
    SELECT *
    FROM merchant_stores
    WHERE id = ${params.storeId}
    LIMIT 1
  `;
  if (!store) {
    throw new Error("Store not found");
  }

  const prevApproval = (store.approval_status as unknown as string) || null;
  const prevOperational = (store.operational_status as unknown as string) || null;

  // Apply delist flags
  const nextApproval = "DELISTED" as unknown as string;
  const nextOperational = "CLOSED" as unknown as string;

  await sql.begin(async (tx) => {
    const run = tx as unknown as typeof sql;
    // Update store flags; status is derived from approval_status trigger (enforce_store_status_rule)
    await run`      UPDATE merchant_stores
      SET
        approval_status = 'DELISTED'::store_approval_status,
        delist_reason = ${params.reasonDescription},
        delisted_at = NOW(),
        is_active = FALSE,
        is_accepting_orders = FALSE,
        is_available = FALSE,
        operational_status = 'CLOSED'::store_operational_status
      WHERE id = ${params.storeId}
    `;

    // Insert into store_delisting_logs for permanent audit trail
    await run`      INSERT INTO store_delisting_logs (
        store_id,
        action_by_user_id,
        action_by_role,
        delist_type,
        reason_category,
        reason_description,
        previous_approval_status,
        new_approval_status,
        previous_operational_status,
        new_operational_status,
        previous_is_active,
        new_is_active,
        previous_is_accepting_orders,
        new_is_accepting_orders,
        previous_is_available,
        new_is_available
      )
      VALUES (
        ${params.storeId},
        ${params.actorUserId},
        ${params.actorRole},
        ${params.delistType},
        ${params.reasonCategory},
        ${params.reasonDescription},
        ${prevApproval}::store_approval_status,
        ${nextApproval}::store_approval_status,
        ${prevOperational}::store_operational_status,
        ${nextOperational}::store_operational_status,
        ${store.is_active},
        FALSE,
        ${store.is_accepting_orders},
        FALSE,
        ${store.is_available},
        FALSE
      )
    `;

    // Optionally also create a block entry so other systems can respect delisting.
    await run`      INSERT INTO merchant_store_blocks (
        store_id,
        block_type,
        block_reason,
        block_reason_code,
        block_notes,
        blocked_by,
        blocked_by_id
      )
      VALUES (
        ${params.storeId},
        'DELISTED',
        ${params.reasonCategory},
        ${params.delistType},
        ${params.reasonDescription},
        ${params.actorRole},
        ${params.actorUserId}
      )
    `;
  });
}

/**
 * Get the latest delisting log entry for a store, including actor name/email when available.
 */
export async function getLatestStoreDelistingLog(
  storeId: number
): Promise<StoreDelistingLogSummary | null> {
  const sql = getSql();
  const rows = await sql<{
    store_id: number;
    delist_type: string;
    reason_category: string;
    reason_description: string;
    action_by_user_id: number;
    action_by_role: string;
    created_at: Date;
    actor_name: string | null;
    actor_email: string | null;
  }[]>`
    SELECT
      l.store_id,
      l.delist_type,
      l.reason_category,
      l.reason_description,
      l.action_by_user_id,
      l.action_by_role,
      l.created_at,
      su.full_name AS actor_name,
      su.email AS actor_email
    FROM store_delisting_logs l
    LEFT JOIN system_users su ON su.id = l.action_by_user_id
    WHERE l.store_id = ${storeId}
    ORDER BY l.created_at DESC
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : (rows as any);
  if (!row) return null;
  return {
    store_id: Number(row.store_id),
    delist_type: String(row.delist_type),
    reason_category: String(row.reason_category),
    reason_description: String(row.reason_description),
    action_by_user_id: Number(row.action_by_user_id),
    action_by_role: String(row.action_by_role),
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    actor_name: row.actor_name ?? null,
    actor_email: row.actor_email ?? null,
  };
}

/**
 * Relist a previously delisted store.
 *
 * - Restores approval_status from the last delist log (fallback APPROVED).
 * - Clears delist_reason / delisted_at.
 * - Keeps the store CLOSED: is_accepting_orders = FALSE, is_available = FALSE, operational_status = CLOSED.
 * - Marks any active DELISTED blocks in merchant_store_blocks as unblocked.
 */
export async function relistMerchantStore(params: {
  storeId: number;
  actorUserId: number;
  actorRole: string;
  relistReason?: string | null;
}): Promise<void> {
  const sql = getSql();

  const [store] = await sql<MerchantStoreRow[]>`
    SELECT *
    FROM merchant_stores
    WHERE id = ${params.storeId}
    LIMIT 1
  `;
  if (!store) {
    throw new Error("Store not found");
  }

  const [lastLog] =
    (await sql<{
      previous_approval_status: string | null;
      previous_operational_status: string | null;
    }[]>`
      SELECT previous_approval_status, previous_operational_status
      FROM store_delisting_logs
      WHERE store_id = ${params.storeId}
      ORDER BY created_at DESC
      LIMIT 1
    `) ?? [];

  const targetApproval =
    (lastLog?.previous_approval_status as string | null) || (store.approval_status as unknown as string) || "APPROVED";

  await sql.begin(async (tx) => {
    const run = tx as unknown as typeof sql;
    // Restore approval_status (typically APPROVED) but keep store operationally CLOSED.
    await run`      UPDATE merchant_stores
      SET
        approval_status = ${targetApproval}::store_approval_status,
        delist_reason = NULL,
        delisted_at = NULL,
        is_active = TRUE,
        is_accepting_orders = FALSE,
        is_available = FALSE,
        operational_status = 'CLOSED'::store_operational_status
      WHERE id = ${params.storeId}
    `;

    // Audit entry in store_delisting_logs to capture relist action.
    await run`      INSERT INTO store_delisting_logs (
        store_id,
        action_by_user_id,
        action_by_role,
        delist_type,
        reason_category,
        reason_description,
        previous_approval_status,
        new_approval_status,
        previous_operational_status,
        new_operational_status,
        previous_is_active,
        new_is_active,
        previous_is_accepting_orders,
        new_is_accepting_orders,
        previous_is_available,
        new_is_available
      )
      VALUES (
        ${params.storeId},
        ${params.actorUserId},
        ${params.actorRole},
        'relist',
        'Relist',
        ${params.relistReason || "Store relisted"},
        ${store.approval_status}::store_approval_status,
        ${targetApproval}::store_approval_status,
        ${store.operational_status}::store_operational_status,
        'CLOSED'::store_operational_status,
        ${store.is_active},
        TRUE,
        ${store.is_accepting_orders},
        FALSE,
        ${store.is_available},
        FALSE
      )
    `;

    // Mark existing DELISTED blocks as unblocked.
    await run`      UPDATE merchant_store_blocks
      SET
        is_unblocked = TRUE,
        unblocked_at = NOW(),
        unblocked_by = ${params.actorUserId},
        unblock_reason = COALESCE(unblock_reason, '') || CASE
          WHEN unblock_reason IS NULL OR unblock_reason = '' THEN 'Relisted'
          ELSE ' | Relisted'
        END
      WHERE store_id = ${params.storeId}
        AND block_type = 'DELISTED'
        AND is_unblocked = FALSE
    `;
  });
}

/**
 * List merchant_parents (parent stores). When areaManagerId is set, includes parents that have at
 * least one child store under that AM, or parents assigned to this AM in parent_area_managers
 * so newly registered parents appear before any child is added. When null (super admin), all parents.
 */
export async function listMerchantParents(params: {
  areaManagerId: number | null;
  limit: number;
  cursor?: string;
  search?: string;
  approval_status?: string;
}): Promise<{ items: MerchantParentRow[]; nextCursor: string | null }> {
  const sql = getSql();
  const limit = Math.min(params.limit || 20, 100);
  const limitVal = limit + 1;
  const cursorId = params.cursor ? parseInt(params.cursor, 10) : null;
  const searchRaw = params.search?.trim() ?? "";
  const search = searchRaw ? `%${searchRaw}%` : null;

  // Search: parent_merchant_id, parent_name, registered_phone; when numeric also match id
  let searchCondition = sql``;
  if (search) {
    const idNum = /^\d+$/.test(searchRaw) ? parseInt(searchRaw, 10) : null;
    if (idNum != null && !Number.isNaN(idNum)) {
      searchCondition = sql`AND (mp.parent_name ILIKE ${search} OR mp.parent_merchant_id ILIKE ${search} OR mp.registered_phone ILIKE ${search} OR mp.registered_phone_normalized ILIKE ${search} OR mp.id = ${idNum})`;
    } else {
      searchCondition = sql`AND (mp.parent_name ILIKE ${search} OR mp.parent_merchant_id ILIKE ${search} OR mp.registered_phone ILIKE ${search} OR mp.registered_phone_normalized ILIKE ${search})`;
    }
  }

  // Build approval_status filter condition for parent stores
  // parent_approval_status enum: 'APPROVED', 'REJECTED', 'BLOCKED', 'SUSPENDED'
  let statusCondition = sql``;
  if (params.approval_status) {
    if (params.approval_status === "APPROVED") {
      statusCondition = sql`AND mp.approval_status = 'APPROVED'`;
    } else if (params.approval_status === "REJECTED") {
      statusCondition = sql`AND mp.approval_status IN ('REJECTED', 'BLOCKED', 'SUSPENDED')`;
    } else {
      statusCondition = sql`AND mp.approval_status = ${params.approval_status}`;
    }
  }

  // When areaManagerId set: include parents assigned to this AM in parent_area_managers,
  // or that have at least one child store under this AM
  const areaManagerCondition =
    params.areaManagerId != null
      ? sql`AND (
          EXISTS (SELECT 1 FROM parent_area_managers pam WHERE pam.parent_id = mp.id AND pam.area_manager_id = ${params.areaManagerId})
          OR EXISTS (
            SELECT 1 FROM merchant_stores ms
            WHERE ms.parent_id = mp.id AND ms.deleted_at IS NULL AND ms.area_manager_id = ${params.areaManagerId}
          )
        )`
      : sql``;

  const rows = await sql<MerchantParentRow[]>`
    SELECT mp.id, mp.parent_merchant_id, mp.parent_name, mp.owner_name, mp.registered_phone, mp.city, mp.approval_status
    FROM merchant_parents mp
    WHERE 1=1
    ${areaManagerCondition}
    ${statusCondition}
    ${cursorId != null ? sql`AND mp.id < ${cursorId}` : sql``}
    ${searchCondition}
    ORDER BY mp.id DESC
    LIMIT ${limitVal}
  `;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? String(last.id) : null;
  return { items, nextCursor };
}

/**
 * Count merchant_parents with same area/search/approval scope as listMerchantParents (for list total).
 */
export async function countMerchantParentsWithFilters(params: {
  areaManagerId: number | null;
  search?: string;
  approval_status?: string;
}): Promise<number> {
  const sql = getSql();
  const searchRaw = params.search?.trim() ?? "";
  const search = searchRaw ? `%${searchRaw}%` : null;
  let searchCondition = sql``;
  if (search) {
    const idNum = /^\d+$/.test(searchRaw) ? parseInt(searchRaw, 10) : null;
    if (idNum != null && !Number.isNaN(idNum)) {
      searchCondition = sql`AND (mp.parent_name ILIKE ${search} OR mp.parent_merchant_id ILIKE ${search} OR mp.registered_phone ILIKE ${search} OR mp.registered_phone_normalized ILIKE ${search} OR mp.id = ${idNum})`;
    } else {
      searchCondition = sql`AND (mp.parent_name ILIKE ${search} OR mp.parent_merchant_id ILIKE ${search} OR mp.registered_phone ILIKE ${search} OR mp.registered_phone_normalized ILIKE ${search})`;
    }
  }
  let statusCondition = sql``;
  if (params.approval_status) {
    if (params.approval_status === "APPROVED") {
      statusCondition = sql`AND mp.approval_status = 'APPROVED'`;
    } else if (params.approval_status === "REJECTED") {
      statusCondition = sql`AND mp.approval_status IN ('REJECTED', 'BLOCKED', 'SUSPENDED')`;
    } else {
      statusCondition = sql`AND mp.approval_status = ${params.approval_status}`;
    }
  }
  const areaManagerCondition =
    params.areaManagerId != null
      ? sql`AND (
          EXISTS (SELECT 1 FROM parent_area_managers pam WHERE pam.parent_id = mp.id AND pam.area_manager_id = ${params.areaManagerId})
          OR EXISTS (
            SELECT 1 FROM merchant_stores ms
            WHERE ms.parent_id = mp.id AND ms.deleted_at IS NULL AND ms.area_manager_id = ${params.areaManagerId}
          )
        )`
      : sql``;
  const result = await sql`
    SELECT count(*)::int AS total
    FROM merchant_parents mp
    WHERE 1=1
    ${areaManagerCondition}
    ${statusCondition}
    ${searchCondition}
  `;
  const row = Array.isArray(result) ? result[0] : result;
  return Number((row as { total: number })?.total ?? 0);
}

/**
 * List merchant_stores for area manager. When areaManagerId is set, only stores under that area manager.
 * When null (super admin), all stores.
 */
export async function listMerchantStores(params: {
  areaManagerId: number | null;
  limit: number;
  cursor?: string;
  status?: string;
  approval_status?: string;
  search?: string;
  filter?: "parent" | "child";
  parentId?: number;
  newOnly?: boolean;
  /** Filter by created_at >= fromDate (YYYY-MM-DD) */
  createdFrom?: string;
  /** Filter by created_at <= toDate (YYYY-MM-DD, end of day) */
  createdTo?: string;
}): Promise<{ items: MerchantStoreRow[]; nextCursor: string | null }> {
  const sql = getSql();
  const limit = Math.min(params.limit || 20, 100);
  const limitVal = limit + 1;
  const cursorId = params.cursor ? parseInt(params.cursor, 10) : null;
  const searchRaw = params.search?.trim() ?? "";
  const search = searchRaw ? `%${searchRaw}%` : null;

  // Fast path: child search by store_id (indexed) for instant result
  if (
    params.filter === "child" &&
    searchRaw.length >= 2 &&
    looksLikeStoreId(searchRaw)
  ) {
    const exact = await getChildStoreByStoreId(
      searchRaw.toUpperCase(),
      params.areaManagerId
    );
    if (exact) {
      return { items: [exact], nextCursor: null };
    }
    // Fall through to ILIKE search if exact match missed (e.g. wrong case stored)
  }

  // Search: store_id, store_name, store_display_name, store_phones (number), parent_id (when numeric)
  let searchCondition = sql``;
  if (search) {
    const parentIdNum = /^\d+$/.test(searchRaw) ? parseInt(searchRaw, 10) : null;
    if (parentIdNum != null && !Number.isNaN(parentIdNum)) {
      searchCondition = sql`AND (store_id ILIKE ${search} OR store_name ILIKE ${search} OR store_display_name ILIKE ${search} OR array_to_string(COALESCE(store_phones, ARRAY[]::text[]), ' ') ILIKE ${search} OR parent_id = ${parentIdNum})`;
    } else {
      searchCondition = sql`AND (store_id ILIKE ${search} OR store_name ILIKE ${search} OR store_display_name ILIKE ${search} OR array_to_string(COALESCE(store_phones, ARRAY[]::text[]), ' ') ILIKE ${search})`;
    }
  }

  // Build filter conditions
  let filterCondition = sql``;
  if (params.filter === "child") {
    // Child stores: stores with a parent_id
    filterCondition = sql`AND parent_id IS NOT NULL`;
  }
  
  if (params.parentId != null) {
    // When parentId is provided, show child stores for that parent
    filterCondition = sql`AND parent_id = ${params.parentId}`;
  }

  // Build approval_status filter condition
  let statusCondition = sql``;
  if (params.approval_status) {
    if (params.approval_status === "SUBMITTED" || params.approval_status === "PENDING") {
      // PENDING includes DRAFT, SUBMITTED, and UNDER_VERIFICATION
      statusCondition = sql`AND approval_status IN ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION')`;
    } else if (params.approval_status === "REJECTED") {
      statusCondition = sql`AND approval_status IN ('REJECTED', 'BLOCKED', 'SUSPENDED')`;
    } else {
      statusCondition = sql`AND approval_status = ${params.approval_status}`;
    }
  }

  // Store status filter (ACTIVE / INACTIVE) for merchant_stores.status
  let storeStatusCondition = sql``;
  if (params.status === "ACTIVE") {
    storeStatusCondition = sql`AND status = 'ACTIVE'`;
  } else if (params.status === "INACTIVE") {
    storeStatusCondition = sql`AND status = 'INACTIVE'`;
  }

  // New stores: created in last 30 days (optional, can combine with approval_status)
  const newOnlyCondition =
    params.newOnly === true
      ? sql`AND created_at >= (now() - interval '30 days')`
      : sql``;

  // Optional date range filter (from/to particular date)
  const fromDate = params.createdFrom?.trim();
  const toDate = params.createdTo?.trim();
  const dateFromCondition = fromDate ? sql`AND created_at >= (${fromDate}::date)` : sql``;
  const dateToCondition = toDate ? sql`AND created_at <= (${toDate}::date + interval '1 day')` : sql``;

  const rows = await sql<MerchantStoreRow[]>`
    SELECT id, store_id, parent_id, store_name, store_display_name, store_description, store_email,
           store_phones, full_address, landmark, city, state, postal_code, country, latitude, longitude,
           banner_url, gallery_images, cuisine_types, avg_preparation_time_minutes,
           min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
           area_manager_id, status, approval_status, approval_reason, approved_by, approved_at,
           rejected_reason, current_onboarding_step, onboarding_completed, onboarding_completed_at,
           is_active, is_accepting_orders, is_available, last_activity_at, deleted_at, deleted_by,
           delist_reason, delisted_at, store_type, operational_status, created_at, updated_at,
           created_by, updated_by
    FROM merchant_stores
    WHERE deleted_at IS NULL
    ${params.areaManagerId != null ? sql`AND area_manager_id = ${params.areaManagerId}` : sql``}
    ${filterCondition}
    ${cursorId != null ? sql`AND id < ${cursorId}` : sql``}
    ${statusCondition}
    ${storeStatusCondition}
    ${newOnlyCondition}
    ${dateFromCondition}
    ${dateToCondition}
    ${searchCondition}
    ORDER BY id DESC
    LIMIT ${limitVal}
  `;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? String(last.id) : null;
  return { items, nextCursor };
}

/**
 * Get one merchant_store by id scoped by area_manager_id.
 */
export async function getMerchantStoreById(
  id: number,
  areaManagerId: number | null
): Promise<(MerchantStoreRow & { parent?: MerchantParentRow }) | null> {
  const sql = getSql();
  const scope =
    areaManagerId != null
      ? await sql`
    SELECT id, store_id, parent_id, store_name, store_display_name, store_description, store_email,
           store_phones, full_address, landmark, city, state, postal_code, country, latitude, longitude,
           banner_url, gallery_images, cuisine_types, avg_preparation_time_minutes,           min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
           area_manager_id, status, approval_status, approval_reason, approved_by, approved_at,
           rejected_reason, current_onboarding_step, onboarding_completed, onboarding_completed_at,
           is_active, is_accepting_orders, is_available, last_activity_at, deleted_at, deleted_by,
           delist_reason, delisted_at, store_type, operational_status, created_at, updated_at,
           created_by, updated_by
    FROM merchant_stores
    WHERE id = ${id} AND deleted_at IS NULL AND area_manager_id = ${areaManagerId}
    LIMIT 1
  `
      : await sql`
    SELECT id, store_id, parent_id, store_name, store_display_name, store_description, store_email,
           store_phones, full_address, landmark, city, state, postal_code, country, latitude, longitude,
           banner_url, gallery_images, cuisine_types, avg_preparation_time_minutes,           min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
           area_manager_id, status, approval_status, approval_reason, approved_by, approved_at,
           rejected_reason, current_onboarding_step, onboarding_completed, onboarding_completed_at,
           is_active, is_accepting_orders, is_available, last_activity_at, deleted_at, deleted_by,
           delist_reason, delisted_at, store_type, operational_status, created_at, updated_at,
           created_by, updated_by
    FROM merchant_stores
    WHERE id = ${id} AND deleted_at IS NULL
    LIMIT 1
  `;
  const row = Array.isArray(scope) ? scope[0] : scope;
  if (!row) return null;
  const store = row as MerchantStoreRow;
  if (store.parent_id) {
    const parentRows = await sql`
      SELECT id, parent_merchant_id, parent_name, owner_name, registered_phone, city, approval_status
      FROM merchant_parents
      WHERE id = ${store.parent_id}
      LIMIT 1
    `;
    const parent = Array.isArray(parentRows) ? parentRows[0] : parentRows;
    return { ...store, parent: parent as MerchantParentRow };
  }
  return store;
}

/**
 * Get one child store by store_id (indexed lookup – use for instant search).
 * Returns null if not found or not a child (parent_id IS NOT NULL).
 */
export async function getChildStoreByStoreId(
  storeId: string,
  areaManagerId: number | null
): Promise<MerchantStoreRow | null> {
  const sql = getSql();
  const id = (storeId || "").trim().toUpperCase();
  if (!id) return null;
  const scope =
    areaManagerId != null
      ? await sql`
    SELECT id, store_id, parent_id, store_name, store_display_name, store_description, store_email,
           store_phones, full_address, landmark, city, state, postal_code, country, latitude, longitude,
           banner_url, gallery_images, cuisine_types, avg_preparation_time_minutes,
           min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
           area_manager_id, status, approval_status, approval_reason, approved_by, approved_at,
           rejected_reason, current_onboarding_step, onboarding_completed, onboarding_completed_at,
           is_active, is_accepting_orders, is_available, last_activity_at, deleted_at, deleted_by,
           delist_reason, delisted_at, store_type, operational_status, created_at, updated_at,
           created_by, updated_by
    FROM merchant_stores
    WHERE store_id = ${id} AND deleted_at IS NULL AND parent_id IS NOT NULL AND area_manager_id = ${areaManagerId}
    LIMIT 1
  `
      : await sql`
    SELECT id, store_id, parent_id, store_name, store_display_name, store_description, store_email,
           store_phones, full_address, landmark, city, state, postal_code, country, latitude, longitude,
           banner_url, gallery_images, cuisine_types, avg_preparation_time_minutes,
           min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
           area_manager_id, status, approval_status, approval_reason, approved_by, approved_at,
           rejected_reason, current_onboarding_step, onboarding_completed, onboarding_completed_at,
           is_active, is_accepting_orders, is_available, last_activity_at, deleted_at, deleted_by,
           delist_reason, delisted_at, store_type, operational_status, created_at, updated_at,
           created_by, updated_by
    FROM merchant_stores
    WHERE store_id = ${id} AND deleted_at IS NULL AND parent_id IS NOT NULL
    LIMIT 1
  `;
  const row = Array.isArray(scope) ? scope[0] : scope;
  return (row as MerchantStoreRow) ?? null;
}

/** True when search term looks like a store_id (alphanumeric, no spaces, 2–50 chars) for fast indexed lookup */
function looksLikeStoreId(term: string): boolean {
  const t = (term || "").trim();
  return t.length >= 2 && t.length <= 50 && /^[A-Za-z0-9_-]+$/.test(t);
}

/**
 * Lightweight store summary for order detail MX card (no area_manager scope).
 * Used when order is already loaded and we need store/parent/operating hours for display.
 */
export interface MerchantStoreSummaryForOrder {
  parentMerchantId: string | null;
  parentName: string | null;
  storeCode: string | null;
  internalStoreId: number | null;
  storeName: string | null;
  phones: string[] | null;
  is24Hours: boolean;
  schedule: Record<
    string,
    {
      open: boolean;
      slot1Start: string | null;
      slot1End: string | null;
      slot2Start: string | null;
      slot2End: string | null;
    }
  > | null;
  city: string | null;
  locality: string | null;
  fullAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  merchantType: string | null;
  assignedUserEmail: string | null;
  assignedUserDepartment: string | null;
}

function extractTime(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  if (s.includes("T")) {
    const [, timePart] = s.split("T");
    return timePart ? timePart.slice(0, 8) : s.slice(0, 8);
  }
  return s.slice(0, 8);
}

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export async function getMerchantStoreSummaryByStoreId(
  storeId: number
): Promise<MerchantStoreSummaryForOrder | null> {
  const sql = getSql();
  const storeRows = await sql`
    SELECT s.id, s.store_id, s.parent_id, s.store_name, s.store_display_name, s.store_phones,
           s.full_address, s.landmark, s.city, s.latitude, s.longitude, s.store_type, s.area_manager_id
    FROM merchant_stores s
    WHERE s.id = ${storeId} AND s.deleted_at IS NULL
    LIMIT 1
  `;
  const storeRow = Array.isArray(storeRows) ? storeRows[0] : storeRows;
  if (!storeRow) return null;
  const s = storeRow as {
    id: number;
    store_id: string | null;
    parent_id: number | null;
    store_name: string | null;
    store_display_name: string | null;
    store_phones: string[] | null;
    full_address: string | null;
    landmark: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    store_type: string | null;
    area_manager_id: number | null;
  };
  let assignedUserEmail: string | null = null;
  let assignedUserDepartment: string | null = null;
  if (s.area_manager_id != null) {
    try {
      const amRows = await sql`
        SELECT su.email
        FROM area_managers am
        JOIN system_users su ON su.id = am.user_id
        WHERE am.id = ${s.area_manager_id}
        LIMIT 1
      `;
      const amRow = Array.isArray(amRows) ? amRows[0] : amRows;
      if (amRow && (amRow as { email?: string | null }).email) {
        assignedUserEmail = (amRow as { email: string }).email;
        assignedUserDepartment = "Area Manager";
      }
    } catch {
      // ignore
    }
  }
  let parentMerchantId: string | null = null;
  let parentName: string | null = null;
  if (s.parent_id != null) {
    const parentRows = await sql`
      SELECT parent_merchant_id, parent_name FROM merchant_parents WHERE id = ${s.parent_id} LIMIT 1
    `;
    const p = Array.isArray(parentRows) ? parentRows[0] : parentRows;
    if (p) {
      parentMerchantId = (p as { parent_merchant_id?: string | null }).parent_merchant_id ?? null;
      parentName = (p as { parent_name?: string | null }).parent_name ?? null;
    }
  }
  const phones: string[] | null = Array.isArray(s.store_phones)
    ? s.store_phones
    : s.store_phones != null
      ? [s.store_phones]
      : null;
  let schedule: MerchantStoreSummaryForOrder["schedule"] = null;
  let is24Hours = false;
  try {
    const ohRows = await sql`
      SELECT store_id,
             monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end,
             tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end,
             wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end,
             thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end,
             friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end,
             saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end,
             sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end,
             is_24_hours
      FROM merchant_store_operating_hours
      WHERE store_id = ${storeId}
      LIMIT 1
    `;
    const oh = Array.isArray(ohRows) ? ohRows[0] : ohRows;
    if (oh) {
      const o = oh as Record<string, unknown>;
      is24Hours = Boolean(o.is_24_hours);
      schedule = {};
      for (const day of DAYS) {
        schedule[day] = {
          open: Boolean(o[`${day}_open`]),
          slot1Start: extractTime(o[`${day}_slot1_start`]),
          slot1End: extractTime(o[`${day}_slot1_end`]),
          slot2Start: extractTime(o[`${day}_slot2_start`]),
          slot2End: extractTime(o[`${day}_slot2_end`]),
        };
      }
    }
  } catch {
    // table may not exist or RLS
  }
  return {
    parentMerchantId,
    parentName,
    storeCode: s.store_id ?? null,
    internalStoreId: s.id,
    storeName: s.store_display_name ?? s.store_name ?? null,
    phones,
    is24Hours,
    schedule,
    city: s.city ?? null,
    locality: s.landmark ?? null,
    fullAddress: s.full_address ?? null,
    latitude: s.latitude ?? null,
    longitude: s.longitude ?? null,
    merchantType: s.store_type ?? null,
    assignedUserEmail,
    assignedUserDepartment,
  };
}

/**
 * Batch fetch store_id (actual store code from merchant_stores) by internal ids.
 * Returns a map of internal id -> store_id string for use in orders list.
 */
export async function getStoreIdsByInternalIds(
  internalIds: number[]
): Promise<Map<number, string>> {
  if (internalIds.length === 0) return new Map();
  const uniq = [...new Set(internalIds)].filter((n) => Number.isFinite(n));
  if (uniq.length === 0) return new Map();
  const sql = getSql();
  const rows = await sql`
    SELECT id, store_id
    FROM merchant_stores
    WHERE id = ANY(${uniq}) AND deleted_at IS NULL
  `;
  const list = Array.isArray(rows) ? rows : [rows];
  const map = new Map<number, string>();
  for (const r of list) {
    const row = r as { id: number; store_id: string | null };
    if (row?.store_id != null) map.set(Number(row.id), String(row.store_id));
  }
  return map;
}

/**
 * Get parent_merchant_id (e.g. GMMP1002) by merchant_parents.id.
 * Used for R2 key paths: docs/merchants/{parent_merchant_id}/stores/{store_id}/assets/...
 */
export async function getParentMerchantIdByParentId(
  parentId: number
): Promise<string | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT parent_merchant_id FROM merchant_parents WHERE id = ${parentId} LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row && typeof (row as { parent_merchant_id?: string }).parent_merchant_id === "string"
    ? (row as { parent_merchant_id: string }).parent_merchant_id
    : null;
}

/**
 * Get parent_name and parent_merchant_id by merchant_parents.id (for header/sidebar display).
 */
export async function getParentDetailsByParentId(
  parentId: number
): Promise<{ parent_name: string | null; parent_merchant_id: string | null }> {
  const sql = getSql();
  const rows = await sql`
    SELECT parent_name, parent_merchant_id FROM merchant_parents WHERE id = ${parentId} LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof row !== "object") return { parent_name: null, parent_merchant_id: null };
  const r = row as { parent_name?: string | null; parent_merchant_id?: string | null };
  return {
    parent_name: typeof r.parent_name === "string" ? r.parent_name : null,
    parent_merchant_id: typeof r.parent_merchant_id === "string" ? r.parent_merchant_id : null,
  };
}

/**
 * Generate next child store_id in GMMC1001, GMMC1002, ... format (same as partnersite).
 */
export async function getNextChildStoreId(): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    SELECT store_id FROM merchant_stores WHERE store_id ~ '^GMMC\\d+$' ORDER BY store_id DESC LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  const lastId = row && typeof (row as { store_id?: string }).store_id === "string" ? (row as { store_id: string }).store_id : null;
  let nextNum = 1001;
  if (lastId) {
    const match = lastId.match(/^GMMC(\d+)$/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `GMMC${nextNum}`;
}

export interface CreateMerchantStoreChildParams {
  parentId: number;
  storeId: string;
  storeName: string;
  ownerFullName?: string | null;
  storeDisplayName?: string | null;
  legalBusinessName?: string | null;
  storeType?: string | null;
  customStoreType?: string | null;
  storeEmail?: string | null;
  storePhones?: string[] | null;
  storeDescription?: string | null;
  areaManagerId: number | null;
  createdBy?: number | null;
}

/**
 * Insert a new child store (merchant_stores) with step-1 style fields. Address set to placeholder until step 2.
 */
export async function createMerchantStoreChild(
  params: CreateMerchantStoreChildParams
): Promise<{ id: number; store_id: string } | null> {
  const sql = getSql();
  const phones = Array.isArray(params.storePhones) ? params.storePhones.filter(Boolean) : [];
  const storeType = (params.storeType && String(params.storeType).trim()) || "RESTAURANT";
  const customStoreType =
    params.customStoreType && String(params.customStoreType).trim()
      ? String(params.customStoreType).trim()
      : null;
  const inserted = await sql`
    INSERT INTO merchant_stores (
      store_id, parent_id, store_name, owner_full_name, store_display_name, store_description, store_type, custom_store_type,
      store_email, store_phones, full_address, city, state, postal_code, country,
      area_manager_id, status, approval_status, current_onboarding_step, onboarding_completed,
      is_active, is_accepting_orders, is_available, created_by
    ) VALUES (
      ${params.storeId},
      ${params.parentId},
      ${params.storeName},
      ${params.ownerFullName?.trim() || null},
      ${params.storeDisplayName?.trim() || null},
      ${params.storeDescription?.trim() || null},
      ${storeType},
      ${customStoreType},
      ${params.storeEmail?.trim() || null},
      ${phones.length ? sql.array(phones) : null},
      'Pending',
      'Pending',
      'Pending',
      'Pending',
      'IN',
      ${params.areaManagerId},
      'INACTIVE',
      'DRAFT',
      1,
      false,
      false,
      false,
      false,
      ${params.createdBy ?? null}
    )
    RETURNING id, store_id
  `;
  const row = Array.isArray(inserted) ? inserted[0] : inserted;
  return row ? (row as { id: number; store_id: string }) : null;
}

/**
 * Get a single merchant_stores row by internal id only (no area_manager check).
 * Used by progress GET so "Complete registration" always loads data when store exists.
 */
export async function getMerchantStoreByIdOnly(
  storeInternalId: number
): Promise<{ id: number; parent_id: number; store_id: string; area_manager_id: number | null } | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, parent_id, store_id, area_manager_id
    FROM merchant_stores
    WHERE id = ${storeInternalId} AND deleted_at IS NULL
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? (row as { id: number; parent_id: number; store_id: string; area_manager_id: number | null }) : null;
}

/**
 * Get a single merchant_stores row by internal id; optionally restrict by area_manager_id.
 * When store.area_manager_id is null (e.g. created from partner app), allow any AM.
 * Used by progress POST so only assigned AM (or null) can save.
 */
export async function getMerchantStoreForProgress(
  storeInternalId: number,
  parentId: number,
  areaManagerId: number | null
): Promise<{ id: number; parent_id: number; store_id: string; area_manager_id: number | null } | null> {
  const store = await getMerchantStoreByIdOnly(storeInternalId);
  if (!store) return null;
  if (areaManagerId != null && store.area_manager_id != null && store.area_manager_id !== areaManagerId) return null;
  return store;
}

/** Step1 fields from merchant_stores for pre-filling add-child / progress form. */
export async function getMerchantStoreStep1Fields(
  storeInternalId: number
): Promise<{
  store_name: string | null;
  owner_full_name: string | null;
  store_display_name: string | null;
  store_description: string | null;
  store_email: string | null;
  store_phones: string[] | null;
  store_type: string | null;
  custom_store_type: string | null;
} | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT store_name, owner_full_name, store_display_name, store_description, store_email, store_phones, store_type, custom_store_type
    FROM merchant_stores
    WHERE id = ${storeInternalId} AND deleted_at IS NULL
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? (row as {
    store_name: string | null;
    owner_full_name: string | null;
    store_display_name: string | null;
    store_description: string | null;
    store_email: string | null;
    store_phones: string[] | null;
    store_type: string | null;
    custom_store_type: string | null;
  }) : null;
}

/**
 * Get child merchant_stores (same parent_id) for a given parent_id.
 */
export async function getChildMerchantStores(
  parentId: number,
  areaManagerId: number | null
): Promise<MerchantStoreRow[]> {
  const sql = getSql();
  const scope =
    areaManagerId != null
      ? await sql`
    SELECT id, store_id, parent_id, store_name, store_display_name, store_description, store_email,
           store_phones, full_address, landmark, city, state, postal_code, country, latitude, longitude,
           banner_url, gallery_images, cuisine_types, avg_preparation_time_minutes,
           min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
           area_manager_id, status, approval_status, approval_reason, approved_by, approved_at,
           rejected_reason, current_onboarding_step, onboarding_completed, onboarding_completed_at,
           is_active, is_accepting_orders, is_available, last_activity_at, deleted_at, deleted_by,
           delist_reason, delisted_at, store_type, operational_status, created_at, updated_at,
           created_by, updated_by
    FROM merchant_stores
    WHERE parent_id = ${parentId} AND deleted_at IS NULL AND area_manager_id = ${areaManagerId}
    ORDER BY created_at DESC
  `
      : await sql`
    SELECT id, store_id, parent_id, store_name, store_display_name, store_description, store_email,
           store_phones, full_address, landmark, city, state, postal_code, country, latitude, longitude,
           banner_url, gallery_images, cuisine_types, avg_preparation_time_minutes,
           min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
           area_manager_id, status, approval_status, approval_reason, approved_by, approved_at,
           rejected_reason, current_onboarding_step, onboarding_completed, onboarding_completed_at,
           is_active, is_accepting_orders, is_available, last_activity_at, deleted_at, deleted_by,
           delist_reason, delisted_at, store_type, operational_status, created_at, updated_at,
           created_by, updated_by
    FROM merchant_stores
    WHERE parent_id = ${parentId} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;
  return (Array.isArray(scope) ? scope : [scope]) as MerchantStoreRow[];
}

/**
 * Update merchant_store (approval_status for verify/reject, optional soft delete).
 */
export async function updateMerchantStore(
  id: number,
  areaManagerId: number | null,
  data: {
    approval_status?: "APPROVED" | "REJECTED" | "DRAFT" | "SUBMITTED" | "UNDER_VERIFICATION";
    approval_reason?: string | null;
    rejected_reason?: string | null;
    approved_by?: number | null;
    approved_at?: Date | null;
    store_name?: string;
    owner_full_name?: string | null;
    store_display_name?: string;
    store_description?: string | null;
    store_email?: string | null;
    store_phones?: string[] | null;
    store_type?: string | null;
    custom_store_type?: string | null;
    full_address?: string | null;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    banner_url?: string | null;
    gallery_images?: string[] | null;
    cuisine_types?: string[] | null;
    avg_preparation_time_minutes?: number | null;
    min_order_amount?: number | null;
    delivery_radius_km?: number | null;
    is_pure_veg?: boolean | null;
    accepts_online_payment?: boolean | null;
    accepts_cash?: boolean | null;
    is_active?: boolean | null;
    is_accepting_orders?: boolean | null;
    is_available?: boolean | null;
    deleted_at?: Date | null;
    onboarding_completed?: boolean | null;
    onboarding_completed_at?: Date | null;
  }
): Promise<MerchantStoreRow | null> {
  const sql = getSql();
  
  // Check if there are any fields to update
  const hasUpdates = Object.keys(data).some(key => data[key as keyof typeof data] !== undefined);
  if (!hasUpdates) {
    return getMerchantStoreById(id, areaManagerId);
  }

  // Build dynamic SET clause
  const setClauses: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];
  
  if (data.approval_status !== undefined) setClauses.push(sql`approval_status = ${data.approval_status}`);
  if (data.approval_reason !== undefined) setClauses.push(sql`approval_reason = ${data.approval_reason}`);
  if (data.rejected_reason !== undefined) setClauses.push(sql`rejected_reason = ${data.rejected_reason}`);
  if (data.approved_by !== undefined) setClauses.push(sql`approved_by = ${data.approved_by}`);
  if (data.approved_at !== undefined) setClauses.push(sql`approved_at = ${data.approved_at instanceof Date ? data.approved_at.toISOString() : data.approved_at}`);
  if (data.store_name !== undefined) setClauses.push(sql`store_name = ${data.store_name}`);
  if (data.owner_full_name !== undefined) setClauses.push(sql`owner_full_name = ${data.owner_full_name}`);
  if (data.store_display_name !== undefined) setClauses.push(sql`store_display_name = ${data.store_display_name}`);
  if (data.store_description !== undefined) setClauses.push(sql`store_description = ${data.store_description}`);
  if (data.store_email !== undefined) setClauses.push(sql`store_email = ${data.store_email}`);
  if (data.store_phones !== undefined) {
    setClauses.push(
      data.store_phones === null
        ? sql`store_phones = NULL`
        : sql`store_phones = ${sql.array(data.store_phones)}`
    );
  }  if (data.store_type !== undefined) setClauses.push(sql`store_type = ${data.store_type}`);
  if (data.custom_store_type !== undefined) setClauses.push(sql`custom_store_type = ${data.custom_store_type}`);
  if (data.full_address !== undefined) setClauses.push(sql`full_address = ${data.full_address}`);
  if (data.landmark !== undefined) setClauses.push(sql`landmark = ${data.landmark}`);
  if (data.city !== undefined) setClauses.push(sql`city = ${data.city}`);
  if (data.state !== undefined) setClauses.push(sql`state = ${data.state}`);
  if (data.postal_code !== undefined) setClauses.push(sql`postal_code = ${data.postal_code}`);
  if (data.country !== undefined) setClauses.push(sql`country = ${data.country}`);
  if (data.latitude !== undefined) setClauses.push(sql`latitude = ${data.latitude}`);
  if (data.longitude !== undefined) setClauses.push(sql`longitude = ${data.longitude}`);
  if (data.banner_url !== undefined) setClauses.push(sql`banner_url = ${data.banner_url}`);
  if (data.gallery_images !== undefined) {
    setClauses.push(
      data.gallery_images === null
        ? sql`gallery_images = NULL`
        : sql`gallery_images = ${sql.array(data.gallery_images)}`
    );
  }
  if (data.cuisine_types !== undefined) {
    setClauses.push(
      data.cuisine_types === null
        ? sql`cuisine_types = NULL`
        : sql`cuisine_types = ${sql.array(data.cuisine_types)}`
    );
  }  if (data.avg_preparation_time_minutes !== undefined) setClauses.push(sql`avg_preparation_time_minutes = ${data.avg_preparation_time_minutes}`);
  if (data.min_order_amount !== undefined) setClauses.push(sql`min_order_amount = ${data.min_order_amount}`);
  if (data.delivery_radius_km !== undefined) setClauses.push(sql`delivery_radius_km = ${data.delivery_radius_km}`);
  if (data.is_pure_veg !== undefined) setClauses.push(sql`is_pure_veg = ${data.is_pure_veg}`);
  if (data.accepts_online_payment !== undefined) setClauses.push(sql`accepts_online_payment = ${data.accepts_online_payment}`);
  if (data.accepts_cash !== undefined) setClauses.push(sql`accepts_cash = ${data.accepts_cash}`);
  if (data.is_active !== undefined) setClauses.push(sql`is_active = ${data.is_active}`);
  if (data.is_accepting_orders !== undefined) setClauses.push(sql`is_accepting_orders = ${data.is_accepting_orders}`);
  if (data.is_available !== undefined) setClauses.push(sql`is_available = ${data.is_available}`);
  if (data.deleted_at !== undefined) setClauses.push(sql`deleted_at = ${data.deleted_at instanceof Date ? data.deleted_at.toISOString() : data.deleted_at}`);
  if (data.onboarding_completed !== undefined) setClauses.push(sql`onboarding_completed = ${data.onboarding_completed}`);
  if (data.onboarding_completed_at !== undefined) setClauses.push(sql`onboarding_completed_at = ${data.onboarding_completed_at instanceof Date ? data.onboarding_completed_at.toISOString() : data.onboarding_completed_at}`);

  // Combine SET clauses
  const setClause = setClauses.reduce((acc, clause, idx) => {
    if (idx === 0) return clause;
    return sql`${acc}, ${clause}`;
  }, sql``);

  type Row = MerchantStoreRow;
  const whereClause = areaManagerId != null
    ? sql`id = ${id} AND deleted_at IS NULL AND area_manager_id = ${areaManagerId}`
    : sql`id = ${id} AND deleted_at IS NULL`;

  const result = await sql<Row[]>`
    UPDATE merchant_stores SET ${setClause}
    WHERE ${whereClause}
    RETURNING id, store_id, parent_id, store_name, store_display_name, store_description, store_email,
              store_phones, full_address, landmark, city, state, postal_code, country, latitude, longitude,
              banner_url, gallery_images, cuisine_types, avg_preparation_time_minutes,
              min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
              area_manager_id, status, approval_status, approval_reason, approved_by, approved_at,
              rejected_reason, current_onboarding_step, onboarding_completed, onboarding_completed_at,
              is_active, is_accepting_orders, is_available, last_activity_at, deleted_at, deleted_by,
              delist_reason, delisted_at, store_type, operational_status, created_at, updated_at,
              created_by, updated_by
  `;
  
  return (Array.isArray(result) ? result[0] : result) as Row | null;
}
