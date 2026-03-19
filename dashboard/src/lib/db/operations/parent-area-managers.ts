import { getSql } from "../client";

export interface ParentAreaManagerRow {
  id: number;
  parent_id: number;
  area_manager_id: number;
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

export async function assignAreaManagersToParent(params: {
  parentId: number;
  areaManagerIds: number[];
  assignedBy: number | null;
}): Promise<void> {
  const sql = getSql();
  const { parentId, areaManagerIds, assignedBy } = params;
  if (!areaManagerIds.length) return;

  // Replace existing assignments for this parent with the provided list
  await sql`
    DELETE FROM parent_area_managers
    WHERE parent_id = ${parentId}
  `;

  for (const amId of areaManagerIds) {
    await sql`
      INSERT INTO parent_area_managers (parent_id, area_manager_id, assigned_by)
      VALUES (${parentId}, ${amId}, ${assignedBy})
      ON CONFLICT (parent_id, area_manager_id) DO NOTHING
    `;
  }

  // Sync to merchant_stores: set area_manager_id for all child stores under this parent
  // so that store-level views and reports show the assigned AM (use first assigned AM as primary).
  const firstAmId = areaManagerIds[0];
  await sql`
    UPDATE merchant_stores
    SET area_manager_id = ${firstAmId}
    WHERE parent_id = ${parentId}
  `;
}

export async function removeAreaManagerAssignment(params: {
  parentId: number;
  areaManagerId: number;
}): Promise<void> {
  const sql = getSql();
  const { parentId, areaManagerId } = params;
  await sql`
    DELETE FROM parent_area_managers
    WHERE parent_id = ${parentId} AND area_manager_id = ${areaManagerId}
  `;

  // Sync merchant_stores: if any AM remains for this parent, set stores to first remaining; else NULL.
  const remaining = await sql`
    SELECT area_manager_id FROM parent_area_managers WHERE parent_id = ${parentId} LIMIT 1
  `;
  const nextAmId = Array.isArray(remaining) && remaining.length > 0 ? (remaining[0] as { area_manager_id: number }).area_manager_id : null;
  await sql`
    UPDATE merchant_stores
    SET area_manager_id = ${nextAmId}
    WHERE parent_id = ${parentId}
  `;
}

/** List all Area Managers assigned to a parent (from parent_area_managers only). */
export async function listAssignedAreaManagers(parentId: number): Promise<AssignedAreaManagerInfo[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT am.id,
           su.full_name,
           su.email,
           su.mobile
    FROM parent_area_managers pam
    JOIN area_managers am ON am.id = pam.area_manager_id
    JOIN system_users su ON su.id = am.user_id
    WHERE pam.parent_id = ${parentId}
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

export async function searchParentsAndStores(termRaw: string, limit = 20): Promise<ParentOrChildSearchResult[]> {
  const sql = getSql();
  const term = termRaw.trim();
  if (!term) return [];

  // Use a numeric ID only when term is all digits; otherwise 0 (ignored in WHERE)
  const numericId = /^\d+$/.test(term) ? Number(term) : 0;

  const rows = await sql`
    WITH am_counts AS (
      SELECT parent_id, COUNT(*)::integer AS assigned_ams_count
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
    SELECT
      ms.id AS store_internal_id,
      ms.store_id,
      COALESCE(ms.store_display_name, ms.store_name) AS store_name,
      ms.city,
      ms.area_manager_id,
      su.full_name AS area_manager_name,
      su.email AS area_manager_email
    FROM merchant_stores ms
    LEFT JOIN area_managers am ON am.id = ms.area_manager_id
    LEFT JOIN system_users su ON su.id = am.user_id
    WHERE ms.parent_id = ${parentId} AND ms.deleted_at IS NULL
    ORDER BY ms.created_at DESC
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

