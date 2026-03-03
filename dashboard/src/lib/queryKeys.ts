/**
 * Centralized query key factory for consistent cache management
 * All query keys should be created using these factory functions
 */

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
    list: (filters: Record<string, unknown>) => ["users", "list", filters] as const,
    details: () => ["users", "detail"] as const,
    detail: (id: number | string) => ["users", "detail", id] as const,
  },
  
  // Customers
  customers: {
    all: () => ["customers"] as const,
    lists: () => ["customers", "list"] as const,
    list: (filters: Record<string, unknown>) => ["customers", "list", filters] as const,
    details: () => ["customers", "detail"] as const,
    detail: (id: number | string) => ["customers", "detail", id] as const,
    stats: (filters: Record<string, unknown>) => ["customers", "stats", filters] as const,
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
    list: (filters: Record<string, unknown>) => ["orders", "list", filters] as const,
    details: () => ["orders", "detail"] as const,
    detail: (id: number | string) => ["orders", "detail", id] as const,
  },
  
  // Tickets
  tickets: {
    all: () => ["tickets"] as const,
    lists: () => ["tickets", "list"] as const,
    list: (filters: Record<string, unknown>) => ["tickets", "list", filters] as const,
    details: () => ["tickets", "detail"] as const,
    detail: (id: number | string) => ["tickets", "detail", id] as const,
    activities: (id: number | string) => ["tickets", "activities", id] as const,
  },

  // Unified tickets (public.unified_tickets)
  unifiedTickets: {
    all: () => ["unified-tickets"] as const,
    list: (filters: Record<string, unknown>) => ["unified-tickets", "list", filters] as const,
  },
  
  // Analytics
  analytics: {
    all: () => ["analytics"] as const,
    dashboard: () => ["analytics", "dashboard"] as const,
    reports: (type: string) => ["analytics", "reports", type] as const,
  },

  // Merchant store dashboard (stats, wallet, store-operations) – shared cache to avoid duplicate calls
  merchantStore: {
    stats: (storeId: string, date?: string) =>
      ["merchant-store", storeId, "stats", date ?? "today"] as const,
    wallet: (storeId: string) => ["merchant-store", storeId, "wallet"] as const,
    storeOperations: (storeId: string) =>
      ["merchant-store", storeId, "store-operations"] as const,
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
