/**
 * Customer-facing side effects when a merchant adds prep delay ("Need more time"):
 * bump prep_time_minutes, recalc live ETA, enqueue push notification.
 */
import type postgres from "postgres";
import { send as sendNotification } from "../modules/notifications/notificationService.js";
import { recalcOrderEta } from "../modules/eta/eta.recalc-service.js";

type Sql = postgres.Sql;

async function customerTokensForOrdersCoreId(sql: Sql, ordersCoreId: number): Promise<string[]> {
  const rows = await sql<{ token: string }[]>`
    SELECT ept.expo_push_token AS token
    FROM orders_core oc
    JOIN customers c ON c.id = oc.customer_id
    JOIN expo_push_tokens ept ON ept.user_id = c.customer_id AND ept.role = 'customer'
    WHERE oc.id = ${ordersCoreId}
  `;
  return rows.map((r) => r.token).filter(Boolean);
}

export async function applyPrepDelayCustomerEffects(
  sql: Sql,
  args: {
    ordersCoreId: number;
    additionalMinutes: number;
    expectedReadyAt?: string | null;
    storeName?: string | null;
  }
): Promise<void> {
  const coreRows = await sql<
    Array<{
      order_id: string | null;
      prep_time_minutes: number | null;
      store_name: string | null;
    }>
  >`
    SELECT oc.order_id,
           oc.prep_time_minutes,
           COALESCE(NULLIF(TRIM(ms.store_display_name), ''), ms.store_name) AS store_name
    FROM orders_core oc
    LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
    WHERE oc.id = ${args.ordersCoreId}
    LIMIT 1
  `;
  const core = coreRows[0];
  if (!core?.order_id) return;

  const orderIdText = String(core.order_id);
  const prevPrep = Number(core.prep_time_minutes) || 0;
  const newPrep = prevPrep + args.additionalMinutes;
  const expectedReadyAt =
    args.expectedReadyAt?.trim() ||
    new Date(Date.now() + args.additionalMinutes * 60_000).toISOString();

  await sql`
    UPDATE orders_core
    SET prep_time_minutes = ${newPrep},
        expected_ready_at = ${expectedReadyAt}::timestamptz,
        updated_at = NOW()
    WHERE id = ${args.ordersCoreId}
  `;

  let snap: Awaited<ReturnType<typeof recalcOrderEta>> = null;
  try {
    snap = await recalcOrderEta(orderIdText, { reason: "MERCHANT_DELAY" });
  } catch (err) {
    console.warn("[prep-delay] ETA recalc failed (tolerated)", (err as Error).message);
  }

  const storeLabel =
    (args.storeName ?? core.store_name ?? "Restaurant").trim() || "Restaurant";
  const etaMins = snap?.etaMaxMinutes ?? newPrep + 15;

  try {
    const tokens = await customerTokensForOrdersCoreId(sql, args.ordersCoreId);
    if (tokens.length > 0) {
      await sendNotification({
        templateCode: "ORDER_PREP_DELAY",
        variables: {
          orderId: orderIdText,
          storeName: storeLabel,
          additionalMinutes: args.additionalMinutes,
          etaMinutes: etaMins,
        },
        target: { device_tokens: tokens },
        metadata: { gmType: "ORDER_PREP_DELAY", orderId: orderIdText },
      });
    }
  } catch (err) {
    console.warn("[prep-delay] customer push failed (tolerated)", (err as Error).message);
  }
}
