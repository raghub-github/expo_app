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
  },
  
  // Analytics
  analytics: {
    all: () => ["analytics"] as const,
    dashboard: () => ["analytics", "dashboard"] as const,
    reports: (type: string) => ["analytics", "reports", type] as const,
  },
} as const;
