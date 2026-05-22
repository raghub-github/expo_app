/**
 * Order service - create order, get order details, list history.
 * All APIs use orderId as the canonical reference (string: numeric for legacy, "GM10000001" for new orders_core).
 */

import api from "./api";
import { ORDER_PLACEMENT_TIMEOUT_MS } from "@/constants";

const ORDERS_PREFIX = "/v1/orders";

export type OrderSummary = {
  /** Canonical order reference (string; e.g. GM10000001). */
  orderId: string;
  /** Numeric orders_core.id — used for support tickets. */
  coreOrderId?: number | null;
  formattedOrderId?: string | null;
  status: string;
  merchantName?: string;
  merchantPublicName?: string | null;
  merchantPublicStoreId?: string | null;
  merchantAddress?: string | null;
  merchantBannerUrl?: string | null;
  merchantStoreId?: number | null;
  vegNonVeg?: string | null;
  avgRating?: number | null;
  totalReviews?: number | null;
  totalAmount?: number;
  createdAt: string;
  items?: {
    name: string;
    quantity: number;
    price: number;
    menuItemId?: string | null;
    lineTotal?: number | null;
    vegNonVeg?: string | null;
    variantName?: string | null;
    customization?: string | null;
  }[];
};

export type OrderDetail = OrderSummary & {
  /** Numeric orders_core.id — required for order-linked support tickets. */
  coreOrderId?: number | null;
  billingSnapshot?: Record<string, unknown> | null;
  statusHistory?: { status: string; at: string }[];
  /** Minutes the restaurant committed at accept. */
  prepTimeMinutes?: number | null;
  /** ISO timestamp when food should be ready (merchant accept). */
  prepReadyByAt?: string | null;
  rider?: { name: string; phone?: string };
  deliveryAddress?: string;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  /** 4-digit code shown on customer tracking for delivery handoff. */
  deliveryOtp?: string | null;
  /** Optional: for map – when available from backend */
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
};

/** Live rider position for tracking map (from GET /orders/:id/tracking) */
export type OrderTrackingResponse = {
  orderId: string;
  rider: {
    latitude: number;
    longitude: number;
    headingDegrees: number | null;
    updatedAt: string;
  } | null;
};

export type CreateOrderItemAddon = {
  addonId: string;
  addonName: string;
  addonPrice: number;
  quantity: number;
};

export type CreateOrderItem = {
  menuItemId: string;
  itemName: string;
  quantity: number;
  basePrice: number;
  variantId?: string | null;
  variantName?: string | null;
  addons?: CreateOrderItemAddon[];
  itemSnapshot?: Record<string, unknown> | null;
};

/** Mirrors backend checkout_metadata: leave-at-door, free-text notes, subscription opt-in, etc. */
export type CheckoutMetadataPayload = {
  leaveAtDoor?: boolean;
  /** Free-text for the delivery partner (gate, landmark, etc.). */
  deliveryInstructions?: string;
  leaveWithGuard?: boolean;
  avoidCalling?: boolean;
  dontRingBell?: boolean;
  petAtHome?: boolean;
  /** Human-readable chosen slot, e.g. "15 May Tomorrow · 12:00 PM - 12:30 PM". */
  scheduledDeliverySummary?: string;
  /** Free-text instructions for the kitchen (customer checkout). */
  restaurantNote?: string;
  /** When true, customer opted out of disposable cutlery. */
  skipCutlery?: boolean;
} & Record<string, unknown>;

export type CreateOrderPayload = {
  merchantId: string;
  merchantParentId?: string | number;
  items: CreateOrderItem[];
  addressId: string;
  paymentMethod: string;
  tipAmount?: number;
  donationAmount?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  pickupAddressRaw?: string;
  pickupLat?: number;
  pickupLon?: number;
  couponCode?: string | null;
  subscriptionOptIn?: boolean;
  /** 'delivery' (default) or 'self_pickup'. Self-pickup zeroes the delivery fee server-side. */
  deliveryType?: "delivery" | "self_pickup";
  checkoutMetadata?: CheckoutMetadataPayload;
  selectedPlatformOfferId?: number | null;
  forceNoAutoOffer?: boolean;
};

/** Payment-first: create pending order (lock cart). Returns pendingId + amount in paise for Razorpay. */
export type CreatePendingPayload = Omit<
  CreateOrderPayload,
  "razorpayOrderId" | "razorpayPaymentId" | "razorpaySignature"
> & {
  /**
   * Optional idempotency key. When provided, a second call from the same
   * customer with the same key returns the existing pendingId (prevents
   * duplicate pending orders on double-tap / retry). Usually derived once per
   * checkout attempt and reused for retries until success / cancel.
   */
  idempotencyKey?: string | null;
};

export type CreatePendingResponse = {
  pendingId: string;
  amount: number;
  currency: string;
};

/** Payment-first: finalize order after payment success. Idempotent. */
export type FinalizeOrderPayload = {
  pendingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export type FinalizeOrderResponse = {
  orderId: string;
  formattedOrderId?: string | null;
  status: string;
  totalAmount: number;
  createdAt: string;
};

export type PendingOrderStatusResponse = {
  pendingId: string;
  paymentState: string;
  finalized: boolean;
  orderId: string | null;
  refundStatus: string | null;
  paymentConfirmBy: string | null;
  message?: string | null;
};

export const orderService = {
  /** Legacy: single-call create (payment params optional). Prefer createPending + finalize for reliability. */
  async createOrder(payload: CreateOrderPayload): Promise<OrderDetail> {
    const { data } = await api.post<OrderDetail>(ORDERS_PREFIX, payload, {
      timeout: ORDER_PLACEMENT_TIMEOUT_MS,
    });
    return data;
  },

  async createPendingOrder(payload: CreatePendingPayload): Promise<CreatePendingResponse> {
    const { idempotencyKey, ...body } = payload;
    const headers: Record<string, string> = {};
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const { data } = await api.post<CreatePendingResponse>(
      `${ORDERS_PREFIX}/pending`,
      // Also echo idempotencyKey in body for servers / proxies that strip it.
      idempotencyKey ? { ...body, idempotencyKey } : body,
      {
        timeout: ORDER_PLACEMENT_TIMEOUT_MS,
        ...(Object.keys(headers).length ? { headers } : {}),
      }
    );
    return data;
  },

  async finalizeOrder(payload: FinalizeOrderPayload): Promise<FinalizeOrderResponse> {
    const { data } = await api.post<FinalizeOrderResponse>(`${ORDERS_PREFIX}/finalize`, payload, {
      timeout: ORDER_PLACEMENT_TIMEOUT_MS,
    });
    return data;
  },

  async getPendingOrderStatus(pendingId: string): Promise<PendingOrderStatusResponse> {
    const { data } = await api.get<PendingOrderStatusResponse>(`${ORDERS_PREFIX}/pending/${pendingId}`);
    return data;
  },

  /** Finalize with retries on network error (idempotent; safe to retry). */
  async finalizeOrderWithRetry(
    payload: FinalizeOrderPayload,
    opts: { retries?: number; delayMs?: number } = {}
  ): Promise<FinalizeOrderResponse> {
    const { retries = 3, delayMs = 1500 } = opts;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.finalizeOrder(payload);
      } catch (e) {
        lastErr = e;
        const isNetwork =
          (e as { code?: string; message?: string })?.code === "ERR_NETWORK" ||
          String((e as Error)?.message ?? "").toLowerCase().includes("network error");
        if (!isNetwork || attempt === retries) throw e;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  },

  async getOrder(orderId: string): Promise<OrderDetail> {
    const { data } = await api.get<OrderDetail>(`${ORDERS_PREFIX}/${orderId}`);
    return data;
  },

  /** Live rider location for tracking map; rider is null until rider starts delivery. */
  async getOrderTracking(orderId: string): Promise<OrderTrackingResponse> {
    const { data } = await api.get<OrderTrackingResponse>(`${ORDERS_PREFIX}/${orderId}/tracking`);
    return data;
  },

  async getMyOrders(params?: { limit?: number; offset?: number }): Promise<OrderSummary[]> {
    const { data } = await api.get<OrderSummary[]>(ORDERS_PREFIX, { params });
    return data;
  },
};
