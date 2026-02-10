/**
 * Area Manager: operations on merchant_stores and merchant_parents (raw SQL).
 * Use these when the DB has merchant_stores/merchant_parents with area_manager_id.
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
  logo_url: string | null;
  banner_url: string | null;
  gallery_images: string[] | null;
  cuisine_types: string[] | null;
  food_categories: string[] | null;
  avg_preparation_time_minutes: number | null;
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

export interface MerchantParentRow {
  id: number;
  parent_merchant_id: string;
  parent_name: string;
  area_manager_id: number | null;
  created_by_name: string | null;
  owner_name: string | null;
  registered_phone: string | null;
  city: string | null;
  approval_status: string;
}

/**
 * Count merchant_parents by area_manager_id.
 */
export async function countMerchantParents(
  areaManagerId: number | null
): Promise<number> {
  const sql = getSql();
  const result =
    areaManagerId != null
      ? await sql`
    SELECT count(*)::int AS total
    FROM merchant_parents
    WHERE area_manager_id = ${areaManagerId}
  `
      : await sql`
    SELECT count(*)::int AS total
    FROM merchant_parents
  `;
  const row = Array.isArray(result) ? result[0] : result;
  return Number(row?.total ?? 0);
}

/**
 * Count child stores (stores with parent_id) by area_manager_id.
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
 * Count merchant_stores by area_manager_id and by approval_status/status for dashboard metrics.
 */
export async function countMerchantStoresByStatus(
  areaManagerId: number | null
): Promise<{
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  active: number;
}> {
  const sql = getSql();
  const scope =
    areaManagerId != null
      ? await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE approval_status = 'APPROVED')::int AS verified,
      count(*) FILTER (WHERE approval_status IN ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION'))::int AS pending,
      count(*) FILTER (WHERE approval_status = 'REJECTED')::int AS rejected,
      count(*) FILTER (WHERE is_active = true AND status = 'ACTIVE')::int AS active
    FROM merchant_stores
    WHERE deleted_at IS NULL AND area_manager_id = ${areaManagerId}
  `
      : await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE approval_status = 'APPROVED')::int AS verified,
      count(*) FILTER (WHERE approval_status IN ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION'))::int AS pending,
      count(*) FILTER (WHERE approval_status = 'REJECTED')::int AS rejected,
      count(*) FILTER (WHERE is_active = true AND status = 'ACTIVE')::int AS active
    FROM merchant_stores
    WHERE deleted_at IS NULL
  `;
  const row = Array.isArray(scope) ? scope[0] : scope;
  return {
    total: Number(row?.total ?? 0),
    verified: Number(row?.verified ?? 0),
    pending: Number(row?.pending ?? 0),
    rejected: Number(row?.rejected ?? 0),
    active: Number(row?.active ?? 0),
  };
}

/**
 * List merchant_parents (parent stores) by area_manager_id.
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
  const search = params.search?.trim() ? `%${params.search.trim()}%` : null;

  // Build approval_status filter condition for parent stores
  // parent_approval_status enum: 'APPROVED', 'REJECTED', 'BLOCKED', 'SUSPENDED'
  let statusCondition = sql``;
  if (params.approval_status) {
    if (params.approval_status === "APPROVED") {
      // VERIFIED = APPROVED
      statusCondition = sql`AND approval_status = 'APPROVED'`;
    } else if (params.approval_status === "REJECTED") {
      // REJECTED = REJECTED, BLOCKED, SUSPENDED
      statusCondition = sql`AND approval_status IN ('REJECTED', 'BLOCKED', 'SUSPENDED')`;
    }
    // PENDING doesn't apply to parent stores (they don't have pending status)
  }

  const rows = await sql<MerchantParentRow[]>`
    SELECT id, parent_merchant_id, parent_name, area_manager_id, created_by_name, owner_name, registered_phone, city, approval_status
    FROM merchant_parents
    WHERE area_manager_id ${params.areaManagerId != null ? sql`= ${params.areaManagerId}` : sql`IS NOT NULL`}
    ${statusCondition}
    ${cursorId != null ? sql`AND id < ${cursorId}` : sql``}
    ${search ? sql`AND (parent_name ILIKE ${search} OR parent_merchant_id ILIKE ${search})` : sql``}
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
 * List merchant_stores for area manager with optional parent info (parent_id -> merchant_parents).
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
}): Promise<{ items: MerchantStoreRow[]; nextCursor: string | null }> {
  const sql = getSql();
  const limit = Math.min(params.limit || 20, 100);
  const limitVal = limit + 1;
  const cursorId = params.cursor ? parseInt(params.cursor, 10) : null;
  const search = params.search?.trim() ? `%${params.search.trim()}%` : null;

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
    if (params.approval_status === "SUBMITTED") {
      // PENDING includes DRAFT, SUBMITTED, and UNDER_VERIFICATION
      statusCondition = sql`AND approval_status IN ('DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION')`;
    } else {
      // For APPROVED or REJECTED, use exact match
      statusCondition = sql`AND approval_status = ${params.approval_status}`;
    }
  }

  const rows = await sql<MerchantStoreRow[]>`
    SELECT id, store_id, parent_id, store_name, store_display_name, store_description, store_email,
           store_phones, full_address, landmark, city, state, postal_code, country, latitude, longitude,
           logo_url, banner_url, gallery_images, cuisine_types, food_categories, avg_preparation_time_minutes,
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
    ${search ? sql`AND (store_name ILIKE ${search} OR store_id ILIKE ${search})` : sql``}
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
           logo_url, banner_url, gallery_images, cuisine_types, food_categories, avg_preparation_time_minutes,
           min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
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
           logo_url, banner_url, gallery_images, cuisine_types, food_categories, avg_preparation_time_minutes,
           min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
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
      SELECT id, parent_merchant_id, parent_name, area_manager_id, created_by_name, owner_name, registered_phone, city, approval_status
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
           logo_url, banner_url, gallery_images, cuisine_types, food_categories, avg_preparation_time_minutes,
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
           logo_url, banner_url, gallery_images, cuisine_types, food_categories, avg_preparation_time_minutes,
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
    store_display_name?: string;
    store_description?: string | null;
    store_email?: string | null;
    store_phones?: string[] | null;
    full_address?: string | null;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    latitude?: number | null;
    longitude?: number | null;
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
  if (data.store_display_name !== undefined) setClauses.push(sql`store_display_name = ${data.store_display_name}`);
  if (data.store_description !== undefined) setClauses.push(sql`store_description = ${data.store_description}`);
  if (data.store_email !== undefined) setClauses.push(sql`store_email = ${data.store_email}`);
  if (data.store_phones !== undefined) setClauses.push(sql`store_phones = ${sql.array(data.store_phones)}`);
  if (data.full_address !== undefined) setClauses.push(sql`full_address = ${data.full_address}`);
  if (data.landmark !== undefined) setClauses.push(sql`landmark = ${data.landmark}`);
  if (data.city !== undefined) setClauses.push(sql`city = ${data.city}`);
  if (data.state !== undefined) setClauses.push(sql`state = ${data.state}`);
  if (data.postal_code !== undefined) setClauses.push(sql`postal_code = ${data.postal_code}`);
  if (data.latitude !== undefined) setClauses.push(sql`latitude = ${data.latitude}`);
  if (data.longitude !== undefined) setClauses.push(sql`longitude = ${data.longitude}`);
  if (data.avg_preparation_time_minutes !== undefined) setClauses.push(sql`avg_preparation_time_minutes = ${data.avg_preparation_time_minutes}`);
  if (data.min_order_amount !== undefined) setClauses.push(sql`min_order_amount = ${data.min_order_amount}`);
  if (data.delivery_radius_km !== undefined) setClauses.push(sql`delivery_radius_km = ${data.delivery_radius_km}`);
  if (data.is_pure_veg !== undefined) setClauses.push(sql`is_pure_veg = ${data.is_pure_veg}`);
  if (data.accepts_online_payment !== undefined) setClauses.push(sql`accepts_online_payment = ${data.accepts_online_payment}`);
  if (data.accepts_cash !== undefined) setClauses.push(sql`accepts_cash = ${data.accepts_cash}`);
  if (data.is_active !== undefined) setClauses.push(sql`is_active = ${data.is_active}`);
  if (data.is_accepting_orders !== undefined) setClauses.push(sql`is_accepting_orders = ${data.is_accepting_orders}`);
  if (data.is_available !== undefined) setClauses.push(sql`is_available = ${data.is_available}`);
  if (data.deleted_at !== undefined) setClauses.push(sql`deleted_at = ${data.deleted_at}`);

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
              logo_url, banner_url, gallery_images, cuisine_types, food_categories, avg_preparation_time_minutes,
              min_order_amount, delivery_radius_km, is_pure_veg, accepts_online_payment, accepts_cash,
              area_manager_id, status, approval_status, approval_reason, approved_by, approved_at,
              rejected_reason, current_onboarding_step, onboarding_completed, onboarding_completed_at,
              is_active, is_accepting_orders, is_available, last_activity_at, deleted_at, deleted_by,
              delist_reason, delisted_at, store_type, operational_status, created_at, updated_at,
              created_by, updated_by
  `;
  
  return (Array.isArray(result) ? result[0] : result) as Row | null;
}
