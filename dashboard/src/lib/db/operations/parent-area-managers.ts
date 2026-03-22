import { getSql } from "../client";

export interface ParentAreaManagerRow {
  id: number;
  parent_id: number;
  area_manager_id: number;
  store_id?: number | null;
  assigned_by: number | null;
  assigned_at: string | null;
}

export interface AssignedAreaManagerInfo {
  id: number;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
}

export interface ParentSearchResult {
  kind: "parent";
  parent_id: number;
  parent_merchant_id: string;
  parent_name: string;
  city: string | null;
  registered_phone: string | null;
  /** Count from parent_area_managers table */
  assigned_ams_count: number;
  /** One of the AMs assigned to this parent (from parent_area_managers) if any */
  parent_direct_am_id: number | null;
}

export interface ChildSearchResult {
  kind: "child";
  parent_id: number;
  store_internal_id: number;
  store_id: string;
  parent_merchant_id: string;
  store_name: string;
  city: string | null;
  /** Count from parent_area_managers for this parent */
  assigned_ams_count: number;
  /** Set if merchant_stores.area_manager_id is set (direct AM on store) */
  store_direct_am_id: number | null;
}

export type ParentOrChildSearchResult = ParentSearchResult | ChildSearchResult;

export interface ChildStoreWithAm {
  store_internal_id: number;
  store_id: string;
  store_name: string;
  city: string | null;
  /** From merchant_stores.area_manager_id (resolved to Area Manager user) */
  area_manager_id: number | null;
  area_manager_name: string | null;
  area_manager_email: string | null;
}

export interface ParentAreaManagerActivityItem {
  id: number;
  parent_id: number;
  store_id: number | null;
  area_manager_id: number;
  action: "ASSIGN" | "REMOVE";
  reason: string | null;
  acted_by: number | null;
  acted_at: string;
  area_manager_name: string | null;
  area_manager_email: string | null;
  actor_name: string | null;
  actor_email: string | null;
}

async function logParentAreaManagerActivity(params: {
  parentId: number;
  storeInternalId: number | null;
  areaManagerId: number;
  action: "ASSIGN" | "REMOVE";
  actedBy: number | null;
  reason?: string | null;
}): Promise<void> {
  const sql = getSql();
  const { parentId, storeInternalId, areaManagerId, action, actedBy, reason } = params;
  await sql`
    INSERT INTO parent_area_manager_activity (parent_id, store_id, area_manager_id, action, acted_by, reason)
    VALUES (${parentId}, ${storeInternalId}, ${areaManagerId}, ${action}, ${actedBy}, ${reason ?? null})
  `;
}

export async function assignAreaManagersToParent(params: {
  parentId: number;
  areaManagerIds: number[];
  assignedBy: number | null;
  storeInternalId?: number | null;
}): Promise<void> {
  const sql = getSql();
  const { parentId, areaManagerIds, assignedBy, storeInternalId } = params;
  if (!areaManagerIds.length) return;

  if (storeInternalId) {
    // Store-level assignment: replace existing assignments for this (parent, store)
    const existing = await sql`
      SELECT area_manager_id
      FROM parent_area_managers
      WHERE parent_id = ${parentId} AND store_id = ${storeInternalId}
    `;

    // Log removal for existing assignments being replaced
    const existingList = Array.isArray(existing) ? existing : [existing];
    for (const row of existingList) {
      if (!row) continue;
      const amId = Number((row as any).area_manager_id);
      if (!Number.isFinite(amId)) continue;
      await logParentAreaManagerActivity({
        parentId,
        storeInternalId,
        areaManagerId: amId,
        action: "REMOVE",
        actedBy: assignedBy ?? null,
        reason: "Replaced by new Area Manager assignment",
      });
    }

    await sql`
      DELETE FROM parent_area_managers
      WHERE parent_id = ${parentId} AND store_id = ${storeInternalId}
    `;

    for (const amId of areaManagerIds) {
      await sql`
        INSERT INTO parent_area_managers (parent_id, store_id, area_manager_id, assigned_by)
        VALUES (${parentId}, ${storeInternalId}, ${amId}, ${assignedBy})
        ON CONFLICT (parent_id, store_id, area_manager_id) DO NOTHING
      `;
      await logParentAreaManagerActivity({
        parentId,
        storeInternalId,
        areaManagerId: amId,
        action: "ASSIGN",
        actedBy: assignedBy ?? null,
      });
    }

    // Sync to merchant_stores: set area_manager_id for this specific store.
    const firstAmId = areaManagerIds[0];
    await sql`
      UPDATE merchant_stores
      SET area_manager_id = ${firstAmId}
      WHERE id = ${storeInternalId} AND parent_id = ${parentId}
    `;
  } else {
    // Parent-level assignment (no specific store) – keep legacy behaviour, scoped to store_id IS NULL.
    const existing = await sql`
      SELECT area_manager_id
      FROM parent_area_managers
      WHERE parent_id = ${parentId} AND store_id IS NULL
    `;

    const existingList = Array.isArray(existing) ? existing : [existing];
    for (const row of existingList) {
      if (!row) continue;
      const amId = Number((row as any).area_manager_id);
      if (!Number.isFinite(amId)) continue;
      await logParentAreaManagerActivity({
        parentId,
        storeInternalId: null,
        areaManagerId: amId,
        action: "REMOVE",
        actedBy: assignedBy ?? null,
        reason: "Replaced by new Area Manager assignment",
      });
    }

    await sql`
      DELETE FROM parent_area_managers
      WHERE parent_id = ${parentId} AND store_id IS NULL
    `;

    for (const amId of areaManagerIds) {
      await sql`
        INSERT INTO parent_area_managers (parent_id, store_id, area_manager_id, assigned_by)
        VALUES (${parentId}, NULL, ${amId}, ${assignedBy})
        ON CONFLICT (parent_id, store_id, area_manager_id) DO NOTHING
      `;
      await logParentAreaManagerActivity({
        parentId,
        storeInternalId: null,
        areaManagerId: amId,
        action: "ASSIGN",
        actedBy: assignedBy ?? null,
      });
    }

    const firstAmId = areaManagerIds[0];
    await sql`
      UPDATE merchant_stores
      SET area_manager_id = ${firstAmId}
      WHERE parent_id = ${parentId}
    `;
  }
}

export async function removeAreaManagerAssignment(params: {
  parentId: number;
  areaManagerId: number;
  storeInternalId?: number | null;
  removedBy: number | null;
  reason?: string | null;
}): Promise<void> {
  const sql = getSql();
  const { parentId, areaManagerId, storeInternalId, removedBy, reason } = params;

  if (storeInternalId) {
    await sql`
      DELETE FROM parent_area_managers
      WHERE parent_id = ${parentId}
        AND area_manager_id = ${areaManagerId}
        AND store_id = ${storeInternalId}
    `;

    await logParentAreaManagerActivity({
      parentId,
      storeInternalId,
      areaManagerId,
      action: "REMOVE",
      actedBy: removedBy ?? null,
      reason,
    });

    // Sync merchant_stores for this specific store: if any AM remains, set to first; else NULL.
    const remaining = await sql`
      SELECT area_manager_id
      FROM parent_area_managers
      WHERE parent_id = ${parentId} AND store_id = ${storeInternalId}
      LIMIT 1
    `;
    const nextAmId =
      Array.isArray(remaining) && remaining.length > 0
        ? (remaining[0] as { area_manager_id: number }).area_manager_id
        : null;
    await sql`
      UPDATE merchant_stores
      SET area_manager_id = ${nextAmId}
      WHERE id = ${storeInternalId} AND parent_id = ${parentId}
    `;
  } else {
    await sql`
      DELETE FROM parent_area_managers
      WHERE parent_id = ${parentId}
        AND area_manager_id = ${areaManagerId}
        AND store_id IS NULL
    `;

    await logParentAreaManagerActivity({
      parentId,
      storeInternalId: null,
      areaManagerId,
      action: "REMOVE",
      actedBy: removedBy ?? null,
      reason,
    });

    // Sync merchant_stores: if any parent-level AM remains, set stores to first remaining; else NULL.
    const remaining = await sql`
      SELECT area_manager_id
      FROM parent_area_managers
      WHERE parent_id = ${parentId} AND store_id IS NULL
      LIMIT 1
    `;
    const nextAmId =
      Array.isArray(remaining) && remaining.length > 0
        ? (remaining[0] as { area_manager_id: number }).area_manager_id
        : null;
    await sql`
      UPDATE merchant_stores
      SET area_manager_id = ${nextAmId}
      WHERE parent_id = ${parentId}
    `;
  }
}

/** List all Area Managers assigned to a parent or a specific store (from parent_area_managers only). */
export async function listAssignedAreaManagers(
  parentId: number,
  storeInternalId?: number | null
): Promise<AssignedAreaManagerInfo[]> {
  const sql = getSql();
  const rows =
    storeInternalId != null
      ? await sql`
          SELECT am.id,
                 su.full_name,
                 su.email,
                 su.mobile
          FROM parent_area_managers pam
          JOIN area_managers am ON am.id = pam.area_manager_id
          JOIN system_users su ON su.id = am.user_id
          WHERE pam.parent_id = ${parentId}
            AND (pam.store_id = ${storeInternalId} OR pam.store_id IS NULL)
          ORDER BY su.full_name NULLS LAST, su.email NULLS LAST
        `
      : await sql`
          SELECT am.id,
                 su.full_name,
                 su.email,
                 su.mobile
          FROM parent_area_managers pam
          JOIN area_managers am ON am.id = pam.area_manager_id
          JOIN system_users su ON su.id = am.user_id
          WHERE pam.parent_id = ${parentId}
            AND pam.store_id IS NULL
          ORDER BY su.full_name NULLS LAST, su.email NULLS LAST
        `;
  const list = Array.isArray(rows) ? rows : [rows];
  return list.filter(Boolean).map((r: any) => ({
    id: Number(r.id),
    full_name: r.full_name ?? null,
    email: r.email ?? null,
    mobile: r.mobile ?? null,
  }));
}

/**
 * Area managers linked to this store in `parent_area_managers` (rows where store_id matches).
 */
export async function listAreaManagersForStore(storeInternalId: number): Promise<AssignedAreaManagerInfo[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT am.id,
           su.full_name,
           su.email,
           su.mobile
    FROM parent_area_managers pam
    JOIN area_managers am ON am.id = pam.area_manager_id
    JOIN system_users su ON su.id = am.user_id
    WHERE pam.store_id = ${storeInternalId}
    ORDER BY pam.assigned_at DESC NULLS LAST, su.full_name NULLS LAST, su.email NULLS LAST
  `;
  const list = Array.isArray(rows) ? rows : [rows];
  return list.filter(Boolean).map((r: any) => ({
    id: Number(r.id),
    full_name: r.full_name ?? null,
    email: r.email ?? null,
    mobile: r.mobile ?? null,
  }));
}

/** Resolve system user profile for one area_managers.id (for fallback when store has area_manager_id). */
export async function getAreaManagerUserProfileById(
  areaManagerId: number
): Promise<AssignedAreaManagerInfo | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT am.id,
           su.full_name,
           su.email,
           su.mobile
    FROM area_managers am
    JOIN system_users su ON su.id = am.user_id
    WHERE am.id = ${areaManagerId}
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return {
    id: Number(r.id),
    full_name: (r.full_name as string) ?? null,
    email: (r.email as string) ?? null,
    mobile: (r.mobile as string) ?? null,
  };
}

/**
 * AMs from parent_area_managers for this store; if none, fall back to merchant_stores.area_manager_id.
 */
export async function resolveAssignedAreaManagersForStoreVerification(
  storeInternalId: number,
  storeAreaManagerId: number | null
): Promise<AssignedAreaManagerInfo[]> {
  const mapped = await listAreaManagersForStore(storeInternalId);
  if (mapped.length > 0) return mapped;
  if (storeAreaManagerId != null && Number.isFinite(storeAreaManagerId)) {
    const one = await getAreaManagerUserProfileById(Number(storeAreaManagerId));
    return one ? [one] : [];
  }
  return [];
}

export async function countDistinctAssignedAreaManagersForParent(parentId: number): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(DISTINCT area_manager_id)::integer AS assigned_ams_count
    FROM parent_area_managers
    WHERE parent_id = ${parentId}
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  return Number(row?.assigned_ams_count ?? 0);
}

export async function searchParentsAndStores(termRaw: string, limit = 20): Promise<ParentOrChildSearchResult[]> {
  const sql = getSql();
  const term = termRaw.trim();
  if (!term) return [];

  // Use a numeric ID only when term is all digits; otherwise 0 (ignored in WHERE)
  const numericId = /^\d+$/.test(term) ? Number(term) : 0;

  const rows = await sql`
    WITH am_counts AS (
      SELECT parent_id, COUNT(DISTINCT area_manager_id)::integer AS assigned_ams_count
      FROM parent_area_managers
      GROUP BY parent_id
    ),
    parents AS (
      SELECT
        'parent'::text AS kind,
        mp.id AS parent_id,
        mp.parent_merchant_id,
        mp.parent_name,
        mp.city,
        mp.registered_phone,
        COALESCE(ac.assigned_ams_count, 0) AS assigned_ams_count,
        (SELECT MIN(pam.area_manager_id) FROM parent_area_managers pam WHERE pam.parent_id = mp.id) AS parent_direct_am_id,
        NULL::bigint AS store_direct_am_id,
        NULL::bigint AS store_internal_id,
        NULL::text AS store_id,
        NULL::text AS store_name
      FROM merchant_parents mp
      LEFT JOIN am_counts ac ON ac.parent_id = mp.id
      WHERE
        (${numericId} > 0 AND mp.id = ${numericId})
        OR mp.parent_merchant_id ILIKE ${"%" + term + "%"}
        OR mp.parent_name ILIKE ${"%" + term + "%"}
    ),
    child_stores AS (
      SELECT
        'child'::text AS kind,
        ms.parent_id,
        mp.parent_merchant_id,
        NULL::text AS parent_name,
        ms.city,
        NULL::text AS registered_phone,
        COALESCE(ac.assigned_ams_count, 0) AS assigned_ams_count,
        NULL::bigint AS parent_direct_am_id,
        ms.area_manager_id AS store_direct_am_id,
        ms.id AS store_internal_id,
        ms.store_id,
        COALESCE(ms.store_display_name, ms.store_name) AS store_name
      FROM merchant_stores ms
      JOIN merchant_parents mp ON mp.id = ms.parent_id
      LEFT JOIN am_counts ac ON ac.parent_id = ms.parent_id
      WHERE
        (${numericId} > 0 AND (ms.id = ${numericId} OR ms.parent_id = ${numericId}))
        OR ms.store_id ILIKE ${"%" + term + "%"}
        OR COALESCE(ms.store_display_name, ms.store_name) ILIKE ${"%" + term + "%"}
    )
    SELECT *
    FROM (
      SELECT kind, parent_id, parent_merchant_id, parent_name, city, registered_phone, assigned_ams_count, parent_direct_am_id, store_direct_am_id, store_internal_id, store_id, store_name
      FROM parents
      UNION ALL
      SELECT kind, parent_id, parent_merchant_id, parent_name, city, registered_phone, assigned_ams_count, parent_direct_am_id, store_direct_am_id, store_internal_id, store_id, store_name
      FROM child_stores
    ) t
    ORDER BY kind, parent_id
    LIMIT ${limit}
  `;

  const list = Array.isArray(rows) ? rows : [rows];
  return list.filter(Boolean).map((r: any) => {
    if (r.kind === "parent") {
      return {
        kind: "parent" as const,
        parent_id: Number(r.parent_id),
        parent_merchant_id: String(r.parent_merchant_id),
        parent_name: r.parent_name as string,
        city: r.city ?? null,
        registered_phone: r.registered_phone ?? null,
        assigned_ams_count: Number(r.assigned_ams_count ?? 0),
        parent_direct_am_id: r.parent_direct_am_id != null ? Number(r.parent_direct_am_id) : null,
      };
    }
    return {
      kind: "child" as const,
      parent_id: Number(r.parent_id),
      store_internal_id: Number(r.store_internal_id),
      store_id: String(r.store_id),
      parent_merchant_id: String(r.parent_merchant_id),
      store_name: r.store_name as string,
      city: r.city ?? null,
      assigned_ams_count: Number(r.assigned_ams_count ?? 0),
      store_direct_am_id: r.store_direct_am_id != null ? Number(r.store_direct_am_id) : null,
    };
  });
}

export async function listChildStoresWithAssignedAm(parentId: number): Promise<ChildStoreWithAm[]> {
  const sql = getSql();
  const rows = await sql`
    WITH effective_am AS (
      SELECT
        ms.id AS store_internal_id,
        ms.store_id,
        COALESCE(ms.store_display_name, ms.store_name) AS store_name,
        ms.city,
        COALESCE(
          ms.area_manager_id,
          (
            SELECT pam.area_manager_id
            FROM parent_area_managers pam
            WHERE pam.parent_id = ms.parent_id
              AND (pam.store_id = ms.id OR pam.store_id IS NULL)
            ORDER BY pam.store_id IS NULL, pam.id
            LIMIT 1
          )
        ) AS effective_area_manager_id
      FROM merchant_stores ms
      WHERE ms.parent_id = ${parentId} AND ms.deleted_at IS NULL
    )
    SELECT
      e.store_internal_id,
      e.store_id,
      e.store_name,
      e.city,
      e.effective_area_manager_id AS area_manager_id,
      su.full_name AS area_manager_name,
      su.email AS area_manager_email
    FROM effective_am e
    LEFT JOIN area_managers am ON am.id = e.effective_area_manager_id
    LEFT JOIN system_users su ON su.id = am.user_id
    ORDER BY e.store_internal_id DESC
  `;
  const list = Array.isArray(rows) ? rows : [rows];
  return list
    .filter(Boolean)
    .map((r: any) => ({
      store_internal_id: Number(r.store_internal_id),
      store_id: String(r.store_id),
      store_name: (r.store_name as string) ?? "",
      city: r.city ?? null,
      area_manager_id: r.area_manager_id != null ? Number(r.area_manager_id) : null,
      area_manager_name: (r.area_manager_name as string) ?? null,
      area_manager_email: (r.area_manager_email as string) ?? null,
    }));
}

export async function listParentAreaManagerActivity(
  parentId: number,
  storeInternalId?: number | null,
  limit = 50
): Promise<ParentAreaManagerActivityItem[]> {
  const sql = getSql();
  const rows =
    storeInternalId != null
      ? await sql`
          SELECT
            a.id,
            a.parent_id,
            a.store_id,
            a.area_manager_id,
            a.action,
            a.reason,
            a.acted_by,
            a.acted_at,
            am_su.full_name AS area_manager_name,
            am_su.email AS area_manager_email,
            actor_su.full_name AS actor_name,
            actor_su.email AS actor_email
          FROM parent_area_manager_activity a
          LEFT JOIN area_managers am ON am.id = a.area_manager_id
          LEFT JOIN system_users am_su ON am_su.id = am.user_id
          LEFT JOIN system_users actor_su ON actor_su.id = a.acted_by
          WHERE a.parent_id = ${parentId}
            AND a.store_id = ${storeInternalId}
          ORDER BY a.acted_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT
            a.id,
            a.parent_id,
            a.store_id,
            a.area_manager_id,
            a.action,
            a.reason,
            a.acted_by,
            a.acted_at,
            am_su.full_name AS area_manager_name,
            am_su.email AS area_manager_email,
            actor_su.full_name AS actor_name,
            actor_su.email AS actor_email
          FROM parent_area_manager_activity a
          LEFT JOIN area_managers am ON am.id = a.area_manager_id
          LEFT JOIN system_users am_su ON am_su.id = am.user_id
          LEFT JOIN system_users actor_su ON actor_su.id = a.acted_by
          WHERE a.parent_id = ${parentId}
            AND a.store_id IS NULL
          ORDER BY a.acted_at DESC
          LIMIT ${limit}
        `;

  const list = Array.isArray(rows) ? rows : [rows];
  return list.filter(Boolean).map((r: any) => ({
    id: Number(r.id),
    parent_id: Number(r.parent_id),
    store_id: r.store_id != null ? Number(r.store_id) : null,
    area_manager_id: Number(r.area_manager_id),
    action: r.action as "ASSIGN" | "REMOVE",
    reason: r.reason ?? null,
    acted_by: r.acted_by != null ? Number(r.acted_by) : null,
    acted_at: String(r.acted_at),
    area_manager_name: (r.area_manager_name as string) ?? null,
    area_manager_email: (r.area_manager_email as string) ?? null,
    actor_name: (r.actor_name as string) ?? null,
    actor_email: (r.actor_email as string) ?? null,
  }));
}

