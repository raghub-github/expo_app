/**
 * Lightweight in-process event bus for domain events.
 *
 * Why this instead of scattered NotificationService.send() calls throughout
 * the codebase?
 *
 *   1. **One place to see all notification triggers** — the wiring lives in
 *      registerDomainEventHandlers() below, so a reviewer can audit every
 *      "who gets pinged when X happens" without grepping 40 files.
 *
 *   2. **Domain modules stay ignorant of notifications** — order.routes.ts
 *      calls `emitEvent("order.status_changed", {...})`, not
 *      `NotificationService.send({...})`. If we later add email or SMS
 *      channels, the domain code doesn't change.
 *
 *   3. **Fire-and-forget** — handlers run inside setImmediate so a slow
 *      notification path can never block the domain transaction.
 *
 * Events are strongly typed via DomainEventMap below. Adding a new event:
 *   1. Add its shape to DomainEventMap.
 *   2. Call `emitEvent("foo.bar", {...})` from the domain module.
 *   3. Add a handler in registerDomainEventHandlers().
 */
import { send as sendNotification } from "./notificationService.js";
import { getSql } from "../../db/client.js";
import {
  clearMerchantStoreOrderNotificationsByOrderRef,
  shouldClearOrderNotifications,
} from "../../lib/clear-merchant-order-notifications.js";

// ---------------------------------------------------------------------------
// Event catalog
// ---------------------------------------------------------------------------

export type DomainEventMap = {
  // Order lifecycle (backend or merchant action changes order.status).
  "order.status_changed": {
    orderId: string;                 // e.g. GM10000042
    orderShortId?: string;
    fromStatus: string;              // CREATED / ACCEPTED / PREPARING / READY / DELIVERED / CANCELLED
    toStatus: string;
    customerId?: string | null;      // GMC-…
    merchantUserId?: string | null;
    merchantStoreId?: number | null;
    merchantName?: string | null;
    riderUserId?: string | null;
    riderName?: string | null;
    reason?: string;                 // for cancellations
  };

  // Rider assigned to an order (after dispatch accept).
  "order.rider_assigned": {
    orderId: string;
    orderShortId?: string;
    customerId?: string | null;
    merchantUserId?: string | null;
    riderUserId: string;
    riderName?: string;
    merchantName?: string | null;
    etaMinutes?: number;
  };

  /** Food rider arrived at merchant store. */
  "order.rider_at_store": {
    orderId: string;
    orderShortId?: string;
    customerId?: string | null;
    riderName?: string | null;
    merchantName?: string | null;
  };

  /** Food rider near / at customer drop. */
  "order.rider_arriving": {
    orderId: string;
    orderShortId?: string;
    customerId?: string | null;
    riderName?: string | null;
    etaMinutes?: number;
  };

  // Payment webhook flip.
  "payment.settled": {
    orderId: string;
    orderShortId?: string;
    customerId: string;
    amount: number;
    status: "SUCCESS" | "FAILED";
    reason?: string;
  };

  // Merchant refund / cancellation refund customer-facing.
  "customer.refund_initiated": {
    orderId: string;
    orderShortId?: string;
    customerId: string;
    amount: number;
  };

  // Any wallet ledger insertion.
  "wallet.updated": {
    userId: string;
    role: "customer" | "merchant" | "rider";
    direction: "CREDIT" | "DEBIT";
    amount: number;
    balance: number;
    reason?: string;
  };

  // KYC / documents decision.
  "kyc.decision": {
    userId: string;
    role: "merchant" | "rider";
    docType?: string;
    decision: "APPROVED" | "REJECTED";
    reason?: string;
  };

  // Rider vehicle verified — separate from generic KYC.
  "rider.vehicle_verified": {
    userId: string;
  };

  // Account state change (suspension / reactivation / blacklist).
  "account.state_changed": {
    userId: string;
    role: "customer" | "merchant" | "rider";
    newState: "SUSPENDED" | "REACTIVATED" | "BLACKLISTED";
    reason?: string;
  };

  // Withdrawal lifecycle.
  "wallet.withdrawal": {
    userId: string;
    role: "rider" | "merchant";
    amount: number;
    status: "REQUESTED" | "SUCCESS" | "FAILED";
    reason?: string;
    eta?: string;
  };

  // Merchant settlement lifecycle.
  "merchant.settlement": {
    merchantUserId: string;
    amount: number;
    period?: string;
    status: "SUCCESS" | "FAILED";
    reason?: string;
  };

  // Subscription lifecycle.
  "subscription.event": {
    userId: string;
    role: "customer" | "merchant";
    event: "RENEWED" | "EXPIRING" | "EXPIRED";
    expiresOn?: string;
  };
};

type EventName = keyof DomainEventMap;
type Handler<K extends EventName> = (payload: DomainEventMap[K]) => Promise<void> | void;

// ---------------------------------------------------------------------------
// Bus
// ---------------------------------------------------------------------------

const handlers = new Map<EventName, Handler<EventName>[]>();

function on<K extends EventName>(event: K, handler: Handler<K>): void {
  const arr = handlers.get(event) ?? [];
  arr.push(handler as Handler<EventName>);
  handlers.set(event, arr);
}

/**
 * Fire an event. Never throws. Handlers run out-of-band via setImmediate so
 * a slow / failing notification path cannot delay the caller.
 */
export function emitEvent<K extends EventName>(event: K, payload: DomainEventMap[K]): void {
  const list = handlers.get(event);
  if (!list || list.length === 0) return;
  for (const h of list) {
    setImmediate(() => {
      try {
        const p = (h as Handler<K>)(payload);
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch((e) =>
            console.warn(`[eventBus] ${event} handler rejected:`, (e as Error).message),
          );
        }
      } catch (e) {
        console.warn(`[eventBus] ${event} handler threw:`, (e as Error).message);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Notification handlers — the "who gets pinged when X happens" wiring
// ---------------------------------------------------------------------------

const STATUS_TO_TEMPLATE: Record<string, { customer?: string; merchant?: string; rider?: string }> = {
  CREATED:           { customer: "ORDER_CREATED", merchant: "MERCHANT_NEW_ORDER" },
  ACCEPTED:          { customer: "ORDER_ACCEPTED" },
  PREPARING:         { customer: "ORDER_PREPARING" },
  READY:             { customer: "ORDER_FOOD_READY" },
  READY_FOR_PICKUP:  { customer: "ORDER_FOOD_READY" },
  OUT_FOR_DELIVERY:  { customer: "ORDER_OUT_FOR_DELIVERY" },
  REACHED_CUSTOMER:  { customer: "ORDER_RIDER_ARRIVING" },
  DELIVERED:         { customer: "ORDER_DELIVERED" },
  CANCELLED:         { customer: "ORDER_CANCELLED", merchant: "MERCHANT_ORDER_CANCELLED", rider: "RIDER_ORDER_CANCELLED" },
};

/** Live-progress metadata for food shade updates (customer app). */
const FOOD_LIVE_BY_TEMPLATE: Record<
  string,
  { step: number; title: string; body: string }
> = {
  ORDER_ACCEPTED: { step: 1, title: "Order Accepted", body: "Store accepted your order" },
  ORDER_PREPARING: { step: 1, title: "Preparing Your Order", body: "Preparing" },
  ORDER_FOOD_READY: { step: 2, title: "Ready for Pickup", body: "Rider arriving at store" },
  ORDER_RIDER_AT_STORE: { step: 2, title: "Ready for Pickup", body: "Rider at the store" },
  ORDER_OUT_FOR_DELIVERY: { step: 3, title: "On The Way", body: "Arriving" },
  ORDER_RIDER_ARRIVING: { step: 4, title: "Nearby", body: "Rider is almost there" },
  ORDER_DELIVERED: { step: 5, title: "Delivered", body: "Enjoy your meal!" },
};

function foodLiveMetadata(
  templateCode: string,
  orderId: string,
  extras?: { riderName?: string | null; merchantName?: string | null; etaMinutes?: number }
): Record<string, unknown> {
  const live = FOOD_LIVE_BY_TEMPLATE[templateCode];
  const base: Record<string, unknown> = {
    orderId,
    gmType: templateCode,
  };
  if (!live) return base;
  return {
    ...base,
    gmLiveProgress: true,
    liveService: "food",
    liveStep: live.step,
    liveSteps: 5,
    liveTitle: live.title,
    liveBody: live.body,
    ...(extras?.merchantName ? { storeName: extras.merchantName } : {}),
    ...(extras?.etaMinutes != null ? { etaMinutes: extras.etaMinutes } : {}),
  };
}

let wired = false;

/** Idempotent — call once from src/index.ts on boot. */
export function registerDomainEventHandlers(): void {
  if (wired) return;
  wired = true;

  // Order status → clear stale "New order!" inbox rows, then push templates.
  on("order.status_changed", async (e) => {
    if (
      shouldClearOrderNotifications(e.toStatus) &&
      e.merchantStoreId != null &&
      e.merchantStoreId > 0
    ) {
      try {
        await clearMerchantStoreOrderNotificationsByOrderRef(getSql(), {
          merchantStoreId: e.merchantStoreId,
          orderIdText: e.orderId,
          formattedOrderId: e.orderShortId ?? e.orderId,
        });
      } catch {
        /* inbox clear is best-effort */
      }
    }

    const map = STATUS_TO_TEMPLATE[e.toStatus.toUpperCase()];
    if (!map) return;
    const vars = {
      orderId: e.orderId,
      orderShortId: e.orderShortId ?? e.orderId,
      merchantName: e.merchantName ?? "Store",
      reason: e.reason ?? "",
      riderName: e.riderName ?? "Your rider",
      etaMinutes: 25,
    };
    if (map.customer && e.customerId) {
      await sendNotification({
        templateCode: map.customer,
        variables: vars,
        target: { user_id: e.customerId },
        idempotencyKey: `${map.customer}:${e.orderId}:${e.toStatus}`,
        metadata: foodLiveMetadata(map.customer, e.orderId, {
          merchantName: e.merchantName,
          riderName: e.riderName,
        }),
      });
    }
    if (map.merchant && e.merchantUserId) {
      await sendNotification({
        templateCode: map.merchant,
        variables: vars,
        target: { user_id: e.merchantUserId },
        idempotencyKey: `${map.merchant}:${e.orderId}:${e.toStatus}`,
        metadata: { orderId: e.orderId, gmType: map.merchant },
      });
    }
    if (map.rider && e.riderUserId) {
      await sendNotification({
        templateCode: map.rider,
        variables: vars,
        target: { user_id: e.riderUserId },
        idempotencyKey: `${map.rider}:${e.orderId}:${e.toStatus}`,
        metadata: { orderId: e.orderId, gmType: map.rider },
      });
    }
  });

  on("order.rider_assigned", async (e) => {
    if (!e.customerId) return;
    // Prefer "on the way" when rider accepts after ready; otherwise keep assign copy.
    await sendNotification({
      templateCode: "ORDER_RIDER_ASSIGNED",
      variables: {
        orderId: e.orderId,
        orderShortId: e.orderShortId ?? e.orderId,
        riderName: e.riderName ?? "Your rider",
        merchantName: e.merchantName ?? "the restaurant",
        etaMinutes: e.etaMinutes ?? 25,
      },
      target: { user_id: e.customerId },
      idempotencyKey: `ORDER_RIDER_ASSIGNED:${e.orderId}:${e.riderUserId}`,
      metadata: {
        orderId: e.orderId,
        riderId: e.riderUserId,
        gmType: "ORDER_RIDER_ASSIGNED",
        gmLiveProgress: true,
        liveService: "food",
        liveStep: 2,
        liveSteps: 5,
        liveTitle: "Ready for Pickup",
        liveBody: "Rider heading to store",
      },
    });
  });

  on("order.rider_at_store", async (e) => {
    if (!e.customerId) return;
    await sendNotification({
      templateCode: "ORDER_RIDER_AT_STORE",
      variables: {
        orderId: e.orderId,
        orderShortId: e.orderShortId ?? e.orderId,
        riderName: e.riderName ?? "Your rider",
        merchantName: e.merchantName ?? "Store",
      },
      target: { user_id: e.customerId },
      idempotencyKey: `ORDER_RIDER_AT_STORE:${e.orderId}`,
      metadata: foodLiveMetadata("ORDER_RIDER_AT_STORE", e.orderId, {
        riderName: e.riderName,
        merchantName: e.merchantName,
      }),
    });
  });

  on("order.rider_arriving", async (e) => {
    if (!e.customerId) return;
    await sendNotification({
      templateCode: "ORDER_RIDER_ARRIVING",
      variables: {
        orderId: e.orderId,
        orderShortId: e.orderShortId ?? e.orderId,
        riderName: e.riderName ?? "Your rider",
        etaMinutes: e.etaMinutes ?? 5,
      },
      target: { user_id: e.customerId },
      idempotencyKey: `ORDER_RIDER_ARRIVING:${e.orderId}`,
      metadata: foodLiveMetadata("ORDER_RIDER_ARRIVING", e.orderId, {
        riderName: e.riderName,
        etaMinutes: e.etaMinutes,
      }),
    });
  });

  on("payment.settled", async (e) => {
    const template = e.status === "SUCCESS" ? "CUSTOMER_PAYMENT_SUCCESS" : "CUSTOMER_PAYMENT_FAILED";
    await sendNotification({
      templateCode: template,
      variables: {
        orderId: e.orderId,
        orderShortId: e.orderShortId ?? e.orderId,
        amount: e.amount,
        reason: e.reason ?? "",
      },
      target: { user_id: e.customerId },
      idempotencyKey: `${template}:${e.orderId}`,
      metadata: { orderId: e.orderId },
    });
  });

  on("customer.refund_initiated", async (e) => {
    await sendNotification({
      templateCode: "CUSTOMER_REFUND_INITIATED",
      variables: {
        orderId: e.orderId,
        orderShortId: e.orderShortId ?? e.orderId,
        amount: e.amount,
      },
      target: { user_id: e.customerId },
      idempotencyKey: `CUSTOMER_REFUND_INITIATED:${e.orderId}:${e.amount}`,
      metadata: { orderId: e.orderId },
    });
  });

  on("wallet.updated", async (e) => {
    const template =
      e.role === "customer" ? "CUSTOMER_WALLET_UPDATED"
      : e.role === "merchant" ? "MERCHANT_WALLET_UPDATED"
      : "RIDER_WALLET_UPDATED";
    await sendNotification({
      templateCode: template,
      variables: {
        direction: e.direction === "CREDIT" ? "Credited" : "Debited",
        amount: e.amount.toFixed(2),
        balance: e.balance.toFixed(2),
      },
      target: { user_id: e.userId },
      idempotencyKey: `${template}:${e.userId}:${Math.round(e.amount * 100)}:${Date.now()}`,
      metadata: { reason: e.reason },
    });
  });

  on("kyc.decision", async (e) => {
    let template: string;
    if (e.role === "merchant") {
      template = e.decision === "APPROVED" ? "MERCHANT_KYC_APPROVED" : "MERCHANT_KYC_REJECTED";
    } else {
      template = e.decision === "APPROVED" ? "RIDER_DOC_APPROVED" : "RIDER_DOC_REJECTED";
    }
    await sendNotification({
      templateCode: template,
      variables: {
        docType: e.docType ?? "Document",
        reason: e.reason ?? "",
      },
      target: { user_id: e.userId },
      idempotencyKey: `${template}:${e.userId}:${e.docType ?? "any"}:${e.decision}`,
      metadata: {},
    });
  });

  on("rider.vehicle_verified", async (e) => {
    await sendNotification({
      templateCode: "RIDER_VEHICLE_VERIFIED",
      variables: { riderId: e.userId },
      target: { user_id: e.userId },
      idempotencyKey: `RIDER_VEHICLE_VERIFIED:${e.userId}`,
    });
  });

  on("account.state_changed", async (e) => {
    const template =
      e.newState === "SUSPENDED" ? "ACCOUNT_SUSPENDED"
      : e.newState === "REACTIVATED" ? "ACCOUNT_REACTIVATED"
      : "RIDER_BLACKLISTED";
    await sendNotification({
      templateCode: template,
      variables: { reason: e.reason ?? "" },
      target: { user_id: e.userId },
      priority: "critical",
      idempotencyKey: `${template}:${e.userId}:${Date.now()}`,
      metadata: {},
    });
  });

  on("wallet.withdrawal", async (e) => {
    if (e.role !== "rider") return; // no merchant withdrawal template yet
    const template =
      e.status === "REQUESTED" ? "RIDER_WITHDRAWAL_REQUESTED"
      : e.status === "SUCCESS" ? "RIDER_WITHDRAWAL_SUCCESS"
      : "RIDER_WITHDRAWAL_FAILED";
    await sendNotification({
      templateCode: template,
      variables: {
        amount: e.amount.toFixed(2),
        reason: e.reason ?? "",
        eta: e.eta ?? "24-48 hours",
      },
      target: { user_id: e.userId },
      idempotencyKey: `${template}:${e.userId}:${Math.round(e.amount * 100)}`,
    });
  });

  on("merchant.settlement", async (e) => {
    const template = e.status === "SUCCESS" ? "MERCHANT_SETTLEMENT_SUCCESS" : "MERCHANT_SETTLEMENT_FAILED";
    await sendNotification({
      templateCode: template,
      variables: {
        amount: e.amount.toFixed(2),
        period: e.period ?? "recent",
        reason: e.reason ?? "",
      },
      target: { user_id: e.merchantUserId },
      idempotencyKey: `${template}:${e.merchantUserId}:${e.period ?? "any"}:${Math.round(e.amount * 100)}`,
    });
  });

  on("subscription.event", async (e) => {
    let template: string;
    if (e.role === "merchant") {
      template = e.event === "RENEWED" ? "MERCHANT_SUBSCRIPTION_RENEWED" : "MERCHANT_SUBSCRIPTION_EXPIRING";
    } else {
      template = "CUSTOMER_SUBSCRIPTION_UPDATE";
    }
    await sendNotification({
      templateCode: template,
      variables: {
        expiresOn: e.expiresOn ?? "",
        title: e.event === "RENEWED" ? "Subscription renewed" : "Subscription update",
        body: e.event === "EXPIRED" ? "Your subscription has expired." : "Your subscription status changed.",
      },
      target: { user_id: e.userId },
      idempotencyKey: `${template}:${e.userId}:${e.event}:${e.expiresOn ?? "na"}`,
    });
  });

  console.log("[notifications] domain event handlers registered");
}
