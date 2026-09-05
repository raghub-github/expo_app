/**
 * Server-side idempotency for customer order-status pushes.
 *
 * One order + one status transition = one row in
 * customer_order_notification_events (UNIQUE order_id, event_type).
 * Claim with INSERT ON CONFLICT DO NOTHING so concurrent eventBus +
 * lifecycle + retry workers cannot double-send.
 */
import { getSql } from "../db/client.js";

const SKIP_CLAIM_TEMPLATES = new Set([
  "ORDER_PREP_DELAY",
  "CUSTOMER_ANNOUNCEMENT",
  "MERCHANT_ANNOUNCEMENT",
  "RIDER_ANNOUNCEMENT",
]);

/** Status / template aliases that must collapse to a single push event. */
const EVENT_TYPE_ALIASES: Record<string, string> = {
  CREATED: "ORDER_CREATED",
  ORDER_CREATED: "ORDER_CREATED",
  PLACED: "ORDER_CREATED",
  ORDER_PLACED: "ORDER_CREATED",

  ACCEPTED: "ORDER_ACCEPTED",
  ORDER_ACCEPTED: "ORDER_ACCEPTED",
  ORDER_CONFIRMED: "ORDER_ACCEPTED",
  PREPARING: "ORDER_ACCEPTED",
  ORDER_PREPARING: "ORDER_ACCEPTED",

  RIDER_ASSIGNED: "ORDER_RIDER_ASSIGNED",
  ASSIGNED: "ORDER_RIDER_ASSIGNED",
  ORDER_RIDER_ASSIGNED: "ORDER_RIDER_ASSIGNED",

  READY: "ORDER_FOOD_READY",
  READY_FOR_PICKUP: "ORDER_FOOD_READY",
  ORDER_FOOD_READY: "ORDER_FOOD_READY",

  RIDER_AT_PICKUP: "ORDER_RIDER_AT_STORE",
  REACHED_STORE: "ORDER_RIDER_AT_STORE",
  AT_STORE: "ORDER_RIDER_AT_STORE",
  ORDER_RIDER_AT_STORE: "ORDER_RIDER_AT_STORE",

  OUT_FOR_DELIVERY: "ORDER_OUT_FOR_DELIVERY",
  PICKED_UP: "ORDER_OUT_FOR_DELIVERY",
  ON_THE_WAY: "ORDER_OUT_FOR_DELIVERY",
  ORDER_OUT_FOR_DELIVERY: "ORDER_OUT_FOR_DELIVERY",

  REACHED_CUSTOMER: "ORDER_RIDER_ARRIVING",
  ARRIVED: "ORDER_RIDER_ARRIVING",
  AT_CUSTOMER: "ORDER_RIDER_ARRIVING",
  ORDER_RIDER_ARRIVING: "ORDER_RIDER_ARRIVING",

  DELIVERED: "ORDER_DELIVERED",
  COMPLETED: "ORDER_DELIVERED",
  COMPLETE: "ORDER_DELIVERED",
  ORDER_DELIVERED: "ORDER_DELIVERED",

  CANCELLED: "ORDER_CANCELLED",
  CANCELED: "ORDER_CANCELLED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_CANCELLED_REFUND_ELIGIBLE: "ORDER_CANCELLED",
  ORDER_CANCELLED_NO_REFUND: "ORDER_CANCELLED",
};

export type CustomerOrderNotificationClaim = {
  inserted: boolean;
  duplicate: boolean;
  orderId: string;
  eventType: string;
  eventKey: string;
};

export function shouldClaimCustomerOrderNotification(templateCode: string | null | undefined): boolean {
  const code = String(templateCode ?? "").trim().toUpperCase();
  if (!code || SKIP_CLAIM_TEMPLATES.has(code)) return false;
  if (code.startsWith("ORDER_")) return true;
  if (code.startsWith("RIDE_")) return true;
  if (code.startsWith("PARCEL_")) return true;
  if (code === "CUSTOMER_DELIVERY_OTP_NEARBY") return true;
  if (code === "CUSTOMER_PICKUP_OTP_ARRIVED") return true;
  return false;
}

export function normalizeCustomerOrderNotificationEventType(
  templateOrStatus: string | null | undefined
): string {
  const raw = String(templateOrStatus ?? "").trim().toUpperCase();
  if (!raw) return "";
  return EVENT_TYPE_ALIASES[raw] ?? raw;
}

export function customerOrderNotificationEventKey(orderId: string, eventType: string): string {
  return `${orderId.trim()}:${eventType.trim().toUpperCase()}`;
}

export function extractCustomerOrderRefFromIntent(intent: {
  templateCode?: string | null;
  variables?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const meta = intent.metadata ?? {};
  const vars = intent.variables ?? {};
  const candidates = [
    meta.orderId,
    meta.order_id,
    meta.orderIdText,
    meta.formattedOrderId,
    meta.formatted_order_id,
    meta.orderShortId,
    vars.orderId,
    vars.order_id,
    vars.orderShortId,
  ];
  for (const raw of candidates) {
    const id = String(raw ?? "").trim();
    if (id) return id;
  }
  return null;
}

async function resolveCanonicalOrderId(orderRef: string): Promise<{
  orderId: string;
  formattedOrderId: string | null;
}> {
  const ref = orderRef.trim();
  if (!ref) return { orderId: ref, formattedOrderId: null };
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT oc.order_id, oc.formatted_order_id
      FROM public.orders_core oc
      WHERE oc.order_id = ${ref}
         OR oc.formatted_order_id = ${ref}
         OR oc.id::text = ${ref}
      LIMIT 1
    `) as unknown as Array<{ order_id: string | null; formatted_order_id: string | null }>;
    const orderId = rows[0]?.order_id?.trim();
    if (orderId) {
      return {
        orderId,
        formattedOrderId: rows[0]?.formatted_order_id?.trim() || null,
      };
    }
  } catch (err) {
    console.warn(
      "[customer-order-notification-events] order lookup failed",
      (err as Error).message
    );
  }
  return { orderId: ref, formattedOrderId: null };
}

function isUndefinedTable(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  return /customer_order_notification_events/i.test(msg) && /does not exist|undefined_table/i.test(msg);
}

/**
 * Atomically claim the (order_id, event_type) slot.
 * Winner: inserted=true. Loser: duplicate=true — caller must NOT send.
 */
export async function claimCustomerOrderNotificationEvent(args: {
  orderRef: string;
  eventType: string;
  templateCode?: string | null;
}): Promise<CustomerOrderNotificationClaim> {
  const eventType = normalizeCustomerOrderNotificationEventType(args.eventType);
  const resolved = await resolveCanonicalOrderId(args.orderRef);
  const orderId = resolved.orderId;
  const eventKey = customerOrderNotificationEventKey(orderId, eventType);
  const empty: CustomerOrderNotificationClaim = {
    inserted: true,
    duplicate: false,
    orderId,
    eventType,
    eventKey,
  };
  if (!orderId || !eventType) return empty;

  try {
    const sql = getSql();
    const rows = (await sql`
      INSERT INTO public.customer_order_notification_events (
        order_id, event_type, event_key, template_code, formatted_order_id
      )
      VALUES (
        ${orderId},
        ${eventType},
        ${eventKey},
        ${args.templateCode ?? eventType},
        ${resolved.formattedOrderId}
      )
      ON CONFLICT (order_id, event_type) DO NOTHING
      RETURNING id
    `) as unknown as Array<{ id: number }>;
    const inserted = rows.length > 0;
    return {
      inserted,
      duplicate: !inserted,
      orderId,
      eventType,
      eventKey,
    };
  } catch (err) {
    if (isUndefinedTable(err)) {
      console.warn(
        "[customer-order-notification-events] table missing — apply drizzle/0601_customer_order_notification_events.sql"
      );
      return empty;
    }
    console.warn(
      "[customer-order-notification-events] claim failed",
      (err as Error).message
    );
    return empty;
  }
}

export async function markCustomerOrderNotificationSent(args: {
  orderId: string;
  eventType: string;
  notificationId?: string | null;
}): Promise<void> {
  try {
    const sql = getSql();
    const eventType = normalizeCustomerOrderNotificationEventType(args.eventType);
    await sql`
      UPDATE public.customer_order_notification_events
      SET sent_at = COALESCE(sent_at, now()),
          notification_id = COALESCE(
            notification_id,
            ${args.notificationId ?? null}::uuid
          )
      WHERE order_id = ${args.orderId}
        AND event_type = ${eventType}
    `;
  } catch (err) {
    if (!isUndefinedTable(err)) {
      console.warn(
        "[customer-order-notification-events] mark sent failed",
        (err as Error).message
      );
    }
  }
}

/** Release a claim that never dispatched so a later retry can send. */
export async function releaseCustomerOrderNotificationClaim(args: {
  orderId: string;
  eventType: string;
}): Promise<void> {
  try {
    const sql = getSql();
    const eventType = normalizeCustomerOrderNotificationEventType(args.eventType);
    await sql`
      DELETE FROM public.customer_order_notification_events
      WHERE order_id = ${args.orderId}
        AND event_type = ${eventType}
        AND sent_at IS NULL
    `;
  } catch (err) {
    if (!isUndefinedTable(err)) {
      console.warn(
        "[customer-order-notification-events] release failed",
        (err as Error).message
      );
    }
  }
}

export function keepCustomerOrderNotificationClaim(result: {
  queued: number;
  skipped?: number;
  failedSync: number;
  skipReason?: string;
}): boolean {
  if (result.skipReason === "quiet_hours") return false;
  if (result.skipReason === "template_missing") return false;
  if (result.skipReason === "no_recipients" && result.queued === 0) return false;
  if (result.queued > 0) return true;
  if ((result.failedSync ?? 0) === 0) return true;
  return false;
}

export async function claimCustomerOrderNotificationFromIntent(intent: {
  templateCode: string;
  variables?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}): Promise<CustomerOrderNotificationClaim | null> {
  if (!shouldClaimCustomerOrderNotification(intent.templateCode)) return null;
  const orderRef = extractCustomerOrderRefFromIntent(intent);
  if (!orderRef) return null;
  return claimCustomerOrderNotificationEvent({
    orderRef,
    eventType: intent.templateCode,
    templateCode: intent.templateCode,
  });
}
