/**
 * Customer Dashboard Statistics Operations
 * Provides aggregated statistics for the customer dashboard
 */

import { getDb } from "../client";
import { customers, ordersCore } from "../schema";
import { eq, and, or, isNull, sql, gte, lte, inArray } from "drizzle-orm";

export interface DashboardStatsFilters {
  orderType?: "food" | "parcel" | "person_ride";
  dateFrom?: string;
  dateTo?: string;
  city?: string;
  accountStatus?: string;
  riskFlag?: string;
}

export interface ServiceStats {
  orderType: "food" | "parcel" | "person_ride" | "all";
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
}

export interface UserCategoryStats {
  category: string;
  count: number;
}

export interface DashboardStats {
  // Top summary cards
  allUsers: number;
  foodUsers: number;
  parcelUsers: number;
  personUsers: number;
  
  // User category cards
  newUsers: number; // Users created in last 30 days
  oldUsers: number; // Users created more than 30 days ago
  repeatedUsers: number; // Users with 2+ orders
  activeUsers: number; // Account status = ACTIVE
  inactiveUsers: number; // Account status = INACTIVE or DEACTIVATED
  suspendedUsers: number; // Account status = SUSPENDED
  fraudUsers: number; // Risk flag = HIGH or CRITICAL
  
  // Service-wise stats
  serviceStats: ServiceStats[];
  
  // Growth trends (last 12 months)
  growthTrend: Array<{
    month: string;
    newUsers: number;
    totalUsers: number;
  }>;
  
  // User-order relationship
  userOrderRelationship: Array<{
    orderCountRange: string;
    userCount: number;
  }>;
  
  // Revenue trends (last 12 months)
  revenueTrend: Array<{
    month: string;
    foodRevenue: number;
    parcelRevenue: number;
    personRevenue: number;
    totalRevenue: number;
  }>;
}

/**
 * Get dashboard statistics
 */
export async function getCustomerDashboardStats(
  filters: DashboardStatsFilters = {}
): Promise<DashboardStats> {
  const db = getDb();
  
  // Base conditions
  const baseConditions = [isNull(customers.deletedAt)];
  
  // Date filter on customer creation
  if (filters.dateFrom) {
    baseConditions.push(gte(customers.createdAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    const dateTo = new Date(filters.dateTo);
    dateTo.setHours(23, 59, 59, 999);
    baseConditions.push(lte(customers.createdAt, dateTo));
  }
  
  // Account status filter
  if (filters.accountStatus) {
    baseConditions.push(eq(customers.accountStatus, filters.accountStatus as any));
  }
  
  // Risk flag filter
  if (filters.riskFlag) {
    baseConditions.push(eq(customers.riskFlag, filters.riskFlag as any));
  }
  
  const whereClause = baseConditions.length > 0 ? and(...baseConditions) : undefined;
  
  // Get all users count
  const [allUsersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(whereClause);
  const allUsers = Number(allUsersResult?.count || 0);
  
  // Get users by service type (customers who have orders of that type)
  const getUsersByOrderType = async (orderType: "food" | "parcel" | "person_ride") => {
    const customersWithOrders = await db
      .selectDistinct({ customerId: ordersCore.customerId })
      .from(ordersCore)
      .where(
        and(
          sql`${ordersCore.customerId} IS NOT NULL`,
          eq(ordersCore.orderType, orderType)
        )
      );
    
    const customerIds = customersWithOrders
      .map((c) => Number(c.customerId))
      .filter((id) => !isNaN(id));
    
    if (customerIds.length === 0) return 0;
    
    const conditions = [
      ...baseConditions,
      inArray(customers.id, customerIds)
    ];
    
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(...conditions));
    
    return Number(result?.count || 0);
  };
  
  const foodUsers = await getUsersByOrderType("food");
  const parcelUsers = await getUsersByOrderType("parcel");
  const personUsers = await getUsersByOrderType("person_ride");
  
  // User category stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // New users (last 30 days)
  const [newUsersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(
      and(
        ...baseConditions,
        gte(customers.createdAt, thirtyDaysAgo)
      )
    );
  const newUsers = Number(newUsersResult?.count || 0);
  
  // Old users (more than 30 days ago)
  const oldUsers = allUsers - newUsers;
  
  // Repeated users (2+ orders)
  const repeatedUsersQuery = await db
    .select({
      customerId: ordersCore.customerId,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(ordersCore)
    .where(sql`${ordersCore.customerId} IS NOT NULL`)
    .groupBy(ordersCore.customerId)
    .having(sql`count(*) >= 2`);
  
  const repeatedCustomerIds = repeatedUsersQuery
    .map((r) => Number(r.customerId))
    .filter((id) => !isNaN(id));
  
  let repeatedUsers = 0;
  if (repeatedCustomerIds.length > 0) {
    const conditions = [
      ...baseConditions,
      inArray(customers.id, repeatedCustomerIds)
    ];
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(...conditions));
    repeatedUsers = Number(result?.count || 0);
  }
  
  // Active users
  const [activeUsersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(
      and(
        ...baseConditions,
        eq(customers.accountStatus, "ACTIVE" as any)
      )
    );
  const activeUsers = Number(activeUsersResult?.count || 0);
  
  // Inactive users (BLOCKED only, as INACTIVE may not exist in enum)
  const [inactiveUsersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(
      and(
        ...baseConditions,
        eq(customers.accountStatus, "BLOCKED" as any)
      )
    );
  const inactiveUsers = Number(inactiveUsersResult?.count || 0);
  
  // Suspended users
  const [suspendedUsersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(
      and(
        ...baseConditions,
        eq(customers.accountStatus, "SUSPENDED" as any)
      )
    );
  const suspendedUsers = Number(suspendedUsersResult?.count || 0);
  
  // Fraud users (HIGH or CRITICAL risk)
  const [fraudUsersResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(
      and(
        ...baseConditions,
        or(
          eq(customers.riskFlag, "HIGH" as any),
          eq(customers.riskFlag, "CRITICAL" as any)
        )!
      )
    );
  const fraudUsers = Number(fraudUsersResult?.count || 0);
  
  // Service-wise stats
  const serviceStats: ServiceStats[] = [];
  
  // All service stats
  const allServiceStats = await db
    .select({
      orderType: ordersCore.orderType,
      totalOrders: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`coalesce(sum(${ordersCore.fareAmount}), 0)`,
    })
    .from(ordersCore)
    .where(sql`${ordersCore.customerId} IS NOT NULL`)
    .groupBy(ordersCore.orderType);
  
  const serviceStatsMap = new Map<string, ServiceStats>();
  
  // Get unique customers per service
  for (const orderType of ["food", "parcel", "person_ride"] as const) {
    const customersWithOrders = await db
      .selectDistinct({ customerId: ordersCore.customerId })
      .from(ordersCore)
      .where(
        and(
          sql`${ordersCore.customerId} IS NOT NULL`,
          eq(ordersCore.orderType, orderType)
        )
      );
    
    const customerIds = customersWithOrders
      .map((c) => Number(c.customerId))
      .filter((id) => !isNaN(id));
    
    let totalUsers = 0;
    if (customerIds.length > 0) {
      const conditions = [
        ...baseConditions,
        inArray(customers.id, customerIds)
      ];
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(customers)
        .where(and(...conditions));
      totalUsers = Number(result?.count || 0);
    }
    
    const stats = allServiceStats.find((s) => s.orderType === orderType);
    serviceStatsMap.set(orderType, {
      orderType,
      totalUsers,
      totalOrders: Number(stats?.totalOrders || 0),
      totalRevenue: Number(stats?.totalRevenue || 0),
    });
  }
  
  // Add "all" service stats
  serviceStats.push({
    orderType: "all",
    totalUsers: allUsers,
    totalOrders: allServiceStats.reduce((sum, s) => sum + Number(s.totalOrders || 0), 0),
    totalRevenue: allServiceStats.reduce((sum, s) => sum + Number(s.totalRevenue || 0), 0),
  });
  
  // Add individual service stats
  serviceStats.push(...Array.from(serviceStatsMap.values()));
  
  // Growth trends (last 12 months)
  const growthTrend: Array<{ month: string; newUsers: number; totalUsers: number }> = [];
  const now = new Date();
  
  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
    
    // New users in this month
    const [newUsersMonthResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(
        and(
          ...baseConditions.filter((c) => !c.toString().includes("createdAt")),
          gte(customers.createdAt, monthStart),
          lte(customers.createdAt, monthEnd)
        )
      );
    const newUsersMonth = Number(newUsersMonthResult?.count || 0);
    
    // Total users up to this month
    const [totalUsersMonthResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(
        and(
          ...baseConditions.filter((c) => !c.toString().includes("createdAt")),
          lte(customers.createdAt, monthEnd)
        )
      );
    const totalUsersMonth = Number(totalUsersMonthResult?.count || 0);
    
    growthTrend.push({
      month: monthKey,
      newUsers: newUsersMonth,
      totalUsers: totalUsersMonth,
    });
  }
  
  // User-order relationship
  const userOrderRelationship: Array<{ orderCountRange: string; userCount: number }> = [];
  
  const orderCounts = await db
    .select({
      customerId: ordersCore.customerId,
      orderCount: sql<number>`count(*)::int`,
    })
    .from(ordersCore)
    .where(sql`${ordersCore.customerId} IS NOT NULL`)
    .groupBy(ordersCore.customerId);
  
  const ranges = [
    { label: "0 orders", min: 0, max: 0 },
    { label: "1 order", min: 1, max: 1 },
    { label: "2-5 orders", min: 2, max: 5 },
    { label: "6-10 orders", min: 6, max: 10 },
    { label: "11-20 orders", min: 11, max: 20 },
    { label: "21+ orders", min: 21, max: Infinity },
  ];
  
  // Get all customer IDs that have orders
  const allCustomerIdsWithOrders = orderCounts
    .map((oc) => Number(oc.customerId))
    .filter((id) => !isNaN(id));
  
  // Calculate users with 0 orders first
  let zeroOrderUsers = 0;
  if (allCustomerIdsWithOrders.length > 0) {
    // Get total users and subtract users with orders
    const [totalUsersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(whereClause);
    const totalUsersCount = Number(totalUsersResult?.count || 0);
    
    const [usersWithOrdersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(
        and(
          ...baseConditions,
          inArray(customers.id, allCustomerIdsWithOrders)
        )
      );
    const usersWithOrdersCount = Number(usersWithOrdersResult?.count || 0);
    
    zeroOrderUsers = totalUsersCount - usersWithOrdersCount;
  } else {
    // If no orders exist, all users have 0 orders
    zeroOrderUsers = allUsers;
  }
  
  // Process each range
  for (const range of ranges) {
    let userCount = 0;
    
    if (range.min === 0 && range.max === 0) {
      // Users with 0 orders
      userCount = zeroOrderUsers;
    } else {
      // Users with orders in this range
      const customerIdsInRange = orderCounts
        .filter((oc) => {
          const count = Number(oc.orderCount);
          return count >= range.min && count <= range.max;
        })
        .map((oc) => Number(oc.customerId))
        .filter((id) => !isNaN(id));
      
      if (customerIdsInRange.length > 0) {
        const conditions = [
          ...baseConditions,
          inArray(customers.id, customerIdsInRange)
        ];
        const [result] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(customers)
          .where(and(...conditions));
        userCount = Number(result?.count || 0);
      }
    }
    
    userOrderRelationship.push({
      orderCountRange: range.label,
      userCount,
    });
  }
  
  // Revenue trends (last 12 months)
  const revenueTrend: Array<{
    month: string;
    foodRevenue: number;
    parcelRevenue: number;
    personRevenue: number;
    totalRevenue: number;
  }> = [];
  
  for (let i = 11; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
    
    const monthlyRevenue = await db
      .select({
        orderType: ordersCore.orderType,
        revenue: sql<number>`coalesce(sum(${ordersCore.fareAmount}), 0)`,
      })
      .from(ordersCore)
      .where(
        and(
          sql`${ordersCore.customerId} IS NOT NULL`,
          gte(ordersCore.createdAt, monthStart),
          lte(ordersCore.createdAt, monthEnd)
        )
      )
      .groupBy(ordersCore.orderType);
    
    const foodRevenue = Number(
      monthlyRevenue.find((r) => r.orderType === "food")?.revenue || 0
    );
    const parcelRevenue = Number(
      monthlyRevenue.find((r) => r.orderType === "parcel")?.revenue || 0
    );
    const personRevenue = Number(
      monthlyRevenue.find((r) => r.orderType === "person_ride")?.revenue || 0
    );
    const totalRevenue = foodRevenue + parcelRevenue + personRevenue;
    
    revenueTrend.push({
      month: monthKey,
      foodRevenue,
      parcelRevenue,
      personRevenue,
      totalRevenue,
    });
  }
  
  return {
    allUsers,
    foodUsers,
    parcelUsers,
    personUsers,
    newUsers,
    oldUsers,
    repeatedUsers,
    activeUsers,
    inactiveUsers,
    suspendedUsers,
    fraudUsers,
    serviceStats,
    growthTrend,
    userOrderRelationship,
    revenueTrend,
  };
}
