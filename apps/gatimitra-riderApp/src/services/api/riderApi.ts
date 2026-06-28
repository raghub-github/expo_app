import { ApiClient, ApiError } from "@gatimitra/sdk";
import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { useSessionStore } from "@/src/stores/sessionStore";
import { notifyForceLogoutIfNeeded } from "@/src/services/rider-auth-errors";
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
  cancellationPenaltyApplied: z.boolean().optional(),
  cancellationPenaltyAmount: z.number().nullable().optional(),
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

function normalizeBlockedServiceName(
  value: string
): "food" | "parcel" | "person_ride" | null {
  const x = (value || "").toLowerCase().trim();
  if (x === "food") return "food";
  if (x === "parcel") return "parcel";
  if (x === "ride" || x === "person_ride") return "person_ride";
  return null;
}

const AccountRestrictionsSchema = z
  .object({
    accountRestricted: z.boolean().optional(),
    accountRestrictedReason: z.string().optional(),
    globalWalletBlock: z.boolean().optional(),
    blacklistBlockedServices: z.array(z.string()).optional(),
    negativeWalletBlocks: z
      .array(z.object({ serviceType: z.string(), reason: z.string() }))
      .optional(),
    allServicesBlacklisted: z.boolean().optional(),
    penaltyDue: z.number().optional(),
    penaltyDutyStopped: z.boolean().optional(),
  })
  .transform((raw) => {
    const walletBlockServices =
      raw.globalWalletBlock === true ||
      (raw.negativeWalletBlocks ?? []).some((b) => b.reason === "global_emergency")
        ? ["food", "parcel", "person_ride"]
        : (raw.negativeWalletBlocks ?? [])
            .filter((b) => b.reason === "negative_wallet" || b.reason === "global_emergency")
            .map((b) => b.serviceType);

    const blockedSet = new Set<"food" | "parcel" | "person_ride">();
    for (const name of [...(raw.blacklistBlockedServices ?? []), ...walletBlockServices]) {
      const norm = normalizeBlockedServiceName(name);
      if (norm) blockedSet.add(norm);
    }
    const blacklistBlockedServices = [...blockedSet];
    const allServicesBlacklisted =
      raw.allServicesBlacklisted ??
      (blacklistBlockedServices.length >= 3 || raw.globalWalletBlock === true);
    const accountRestricted =
      raw.accountRestricted ??
      (blacklistBlockedServices.length > 0 || raw.globalWalletBlock === true);
    const reason = raw.accountRestrictedReason;
    const accountRestrictedReason =
      reason === "service_blacklist" ||
      reason === "all_services_blacklist" ||
      reason === "blocked_status"
        ? reason
        : allServicesBlacklisted
          ? "all_services_blacklist"
          : accountRestricted
            ? "service_blacklist"
            : "none";

    return {
      accountRestricted,
      accountRestrictedReason: accountRestrictedReason as
        | "none"
        | "service_blacklist"
        | "all_services_blacklist"
        | "blocked_status",
      globalWalletBlock: raw.globalWalletBlock ?? false,
      blacklistBlockedServices,
      allServicesBlacklisted,
      penaltyDue: raw.penaltyDue ?? 0,
      penaltyDutyStopped: raw.penaltyDutyStopped ?? false,
    };
  });

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
  accountRestrictions: AccountRestrictionsSchema.optional().transform((value) =>
    value ?? {
      accountRestricted: false,
      accountRestrictedReason: "none" as const,
      globalWalletBlock: false,
      blacklistBlockedServices: [],
      allServicesBlacklisted: false,
      penaltyDue: 0,
      penaltyDutyStopped: false,
    }
  ),
});

const DutyStatusSchema = z.object({
  isOnDuty: z.boolean(),
  allowedServiceTypes: z.array(z.string()).optional().default([]),
  blockedServiceTypes: z.array(z.string()).optional(),
  accountRestricted: z.boolean().optional(),
  allServicesBlacklisted: z.boolean().optional(),
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
  orderPublicId: z.string().nullable(),
  createdAt: z.string(),
});

const RiderLedgerResponseSchema = z.object({
  entries: z.array(RiderLedgerEntrySchema),
  total: z.number(),
  hasMore: z.boolean(),
  periodLabel: z.string(),
  summary: RiderLedgerSummarySchema,
});

const RiderLedgerGraphSchema = z.object({
  totalEarning: z.number(),
  orderEarning: z.number(),
  incentive: z.number(),
  surge: z.number(),
  waiting: z.number(),
  orderCount: z.number(),
  rangeLabel: z.string(),
  from: z.string(),
  to: z.string(),
  dailyBars: z.array(
    z.object({
      date: z.string(),
      day: z.number(),
      amount: z.number(),
      orderCount: z.number(),
    }),
  ),
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

export type RiderLedgerGraphDayBar = {
  date: string;
  day: number;
  amount: number;
  orderCount: number;
};

export type RiderLedgerGraphData = {
  totalEarning: number;
  orderEarning: number;
  incentive: number;
  surge: number;
  waiting: number;
  orderCount: number;
  rangeLabel: string;
  from: string;
  to: string;
  dailyBars: RiderLedgerGraphDayBar[];
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

const RiderDeviceSessionSchema = z.object({
  id: z.number(),
  deviceId: z.string().nullable(),
  deviceType: z.string().nullable(),
  deviceName: z.string().nullable(),
  deviceModel: z.string().nullable(),
  os: z.string().nullable(),
  osVersion: z.string().nullable(),
  appVersion: z.string().nullable(),
  ipAddress: z.string().nullable(),
  location: z.string().nullable(),
  loginState: z.string().nullable(),
  loginDistrict: z.string().nullable(),
  loginTown: z.string().nullable(),
  loginVillage: z.string().nullable(),
  loginMethod: z.string().nullable(),
  loginTime: z.string(),
  lastActive: z.string(),
  isActive: z.boolean(),
  isCurrentDevice: z.boolean(),
});

export type RiderDeviceSession = z.infer<typeof RiderDeviceSessionSchema>;

// Create API client instance
let refreshInFlight: Promise<void> | null = null;

async function ensureSessionRefreshed(force = false): Promise<boolean> {
  const store = useSessionStore.getState();
  if (!store.session?.accessToken) return false;

  if (!refreshInFlight) {
    refreshInFlight = store.refreshSessionIfNeeded({ force }).finally(() => {
      refreshInFlight = null;
    });
  }
  await refreshInFlight;
  return Boolean(useSessionStore.getState().session?.accessToken);
}

type RiderRequestInit<T> = RequestInit & {
  responseSchema?: z.ZodSchema<T>;
  idempotencyKey?: string;
};

function apiErrorBody(err: ApiError): string | undefined {
  if (err.payload == null) return undefined;
  return typeof err.payload === "string" ? err.payload : JSON.stringify(err.payload);
}

function apiErrorCode(err: ApiError): string {
  if (!err.payload || typeof err.payload !== "object") return "";
  return String((err.payload as { error?: string }).error ?? "");
}

async function riderRequest<T>(path: string, init: RiderRequestInit<T> = {}): Promise<T> {
  const run = () => {
    const config = getRiderAppConfig();
    const client = new ApiClient({
      baseUrl: resolveUrlForDevice(config.apiBaseUrl),
      getAccessToken: async () => useSessionStore.getState().session?.accessToken ?? null,
    });
    return client.request<T>(path, init);
  };

  try {
    return await run();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    if (apiErrorCode(err) === "invalid_token") {
      const refreshed = await ensureSessionRefreshed(true);
      if (refreshed) {
        try {
          return await run();
        } catch (retryErr) {
          if (retryErr instanceof ApiError && retryErr.status === 401) {
            notifyForceLogoutIfNeeded(retryErr.status, apiErrorBody(retryErr));
          }
          throw retryErr;
        }
      }
    }
    notifyForceLogoutIfNeeded(err.status, apiErrorBody(err));
    throw err;
  }
}

function createApiClient(): { request: typeof riderRequest } {
  return { request: riderRequest };
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

  async getCancellationPenaltyPreview(orderId: string, reasonCode: string) {
    const client = createApiClient();
    const params = new URLSearchParams({ reasonCode });
    const PreviewSchema = z.object({
      ok: z.literal(true),
      appliesPenalty: z.boolean(),
      penaltyAmount: z.coerce.number(),
      ledgerTitle: z.string(),
      ledgerDescription: z.string(),
      scenarioCode: z.string().nullable(),
      catalogReasonId: z.coerce.number().nullable(),
      reasonLabel: z.string().nullable(),
      skipped: z.string().optional(),
    });
    const res = await client.request<z.infer<typeof PreviewSchema>>(
      `/v1/rider/orders/${orderId}/cancellation-penalty-preview?${params.toString()}`,
      { responseSchema: PreviewSchema }
    );
    return {
      appliesPenalty: res.appliesPenalty,
      penaltyAmount: res.penaltyAmount,
      ledgerTitle: res.ledgerTitle,
      ledgerDescription: res.ledgerDescription,
      reasonLabel: res.reasonLabel,
      scenarioCode: res.scenarioCode,
      skipped: res.skipped,
    };
  },

  async cancelAssignedRide(
    orderId: string,
    payload: { reasonCode: string; reasonText?: string }
  ) {
    const client = createApiClient();
    return client.request<{ ok: true; penaltyApplied?: boolean; penaltyAmount?: number }>(
      `/v1/rider/orders/${orderId}/cancel-assigned`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  async getCancellationReasons(serviceType?: "food" | "person_ride" | "parcel") {
    const client = createApiClient();
    const params = new URLSearchParams();
    if (serviceType) params.set("serviceType", serviceType);
    const qs = params.toString();
    const CancellationReasonSchema = z.object({
      id: z.coerce.number(),
      attribute: z.string(),
      label: z.string(),
      reasonCode: z.string(),
      sortOrder: z.coerce.number(),
      serviceType: z.string().nullable(),
    });
    return client.request<{ ok: true; reasons: z.infer<typeof CancellationReasonSchema>[] }>(
      `/v1/rider/cancellation-reasons${qs ? `?${qs}` : ""}`,
      {
        responseSchema: z.object({
          ok: z.literal(true),
          reasons: z.array(CancellationReasonSchema),
        }),
      }
    );
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

  async createWithdrawalRequest(amount: number) {
    const client = createApiClient();
    const RiderWithdrawalSchema = z.object({
      id: z.number(),
      amount: z.number(),
      status: z.string(),
      bankAccMasked: z.string(),
      ifsc: z.string(),
      accountHolderName: z.string(),
      transactionId: z.string().nullable(),
      failureReason: z.string().nullable(),
      createdAt: z.string(),
      processedAt: z.string().nullable(),
    });
    return client.request<{ withdrawal: z.infer<typeof RiderWithdrawalSchema> }>(
      "/v1/rider/withdrawals",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
        responseSchema: z.object({ withdrawal: RiderWithdrawalSchema }),
      },
    );
  },

  async listWithdrawals(limit = 20) {
    const client = createApiClient();
    const RiderWithdrawalSchema = z.object({
      id: z.number(),
      amount: z.number(),
      status: z.string(),
      bankAccMasked: z.string(),
      ifsc: z.string(),
      accountHolderName: z.string(),
      transactionId: z.string().nullable(),
      failureReason: z.string().nullable(),
      createdAt: z.string(),
      processedAt: z.string().nullable(),
    });
    return client.request<{ withdrawals: z.infer<typeof RiderWithdrawalSchema>[] }>(
      `/v1/rider/withdrawals?limit=${limit}`,
      {
        method: "GET",
        responseSchema: z.object({ withdrawals: z.array(RiderWithdrawalSchema) }),
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

  async getLedgerGraph(args: {
    segment?: RiderLedgerSegment;
    from: string;
    to: string;
  }) {
    const client = createApiClient();
    const params = new URLSearchParams();
    if (args.segment) params.set("segment", args.segment);
    params.set("from", args.from);
    params.set("to", args.to);
    return client.request<z.infer<typeof RiderLedgerGraphSchema>>(
      `/v1/rider/wallet/ledger/graph?${params.toString()}`,
      {
        method: "GET",
        responseSchema: RiderLedgerGraphSchema,
      },
    );
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
   * Update duty status (writes to duty_logs for dashboard Activity Logs).
   */
  async updateDutyStatus(
    isOnDuty: boolean,
    serviceTypes?: string[],
    opts?: { lat?: number; lon?: number; deviceId?: string }
  ) {
    const client = createApiClient();
    const body: {
      isOnDuty: boolean;
      serviceTypes?: string[];
      lat?: number;
      lon?: number;
      deviceId?: string;
    } = { isOnDuty };
    if (serviceTypes?.length) {
      body.serviceTypes = serviceTypes;
    }
    if (opts?.lat != null) body.lat = opts.lat;
    if (opts?.lon != null) body.lon = opts.lon;
    if (opts?.deviceId) body.deviceId = opts.deviceId;
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

  async getDeviceSessions() {
    const client = createApiClient();
    return client.request<{
      activeCount: number;
      sessions: RiderDeviceSession[];
    }>("/v1/rider/me/device-sessions", {
      method: "GET",
      responseSchema: z.object({
        activeCount: z.number(),
        sessions: z.array(RiderDeviceSessionSchema),
      }),
    });
  },

  async logoutDeviceSessions(sessionIds: number[]) {
    const client = createApiClient();
    return client.request<{ ok: true; revokedCount: number }>(
      "/v1/rider/me/device-sessions/logout",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionIds }),
      },
    );
  },

  async logoutAllOtherDeviceSessions() {
    const client = createApiClient();
    return client.request<{ ok: true; revokedCount: number }>(
      "/v1/rider/me/device-sessions/logout-all",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ includeCurrent: false }),
      },
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

