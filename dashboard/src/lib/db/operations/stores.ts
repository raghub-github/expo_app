/**
 * Database operations for stores (area manager merchant flow).
 * All queries must be scoped by area_manager_id when not super admin.
 */

import { getDb } from "../client";
import { stores } from "../schema";
import {
  eq,
  and,
  isNull,
  or,
  ilike,
  desc,
  sql,
  type SQL,
} from "drizzle-orm";

export interface CreateStoreData {
  storeId: string;
  name: string;
  ownerPhone: string;
  areaManagerId: number;
  parentStoreId?: number | null;
  status?: "VERIFIED" | "PENDING" | "REJECTED";
  localityCode?: string | null;
  areaCode?: string | null;
  createdBy?: number | null;
}

export interface UpdateStoreData {
  name?: string;
  ownerPhone?: string;
  status?: "VERIFIED" | "PENDING" | "REJECTED";
  localityCode?: string | null;
  areaCode?: string | null;
  updatedBy?: number | null;
  deletedAt?: Date | null;
  deletedBy?: number | null;
}

export interface ListStoresParams {
  areaManagerId: number | null; // null = super admin (no scope)
  status?: "VERIFIED" | "PENDING" | "REJECTED";
  search?: string;
  limit: number;
  cursor?: string; // "id:createdAt" for cursor pagination
}

export interface StoreRow {
  id: number;
  storeId: string;
  name: string;
  ownerPhone: string;
  areaManagerId: number;
  parentStoreId: number | null;
  status: string;
  localityCode: string | null;
  areaCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a store
 */
export async function createStore(data: CreateStoreData) {
  const db = getDb();
  const [row] = await db
    .insert(stores)
    .values({
      storeId: data.storeId,
      name: data.name,
      ownerPhone: data.ownerPhone,
      areaManagerId: data.areaManagerId,
      parentStoreId: data.parentStoreId ?? null,
      status: data.status ?? "PENDING",
      localityCode: data.localityCode ?? null,
      areaCode: data.areaCode ?? null,
      createdBy: data.createdBy ?? null,
    })
    .returning();
  return row;
}

/**
 * Get store by id; optionally scope by area_manager_id (null = no scope)
 */
export async function getStoreById(
  id: number,
  areaManagerId: number | null
): Promise<StoreRow | null> {
  const db = getDb();
  const conditions = [eq(stores.id, id), isNull(stores.deletedAt)];
  if (areaManagerId !== null) {
    conditions.push(eq(stores.areaManagerId, areaManagerId));
  }
  const [row] = await db
    .select()
    .from(stores)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

/**
 * List stores with cursor pagination and optional parent-store expansion.
 * When search matches a parent store, include that parent and all its children.
 */
export async function listStores(params: ListStoresParams): Promise<{
  items: StoreRow[];
  nextCursor: string | null;
}> {
  const db = getDb();
  const limit = Math.min(params.limit || 20, 100);
  const conditions: SQL[] = [isNull(stores.deletedAt)];

  if (params.areaManagerId !== null) {
    conditions.push(eq(stores.areaManagerId, params.areaManagerId));
  }
  if (params.status) {
    conditions.push(eq(stores.status, params.status));
  }
  if (params.search?.trim()) {
    const term = `%${params.search.trim()}%`;
    conditions.push(
      or(
        ilike(stores.name, term),
        ilike(stores.ownerPhone, term),
        ilike(stores.storeId, term)
      )!
    );
  }

  const baseWhere = and(...conditions);
  let whereClause: SQL | undefined = baseWhere;
  if (params.cursor) {
    const cursorId = parseInt(params.cursor, 10);
    if (!isNaN(cursorId)) {
      whereClause = and(baseWhere, sql`${stores.id} < ${cursorId}`);
    }
  }

  const items = await db
    .select()
    .from(stores)
    .where(whereClause)
    .orderBy(desc(stores.id))
    .limit(limit + 1);

  const hasMore = items.length > limit;
  const result = hasMore ? items.slice(0, limit) : items;
  const last = result[result.length - 1];
  const nextCursor = hasMore && last ? String(last.id) : null;

  return {
    items: result as StoreRow[],
    nextCursor,
  };
}

/**
 * Get store by id for read-only use (e.g. availability by-store); no area_manager scope
 */
export async function getStoreByIdForAvailability(id: number): Promise<StoreRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, id), isNull(stores.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Get store by store_id (external id) scoped by area manager
 */
export async function getStoreByStoreId(
  storeId: string,
  areaManagerId: number | null
): Promise<StoreRow | null> {
  const db = getDb();
  const conditions = [eq(stores.storeId, storeId), isNull(stores.deletedAt)];
  if (areaManagerId !== null) {
    conditions.push(eq(stores.areaManagerId, areaManagerId));
  }
  const [row] = await db
    .select()
    .from(stores)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

/**
 * Get child stores for a parent store id
 */
export async function getChildStores(parentStoreId: number): Promise<StoreRow[]> {
  const db = getDb();
  return db
    .select()
    .from(stores)
    .where(
      and(eq(stores.parentStoreId, parentStoreId), isNull(stores.deletedAt))
    )
    .orderBy(desc(stores.createdAt)) as Promise<StoreRow[]>;
}

/**
 * Update store
 */
export async function updateStore(
  id: number,
  areaManagerId: number | null,
  data: UpdateStoreData
) {
  const db = getDb();
  const conditions = [eq(stores.id, id), isNull(stores.deletedAt)];
  if (areaManagerId !== null) {
    conditions.push(eq(stores.areaManagerId, areaManagerId));
  }
  const [row] = await db
    .update(stores)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning();
  return row ?? null;
}

/**
 * Count stores by status for an area manager
 */
export async function countStoresByStatus(
  areaManagerId: number | null
): Promise<{ total: number; verified: number; pending: number; rejected: number }> {
  const db = getDb();
  const baseWhere = isNull(stores.deletedAt);
  const scopeWhere =
    areaManagerId !== null
      ? and(baseWhere, eq(stores.areaManagerId, areaManagerId))
      : baseWhere;

  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stores)
    .where(scopeWhere);

  const [verified] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stores)
    .where(and(scopeWhere, eq(stores.status, "VERIFIED")));

  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stores)
    .where(and(scopeWhere, eq(stores.status, "PENDING")));

  const [rejected] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stores)
    .where(and(scopeWhere, eq(stores.status, "REJECTED")));

  return {
    total: total?.count ?? 0,
    verified: verified?.count ?? 0,
    pending: pending?.count ?? 0,
    rejected: rejected?.count ?? 0,
  };
}
