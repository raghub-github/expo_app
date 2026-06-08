/**
 * Tip boost + search extension when rider pool matching times out.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { ordersCore, ordersRide } from "../../db/schema.js";
import { appendOrderTimeline } from "../../lib/order-placement-timeline.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { restartOrderDispatch } from "../../lib/order-dispatch.service.js";

export const RIDE_SEARCH_EXTENSION_SEC = 180;
/** Max search extensions after the tip-boost sheet (one extra 3‑min window, then auto-cancel). */
export const RIDE_MAX_SEARCH_EXTENSIONS = 1;

export const RIDE_TIP_AMOUNTS = new Set([0, 10, 20, 30, 40, 50]);

export type ExtendRideSearchInput = {
  customerPk: number;
  orderRef: string;
  tipAmount?: number;
};

export type ExtendRideSearchResult = {
  orderId: string;
  searchExpiresAt: string;
  searchExtendedUntil: string;
  dispatchRetryCount: number;
  customerTipAmount: number;
  prebookTipAmount: number;
  searchBoostTip1: number;
  searchBoostTip2: number;
  tipBoostApplied: boolean;
  higherDispatchPriority: boolean;
  extensionSec: number;
};

async function loadSearchingRide(customerPk: number, orderRef: string) {
  const db = getDb();
  const [row] = await db
    .select({
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      status: ordersCore.status,
      riderId: ordersCore.riderId,
      tipAmount: ordersCore.tipAmount,
      dispatchRetryCount: ordersRide.dispatchRetryCount,
      customerTipAmount: ordersRide.customerTipAmount,
      prebookTipAmount: ordersRide.prebookTipAmount,
      searchBoostTip1: ordersRide.searchBoostTip1,
      searchBoostTip2: ordersRide.searchBoostTip2,
      awaitingTipBoost: ordersRide.awaitingTipBoost,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(
      and(
        customerOrderRefWhere(customerPk, orderRef),
        eq(ordersCore.orderType, "person_ride"),
        isNull(ordersCore.riderId),
        eq(ordersCore.status, "assigned"),
        sql`${ordersRide.cancelledAt} IS NULL`
      )
    )
    .limit(1);

  if (!row?.coreId || !row.orderId) {
    throw Object.assign(new Error("Ride order not found or not searching"), { statusCode: 404 });
  }
  return row;
}

/** Mark first search window ended — pauses auto-cancel until customer acts. */
export async function markRideSearchWindowEnded(
  customerPk: number,
  orderRef: string
): Promise<{ orderId: string; awaitingTipBoost: boolean }> {
  const db = getDb();
  const row = await loadSearchingRide(customerPk, orderRef);
  const now = new Date();

  await db
    .update(ordersRide)
    .set({
      awaitingTipBoost: true,
      updatedAt: now,
    })
    .where(eq(ordersRide.orderId, row.coreId));

  return { orderId: row.orderId ?? "", awaitingTipBoost: true };
}

export async function extendRideSearch(
  input: ExtendRideSearchInput
): Promise<ExtendRideSearchResult> {
  const db = getDb();
  const row = await loadSearchingRide(input.customerPk, input.orderRef);

  const tipAmount =
    input.tipAmount != null && input.tipAmount > 0 ? Math.round(input.tipAmount) : 0;
  if (tipAmount > 0 && !RIDE_TIP_AMOUNTS.has(tipAmount)) {
    throw Object.assign(new Error("Invalid tip amount"), { statusCode: 400 });
  }

  const retryCount = Number(row.dispatchRetryCount ?? 0);
  if (retryCount >= RIDE_MAX_SEARCH_EXTENSIONS) {
    throw Object.assign(new Error("Maximum search extensions reached"), { statusCode: 409 });
  }

  const now = new Date();
  const extensionSec = RIDE_SEARCH_EXTENSION_SEC;
  const searchExpiresAt = new Date(now.getTime() + extensionSec * 1000);
  const prebookTip = Number(row.prebookTipAmount ?? 0);
  let searchBoostTip1 = Number(row.searchBoostTip1 ?? 0);
  let searchBoostTip2 = Number(row.searchBoostTip2 ?? 0);
  const prevCoreTip = Number(row.tipAmount ?? 0);

  if (tipAmount > 0) {
    if (retryCount === 0) {
      searchBoostTip1 = tipAmount;
    } else if (retryCount === 1) {
      searchBoostTip2 = tipAmount;
    }
  }

  const newTipTotal = prebookTip + searchBoostTip1 + searchBoostTip2;
  const prevTipTotal = Number(row.customerTipAmount ?? 0);
  const tipDelta = newTipTotal - prevTipTotal;
  const tipBoostApplied = tipAmount > 0;
  const higherPriority = newTipTotal > 0;

  await db.transaction(async (tx) => {
    await tx
      .update(ordersRide)
      .set({
        searchExpiresAt,
        searchExtendedUntil: searchExpiresAt,
        dispatchRetryCount: retryCount + 1,
        customerTipAmount: String(newTipTotal),
        prebookTipAmount: String(prebookTip),
        searchBoostTip1: String(searchBoostTip1),
        searchBoostTip2: String(searchBoostTip2),
        tipBoostApplied: newTipTotal > 0,
        higherDispatchPriority: higherPriority,
        awaitingTipBoost: false,
        updatedAt: now,
      })
      .where(eq(ordersRide.orderId, row.coreId));

    if (tipDelta > 0) {
      await tx
        .update(ordersCore)
        .set({
          tipAmount: String(prevCoreTip + tipDelta),
          grandTotal: sql`${ordersCore.grandTotal} + ${tipDelta}`,
          updatedAt: now,
        })
        .where(eq(ordersCore.id, row.coreId));
    }

    await appendOrderTimeline(tx, {
      orderCorePk: row.coreId,
      status: "SEARCHING_RIDER",
      previousStatus: "SEARCHING_RIDER",
      actorType: "customer",
      actorId: input.customerPk,
      statusMessage:
        tipAmount > 0
          ? `Tip boost ₹${tipAmount} — searching extended ${extensionSec / 60} min`
          : `Search extended ${extensionSec / 60} min without tip`,
      occurredAt: now,
      metadata: {
        tipAmount,
        customerTipTotal: newTipTotal,
        prebookTipAmount: prebookTip,
        searchBoostTip1,
        searchBoostTip2,
        dispatchRetryCount: retryCount + 1,
        extensionSec,
        higherDispatchPriority: higherPriority,
      },
    });
  });

  void restartOrderDispatch(row.coreId);

  return {
    orderId: row.orderId ?? "",
    searchExpiresAt: searchExpiresAt.toISOString(),
    searchExtendedUntil: searchExpiresAt.toISOString(),
    dispatchRetryCount: retryCount + 1,
    customerTipAmount: newTipTotal,
    prebookTipAmount: prebookTip,
    searchBoostTip1,
    searchBoostTip2,
    tipBoostApplied,
    higherDispatchPriority: higherPriority,
    extensionSec,
  };
}
