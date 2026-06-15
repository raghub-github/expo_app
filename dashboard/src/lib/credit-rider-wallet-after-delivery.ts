import {
  creditRiderOrderEarningOnDelivered,
  type RiderOrderWalletServiceType,
} from "@/lib/credit-rider-order-on-delivered";
import { getSql } from "@/lib/db/client";
import {
  isRiderEligibleForDeliveryWalletCredit,
  resolveDeliveredRiderIdForWalletCredit,
} from "@/lib/rider-delivery-wallet-eligibility";

function mapOrderType(raw: unknown): RiderOrderWalletServiceType {
  const value = String(raw ?? "food").toLowerCase();
  if (value === "parcel") return "parcel";
  if (value === "person_ride") return "person_ride";
  return "food";
}

/** Credit assigned rider wallet when order reaches delivered (dashboard agent / status sync). */
export async function creditRiderWalletForDeliveredCoreOrder(
  ordersCoreId: number
): Promise<void> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      c.id,
      c.order_type,
      c.order_id,
      c.formatted_order_id,
      c.status
    FROM orders_core c
    WHERE c.id = ${ordersCoreId}
    LIMIT 1
  `;

  const row = (rows as Array<{
    id?: number;
    order_type?: string | null;
    order_id?: string | null;
    formatted_order_id?: string | null;
    status?: string | null;
  }>)[0];

  if (!row?.id) return;
  if (String(row.status ?? "").toLowerCase() !== "delivered") return;

  const riderId = await resolveDeliveredRiderIdForWalletCredit(ordersCoreId);
  if (riderId == null || !Number.isFinite(riderId) || riderId <= 0) return;

  const eligibility = await isRiderEligibleForDeliveryWalletCredit(ordersCoreId, riderId);
  if (!eligibility.eligible) {
    if (eligibility.error !== "zero_earning") {
      console.warn(
        "[creditRiderWalletForDeliveredCoreOrder]",
        ordersCoreId,
        eligibility.error
      );
    }
    return;
  }

  const result = await creditRiderOrderEarningOnDelivered({
    ordersCoreId,
    riderId,
    orderType: mapOrderType(row.order_type),
    orderIdText: row.order_id?.trim() || String(ordersCoreId),
    formattedOrderId: row.formatted_order_id?.trim() || null,
  });

  if (!result.credited && result.error && result.error !== "zero_earning") {
    console.warn("[creditRiderWalletForDeliveredCoreOrder]", ordersCoreId, result.error);
  }
}
