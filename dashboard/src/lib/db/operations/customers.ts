/**
 * Database Operations for Customers
 * Handles all CRUD operations for customer management
 */

import { getDb } from "../client";
import { customers, ordersCore } from "../schema";
import {
  eq,
  and,
  or,
  ilike,
  isNull,
  sql,
  desc,
  asc,
  gte,
  lte,
  inArray,
  type SQL,
} from "drizzle-orm";
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
  
  const customerSelect = {
    id: customers.id,
    customerId: customers.customerId,
    fullName: customers.fullName,
    email: customers.email,
    primaryMobile: customers.primaryMobile,
    accountStatus: customers.accountStatus,
    riskFlag: customers.riskFlag,
    trustScore: customers.trustScore,
    walletBalance: customers.walletBalance,
    createdAt: customers.createdAt,
    lastOrderAt: customers.lastOrderAt,
  };

  let filteredCustomers = db.select(customerSelect).from(customers).$dynamic();

  if (conditions.length > 0) {
    filteredCustomers = filteredCustomers.where(and(...conditions));
  }

  const sortBy = filters.sortBy || "createdAt";
  const sortOrder = filters.sortOrder || "desc";

  const query =
    sortBy === "fullName"
      ? filteredCustomers.orderBy(sortOrder === "asc" ? asc(customers.fullName) : desc(customers.fullName))
      : sortBy === "createdAt"
        ? filteredCustomers.orderBy(sortOrder === "asc" ? asc(customers.createdAt) : desc(customers.createdAt))
        : sortBy === "lastOrderAt"
          ? filteredCustomers.orderBy(sortOrder === "asc" ? asc(customers.lastOrderAt) : desc(customers.lastOrderAt))
          : filteredCustomers.orderBy(desc(customers.createdAt));

  const countConditions = [...conditions];
  let total: number;
  if (orderTypeFilter) {
    const [countRow] = await db
      .select({ count: sql<number>`count(distinct ${customers.id})` })
      .from(customers)
      .innerJoin(ordersCore, eq(customers.id, ordersCore.customerId))
      .where(
        and(
          ...countConditions,
          eq(ordersCore.orderType, orderTypeFilter)
        )!
      );
    total = Number(countRow?.count || 0);
  } else {
    let countQuery = db
      .select({ count: sql<number>`count(distinct ${customers.id})` })
      .from(customers)
      .$dynamic();
    if (countConditions.length > 0) {
      countQuery = countQuery.where(and(...countConditions));
    }
    const [countResult] = await countQuery;
    total = Number(countResult?.count || 0);
  }
    // Apply pagination
  const customerList = await query.limit(limit).offset(offset);
  
  // Get order statistics for each customer (firstName/lastName omitted from select if not in DB)
  const customersWithStats: CustomerWithStats[] = await Promise.all(
    customerList.map(async (customer) => {
      const stats = await getCustomerOrderStats(customer.id, orderTypeFilter || undefined);
      const trustRaw = customer.trustScore;
      const trustScore =
        trustRaw === null || trustRaw === undefined
          ? null
          : typeof trustRaw === "number"
            ? trustRaw
            : Number(trustRaw);
      const wbRaw = customer.walletBalance;
      const walletBalance =
        wbRaw === null || wbRaw === undefined
          ? null
          : typeof wbRaw === "number"
            ? wbRaw
            : Number(wbRaw);
      return {
        ...customer,
        trustScore:
          customer.trustScore == null ? null : Number(customer.trustScore),
        walletBalance:
          customer.walletBalance == null ? null : Number(customer.walletBalance),
        firstName: null,
        lastName: null,
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

  const statsConditions: SQL[] = [eq(ordersCore.customerId, customerId)];
  if (orderType) {
    statsConditions.push(eq(ordersCore.orderType, orderType));
  }
  const stats = await db
    .select({
      orderType: ordersCore.orderType,
      totalOrders: sql<number>`count(*)::int`,
      totalSpent: sql<number>`coalesce(sum(${ordersCore.fareAmount}), 0)`,
      lastOrderAt: sql<Date | null>`max(${ordersCore.createdAt})`,
    })
    .from(ordersCore)
    .where(and(...statsConditions)!)
    .groupBy(ordersCore.orderType);
  
  return stats.map((stat) => ({
    orderType: stat.orderType as "food" | "parcel" | "person_ride" | null,
    totalOrders: Number(stat.totalOrders),
    totalSpent: Number(stat.totalSpent),
    lastOrderAt: stat.lastOrderAt,
  }));
}

/** Safe customer columns (omit first_name/last_name when they do not exist in DB) */
const customerSelectFields = {
  id: customers.id,
  customerId: customers.customerId,
  fullName: customers.fullName,
  email: customers.email,
  emailVerified: customers.emailVerified,
  primaryMobile: customers.primaryMobile,
  primaryMobileNormalized: customers.primaryMobileNormalized,
  primaryMobileCountryCode: customers.primaryMobileCountryCode,
  mobileVerified: customers.mobileVerified,
  alternateMobile: customers.alternateMobile,
  whatsappNumber: customers.whatsappNumber,
  gender: customers.gender,
  dateOfBirth: customers.dateOfBirth,
  profileImageUrl: customers.profileImageUrl,
  bio: customers.bio,
  preferredLanguage: customers.preferredLanguage,
  referralCode: customers.referralCode,
  referredBy: customers.referredBy,
  referrerCustomerId: customers.referrerCustomerId,
  accountStatus: customers.accountStatus,
  statusReason: customers.statusReason,
  riskFlag: customers.riskFlag,
  trustScore: customers.trustScore,
  fraudScore: customers.fraudScore,
  walletBalance: customers.walletBalance,
  walletLockedAmount: customers.walletLockedAmount,
  isIdentityVerified: customers.isIdentityVerified,
  isEmailVerified: customers.isEmailVerified,
  isMobileVerified: customers.isMobileVerified,
  lastLoginAt: customers.lastLoginAt,
  lastOrderAt: customers.lastOrderAt,
  lastActivityAt: customers.lastActivityAt,
  deletedAt: customers.deletedAt,
  deletedBy: customers.deletedBy,
  deletionReason: customers.deletionReason,
  createdAt: customers.createdAt,
  updatedAt: customers.updatedAt,
  createdVia: customers.createdVia,
  updatedBy: customers.updatedBy,
};

/**
 * Get customer by ID (uses safe columns; firstName/lastName not selected if missing in DB)
 */
export async function getCustomerById(id: number) {
  const db = getDb();

  const [customer] = await db
    .select(customerSelectFields)
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (!customer) return null;
  return { ...customer, firstName: null, lastName: null };
}

/**
 * Get customer by customer_id (uses safe columns; firstName/lastName not selected if missing in DB)
 */
export async function getCustomerByCustomerId(customerId: string) {
  const db = getDb();

  const [customer] = await db
    .select(customerSelectFields)
    .from(customers)
    .where(eq(customers.customerId, customerId))
    .limit(1);

  if (!customer) return null;
  return { ...customer, firstName: null, lastName: null };
}
