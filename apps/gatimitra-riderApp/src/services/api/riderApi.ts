import { ApiClient } from "@gatimitra/sdk";
import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { useSessionStore } from "@/src/stores/sessionStore";
import { z } from "zod";

// API Response Schemas
const OrderSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "assigned", "picked_up", "in_transit", "delivered", "cancelled"]),
  category: z.enum(["food", "parcel", "ride"]),
  pickup: z.object({
    address: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  delivery: z.object({
    address: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  distanceKm: z.number().optional(),
  pickupDistanceKm: z.number().optional(),
  tripDistanceKm: z.number().optional(),
  totalDistanceKm: z.number().optional(),
  estimatedEarning: z.number(),
  baseEarning: z.number().optional(),
  customerTipAmount: z.number().optional(),
  waitingEarning: z.number().optional(),
  surgeEarning: z.number().optional(),
  appliedSurges: z
    .array(z.object({ name: z.string(), amount: z.number() }))
    .optional(),
  totalEarning: z.number().optional(),
  higherDispatchPriority: z.boolean().optional(),
  merchantName: z.string().nullable().optional(),
  itemCount: z.number().optional(),
  createdAt: z.string(),
  acceptDeadlineAt: z.string().optional(),
  rideType: z.string().optional(),
  formattedOrderId: z.string().nullable().optional(),
  atPickup: z.boolean().optional(),
  pickupOtpVerified: z.boolean().optional(),
  rideStarted: z.boolean().optional(),
  atCustomer: z.boolean().optional(),
  foodOrderStatus: z.string().nullable().optional(),
  merchantOrderReady: z.boolean().optional(),
  pickupWaitStartedAt: z.string().nullable().optional(),
  pickupWaitSeconds: z.number().nullable().optional(),
  pickupWaitFinalized: z.boolean().optional(),
  preparedAt: z.string().nullable().optional(),
  pickupTimerStartedAt: z.string().nullable().optional(),
  pickupTimerBudgetSeconds: z.number().nullable().optional(),
  pickupDurationSeconds: z.number().nullable().optional(),
  ridePickupWaitFreeMinutes: z.number().nullable().optional(),
  prepReadyByAt: z.string().nullable().optional(),
  acceptedAt: z.string().nullable().optional(),
  preparingAt: z.string().nullable().optional(),
  preparationTimeMinutes: z.number().nullable().optional(),
  prepDelayMinutes: z.number().nullable().optional(),
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  customerPrimaryName: z.string().nullable().optional(),
  customerPrimaryPhone: z.string().nullable().optional(),
  customerAlternateName: z.string().nullable().optional(),
  customerAlternatePhone: z.string().nullable().optional(),
  pickupAddressGeocoded: z.string().optional(),
  dropAddressGeocoded: z.string().optional(),
  foodItems: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number(),
        variantName: z.string().nullable().optional(),
        customization: z.string().nullable().optional(),
      })
    )
    .optional(),
  deliveryInstructions: z.string().nullable().optional(),
  requiresUtensils: z.boolean().optional(),
  restaurantPhone: z.string().nullable().optional(),
  merchantFeedbackSubmitted: z.boolean().optional(),
  customerFeedbackSubmitted: z.boolean().optional(),
  paymentMethod: z.string().nullable().optional(),
  paymentStatus: z.string().nullable().optional(),
  adminRiderPaymentClearedAt: z.string().nullable().optional(),
  walletCreditPending: z.boolean().optional(),
  customerRating: z.number().nullable().optional(),
  passengerRating: z.number().nullable().optional(),
});

const RiderBankPaymentMethodSchema = z.object({
  id: z.number(),
  methodType: z.literal("bank"),
  accountHolderName: z.string(),
  bankName: z.string().nullable(),
  ifsc: z.string().nullable(),
  branch: z.string().nullable(),
  accountNumberMasked: z.string(),
  verificationStatus: z.enum(["pending", "verified", "rejected"]),
  createdAt: z.string(),
});

export type RiderBankPaymentMethod = z.infer<typeof RiderBankPaymentMethodSchema>;

const EarningsSummarySchema = z.object({
  totalBalance: z.number(),
  withdrawable: z.number(),
  locked: z.number(),
  subscriptionDebited: z.number(),
  thisWeek: z.number(),
  thisMonth: z.number(),
  hasBankAccount: z.boolean(),
  breakdown: z.object({
    food: z.number(),
    parcel: z.number(),
    ride: z.number(),
  }),
});

const DutyStatusSchema = z.object({
  isOnDuty: z.boolean(),
  allowedServiceTypes: z.array(z.string()).optional(),
  blockedServiceTypes: z.array(z.string()).optional(),
  lastUpdated: z.string(),
});

const LogoutResponseSchema = z.object({
  success: z.literal(true),
});

const RiderLedgerSegmentSchema = z.enum([
  "all",
  "food",
  "parcel",
  "ride",
  "incentives",
  "subscriptions",
  "adjustments",
  "penalties",
  "withdrawals",
]);

const RiderLedgerPeriodSchema = z.enum(["this_month", "last_month", "all"]);

const RiderLedgerSummarySchema = z.object({
  totalEarnings: z.number(),
  totalWithdrawals: z.number(),
  pendingSettlement: z.number(),
  monthLabel: z.string(),
});

const RiderLedgerEntrySchema = z.object({
  id: z.number(),
  entryType: z.string(),
  flow: z.enum(["credit", "debit"]),
  category: z.string(),
  description: z.string(),
  amount: z.number(),
  balance: z.number().nullable(),
  ref: z.string().nullable(),
  refType: z.string().nullable(),
  serviceType: z.string().nullable(),
  createdAt: z.string(),
});

const RiderLedgerResponseSchema = z.object({
  entries: z.array(RiderLedgerEntrySchema),
  total: z.number(),
  hasMore: z.boolean(),
  periodLabel: z.string(),
  summary: RiderLedgerSummarySchema,
});

export type RiderLedgerSegment = z.infer<typeof RiderLedgerSegmentSchema>;
export type RiderLedgerPeriod = z.infer<typeof RiderLedgerPeriodSchema>;
export type RiderLedgerEntry = z.infer<typeof RiderLedgerEntrySchema>;
export type RiderLedgerSummary = z.infer<typeof RiderLedgerSummarySchema>;

export type RiderLedgerFilters = {
  segment?: RiderLedgerSegment;
  period?: RiderLedgerPeriod;
  limit?: number;
  offset?: number;
};

export type RiderOrderSummary = z.infer<typeof OrderSummarySchema>;

const EmergencyContactSchema = z.object({
  label: z.string(),
  phone: z.string(),
});

export type RiderEmergencyContact = z.infer<typeof EmergencyContactSchema>;

const EmergencyContactsResponseSchema = z.object({
  contacts: z.array(EmergencyContactSchema),
  defaults: z.object({
    police: z.string(),
    ambulance: z.string(),
  }),
});

// Create API client instance
function createApiClient(): ApiClient {
  const config = getRiderAppConfig();
  return new ApiClient({
    baseUrl: resolveUrlForDevice(config.apiBaseUrl),
    getAccessToken: async () => {
      const session = useSessionStore.getState().session;
      return session?.accessToken ?? null;
    },
  });
}

// API Service
export const riderApi = {
  /**
   * Get available orders for the rider
   */
  async getAvailableOrders() {
    const client = createApiClient();
    return client.request<z.infer<typeof OrderSummarySchema>[]>(
      "/v1/rider/orders/available",
      {
        method: "GET",
        responseSchema: z.array(OrderSummarySchema),
      }
    );
  },

  /**
   * Get rider's active orders
   */
  async getActiveOrders() {
    const client = createApiClient();
    return client.request<z.infer<typeof OrderSummarySchema>[]>(
      "/v1/rider/orders/active",
      {
        method: "GET",
        responseSchema: z.array(OrderSummarySchema),
      }
    );
  },

  async getRidePaymentHolds() {
    const client = createApiClient();
    return client.request<
      Array<{
        orderId: string;
        formattedOrderId: string | null;
        totalEarning: number;
        passengerFare: number;
        completedAt: string;
      }>
    >("/v1/rider/orders/ride-payment-holds", {
      method: "GET",
      responseSchema: z.array(
        z.object({
          orderId: z.string(),
          formattedOrderId: z.string().nullable(),
          totalEarning: z.number(),
          passengerFare: z.number(),
          completedAt: z.string(),
        })
      ),
    });
  },

  async getOrderHistory(opts?: {
    limit?: number;
    offset?: number;
    category?: "food" | "ride" | "parcel" | "all";
  }) {
    const client = createApiClient();
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.category && opts.category !== "all") {
      params.set("category", opts.category === "ride" ? "person" : opts.category);
    }
    const q = params.toString();
    return client.request<{
      orders: RiderOrderSummary[];
      total: number;
      hasMore: boolean;
    }>(`/v1/rider/orders/ride-history${q ? `?${q}` : ""}`, {
      method: "GET",
      responseSchema: z.object({
        orders: z.array(OrderSummarySchema),
        total: z.number(),
        hasMore: z.boolean(),
      }),
    });
  },

  /**
   * Accept an order
   */
  async acceptOrder(orderId: string) {
    const client = createApiClient();
    const ref = encodeURIComponent(orderId.trim());
    return client.request<z.infer<typeof OrderSummarySchema>>(
      `/v1/rider/orders/${ref}/accept`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        responseSchema: OrderSummarySchema,
      }
    );
  },

  /**
   * Reject an order
   */
  async rejectOrder(
    orderId: string,
    body: { reasonCode: string; reasonText?: string }
  ) {
    const client = createApiClient();
    return client.request<{ ok: true }>(
      `/v1/rider/orders/${orderId}/reject`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    );
  },

  /** Offer timer expired — rider did not accept in time. */
  async missOrderOffer(orderId: string, reason?: string) {
    const client = createApiClient();
    return client.request<{ ok: true; recorded: boolean }>(
      `/v1/rider/orders/${orderId}/offer-missed`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reason ? { reason } : {}),
      }
    );
  },

  async getDispatchOfferStats() {
    const client = createApiClient();
    return client.request<{
      riderId: number;
      offersTotal: number;
      offersAccepted: number;
      offersRejected: number;
      offersMissed: number;
      acceptRate: number | null;
      lastOfferAt: string | null;
      lastAcceptedAt: string | null;
    }>(`/v1/rider/dispatch-offer-stats`, { method: "GET" });
  },

  async getRideOrder(orderId: string) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(`/v1/rider/orders/${orderId}`, {
      method: "GET",
      responseSchema: OrderSummarySchema,
    });
  },

  async getMilestoneGeoFence(
    orderId: string,
    gps?: { lat?: number; lng?: number }
  ) {
    const client = createApiClient();
    const params = new URLSearchParams();
    if (gps?.lat != null) params.set("lat", String(gps.lat));
    if (gps?.lng != null) params.set("lng", String(gps.lng));
    const q = params.toString();
    return client.request<{
      orderId: string;
      serviceType: "food" | "parcel" | "person_ride";
      milestones: Array<{
        milestoneKey: string;
        serviceType: string;
        radiusMeters: number;
        distanceMeters: number;
        withinRadius: boolean;
        blockedMessage: string | null;
      }>;
    }>(`/v1/rider/orders/${orderId}/milestone-geo-fence${q ? `?${q}` : ""}`, {
      method: "GET",
    });
  },

  async getFoodPickupVerificationSettings() {
    const client = createApiClient();
    return client.request<{
      barcodeEnabled: boolean;
      otpEnabled: boolean;
      verificationRequired: boolean;
    }>("/v1/rider/food-pickup-verification-settings", {
      method: "GET",
    });
  },

  async markFoodPickup(
    orderId: string,
    gps?: { lat?: number; lng?: number; deviceTimestamp?: string }
  ) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(`/v1/rider/orders/${orderId}/mark-food-pickup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(gps ?? {}),
      responseSchema: OrderSummarySchema,
    });
  },

  async submitMerchantPickupFeedback(
    orderId: string,
    payload: { rating?: number; tags?: string[]; messages?: string[]; skipped?: boolean }
  ) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(
      `/v1/rider/orders/${orderId}/merchant-pickup-feedback`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        responseSchema: OrderSummarySchema,
      }
    );
  },

  async submitCustomerDeliveryFeedback(
    orderId: string,
    payload: {
      rating?: number;
      tags?: string[];
      messages?: string[];
      comment?: string;
      skipped?: boolean;
    }
  ) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(
      `/v1/rider/orders/${orderId}/customer-delivery-feedback`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        responseSchema: OrderSummarySchema,
      }
    );
  },

  async markReachedPickup(
    orderId: string,
    gps?: { lat?: number; lng?: number }
  ) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(
      `/v1/rider/orders/${orderId}/reached-pickup`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(gps ?? {}),
        responseSchema: OrderSummarySchema,
      }
    );
  },

  async markReachedCustomer(
    orderId: string,
    gps?: { lat?: number; lng?: number }
  ) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(
      `/v1/rider/orders/${orderId}/reached-customer`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(gps ?? {}),
        responseSchema: OrderSummarySchema,
      }
    );
  },

  async cancelAssignedRide(
    orderId: string,
    payload: { reasonCode: string; reasonText?: string }
  ) {
    const client = createApiClient();
    return client.request<{ ok: true }>(`/v1/rider/orders/${orderId}/cancel-assigned`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async verifyPickupOtp(
    orderId: string,
    payload: { otp: string; lat?: number; lng?: number; deviceTimestamp?: string }
  ) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(`/v1/rider/orders/${orderId}/verify-pickup-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      responseSchema: OrderSummarySchema,
    });
  },

  async verifyPickupBarcode(
    orderId: string,
    payload: { barcode: string; lat?: number; lng?: number; deviceTimestamp?: string }
  ) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(
      `/v1/rider/orders/${orderId}/verify-pickup-barcode`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        responseSchema: OrderSummarySchema,
      }
    );
  },

  async completeRide(orderId: string, gps?: { lat?: number; lng?: number }) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(`/v1/rider/orders/${orderId}/complete-ride`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(gps ?? {}),
      responseSchema: OrderSummarySchema,
    });
  },

  async startRide(orderId: string, gps?: { lat?: number; lng?: number }) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(`/v1/rider/orders/${orderId}/start-ride`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(gps ?? {}),
      responseSchema: OrderSummarySchema,
    });
  },

  async verifyDeliveryOtp(
    orderId: string,
    payload: {
      otp: string;
      lat?: number;
      lng?: number;
      deliveryImageUrl?: string;
      deliveryImageR2Key?: string;
    }
  ) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(`/v1/rider/orders/${orderId}/verify-delivery-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      responseSchema: OrderSummarySchema,
    });
  },

  /**
   * Get earnings summary
   */
  async getEarningsSummary() {
    const client = createApiClient();
    return client.request<z.infer<typeof EarningsSummarySchema>>(
      "/v1/rider/earnings/summary",
      {
        method: "GET",
        responseSchema: EarningsSummarySchema,
      }
    );
  },

  async getBankPaymentMethod() {
    const client = createApiClient();
    return client.request<{ paymentMethod: RiderBankPaymentMethod | null }>(
      "/v1/rider/payment-methods/bank",
      {
        method: "GET",
        responseSchema: z.object({
          paymentMethod: RiderBankPaymentMethodSchema.nullable(),
        }),
      },
    );
  },

  async createBankPaymentMethod(payload: {
    accountHolderName: string;
    bankName: string;
    ifsc: string;
    branch?: string;
    accountNumber: string;
  }) {
    const client = createApiClient();
    return client.request<{ paymentMethod: RiderBankPaymentMethod }>(
      "/v1/rider/payment-methods/bank",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        responseSchema: z.object({
          paymentMethod: RiderBankPaymentMethodSchema,
        }),
      },
    );
  },

  async getLedger(filters: RiderLedgerFilters = {}) {
    const client = createApiClient();
    const params = new URLSearchParams();
    if (filters.segment) params.set("segment", filters.segment);
    if (filters.period) params.set("period", filters.period);
    if (filters.limit != null) params.set("limit", String(filters.limit));
    if (filters.offset != null) params.set("offset", String(filters.offset));
    const qs = params.toString();
    const path = qs ? `/v1/rider/wallet/ledger?${qs}` : "/v1/rider/wallet/ledger";
    return client.request<z.infer<typeof RiderLedgerResponseSchema>>(path, {
      method: "GET",
      responseSchema: RiderLedgerResponseSchema,
    });
  },

  /**
   * Read duty status from server (dispatch eligibility source of truth).
   */
  async getDutyStatus() {
    const client = createApiClient();
    return client.request<z.infer<typeof DutyStatusSchema>>("/v1/rider/duty", {
      method: "GET",
      responseSchema: DutyStatusSchema,
    });
  },

  /**
   * Update duty status
   */
  async updateDutyStatus(isOnDuty: boolean, serviceTypes?: string[]) {
    const client = createApiClient();
    const body: { isOnDuty: boolean; serviceTypes?: string[] } = { isOnDuty };
    if (serviceTypes?.length) {
      body.serviceTypes = serviceTypes;
    }
    return client.request<z.infer<typeof DutyStatusSchema>>(
      "/v1/rider/duty",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        responseSchema: DutyStatusSchema,
      }
    );
  },

  async logout(payload: { reasonCode: string; reasonText?: string }) {
    const client = createApiClient();
    return client.request<z.infer<typeof LogoutResponseSchema>>("/v1/rider/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      responseSchema: LogoutResponseSchema,
    });
  },

  async getEmergencyContacts() {
    const client = createApiClient();
    return client.request<z.infer<typeof EmergencyContactsResponseSchema>>(
      "/v1/rider/me/emergency-contacts",
      {
        method: "GET",
        responseSchema: EmergencyContactsResponseSchema,
      }
    );
  },

  async saveEmergencyContacts(contacts: RiderEmergencyContact[]) {
    const client = createApiClient();
    return client.request<z.infer<typeof EmergencyContactsResponseSchema>>(
      "/v1/rider/me/emergency-contacts",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contacts }),
        responseSchema: EmergencyContactsResponseSchema,
      }
    );
  },
};

