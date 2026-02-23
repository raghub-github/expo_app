/**
 * Order service - create order, get order details, list history.
 * All APIs use orderId as the canonical reference (string: numeric for legacy, "GM10000001" for new orders_core).
 */

import api from "./api";

const ORDERS_PREFIX = "/v1/orders";

export type OrderSummary = {
  /** Canonical order reference (string; e.g. GM-<ts>-<hex> for new orders). */
  orderId: string;
  status: string;
  merchantName?: string;
  totalAmount?: number;
  createdAt: string;
  items?: { name: string; quantity: number; price: number }[];
};

export type OrderDetail = OrderSummary & {
  statusHistory?: { status: string; at: string }[];
  rider?: { name: string; phone?: string };
  deliveryAddress?: string;
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
};

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
};

/** Payment-first: create pending order (lock cart). Returns pendingId + amount in paise for Razorpay. */
export type CreatePendingPayload = Omit<
  CreateOrderPayload,
  "razorpayOrderId" | "razorpayPaymentId" | "razorpaySignature"
>;

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
  status: string;
  totalAmount: number;
  createdAt: string;
};

export const orderService = {
  /** Legacy: single-call create (payment params optional). Prefer createPending + finalize for reliability. */
  async createOrder(payload: CreateOrderPayload): Promise<OrderDetail> {
    const { data } = await api.post<OrderDetail>(ORDERS_PREFIX, payload);
    return data;
  },

  async createPendingOrder(payload: CreatePendingPayload): Promise<CreatePendingResponse> {
    const { data } = await api.post<CreatePendingResponse>(`${ORDERS_PREFIX}/pending`, payload);
    return data;
  },

  async finalizeOrder(payload: FinalizeOrderPayload): Promise<FinalizeOrderResponse> {
    const { data } = await api.post<FinalizeOrderResponse>(`${ORDERS_PREFIX}/finalize`, payload);
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
