/**
 * Soft-hide customer in-app order notifications once the order is terminal.
 * Inbox reads filter `revoked_at IS NULL`.
 */
import type { Sql } from "postgres";
import { ORDER_NOTIFICATION_TERMINAL } from "./clear-merchant-order-notifications.js";

export { ORDER_NOTIFICATION_TERMINAL };

export function shouldClearOrderNotifications(status: string): boolean {
  return ORDER_NOTIFICATION_TERMINAL.has(String(status ?? "").trim().toUpperCase());
}

/**
 * Revoke customer dispatch-log inbox rows for a finished/cancelled order.
 */
export async function clearCustomerOrderNotifications(
  sql: Sql,
  args: {
    orderIdText?: string | null;
    formattedOrderId?: string | null;
    customerUserId?: string | null;
  }
): Promise<number> {
  const orderRef = (args.formattedOrderId ?? args.orderIdText ?? "").trim();
  if (!orderRef) return 0;

  try {
    const hasCol = await sql`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification_dispatch_logs'
        AND column_name = 'revoked_at'
      LIMIT 1
    `;
    if (!hasCol.length) return 0;

    const like = `%${orderRef}%`;
    const customerId = (args.customerUserId ?? "").trim();

    const rows = customerId
      ? await sql`
          UPDATE public.notification_dispatch_logs
          SET revoked_at = now()
          WHERE revoked_at IS NULL
            AND recipient_role = 'customer'
            AND recipient_user_id = ${customerId}
            AND (
              template_code ILIKE 'ORDER_%'
              OR template_code ILIKE '%_ORDER_%'
              OR coalesce(metadata->>'gmType', '') ILIKE 'ORDER_%'
            )
            AND (
              coalesce(metadata->>'orderId', '') = ${orderRef}
              OR coalesce(metadata->>'order_id', '') = ${orderRef}
              OR coalesce(deep_link, '') ILIKE ${like}
              OR coalesce(body, '') ILIKE ${like}
              OR coalesce(title, '') ILIKE ${like}
            )
          RETURNING id
        `
      : await sql`
          UPDATE public.notification_dispatch_logs
          SET revoked_at = now()
          WHERE revoked_at IS NULL
            AND recipient_role = 'customer'
            AND (
              template_code ILIKE 'ORDER_%'
              OR template_code ILIKE '%_ORDER_%'
              OR coalesce(metadata->>'gmType', '') ILIKE 'ORDER_%'
            )
            AND (
              coalesce(metadata->>'orderId', '') = ${orderRef}
              OR coalesce(metadata->>'order_id', '') = ${orderRef}
              OR coalesce(deep_link, '') ILIKE ${like}
              OR coalesce(body, '') ILIKE ${like}
              OR coalesce(title, '') ILIKE ${like}
            )
          RETURNING id
        `;

    return rows.length;
  } catch {
    return 0;
  }
}
