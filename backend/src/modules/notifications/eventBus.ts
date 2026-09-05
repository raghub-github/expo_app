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
import type { TemplateVariables } from "./types.js";
import { getSql } from "../../db/client.js";
import {
  clearMerchantStoreOrderNotificationsByOrderRef,
  shouldClearOrderNotifications,
} from "../../lib/clear-merchant-order-notifications.js";
import { clearCustomerOrderNotifications } from "../../lib/clear-customer-order-notifications.js";
import { resolveCustomerOrderCancelledTemplateCode } from "../../lib/order-cancel-notification.js";
import {
  lookupFoodOrderIdByCoreOrderText,
  merchantAppOrderHref,
  merchantAppHomeNewOrdersHref,
} from "../../lib/merchant-new-order-notify.js";
import { resolveMerchantVisibleOrderNotify } from "../../lib/merchant-visible-pricing.js";

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
    /** Explicit cancel refund decision from the cancel path (preferred). */
    refundEligible?: boolean | null;
    refundStatus?: string | null;
    refundAmount?: number | null;
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
    riderId?: number | string | null;
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

  "wallet.frozen": {
    role: "rider" | "merchant";
    userId: string;
    reason?: string | null;
  };

  "wallet.unfrozen": {
    role: "rider" | "merchant";
    userId: string;
  };

  "store.delisted": {
    role: "merchant";
    userId: string;
    storeId: number;
    storeName?: string;
    reason?: string | null;
  };

  "store.relisted": {
    role: "merchant";
    userId: string;
    storeId: number;
    storeName?: string;
  };

  // Any wallet ledger insertion.
  "wallet.updated": {
    userId: string;
    role: "customer" | "merchant" | "rider";
    direction: "CREDIT" | "DEBIT";
    amount: number;
    balance: number;
    reason?: string;
    /** Stable ledger / txn id for idempotency (preferred). */
    ledgerId?: string | number | null;
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

  /** Rider penalty (agent dashboard or order cancellation). */
  "rider.penalty": {
    userId: string;
    amount: number;
    reason?: string;
    orderId?: string | number | null;
    penaltyId?: string | number | null;
  };

  /** Rider Driving Licence approaching expiry (pre-expiry warning window). */
  "rider.dl_expiring": {
    userId: string;
    role?: string;
    daysRemaining: number;
    expiryDate: string;
    window: number;
  };

  /** Rider bank account rejected by agent. */
  "rider.bank_rejected": {
    userId: string;
    reason: string;
    paymentMethodId?: string | number | null;
  };

  /** Rider bank account approved by agent. */
  "rider.bank_approved": {
    userId: string;
    paymentMethodId?: string | number | null;
  };

  // Withdrawal lifecycle.
  "wallet.withdrawal": {
    userId: string;
    role: "rider" | "merchant";
    amount: number;
    status: "REQUESTED" | "SUCCESS" | "FAILED";
    reason?: string;
    eta?: string;
    withdrawalId?: string | number | null;
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

  // Referral reward credited (GatiCash or rider wallet).
  "referral.reward_credited": {
    userId: string;
    role: "customer" | "rider" | "merchant";
    amount: number;
    title: string;
    body: string;
    party: "referrer" | "referred";
    /** Stable reward key / relationship id for idempotency. */
    rewardKey?: string | null;
  };

  // Customer / merchant / rider account welcome after signup.
  "user.signup": {
    userId: string;
    role: "customer" | "merchant" | "rider";
    name?: string | null;
  };

  // Customer address lifecycle.
  "customer.address_changed": {
    userId: string;
    action: "ADDED" | "UPDATED";
    addressId?: number | null;
  };

  // Support ticket update for any role.
  "support.ticket_updated": {
    userId: string;
    role: "customer" | "merchant" | "rider";
    ticketId: string;
    ticketTitle?: string;
    messagePreview: string;
  };

  // Merchant store approval / suspension.
  "merchant.store_status": {
    merchantUserId: string;
    storeId: number;
    storeName?: string | null;
    status: "APPROVED" | "SUSPENDED" | "ACTIVATED";
    reason?: string;
  };

  // Merchant menu moderation.
  "merchant.menu_decision": {
    merchantUserId: string;
    storeId: number;
    storeName?: string | null;
    decision: "APPROVED" | "REJECTED";
    reason?: string;
  };

  // Rider ops.
  "rider.order_reassigned": {
    riderUserId: string;
    orderId: string;
    reason?: string;
  };

  "rider.incentive": {
    riderUserId: string;
    amount: number;
    message?: string;
    incentiveId?: string | null;
  };

  "rider.shift_reminder": {
    riderUserId: string;
  };

  "rider.attendance": {
    riderUserId: string;
    message: string;
    attendanceKey?: string | null;
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
  // Customer cancel templates are chosen dynamically (refund eligible vs none).
  CANCELLED:         { merchant: "MERCHANT_ORDER_CANCELLED", rider: "RIDER_ORDER_CANCELLED" },
};

/** Live-progress metadata for food shade updates (customer app). */
const FOOD_LIVE_BY_TEMPLATE: Record<
  string,
  { step: number; title: string; body: string }
> = {
  ORDER_CREATED: { step: 1, title: "Order placed", body: "Waiting for store confirmation" },
  ORDER_ACCEPTED: { step: 1, title: "Order Confirmed by the Store", body: "Your order has been confirmed by the store and is now being prepared." },
  ORDER_PREPARING: { step: 1, title: "Preparing Your Order", body: "Preparing" },
  ORDER_FOOD_READY: { step: 2, title: "Ready for Pickup", body: "Rider arriving at store" },
  ORDER_RIDER_ASSIGNED: { step: 2, title: "Ready for Pickup", body: "Rider heading to store" },
  ORDER_RIDER_AT_STORE: { step: 2, title: "Ready for Pickup", body: "Rider at the store" },
  ORDER_OUT_FOR_DELIVERY: { step: 3, title: "On The Way", body: "Arriving" },
  ORDER_RIDER_ARRIVING: { step: 4, title: "Nearby", body: "Rider is almost there" },
  ORDER_DELIVERED: { step: 5, title: "Delivered", body: "Enjoy your meal!" },
};

function foodLiveMetadata(
  templateCode: string,
  orderId: string,
  extras?: {
    riderName?: string | null;
    merchantName?: string | null;
    etaMinutes?: number;
    deliveryOtp?: string | null;
  }
): Record<string, unknown> {
  const live = FOOD_LIVE_BY_TEMPLATE[templateCode];
  const base: Record<string, unknown> = {
    orderId,
    gmType: templateCode,
  };
  if (!live) return base;
  let liveBody = live.body;
  if (templateCode === "ORDER_RIDER_ARRIVING" && extras?.deliveryOtp) {
    liveBody = `OTP ${extras.deliveryOtp} · Share with your delivery partner`;
  }
  return {
    ...base,
    gmLiveProgress: true,
    liveService: "food",
    liveStep: live.step,
    liveSteps: 5,
    liveTitle: live.title,
    liveBody,
    skip_in_app_banner: true,
    ...(extras?.merchantName ? { storeName: extras.merchantName } : {}),
    ...(extras?.etaMinutes != null ? { etaMinutes: extras.etaMinutes } : {}),
    ...(extras?.deliveryOtp ? { deliveryOtp: extras.deliveryOtp } : {}),
  };
}

let wired = false;

/** Idempotent — call once from src/index.ts on boot. */
export function registerDomainEventHandlers(): void {
  if (wired) return;
  wired = true;

  // Order status → clear stale "New order!" inbox rows, then push templates.
  on("order.status_changed", async (e) => {
    if (shouldClearOrderNotifications(e.toStatus)) {
      if (e.merchantStoreId != null && e.merchantStoreId > 0) {
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
      try {
        await clearCustomerOrderNotifications(getSql(), {
          orderIdText: e.orderId,
          formattedOrderId: e.orderShortId ?? e.orderId,
          customerUserId: e.customerId ?? null,
        });
      } catch {
        /* customer inbox clear is best-effort */
      }
    }

    const map = STATUS_TO_TEMPLATE[e.toStatus.toUpperCase()];
    const toStatus = e.toStatus.toUpperCase();
    const foodOrderId = await lookupFoodOrderIdByCoreOrderText(getSql(), {
      orderIdText: e.orderId,
      merchantStoreId: e.merchantStoreId,
    });
    // Store-token lifecycle push for every merchant-visible stage (works when
    // the template map has no merchant row, e.g. preparing / ready / RTO).
    if (e.merchantStoreId != null && e.merchantStoreId > 0) {
      try {
        const { notifyMerchantOrderLifecycle } = await import(
          "../../lib/merchant-push-notify.js"
        );
        const foodIdNum =
          foodOrderId != null && /^\d+$/.test(foodOrderId) ? Number(foodOrderId) : NaN;
        await notifyMerchantOrderLifecycle(getSql(), {
          storeId: e.merchantStoreId,
          foodOrderId: Number.isInteger(foodIdNum) && foodIdNum > 0 ? foodIdNum : null,
          displayOrderId: e.orderShortId ?? e.orderId,
          stage: toStatus,
          reason: e.reason ?? null,
        });
      } catch (err) {
        console.warn(
          "[eventBus] merchant lifecycle push failed:",
          (err as Error)?.message ?? err
        );
      }
    }

    if (!map) return;
    const vars = {
      orderId: e.orderId,
      orderShortId: e.orderShortId ?? e.orderId,
      merchantName: e.merchantName ?? "Store",
      reason: e.reason ?? "",
      riderName: e.riderName ?? "Your rider",
      etaMinutes: 25,
    };
    let customerTemplate = map.customer;
    if (toStatus === "CANCELLED" && e.customerId) {
      let refundEligible = e.refundEligible;
      let refundStatus = e.refundStatus ?? null;
      let refundAmount = e.refundAmount ?? null;
      // Fallback: read latest cancellation row when emitters omit refund fields.
      if (refundEligible == null && refundStatus == null && refundAmount == null) {
        try {
          const rows = (await getSql()`
            SELECT refund_status, refund_amount
            FROM public.order_cancellation_reasons
            WHERE order_id = (
              SELECT id FROM public.orders_core
              WHERE order_id = ${e.orderId} OR formatted_order_id = ${e.orderId}
              LIMIT 1
            )
            ORDER BY cancelled_at DESC NULLS LAST, id DESC
            LIMIT 1
          `) as unknown as Array<{ refund_status?: string | null; refund_amount?: unknown }>;
          const row = rows[0];
          if (row) {
            refundStatus = row.refund_status ?? null;
            refundAmount =
              row.refund_amount != null && Number.isFinite(Number(row.refund_amount))
                ? Number(row.refund_amount)
                : null;
          }
        } catch {
          /* best-effort */
        }
      }
      customerTemplate = resolveCustomerOrderCancelledTemplateCode({
        refundEligible,
        refundStatus,
        refundAmount,
      });
    }

    if (customerTemplate && e.customerId) {
      await sendNotification({
        templateCode: customerTemplate,
        variables: vars,
        target: { user_id: e.customerId },
        idempotencyKey: `${customerTemplate}:${e.orderId}`,
        metadata: foodLiveMetadata(customerTemplate, e.orderId, {
          merchantName: e.merchantName,
          riderName: e.riderName,
        }),
      });
    }
    if (map.merchant && e.merchantUserId) {
      // Store-token lifecycle push already covers cancel (avoids twin shade alerts).
      const skipMerchantTemplate =
        map.merchant === "MERCHANT_ORDER_CANCELLED" &&
        e.merchantStoreId != null &&
        e.merchantStoreId > 0;
      if (!skipMerchantTemplate) {
        const merchantVars: TemplateVariables = {
          ...vars,
          foodOrderId: foodOrderId ?? "",
          orderId: foodOrderId ?? e.orderId,
        };
        if (
          map.merchant === "MERCHANT_NEW_ORDER" &&
          e.merchantStoreId != null &&
          e.merchantStoreId > 0
        ) {
          try {
            const ctm = await resolveMerchantVisibleOrderNotify(getSql(), {
              merchantStoreId: e.merchantStoreId,
              orderIdText: e.orderId,
            });
            if (ctm) {
              merchantVars.amount = ctm.amount;
              merchantVars.itemCount = ctm.itemCount;
              merchantVars.customerName = ctm.customerName;
            }
          } catch {
            /* keep template without amount rather than customer CTC */
          }
        }
        await sendNotification({
          templateCode: map.merchant,
          variables: merchantVars,
          // Prefer store_id so merchant_store_push_tokens + parent Expo tokens resolve.
          target:
            e.merchantStoreId != null && e.merchantStoreId > 0
              ? { store_id: e.merchantStoreId }
              : { user_id: e.merchantUserId },
          // Align with notifyMerchantStoreNewOrder so placement + status_changed
          // retries cannot twin-push the same CREATED order.
          idempotencyKey:
            map.merchant === "MERCHANT_NEW_ORDER" &&
            e.merchantStoreId != null &&
            e.merchantStoreId > 0
              ? `MERCHANT_NEW_ORDER:${e.orderId}:${e.merchantStoreId}`
              : `${map.merchant}:${e.orderId}:${e.toStatus}`,
          ...(map.merchant === "MERCHANT_NEW_ORDER"
            ? {
                overrides: {
                  title: "🔔 New Order Received",
                  body: `Order #${e.orderShortId ?? e.orderId} is waiting for your acceptance.`,
                },
              }
            : {}),
          metadata: {
            type: map.merchant === "MERCHANT_NEW_ORDER" ? "merchant_new_order" : "merchant_order",
            orderId: e.orderId,
            foodOrderId,
            url:
              map.merchant === "MERCHANT_NEW_ORDER"
                ? merchantAppHomeNewOrdersHref()
                : merchantAppOrderHref(foodOrderId),
            gmType: map.merchant,
            stage: toStatus,
            skip_in_app_banner: true,
          },
        });
      }
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
      idempotencyKey: `ORDER_RIDER_ASSIGNED:${e.orderId}`,
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
        skip_in_app_banner: true,
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
    // Dedicated OTP push (once) — includes delivery OTP in title/body.
    void import("../../lib/otp-radius-notify.js")
      .then(({ notifyCustomerDeliveryOtpOnRadius }) =>
        notifyCustomerDeliveryOtpOnRadius({
          orderIdText: e.orderId,
          riderId: e.riderId != null ? Number(e.riderId) : 0,
          riderName: e.riderName,
        })
      )
      .catch(() => {});
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

  on("wallet.frozen", async (e) => {
    const template = e.role === "merchant" ? "MERCHANT_WALLET_FROZEN" : "RIDER_WALLET_FROZEN";
    await sendNotification({
      templateCode: template,
      variables: { reason: e.reason?.trim() || "Contact support." },
      target: { user_id: e.userId },
      priority: "high",
      idempotencyKey: `${template}:${e.userId}:${Date.now()}`,
      metadata: { reason: e.reason ?? null, url: e.role === "rider" ? "/(tabs)/earnings" : "/earnings" },
    });
  });

  on("wallet.unfrozen", async (e) => {
    const template = e.role === "merchant" ? "MERCHANT_WALLET_UNFROZEN" : "RIDER_WALLET_UNFROZEN";
    await sendNotification({
      templateCode: template,
      variables: {},
      target: { user_id: e.userId },
      priority: "high",
      idempotencyKey: `${template}:${e.userId}:${Date.now()}`,
      metadata: { url: e.role === "rider" ? "/(tabs)/earnings" : "/earnings" },
    });
  });

  on("store.delisted", async (e) => {
    await sendNotification({
      templateCode: "MERCHANT_STORE_DELISTED",
      variables: {
        storeName: e.storeName?.trim() || "Your store",
        reason: e.reason?.trim() || "Contact support.",
      },
      target: { store_id: e.storeId },
      priority: "high",
      channel: "push",
      idempotencyKey: `MERCHANT_STORE_DELISTED:${e.storeId}`,
      metadata: { storeId: e.storeId, url: "/(tabs)", screen: "home" },
    });
  });

  on("store.relisted", async (e) => {
    await sendNotification({
      templateCode: "MERCHANT_STORE_RELISTED",
      variables: { storeName: e.storeName?.trim() || "Your store" },
      target: { store_id: e.storeId },
      priority: "high",
      channel: "push",
      idempotencyKey: `MERCHANT_STORE_RELISTED:${e.storeId}`,
      metadata: { storeId: e.storeId, url: "/(tabs)", screen: "home" },
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
      idempotencyKey: `${template}:${e.userId}:${e.direction}:${Math.round(e.amount * 100)}:${e.ledgerId ?? Math.round(e.balance * 100)}:${e.reason ?? "na"}`,
      metadata: { reason: e.reason, ledgerId: e.ledgerId ?? null },
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
    // Rider templates are role-scoped; customer ACCOUNT_* codes will role_mismatch for riders.
    const template =
      e.role === "rider"
        ? e.newState === "REACTIVATED"
          ? "RIDER_ACCOUNT_ACTIVATED"
          : e.newState === "SUSPENDED"
            ? "RIDER_ACCOUNT_DEACTIVATED"
            : "RIDER_BLACKLISTED"
        : e.newState === "SUSPENDED"
          ? "ACCOUNT_SUSPENDED"
          : e.newState === "REACTIVATED"
            ? "ACCOUNT_REACTIVATED"
            : "RIDER_BLACKLISTED";
    await sendNotification({
      templateCode: template,
      variables: { reason: e.reason ?? "" },
      target: { user_id: e.userId },
      priority: "critical",
      idempotencyKey: `${template}:${e.userId}:${e.newState}:${e.reason ?? "na"}:${Date.now()}`,
      metadata: {
        newState: e.newState,
        reason: e.reason ?? null,
        url: e.role === "rider" ? "/(tabs)/earnings" : "/support",
      },
    });
  });

  on("rider.penalty", async (e) => {
    await sendNotification({
      templateCode: "RIDER_PENALTY",
      variables: {
        amount: Number(e.amount).toFixed(2),
        reason: e.reason?.trim() || "Penalty applied to your wallet.",
      },
      target: { user_id: e.userId },
      priority: "high",
      idempotencyKey: `RIDER_PENALTY:${e.userId}:${e.penaltyId ?? e.orderId ?? Math.round(e.amount * 100)}:${Date.now()}`,
      metadata: {
        amount: e.amount,
        reason: e.reason ?? null,
        orderId: e.orderId ?? null,
        penaltyId: e.penaltyId ?? null,
        url: "/(tabs)/earnings",
      },
    });
  });

  on("rider.dl_expiring", async (e) => {
    await sendNotification({
      templateCode: "RIDER_DL_EXPIRING",
      variables: {
        daysRemaining: String(e.daysRemaining),
        expiryDate: e.expiryDate,
      },
      target: { user_id: e.userId },
      priority: "high",
      // Idempotent per (rider, expiry, window) — never double-sends a window's warning.
      idempotencyKey: `RIDER_DL_EXPIRING:${e.userId}:${e.expiryDate}:${e.window}`,
      metadata: {
        daysRemaining: e.daysRemaining,
        expiryDate: e.expiryDate,
        url: "/vehicles",
      },
    });
  });

  on("rider.bank_rejected", async (e) => {
    await sendNotification({
      templateCode: "RIDER_BANK_REJECTED",
      variables: {
        reason: e.reason.trim() || "Your bank account was rejected. Please add a valid account.",
      },
      target: { user_id: e.userId },
      priority: "high",
      idempotencyKey: `RIDER_BANK_REJECTED:${e.userId}:${e.paymentMethodId ?? "na"}:${Date.now()}`,
      metadata: {
        reason: e.reason,
        paymentMethodId: e.paymentMethodId ?? null,
        url: "/(tabs)/earnings",
      },
    });
  });

  on("rider.bank_approved", async (e) => {
    await sendNotification({
      templateCode: "RIDER_BANK_APPROVED",
      variables: {},
      target: { user_id: e.userId },
      priority: "high",
      idempotencyKey: `RIDER_BANK_APPROVED:${e.userId}:${e.paymentMethodId ?? "na"}:${Date.now()}`,
      metadata: {
        paymentMethodId: e.paymentMethodId ?? null,
        url: "/(tabs)/earnings",
      },
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
      idempotencyKey: `${template}:${e.userId}:${e.status}:${e.withdrawalId ?? Math.round(e.amount * 100)}`,
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

  on("referral.reward_credited", async (e) => {
    const template =
      e.role === "customer"
        ? "REFERRAL_REWARD_CUSTOMER"
        : e.role === "merchant"
          ? "REFERRAL_REWARD_MERCHANT"
          : "REFERRAL_REWARD_RIDER";
    await sendNotification({
      templateCode: template,
      variables: {
        amount: e.amount.toFixed(2),
        title: e.title,
        body: e.body,
      },
      overrides: { title: e.title, body: e.body },
      target: { user_id: e.userId },
      idempotencyKey: `${template}:${e.userId}:${e.party}:${e.rewardKey ?? Math.round(e.amount * 100)}`,
      metadata: { category: "referral", party: e.party, rewardKey: e.rewardKey ?? null },
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

  on("user.signup", async (e) => {
    const template =
      e.role === "customer" ? "CUSTOMER_SIGNUP"
      : e.role === "merchant" ? "MERCHANT_SIGNUP"
      : "RIDER_SIGNUP";
    await sendNotification({
      templateCode: template,
      variables: { customerName: e.name ?? "", name: e.name ?? "" },
      target: { user_id: e.userId },
      idempotencyKey: `${template}:${e.userId}`,
    });
  });

  on("customer.address_changed", async (e) => {
    const template = e.action === "ADDED" ? "CUSTOMER_ADDRESS_ADDED" : "CUSTOMER_ADDRESS_UPDATED";
    await sendNotification({
      templateCode: template,
      variables: {},
      target: { user_id: e.userId },
      overrides: { deepLink: "/addresses" },
      idempotencyKey: `${template}:${e.userId}:${e.addressId ?? "na"}`,
    });
  });

  on("support.ticket_updated", async (e) => {
    const template =
      e.role === "customer" ? "CUSTOMER_SUPPORT_TICKET"
      : e.role === "rider" ? "RIDER_SUPPORT_TICKET"
      : "MERCHANT_SUPPORT_TICKET";
    await sendNotification({
      templateCode: template,
      variables: {
        ticketId: e.ticketId,
        ticketTitle: e.ticketTitle ?? "Support",
        messagePreview: e.messagePreview,
      },
      target: { user_id: e.userId },
      idempotencyKey: `${template}:${e.ticketId}:${e.messagePreview.slice(0, 40)}`,
    });
  });

  on("merchant.store_status", async (e) => {
    const template =
      e.status === "SUSPENDED" ? "MERCHANT_STORE_SUSPENDED"
      : e.status === "APPROVED" ? "MERCHANT_STORE_APPROVED"
      : "MERCHANT_STORE_ACTIVATED";
    await sendNotification({
      templateCode: template,
      variables: {
        storeName: e.storeName ?? "Your store",
        reason: e.reason ?? "",
      },
      target: { user_id: e.merchantUserId },
      priority: e.status === "SUSPENDED" ? "critical" : "high",
      idempotencyKey: `${template}:${e.storeId}:${e.status}`,
    });
  });

  on("merchant.menu_decision", async (e) => {
    const template = e.decision === "APPROVED" ? "MERCHANT_MENU_APPROVED" : "MERCHANT_MENU_REJECTED";
    await sendNotification({
      templateCode: template,
      variables: {
        storeName: e.storeName ?? "Your store",
        reason: e.reason ?? "",
      },
      target: { user_id: e.merchantUserId },
      idempotencyKey: `${template}:${e.storeId}:${e.decision}`,
    });
  });

  on("rider.order_reassigned", async (e) => {
    await sendNotification({
      templateCode: "RIDER_ORDER_REASSIGNED",
      variables: { orderId: e.orderId, reason: e.reason ?? "" },
      target: { user_id: e.riderUserId },
      idempotencyKey: `RIDER_ORDER_REASSIGNED:${e.orderId}:${e.riderUserId}`,
    });
  });

  on("rider.incentive", async (e) => {
    await sendNotification({
      templateCode: "RIDER_INCENTIVE",
      variables: {
        amount: e.amount.toFixed(2),
        message: e.message ?? "Keep riding!",
      },
      target: { user_id: e.riderUserId },
      idempotencyKey: `RIDER_INCENTIVE:${e.riderUserId}:${e.incentiveId ?? Math.round(e.amount * 100)}`,
    });
  });

  on("rider.shift_reminder", async (e) => {
    await sendNotification({
      templateCode: "RIDER_SHIFT_REMINDER",
      variables: {},
      target: { user_id: e.riderUserId },
      idempotencyKey: `RIDER_SHIFT_REMINDER:${e.riderUserId}:${new Date().toISOString().slice(0, 10)}`,
    });
  });

  on("rider.attendance", async (e) => {
    await sendNotification({
      templateCode: "RIDER_ATTENDANCE",
      variables: { message: e.message },
      target: { user_id: e.riderUserId },
      idempotencyKey: `RIDER_ATTENDANCE:${e.riderUserId}:${e.attendanceKey ?? e.message.slice(0, 40)}`,
    });
  });

  console.log("[notifications] domain event handlers registered");
}
