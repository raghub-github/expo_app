/**
 * Customer push notifications for person-ride captain assignment lifecycle.
 */
import { getSql } from "../db/client.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";

export const RIDE_CAPTAIN_CANCELLED_TITLE = "Captain cancelled ride";
export const RIDE_CAPTAIN_CANCELLED_BODY =
  "Unfortunately, our previous captain cannot proceed with this order. We are looking out for another captain.";

async function customerTokensForOrdersCoreId(
  ordersCoreId: number
): Promise<string[]> {
  const sql = getSql();
  const rows = await sql<{ token: string }[]>`
    SELECT ept.expo_push_token AS token
    FROM orders_core oc
    JOIN customers c ON c.id = oc.customer_id
    JOIN expo_push_tokens ept ON ept.user_id = c.customer_id AND ept.role = 'customer'
    WHERE oc.id = ${ordersCoreId}
  `;
  return rows.map((r) => r.token).filter(Boolean);
}

/** Rapido-style push when an assigned captain cancels / unassigns before pickup. */
export async function notifyCustomerRideCaptainCancelled(
  ordersCoreId: number,
  orderIdText: string
): Promise<void> {
  try {
    const tokens = await customerTokensForOrdersCoreId(ordersCoreId);
    if (tokens.length === 0) return;

    await sendNotification({
      templateCode: "RIDE_CAPTAIN_CANCELLED",
      variables: { orderId: orderIdText, orderShortId: orderIdText },
      target: { device_tokens: tokens },
      metadata: {
        gmType: "RIDE_CAPTAIN_CANCELLED",
        liveService: "ride",
        orderId: orderIdText,
      },
    });
  } catch (err) {
    console.warn(
      "[ride] captain-cancelled customer push failed (tolerated)",
      (err as Error).message
    );
  }
}

/** Push when a captain accepts a person-ride — Super Admin template ORDER_RIDER_ASSIGNED. */
export async function notifyCustomerRideCaptainOnTheWay(
  ordersCoreId: number,
  orderIdText: string,
  riderId: number
): Promise<void> {
  try {
    const { notifyCustomerRideLifecycle } = await import("./customer-lifecycle-notify.js");
    await notifyCustomerRideLifecycle({
      orderIdText,
      templateCode: "ORDER_RIDER_ASSIGNED",
      riderId,
    });
  } catch (err) {
    console.warn(
      "[ride] ORDER_RIDER_ASSIGNED customer push failed (tolerated)",
      (err as Error).message
    );
  }
}
