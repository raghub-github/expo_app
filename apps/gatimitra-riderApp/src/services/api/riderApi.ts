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
  customerName: z.string().nullable().optional(),
  customerPhone: z.string().nullable().optional(),
  pickupAddressGeocoded: z.string().optional(),
  dropAddressGeocoded: z.string().optional(),
});

const EarningsSummarySchema = z.object({
  totalBalance: z.number(),
  withdrawable: z.number(),
  locked: z.number(),
  thisWeek: z.number(),
  thisMonth: z.number(),
  breakdown: z.object({
    food: z.number(),
    parcel: z.number(),
    ride: z.number(),
  }),
});

const DutyStatusSchema = z.object({
  isOnDuty: z.boolean(),
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
  "adjustments",
  "penalties",
]);

const RiderLedgerPeriodSchema = z.enum(["this_month", "last_month", "all"]);

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
});

export type RiderLedgerSegment = z.infer<typeof RiderLedgerSegmentSchema>;
export type RiderLedgerPeriod = z.infer<typeof RiderLedgerPeriodSchema>;
export type RiderLedgerEntry = z.infer<typeof RiderLedgerEntrySchema>;

export type RiderLedgerFilters = {
  segment?: RiderLedgerSegment;
  period?: RiderLedgerPeriod;
  limit?: number;
  offset?: number;
};

export type RiderOrderSummary = z.infer<typeof OrderSummarySchema>;

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
    payload: { otp: string; lat?: number; lng?: number }
  ) {
    const client = createApiClient();
    return client.request<RiderOrderSummary>(`/v1/rider/orders/${orderId}/verify-pickup-otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      responseSchema: OrderSummarySchema,
    });
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
};

