import { ordersCore, ordersFood, walletLedger } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { formatRiderOrderDisplayId } from "@/lib/riders/format-rider-order-display-id";

type Db = ReturnType<typeof getDb>;

function pickPublicId(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const t = typeof c === "string" ? c.trim() : "";
    if (!t) continue;
    // Prefer real public IDs (GMF… / GMP…) over bare numeric PKs.
    if (!/^\d+$/.test(t)) return t;
  }
  for (const c of candidates) {
    const t = typeof c === "string" ? c.trim() : "";
    if (t) return t;
  }
  return null;
}

function isBareNumericId(value: string | null | undefined, coreId: number): boolean {
  if (value == null) return true;
  const t = value.trim();
  if (!t) return true;
  return /^\d+$/.test(t) && Number(t) === coreId;
}

/**
 * Batch-resolve formatted public order IDs for rider_penalties.order_id.
 * That column usually stores orders_core.id; food public IDs often live on
 * orders_food.formatted_order_id when orders_core.formatted_order_id is empty.
 * Falls back to wallet_ledger.metadata.orderPublicId for older penalty rows.
 */
export async function resolveFormattedOrderIdsByCoreId(
  db: Db,
  orderIds: number[]
): Promise<Map<number, string>> {
  const ids = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  const out = new Map<number, string>();
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      id: ordersCore.id,
      formattedOrderId: ordersCore.formattedOrderId,
      orderId: ordersCore.orderId,
      externalRef: ordersCore.externalRef,
      foodFormattedOrderId: ordersFood.formattedOrderId,
    })
    .from(ordersCore)
    .leftJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(inArray(ordersCore.id, ids));

  for (const row of rows) {
    const publicId = pickPublicId(
      row.formattedOrderId,
      row.foodFormattedOrderId,
      row.orderId,
      row.externalRef
    );
    out.set(
      row.id,
      publicId ??
        formatRiderOrderDisplayId({
          id: row.id,
          formattedOrderId: row.formattedOrderId,
          orderId: row.orderId,
          externalRef: row.externalRef,
        })
    );
  }

  const stillBare = ids.filter((id) => isBareNumericId(out.get(id) ?? null, id));
  if (stillBare.length === 0) return out;

  try {
    const ledgerRows = await db
      .select({
        metadata: walletLedger.metadata,
      })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.refType, "penalty"),
          or(
            ...stillBare.map(
              (id) =>
                sql`(${walletLedger.metadata}->>'orderId')::bigint = ${id}`
            )
          )
        )
      )
      .limit(stillBare.length * 5);

    for (const row of ledgerRows) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const coreId = Number(meta.orderId);
      if (!Number.isFinite(coreId) || !stillBare.includes(coreId)) continue;
      const publicId = pickPublicId(
        typeof meta.orderPublicId === "string" ? meta.orderPublicId : null,
        typeof meta.formattedOrderId === "string" ? meta.formattedOrderId : null
      );
      if (publicId && !/^\d+$/.test(publicId)) {
        out.set(coreId, publicId);
      }
    }
  } catch {
    // Ledger fallback is best-effort.
  }

  return out;
}

/** Prefer metadata public id when present (ledger / manual penalty writers). */
export function displayIdFromPenaltyMetadata(metadata: unknown): string | null {
  if (metadata == null || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  return pickPublicId(
    typeof m.orderPublicId === "string" ? m.orderPublicId : null,
    typeof m.formattedOrderId === "string" ? m.formattedOrderId : null,
    typeof m.order_public_id === "string" ? m.order_public_id : null,
    typeof m.formatted_order_id === "string" ? m.formatted_order_id : null
  );
}
