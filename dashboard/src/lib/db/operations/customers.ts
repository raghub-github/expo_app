/**
 * Database Operations for Customers
 * Handles all CRUD operations for customer management
 */

import { getDb } from "../client";
import { customers, ordersCore } from "../schema";
import { eq, and, or, ilike, isNull, sql, desc, asc, gte, lte, inArray } from "drizzle-orm";

export interface CustomerFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  orderType?: "food" | "parcel" | "person_ride";
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CustomerOrderStats {
  orderType: "food" | "parcel" | "person_ride" | null;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: Date | null;
}

export interface CustomerWithStats {
  id: number;
  customerId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  primaryMobile: string;
  accountStatus: string;
  riskFlag: string | null;
  trustScore: number | null;
  walletBalance: number | null;
  createdAt: Date;
  lastOrderAt: Date | null;
  orderStats: CustomerOrderStats[];
}

/**
 * List customers with filters and pagination
 */
export async function listCustomers(filters: CustomerFilters = {}) {
  const db = getDb();
  
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;
  
  // Build where conditions
  const conditions = [];
  
  // Exclude soft-deleted customers
  conditions.push(isNull(customers.deletedAt));
  
  // Search filter
  if (filters.search) {
    const searchTerm = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(customers.customerId, searchTerm),
        ilike(customers.fullName, searchTerm),
        ilike(customers.primaryMobile, searchTerm),
        ilike(customers.email, searchTerm)
      )!
    );
  }
  
  // Status filter
  if (filters.status) {
    conditions.push(eq(customers.accountStatus, filters.status as any));
  }
  
  // Date range filter (on created_at)
  if (filters.dateFrom) {
    conditions.push(gte(customers.createdAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    const dateTo = new Date(filters.dateTo);
    dateTo.setHours(23, 59, 59, 999); // Include entire day
    conditions.push(lte(customers.createdAt, dateTo));
  }
  
  // Order type filter - if specified, only show customers with orders of that type
  const orderTypeFilter = filters.orderType;
  
  // If order type filter is specified, get customer IDs that have orders of that type
  if (orderTypeFilter) {
    const customersWithOrders = await db
      .selectDistinct({ customerId: ordersCore.customerId })
      .from(ordersCore)
      .where(
        and(
          sql`${ordersCore.customerId} IS NOT NULL`,
          eq(ordersCore.orderType, orderTypeFilter)
        )
      );
    
    const customerIds = customersWithOrders
      .map((c) => Number(c.customerId))
      .filter((id) => !isNaN(id));
    
    if (customerIds.length === 0) {
      // No customers with orders of this type
      return {
        customers: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }
    
    // Add customer ID filter to conditions
    conditions.push(inArray(customers.id, customerIds));
  }
  
  // Build base query
  let query = db.select({
    id: customers.id,
    customerId: customers.customerId,
    fullName: customers.fullName,
    firstName: customers.firstName,
    lastName: customers.lastName,
    email: customers.email,
    primaryMobile: customers.primaryMobile,
    accountStatus: customers.accountStatus,
    riskFlag: customers.riskFlag,
    trustScore: customers.trustScore,
    walletBalance: customers.walletBalance,
    createdAt: customers.createdAt,
    lastOrderAt: customers.lastOrderAt,
  }).from(customers);
  
  // Apply where conditions
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  // Sorting
  const sortBy = filters.sortBy || "createdAt";
  const sortOrder = filters.sortOrder || "desc";
  
  if (sortBy === "fullName") {
    query = query.orderBy(sortOrder === "asc" ? asc(customers.fullName) : desc(customers.fullName));
  } else if (sortBy === "createdAt") {
    query = query.orderBy(sortOrder === "asc" ? asc(customers.createdAt) : desc(customers.createdAt));
  } else if (sortBy === "lastOrderAt") {
    query = query.orderBy(sortOrder === "asc" ? asc(customers.lastOrderAt) : desc(customers.lastOrderAt));
  } else {
    query = query.orderBy(desc(customers.createdAt));
  }
  
  // Get total count for pagination
  const countConditions = [...conditions];
  let countQuery = db
    .select({ count: sql<number>`count(distinct ${customers.id})` })
    .from(customers);
  
  if (orderTypeFilter) {
    // For order type filter, we need to count only customers with orders of that type
    countQuery = db
      .select({ count: sql<number>`count(distinct ${customers.id})` })
      .from(customers)
      .innerJoin(ordersCore, eq(customers.id, ordersCore.customerId))
      .where(
        and(
          ...countConditions,
          eq(ordersCore.orderType, orderTypeFilter)
        )
      );
  } else {
    if (countConditions.length > 0) {
      countQuery = countQuery.where(and(...countConditions));
    }
  }
  
  const [countResult] = await countQuery;
  const total = Number(countResult?.count || 0);
  
  // Apply pagination
  const customerList = await query.limit(limit).offset(offset);
  
  // Get order statistics for each customer
  const customersWithStats: CustomerWithStats[] = await Promise.all(
    customerList.map(async (customer) => {
      const stats = await getCustomerOrderStats(customer.id, orderTypeFilter || undefined);
      return {
        ...customer,
        orderStats: stats,
      };
    })
  );
  
  return {
    customers: customersWithStats,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get order statistics for a customer
 */
export async function getCustomerOrderStats(
  customerId: number,
  orderType?: "food" | "parcel" | "person_ride"
): Promise<CustomerOrderStats[]> {
  const db = getDb();
  
  let statsQuery = db
    .select({
      orderType: ordersCore.orderType,
      totalOrders: sql<number>`count(*)::int`,
      totalSpent: sql<number>`coalesce(sum(${ordersCore.fareAmount}), 0)`,
      lastOrderAt: sql<Date | null>`max(${ordersCore.createdAt})`,
    })
    .from(ordersCore)
    .where(eq(ordersCore.customerId, customerId))
    .groupBy(ordersCore.orderType);
  
  if (orderType) {
    statsQuery = statsQuery.where(
      and(
        eq(ordersCore.customerId, customerId),
        eq(ordersCore.orderType, orderType)
      )
    );
  }
  
  const stats = await statsQuery;
  
  return stats.map((stat) => ({
    orderType: stat.orderType as "food" | "parcel" | "person_ride" | null,
    totalOrders: Number(stat.totalOrders),
    totalSpent: Number(stat.totalSpent),
    lastOrderAt: stat.lastOrderAt,
  }));
}

/**
 * Get customer by ID
 */
export async function getCustomerById(id: number) {
  const db = getDb();
  
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  
  return customer || null;
}

/**
 * Get customer by customer_id
 */
export async function getCustomerByCustomerId(customerId: string) {
  const db = getDb();
  
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.customerId, customerId))
    .limit(1);
  
  return customer || null;
}
