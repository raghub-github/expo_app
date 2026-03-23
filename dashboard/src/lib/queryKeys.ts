/**
 * Centralized query key factory for consistent cache management
 * All query keys should be created using these factory functions
 */

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number" || t === "boolean") return String(value);
  if (t === "bigint") return JSON.stringify(value.toString() + "n");
  if (t === "function") return '"[function]"';

  if (Array.isArray(value)) {
    return `[${value.map((v) => stableSerialize(v)).join(",")}]`;
  }

  if (t === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${stableSerialize(v)}`)
      .join(",")}}`;
  }

  // Fallback (symbols, etc.)
  return JSON.stringify(String(value));
}

export const queryKeys = {
  // Auth & Permissions
  auth: {
    session: () => ["auth", "session"] as const,
    sessionStatus: () => ["auth", "session-status"] as const,
  },
  permissions: () => ["permissions"] as const,
  dashboardAccess: () => ["dashboard-access"] as const,
  
  // Users
  users: {
    all: () => ["users"] as const,
    lists: () => ["users", "list"] as const,
    list: (filters: Record<string, unknown>) => ["users", "list", stableSerialize(filters)] as const,
    details: () => ["users", "detail"] as const,
    detail: (id: number | string) => ["users", "detail", id] as const,
  },
  
  // Customers
  customers: {
    all: () => ["customers"] as const,
    lists: () => ["customers", "list"] as const,
    list: (filters: Record<string, unknown>) => ["customers", "list", stableSerialize(filters)] as const,
    details: () => ["customers", "detail"] as const,
    detail: (id: number | string) => ["customers", "detail", id] as const,
    stats: (filters: Record<string, unknown>) => ["customers", "stats", stableSerialize(filters)] as const,
  },
  
  // Service Points
  servicePoints: {
    all: () => ["service-points"] as const,
    lists: () => ["service-points", "list"] as const,
    list: () => ["service-points", "list"] as const,
    details: () => ["service-points", "detail"] as const,
    detail: (id: number) => ["service-points", "detail", id] as const,
  },
  
  // Orders (for future use)
  orders: {
    all: () => ["orders"] as const,
    lists: () => ["orders", "list"] as const,
    list: (filters: Record<string, unknown>) => ["orders", "list", stableSerialize(filters)] as const,
    details: () => ["orders", "detail"] as const,
    detail: (id: number | string) => ["orders", "detail", id] as const,
  },

  // Orders core list endpoints (dashboard/orders/*)
  ordersCore: {
    foodList: (filters: Record<string, unknown>) =>
      ["orders", "core", "food", stableSerialize(filters)] as const,
  },
  
  // Tickets
  tickets: {
    all: () => ["tickets"] as const,
    lists: () => ["tickets", "list"] as const,
    list: (filters: Record<string, unknown>) => ["tickets", "list", stableSerialize(filters)] as const,
    details: () => ["tickets", "detail"] as const,
    detail: (id: number | string) => ["tickets", "detail", id] as const,
    activities: (id: number | string) => ["tickets", "activities", id] as const,
    agents: () => ["tickets", "agents"] as const,
    referenceData: () => ["tickets", "reference-data"] as const,
  },

  // Unified tickets (public.unified_tickets)
  unifiedTickets: {
    all: () => ["unified-tickets"] as const,
    list: (filters: Record<string, unknown>) => ["unified-tickets", "list", stableSerialize(filters)] as const,
  },
  
  // Analytics
  analytics: {
    all: () => ["analytics"] as const,
    dashboard: () => ["analytics", "dashboard"] as const,
    reports: (type: string) => ["analytics", "reports", type] as const,
  },

  // Merchant stores list (dashboard/merchants) – stats and list cached for fast revisit
  merchantStores: {
    stats: (fromDate?: string, toDate?: string) =>
      ["merchant-stores", "stats", fromDate ?? "", toDate ?? ""] as const,
    list: (params: { filter: string; search?: string; category?: string; fromDate?: string; toDate?: string }) =>
      ["merchant-stores", "list", stableSerialize(params)] as const,
  },

  // Merchant store dashboard (stats, wallet, store-operations, menu) – shared cache to avoid duplicate calls
  merchantStore: {
    stats: (storeId: string, date?: string) =>
      ["merchant-store", storeId, "stats", date ?? "today"] as const,
    wallet: (storeId: string) => ["merchant-store", storeId, "wallet"] as const,
    storeOperations: (storeId: string) =>
      ["merchant-store", storeId, "store-operations"] as const,
    menu: (storeId: string) => ["merchant-store", storeId, "menu"] as const,
  },

  // Merchant wallet-requests summary (global + store-scoped)
  merchantWalletRequests: {
    summary: (storeId: string | null) =>
      ["merchant-wallet-requests-summary", storeId ?? "global"] as const,
  },

  offers: {
    merchant: {
      list: (filters: Record<string, unknown>) =>
        ["offers", "merchant", "list", stableSerialize(filters)] as const,    },
    stores: () => ["offers", "stores"] as const,
  },

  // Rider Dashboard
  rider: {
    summary: (riderId: number | null, params: RiderSummaryParams) =>
      ["rider", "summary", riderId, params] as const,
    access: () => ["rider", "access"] as const,
  },
} as const;

export interface RiderSummaryParams {
  ordersLimit: number;
  ordersFrom: string;
  ordersTo: string;
  ordersOrderType: string; // 'all' | 'food' | 'parcel' | 'person_ride'
  ordersStatus: string;
  ordersOrderId: string;
  withdrawalsLimit: number;
  withdrawalsFrom: string;
  withdrawalsTo: string;
  ticketsLimit: number;
  ticketsFrom: string;
  ticketsTo: string;
  ticketsStatus: string; // 'all' | 'open' | 'in_progress' | 'resolved' | 'closed'
  ticketsCategory: string;
  ticketsPriority: string; // 'all' | 'low' | 'medium' | 'high' | 'urgent'
  penaltiesLimit: number;
  penaltiesFrom: string;
  penaltiesTo: string;
  penaltiesStatus: string; // 'all' | 'reverted' | 'not'
  penaltiesServiceType: string; // 'all' | 'food' | 'parcel' | 'person_ride'
  penaltiesOrderId: string; // search by order id
}
