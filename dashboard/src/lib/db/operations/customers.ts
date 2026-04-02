/**
 * Database Operations for Customers
 * Handles all CRUD operations for customer management
 */

import { getDb, getSql } from "../client";
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

export interface CustomerAddressRow {
  id: number;
  label: string | null;
  customLabel: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string | null;
  isDefault: boolean;
  landmark: string | null;
  addressAuto: string | null;
}

function numPk(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}

/**
 * Search semantics (customer_id, full_name, primary_mobile, email):
 * - `GM` + digits only → **exact** `customer_id` (case-insensitive). Avoids `GM100001` matching `GM1000010`.
 * - Phone-only input (digits + common separators) → **exact** normalized mobile match (no substring).
 * - Otherwise → fuzzy `ILIKE` on customer_id, full_name, primary_mobile, email.
 */
function customerSearchSql(trim: string): SQL {
  const raw = trim.trim();
  const compact = raw.replace(/\s/g, "");

  if (/^GM\d+$/i.test(compact)) {
    return sql`LOWER(TRIM(${customers.customerId})) = LOWER(${compact})`;
  }

  const digitsOnly = compact.replace(/\D/g, "");
  const phoneCharsOnly = /^[+\d\s\-().]*$/.test(raw.trim());
  if (
    phoneCharsOnly &&
    digitsOnly.length >= 10 &&
    digitsOnly.length <= 15
  ) {
    const variants = new Set<string>();
    variants.add(digitsOnly);
    if (digitsOnly.length === 10) variants.add(`91${digitsOnly}`);
    if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
      variants.add(digitsOnly.slice(2));
    }
    const orParts: SQL[] = [];
    for (const v of variants) {
      orParts.push(
        sql`regexp_replace(COALESCE(${customers.primaryMobile}, ''), '[^0-9]', '', 'g') = ${v}`
      );
    }
    const last10 =
      digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
    if (last10.length === 10) {
      orParts.push(eq(customers.primaryMobileNormalized, last10));
    }
    return or(...orParts)!;
  }

  const searchTerm = `%${raw}%`;
  return or(
    ilike(customers.customerId, searchTerm),
    ilike(customers.fullName, searchTerm),
    ilike(customers.primaryMobile, searchTerm),
    ilike(customers.email, searchTerm)
  )!;
}

function mapCustomerAddressRow(r: Record<string, unknown>): CustomerAddressRow {
  const def = r.is_default;
  return {
    id: numPk(r.id),
    label: r.label != null ? String(r.label) : null,
    customLabel: r.custom_label != null ? String(r.custom_label) : null,
    addressLine1: String(r.address_line1 ?? ""),
    addressLine2: r.address_line2 != null ? String(r.address_line2) : null,
    city: String(r.city ?? ""),
    state: String(r.state ?? ""),
    postalCode: String(r.postal_code ?? ""),
    country: r.country != null ? String(r.country) : null,
    isDefault: def === true || def === "t",
    landmark: r.landmark != null ? String(r.landmark) : null,
    addressAuto: r.address_auto != null ? String(r.address_auto) : null,
  };
}

/** Customers who installed/signup via this customer's referral (FK or matching referral code). */
export async function getCustomerReferralInstallCount(
  customerDbId: number
): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM customers c
    WHERE c.deleted_at IS NULL
    AND (
      c.referrer_customer_id = ${customerDbId}
      OR EXISTS (
        SELECT 1 FROM customers r
        WHERE r.id = ${customerDbId}
        AND r.referral_code IS NOT NULL
        AND c.referred_by = r.referral_code
      )
    )
  `;
  const row = rows[0] as { cnt?: number } | undefined;
  return Number(row?.cnt ?? 0);
}

export async function getCustomerAddresses(
  customerDbId: number
): Promise<CustomerAddressRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      id,
      label::text AS label,
      custom_label,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      is_default,
      landmark,
      address_auto
    FROM customer_addresses
    WHERE customer_id = ${customerDbId}
    AND deleted_at IS NULL
    AND COALESCE(is_active, TRUE) = TRUE
    ORDER BY is_default DESC NULLS LAST, id ASC
  `;
  return rows.map((r) => mapCustomerAddressRow(r as Record<string, unknown>));
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
  trustTier: string | null;
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
    conditions.push(customerSearchSql(filters.search));
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
    trustTier: customers.trustTier,
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
        trustTier: customer.trustTier ?? null,
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

/** Customer columns for detail/list API (matches public.customers; no first_name/last_name in DB). */
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
  trustTier: customers.trustTier,
  fraudScore: customers.fraudScore,
  walletBalance: customers.walletBalance,
  walletLockedAmount: customers.walletLockedAmount,
  isIdentityVerified: customers.isIdentityVerified,
  isEmailVerified: customers.isEmailVerified,
  isMobileVerified: customers.isMobileVerified,
  smsPermission: customers.smsPermission,
  gmitraPlusActive: customers.gmitraPlusActive,
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
  ageGroup: customers.ageGroup,
  profileCompleted: customers.profileCompleted,
  locationPermission: customers.locationPermission,
  contactsPermission: customers.contactsPermission,
  sessionsInvalidBefore: customers.sessionsInvalidBefore,
  addressLine1: customers.addressLine1,
  addressLine2: customers.addressLine2,
  city: customers.city,
  state: customers.state,
  pincode: customers.pincode,
  country: customers.country,
  latitude: customers.latitude,
  longitude: customers.longitude,
  emailVerifiedAt: customers.emailVerifiedAt,
  customerUuid: customers.customerUuid,
  isGlobalActive: customers.isGlobalActive,
  workPhone: customers.workPhone,
  facebookId: customers.facebookId,
  twitterId: customers.twitterId,
  timeZone: customers.timeZone,
  contactTags: customers.contactTags,
  jobTitle: customers.jobTitle,
  uniqueExternalId: customers.uniqueExternalId,
  twitterVerified: customers.twitterVerified,
  twitterFollowerCount: customers.twitterFollowerCount,
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
  const [referralInstallCount, addresses] = await Promise.all([
    getCustomerReferralInstallCount(id),
    getCustomerAddresses(id),
  ]);
  return {
    ...customer,
    referralInstallCount,
    addresses,
  };
}

/** Get customer by public customer_id (e.g. GM…). */
export async function getCustomerByCustomerId(customerId: string) {
  const db = getDb();

  const [customer] = await db
    .select(customerSelectFields)
    .from(customers)
    .where(eq(customers.customerId, customerId))
    .limit(1);

  if (!customer) return null;
  const [referralInstallCount, addresses] = await Promise.all([
    getCustomerReferralInstallCount(customer.id),
    getCustomerAddresses(customer.id),
  ]);
  return {
    ...customer,
    referralInstallCount,
    addresses,
  };
}
