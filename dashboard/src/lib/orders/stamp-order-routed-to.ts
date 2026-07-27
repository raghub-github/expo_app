/**
 * Stamp CS ownership ("Routed To") on an order whenever an agent performs
 * a tracked action: remark, refund, cancel, status update, rider cancel,
 * rider recon, or CX notification.
 */

import "server-only";

import { getSql, sqlJsonbParam } from "@/lib/db/client";

import {
  ORDER_ROUTED_TO_ACTION_LABELS,
  type OrderRoutedToAction,
} from "@/lib/orders/stamp-order-routed-to-labels";

export type { OrderRoutedToAction };
export { ORDER_ROUTED_TO_ACTION_LABELS };

export type StampOrderRoutedToInput = {
  orderId: number;
  systemUserId?: number | null;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: OrderRoutedToAction;
  actionLabel?: string | null;
  actionRefTable?: string | null;
  actionRefId?: string | number | null;
  metadata?: Record<string, unknown> | null;
};

export type OrderRoutedToHistoryItem = {
  id: number;
  orderId: number;
  systemUserId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  actionLabel: string | null;
  actionRefTable: string | null;
  actionRefId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

function cleanEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim();
  return email || null;
}

/**
 * Updates orders_core.routed_to_* and appends order_routed_to_history.
 * Never throws into the caller path — ownership stamp must not break the main action.
 */
export async function stampOrderRoutedTo(
  input: StampOrderRoutedToInput
): Promise<{ ok: boolean; routedToEmail: string | null }> {
  const orderId = Number(input.orderId);
  const actorEmail = cleanEmail(input.actorEmail);
  if (!Number.isFinite(orderId) || orderId <= 0 || !actorEmail) {
    return { ok: false, routedToEmail: null };
  }

  const systemUserId =
    input.systemUserId != null && Number.isFinite(Number(input.systemUserId))
      ? Number(input.systemUserId)
      : null;
  const actorName = (input.actorName ?? "").trim() || null;
  const actorRole = (input.actorRole ?? "").trim() || null;
  const actionLabel =
    (input.actionLabel ?? "").trim() ||
    ORDER_ROUTED_TO_ACTION_LABELS[input.action] ||
    input.action;
  const actionRefId =
    input.actionRefId == null || input.actionRefId === ""
      ? null
      : String(input.actionRefId);

  try {
    const sql = getSql();
    await sql.begin(async (tx) => {
      await tx`
        UPDATE orders_core
        SET
          routed_to_system_user_id = ${systemUserId},
          routed_to_email = ${actorEmail},
          routed_to_at = now(),
          updated_at = now()
        WHERE id = ${orderId}
      `;

      await tx`
        INSERT INTO order_routed_to_history (
          order_id,
          system_user_id,
          actor_email,
          actor_name,
          actor_role,
          action,
          action_label,
          action_ref_table,
          action_ref_id,
          metadata
        ) VALUES (
          ${orderId},
          ${systemUserId},
          ${actorEmail},
          ${actorName},
          ${actorRole},
          ${input.action},
          ${actionLabel},
          ${input.actionRefTable ?? null},
          ${actionRefId},
          ${sqlJsonbParam(input.metadata ?? null)}::jsonb
        )
      `;
    });

    return { ok: true, routedToEmail: actorEmail };
  } catch (error) {
    console.error("[stampOrderRoutedTo]", orderId, input.action, error);
    return { ok: false, routedToEmail: null };
  }
}

export async function listOrderRoutedToHistory(
  orderId: number
): Promise<OrderRoutedToHistoryItem[]> {
  if (!Number.isFinite(orderId) || orderId <= 0) return [];
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT
        id,
        order_id AS "orderId",
        system_user_id AS "systemUserId",
        actor_email AS "actorEmail",
        actor_name AS "actorName",
        actor_role AS "actorRole",
        action,
        action_label AS "actionLabel",
        action_ref_table AS "actionRefTable",
        action_ref_id AS "actionRefId",
        metadata,
        created_at AS "createdAt"
      FROM order_routed_to_history
      WHERE order_id = ${orderId}
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    `;
    return (rows as unknown as Array<Omit<OrderRoutedToHistoryItem, "createdAt"> & {
      createdAt: string | Date;
    }>).map((row) => ({
      ...row,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : null,
    }));
  } catch (error) {
    console.error("[listOrderRoutedToHistory]", orderId, error);
    return [];
  }
}
