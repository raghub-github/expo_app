/**
 * Customer push notifications for person-ride captain assignment lifecycle.
 */
import { getSql } from "../db/client.js";
import { enqueuePush } from "../modules/push/enqueuePush.js";

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

async function riderDisplayName(riderId: number): Promise<string> {
  const sql = getSql();
  const rows = await sql<{ name: string | null }[]>`
    SELECT NULLIF(TRIM(name), '') AS name
    FROM riders
    WHERE id = ${riderId}
    LIMIT 1
  `;
  return rows[0]?.name?.trim() || "Captain";
}

/** Rapido-style push when an assigned captain cancels / unassigns before pickup. */
export async function notifyCustomerRideCaptainCancelled(
  ordersCoreId: number,
  orderIdText: string
): Promise<void> {
  try {
    const tokens = await customerTokensForOrdersCoreId(ordersCoreId);
    if (tokens.length === 0) return;

    await enqueuePush({
      to: tokens,
      title: RIDE_CAPTAIN_CANCELLED_TITLE,
      body: RIDE_CAPTAIN_CANCELLED_BODY,
      sound: "default",
      channelId: "customer_default",
      screen: `/orders/${orderIdText}`,
      data: {
        gmType: "RIDE_CAPTAIN_CANCELLED",
        orderId: orderIdText,
        gmTitle: RIDE_CAPTAIN_CANCELLED_TITLE,
        gmMessage: RIDE_CAPTAIN_CANCELLED_BODY,
      },
    });
  } catch (err) {
    console.warn(
      "[ride] captain-cancelled customer push failed (tolerated)",
      (err as Error).message
    );
  }
}

/** Push when a captain accepts — including re-assignment after a prior cancel. */
export async function notifyCustomerRideCaptainOnTheWay(
  ordersCoreId: number,
  orderIdText: string,
  riderId: number
): Promise<void> {
  try {
    const tokens = await customerTokensForOrdersCoreId(ordersCoreId);
    if (tokens.length === 0) return;

    const captainName = await riderDisplayName(riderId);
    const title = "Captain on the way! 👮";
    const body = `Captain ${captainName} will be there in a bit.`;

    await enqueuePush({
      to: tokens,
      title,
      body,
      sound: "default",
      channelId: "customer_default",
      screen: `/orders/${orderIdText}`,
      data: {
        gmType: "RIDE_CAPTAIN_ON_THE_WAY",
        orderId: orderIdText,
        riderId,
        captainName,
        gmTitle: title,
        gmMessage: body,
      },
    });
  } catch (err) {
    console.warn(
      "[ride] captain-on-the-way customer push failed (tolerated)",
      (err as Error).message
    );
  }
}
