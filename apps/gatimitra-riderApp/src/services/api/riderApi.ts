import { ApiClient } from "@gatimitra/sdk";
import { getRiderAppConfig } from "@/src/config/env";
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
  estimatedEarning: z.number(),
  createdAt: z.string(),
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

// Create API client instance
function createApiClient(): ApiClient {
  const config = getRiderAppConfig();
  return new ApiClient({
    baseUrl: config.apiBaseUrl,
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

  /**
   * Accept an order
   */
  async acceptOrder(orderId: string) {
    const client = createApiClient();
    return client.request<z.infer<typeof OrderSummarySchema>>(
      `/v1/rider/orders/${orderId}/accept`,
      {
        method: "POST",
        responseSchema: OrderSummarySchema,
      }
    );
  },

  /**
   * Reject an order
   */
  async rejectOrder(orderId: string) {
    const client = createApiClient();
    return client.request<void>(
      `/v1/rider/orders/${orderId}/reject`,
      {
        method: "POST",
      }
    );
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

  /**
   * Update duty status
   */
  async updateDutyStatus(isOnDuty: boolean) {
    const client = createApiClient();
    return client.request<z.infer<typeof DutyStatusSchema>>(
      "/v1/rider/duty",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ isOnDuty }),
        responseSchema: DutyStatusSchema,
      }
    );
  },
};

