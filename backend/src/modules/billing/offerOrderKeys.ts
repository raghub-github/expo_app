/**
 * Match platform-offer / flash-sale ledger rows to an order.
 *
 * Placement stores orders_core.id on `order_id` and the public GM… id on
 * `order_id_text`. Cancel/refund often passes GM… / GMF… strings. Never treat
 * digits stripped from those public ids as the core PK (GM100049 → 100049).
 */

import { eq, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ordersCore } from "../../db/schema.js";

export type OfferOrderKeys = {
  pks: number[];
  texts: string[];
};

/** Pure integer PK only — GM100049 / GMF100049 must not become 100049. */
export function parseOfferOrderNumericPk(
  orderId: string | number | null | undefined
): number | null {
  if (orderId == null) return null;
  if (typeof orderId === "number") {
    return Number.isFinite(orderId) && orderId > 0 ? Math.floor(orderId) : null;
  }
  const s = String(orderId).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function seedOfferOrderKeys(
  orderId: string | number | null | undefined,
  orderPkHint?: number | null
): OfferOrderKeys {
  const pks = new Set<number>();
  const texts = new Set<string>();
  const hint =
    orderPkHint != null && Number.isFinite(orderPkHint) && orderPkHint > 0
      ? Math.floor(orderPkHint)
      : null;
  if (hint) pks.add(hint);
  const direct = parseOfferOrderNumericPk(orderId);
  if (direct) pks.add(direct);
  const text = String(orderId ?? "").trim();
  if (text) texts.add(text);
  return { pks: [...pks], texts: [...texts] };
}

export async function resolveOfferOrderKeys(
  db: PostgresJsDatabase<Record<string, unknown>>,
  orderId: string | number | null | undefined,
  orderPkHint?: number | null
): Promise<OfferOrderKeys> {
  const keys = seedOfferOrderKeys(orderId, orderPkHint);
  const text = String(orderId ?? "").trim();
  const conds: SQL[] = [];
  for (const pk of keys.pks) conds.push(eq(ordersCore.id, pk));
  if (text) {
    conds.push(eq(ordersCore.orderId, text));
    conds.push(eq(ordersCore.formattedOrderId, text));
  }
  if (conds.length === 0) return keys;

  try {
    const rows = await db
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
      })
      .from(ordersCore)
      .where(or(...conds))
      .limit(5);
    for (const r of rows) {
      const id = Number(r.id);
      if (Number.isFinite(id) && id > 0) keys.pks.push(id);
      const oid = String(r.orderId ?? "").trim();
      if (oid) keys.texts.push(oid);
      const fmt = String(r.formattedOrderId ?? "").trim();
      if (fmt) keys.texts.push(fmt);
    }
  } catch {
    /* lookup is best-effort — seeded keys still match order_id_text */
  }

  return {
    pks: [...new Set(keys.pks)],
    texts: [...new Set(keys.texts)],
  };
}

export function offerLedgerOrderPredicate(
  orderIdCol: Column,
  orderIdTextCol: Column,
  keys: OfferOrderKeys
): SQL {
  const clauses: SQL[] = [];
  if (keys.pks.length === 1) clauses.push(eq(orderIdCol, keys.pks[0]!));
  else if (keys.pks.length > 1) clauses.push(inArray(orderIdCol, keys.pks));
  if (keys.texts.length === 1) clauses.push(eq(orderIdTextCol, keys.texts[0]!));
  else if (keys.texts.length > 1) clauses.push(inArray(orderIdTextCol, keys.texts));
  if (clauses.length === 0) return sql`false`;
  if (clauses.length === 1) return clauses[0]!;
  return or(...clauses)!;
}
