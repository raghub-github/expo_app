/**
 * Order service - create order, get order details, list history.
 * All APIs use orderId as the canonical reference (string: numeric for legacy, "GM10000001" for new orders_core).
 */

import api from "./api";
import { ORDER_PLACEMENT_TIMEOUT_MS } from "@/constants";
import { isRetriableCheckoutError } from "@/utils/networkError";

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
  paymentStatus?: string | null;
  checkoutMetadata?: Record<string, unknown> | null;
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
  storeRatingSubmitted?: boolean;
  storeRating?: number | null;
  deliveryRating?: number | null;
  /** Human-readable cancellation reason (orders_food.rejected_reason). */
  cancellationReason?: string | null;
  /** Who cancelled — e.g. Cancelled by me, Rejected by Restaurant. */
  cancelledByLabel?: string | null;
  /** From order_cancellation_reasons — Refunded line on history when completed. */
  refundStatus?: string | null;
  orderType?: string | null;
  rideType?: string | null;
  deliveryAddress?: string | null;
  pickupOtp?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  /** Trip distance in km when available (rides). Mirrors OrderDetail.distanceKm. */
  distanceKm?: number | null;
  billingSnapshot?: Record<string, unknown> | null;
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
  rider?: {
    name: string;
    phone?: string;
    photoUrl?: string | null;
    rating?: number | null;
    deliveredOrdersCount?: number | null;
    vehicleRegistration?: string | null;
    vehicleModel?: string | null;
  };
  deliveryAddress?: string;
  deliveryAddressLabel?: string | null;
  deliveryContactName?: string | null;
  deliveryContactPhone?: string | null;
  deliveryPrimaryContactName?: string | null;
  alternateContactName?: string | null;
  alternateContactPhone?: string | null;
  /** Set when customer added an alternate contact from order help (one-time). */
  alternateContactSetAt?: string | null;
  deliveryInstructionsList?: string[];
  merchantInstructionsList?: string[];
  merchantPhone?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  /** 4-digit code shown on customer tracking for delivery handoff. */
  deliveryOtp?: string | null;
  /** 4-digit pickup OTP for person_ride — share with rider at pickup. */
  pickupOtp?: string | null;
  orderType?: string | null;
  rideType?: string | null;
  /** ISO timestamp when assigned rider marked reached pickup. */
  riderReachedPickupAt?: string | null;
  /** ISO timestamp when rider marked food pickup (OTP/barcode/mark). */
  riderPickedUpAt?: string | null;
  /** ISO timestamp when rider verified pickup OTP (person_ride). */
  pickupOtpVerifiedAt?: string | null;
  /** Person ride started — captain en route to drop. */
  rideStarted?: boolean | null;
  /** Optional: for map – when available from backend */
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  merchantStoreId?: number | null;
  storeRatingSubmitted?: boolean;
  storeRating?: number | null;
  deliveryRating?: number | null;
  storeReviewText?: string | null;
  riderReviewText?: string | null;
  storeReviewTags?: string[];
  riderReviewTags?: string[];
  /** Customer packaging feedback: good | not_good */
  customerPackagingFeedback?: "good" | "not_good" | null;
  /** Customer answer: was rider in GatiMitra uniform? */
  customerRiderInUniform?: boolean | null;
  /** Rider tip paid at checkout (₹). */
  tipAmount?: number | null;
  /** Trip distance in km when available. */
  distanceKm?: number | null;
  /** Estimated or actual ride duration in minutes. */
  rideDurationMinutes?: number | null;
  /** Person ride: finalized pickup wait duration (seconds). */
  pickupWaitSeconds?: number | null;
  pickupWaitingChargePerMin?: number | null;
  estimatedPickupWaitingCharge?: number | null;
  deliveryPromiseComparison?: {
    promisedMinutes: number;
    actualMinutes: number;
    deltaMinutes: number;
    message: string;
  } | null;
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
  customizationId?: string | null;
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
  /** GatiCash wallet amount applied to this checkout (INR). */
  gatiCashAmount?: number;
  /** Missed-offer GatiCash credit to apply after order is placed. */
  missedOfferCompensation?: {
    amountInr: number;
    offerKey: string;
    offerId?: number | null;
    offerSource?: "platform" | "merchant" | null;
    offerKind?: string;
    offerTitle?: string;
    /** Discount applied on this order when unlocked via GatiCash. */
    discountInr?: number;
  };
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
  subscriptionPlanId?: number;
  subscriptionBillingCycle?: "weekly" | "monthly" | "yearly";
  /** 'delivery' (default) or 'self_pickup'. Self-pickup zeroes the delivery fee server-side. */
  deliveryType?: "delivery" | "self_pickup";
  checkoutMetadata?: CheckoutMetadataPayload;
  selectedPlatformOfferId?: number | null;
  selectedMerchantOfferId?: number | null;
  forceNoAutoOffer?: boolean;
  /** GatiCash wallet amount to apply on this order (INR). */
  gatiCashAmount?: number;
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

  /** Pending order with retries on flaky LAN / slow billing recalc (idempotent via Idempotency-Key). */
  async createPendingOrderWithRetry(
    payload: CreatePendingPayload,
    opts: { retries?: number; delayMs?: number } = {}
  ): Promise<CreatePendingResponse> {
    const { retries = 2, delayMs = 1200 } = opts;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.createPendingOrder(payload);
      } catch (e) {
        lastErr = e;
        if (!isRetriableCheckoutError(e) || attempt === retries) throw e;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
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

  /** Finalize with retries on network error or idempotent server failures (safe to retry). */
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
        if (!isRetriableCheckoutError(e) || attempt === retries) throw e;
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
    const { data } = await api.get<OrderSummary[] | { orders?: OrderSummary[] }>(ORDERS_PREFIX, {
      params,
    });
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && Array.isArray(data.orders)) return data.orders;
    return [];
  },

  async submitStoreRating(
    orderId: string,
    payload: {
      storeRating?: number | null;
      deliveryRating?: number | null;
      reviewText?: string | null;
      riderReviewText?: string | null;
      storeReviewTags?: string[];
      riderReviewTags?: string[];
      riderTipAmount?: number | null;
    }
  ): Promise<{ submitted: true; storeRating: number | null; deliveryRating: number | null }> {
    const { data } = await api.post(`${ORDERS_PREFIX}/${orderId}/store-rating`, payload);
    return data;
  },

  async submitPostDeliveryFeedback(
    orderId: string,
    payload: {
      packagingFeedback?: "good" | "not_good";
      riderInUniform?: boolean;
    }
  ): Promise<{
    ok: true;
    packagingFeedback: "good" | "not_good" | null;
    riderInUniform: boolean | null;
  }> {
    const { data } = await api.post(`${ORDERS_PREFIX}/${orderId}/post-delivery-feedback`, payload);
    return data;
  },

  /** Pay a delivery partner tip during live order tracking (after Razorpay success). */
  async submitRiderTip(
    orderId: string,
    payload: {
      tipAmount: number;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }
  ): Promise<{ ok: true; tipAmount: number }> {
    const { data } = await api.post(`${ORDERS_PREFIX}/${orderId}/rider-tip`, payload);
    return data;
  },

  /** Pay ride fare after delivery (Razorpay verify + rider wallet credit). */
  async payRideFare(
    orderId: string,
    payload: {
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpaySignature?: string;
      gatiCashAmount?: number;
      couponCode?: string;
      platformOfferId?: number;
    }
  ): Promise<{ ok: true; amountPaid: number }> {
    const { data } = await api.post(`${ORDERS_PREFIX}/${orderId}/ride-fare-payment`, payload);
    return data;
  },

  /** Server-authoritative ride fare bill (billing rules + selected offers). */
  async getRideFareBill(
    orderId: string,
    payload?: {
      couponCode?: string | null;
      platformOfferId?: number | null;
      forceNoAutoOffer?: boolean;
    }
  ): Promise<import("@/lib/ride-fare-bill-display").RideFareBillApiResponse> {
    const { data } = await api.post(`${ORDERS_PREFIX}/${orderId}/ride-fare-bill`, {
      ...(payload?.couponCode?.trim() ? { couponCode: payload.couponCode.trim() } : {}),
      ...(payload?.platformOfferId != null && payload.platformOfferId > 0
        ? { platformOfferId: payload.platformOfferId }
        : {}),
      ...(payload?.forceNoAutoOffer ? { forceNoAutoOffer: true } : {}),
    });
    return data;
  },

  /** Email ride invoice PDF-style breakdown to customer (Zoho SMTP on server). */
  async sendRideInvoiceEmail(
    orderId: string,
    payload?: { email?: string }
  ): Promise<{ ok: true; sentTo: string }> {
    const { data } = await api.post(`${ORDERS_PREFIX}/${orderId}/ride-invoice-email`, {
      ...(payload?.email?.trim() ? { email: payload.email.trim() } : {}),
    });
    return data;
  },

  /** Append a cooking / kitchen note during live food order tracking. */
  async appendMerchantInstruction(
    orderId: string,
    instruction: string
  ): Promise<{ ok: true; merchantInstructionsList: string[] }> {
    const { data } = await api.post(`${ORDERS_PREFIX}/${orderId}/merchant-instructions`, {
      instruction,
    });
    return data;
  },

  async updateDeliveryInstructions(
    orderId: string,
    instructions: string[]
  ): Promise<{ ok: true; deliveryInstructionsList: string[] }> {
    const { data } = await api.post(`${ORDERS_PREFIX}/${orderId}/delivery-instructions`, {
      instructions,
    });
    return data;
  },

  async setAlternateContact(
    orderId: string,
    payload: { contactName: string; contactPhone: string }
  ): Promise<{ ok: true; deliveryContactName: string | null; deliveryContactPhone: string | null }> {
    const { data } = await api.post(`${ORDERS_PREFIX}/${orderId}/alternate-contact`, payload);
    return data;
  },

  /** Platform + delivery GST tax invoices (HTML for in-app viewer). */
  async fetchOrderInvoice(orderId: string): Promise<{ html: string; title: string }> {
    const { data } = await api.get(`${ORDERS_PREFIX}/${orderId}/invoice`);
    return data;
  },

  /** Order summary receipt (Bill Summary download — Zomato-style). */
  async fetchOrderReceipt(orderId: string): Promise<{ html: string; title: string }> {
    const { data } = await api.get(`${ORDERS_PREFIX}/${orderId}/receipt`);
    return data;
  },

  async cancelFoodOrder(
    orderId: string,
    payload: { reasonCode: string; reasonText: string }
  ): Promise<{ orderId: string; status: string }> {
    const { data } = await api.post<{ orderId: string; status: string }>(
      `${ORDERS_PREFIX}/${orderId}/cancel`,
      payload
    );
    return data;
  },
};
