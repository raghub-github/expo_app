import { getSql } from "../client";
import { publicTableExists } from "../schema-ensure";

export interface OrderCxNotificationRecord {
  id: number;
  orderId: number;
  message: string;
  sentByEmail: string | null;
  sentByName: string | null;
  sentByRole: string | null;
  sentAt: Date;
  notificationMetadata: unknown;
}

export interface CreateOrderCxNotificationInput {
  orderId: number;
  message: string;
  sentByEmail?: string | null;
  sentByName?: string | null;
  sentByRole?: string | null;
  notificationMetadata?: unknown;
}

let cxNotificationsTableReady = false;

async function ensureOrderCxNotificationsTable(): Promise<void> {
  if (cxNotificationsTableReady) return;
  if (await publicTableExists("order_cx_agent_notifications")) {
    cxNotificationsTableReady = true;
    return;
  }
  const sql = getSql();
  await sql`
    CREATE TABLE order_cx_agent_notifications (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders_core(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      sent_by_email TEXT,
      sent_by_name TEXT,
      sent_by_role TEXT,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notification_metadata JSONB DEFAULT '{}'::jsonb
    )
  `;
  await sql`
    CREATE INDEX order_cx_agent_notifications_order_id_idx
    ON order_cx_agent_notifications(order_id)
  `;
  await sql`
    CREATE INDEX order_cx_agent_notifications_order_sent_at_idx
    ON order_cx_agent_notifications(order_id, sent_at DESC)
  `;
  cxNotificationsTableReady = true;
}

export async function createOrderCxNotification(
  input: CreateOrderCxNotificationInput
): Promise<OrderCxNotificationRecord> {
  await ensureOrderCxNotificationsTable();
  const sql = getSql();
  const metadataJson = JSON.stringify(input.notificationMetadata ?? {});

  const result = await sql`
    INSERT INTO order_cx_agent_notifications (
      order_id,
      message,
      sent_by_email,
      sent_by_name,
      sent_by_role,
      notification_metadata
    )
    VALUES (
      ${input.orderId},
      ${input.message.trim()},
      ${input.sentByEmail ?? null},
      ${input.sentByName ?? null},
      ${input.sentByRole ?? "AGENT"},
      CAST(${metadataJson} AS jsonb)
    )
    RETURNING
      id,
      order_id AS "orderId",
      message,
      sent_by_email AS "sentByEmail",
      sent_by_name AS "sentByName",
      sent_by_role AS "sentByRole",
      sent_at AS "sentAt",
      notification_metadata AS "notificationMetadata"
  `;

  return result[0] as OrderCxNotificationRecord;
}

export async function listOrderCxNotifications(
  orderId: number
): Promise<OrderCxNotificationRecord[]> {
  await ensureOrderCxNotificationsTable();
  const sql = getSql();

  const result = await sql`
    SELECT
      id,
      order_id AS "orderId",
      message,
      sent_by_email AS "sentByEmail",
      sent_by_name AS "sentByName",
      sent_by_role AS "sentByRole",
      sent_at AS "sentAt",
      notification_metadata AS "notificationMetadata"
    FROM order_cx_agent_notifications
    WHERE order_id = ${orderId}
    ORDER BY sent_at DESC
  `;

  return result as unknown as OrderCxNotificationRecord[];
}

export async function getOrderCxNotificationsCount(orderId: number): Promise<number> {
  await ensureOrderCxNotificationsTable();
  const sql = getSql();
  const result = await sql`
    SELECT count(*)::int AS cnt
    FROM order_cx_agent_notifications
    WHERE order_id = ${orderId}
  `;
  const row = (result as unknown as Array<{ cnt: number }>)[0];
  return row?.cnt ?? 0;
}
