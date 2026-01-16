/**
 * Enterprise-Grade DBMS Schema for Rider-Based Gig-Economy Logistics Application
 * 
 * Architecture: Modular Monolithic Schema in Supabase PostgreSQL
 * ORM: Drizzle
 * 
 * Key Design Decisions:
 * - Rider ID: INTEGER (auto-incrementing, unique, no characters)
 * - Domain-based table groups for modularity
 * - Event logging tables for audit trails
 * - Partition-ready tables for high-volume data
 * - Read-optimized aggregates for analytics
 */

import {
  pgTable,
  pgEnum,
  integer,
  text,
  timestamp,
  boolean,
  numeric,
  jsonb,
  doublePrecision,
  smallint,
  date,
  bigserial,
  serial,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// ENUMS
// ============================================================================

export const onboardingStageEnum = pgEnum("onboarding_stage", [
  "MOBILE_VERIFIED",
  "KYC",
  "PAYMENT",
  "APPROVAL",
  "ACTIVE",
]);

export const kycStatusEnum = pgEnum("kyc_status", [
  "PENDING",
  "REJECTED",
  "APPROVED",
  "REVIEW",
]);

export const riderStatusEnum = pgEnum("rider_status", [
  "INACTIVE",
  "ACTIVE",
  "BLOCKED",
  "BANNED",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "aadhaar",
  "dl",
  "rc",
  "pan",
  "selfie",
  "rental_proof",
  "ev_proof",
]);

export const dutyStatusEnum = pgEnum("duty_status", [
  "ON",
  "OFF",
  "AUTO_OFF",
]);

export const orderTypeEnum = pgEnum("order_type", [
  "food",
  "parcel",
  "ride",
  "3pl",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "assigned",
  "accepted",
  "reached_store",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
  "failed",
]);

export const orderActionEnum = pgEnum("order_action", [
  "accept",
  "reject",
  "auto_reject",
  "timeout",
]);

export const walletEntryTypeEnum = pgEnum("wallet_entry_type", [
  "earning",
  "penalty",
  "onboarding_fee",
  "adjustment",
  "refund",
  "bonus",
  "referral_bonus",
]);

export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
  "refunded",
]);

export const offerScopeEnum = pgEnum("offer_scope", [
  "global",
  "city",
  "rider",
]);

export const rewardTypeEnum = pgEnum("reward_type", [
  "cash",
  "voucher",
  "bonus",
]);

export const ratingFromTypeEnum = pgEnum("rating_from_type", [
  "customer",
  "merchant",
]);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

// ============================================================================
// SYSTEM USERS & ACCESS MANAGEMENT
// ============================================================================

export const systemUserRoleTypeEnum = pgEnum("system_user_role_type", [
  "SUPER_ADMIN",
  "ADMIN",
  "AGENT",
  "AREA_MANAGER_MERCHANT",
  "AREA_MANAGER_RIDER",
  "SALES_TEAM",
  "ADVERTISEMENT_TEAM",
  "AUDIT_TEAM",
  "COMPLIANCE_TEAM",
  "SUPPORT_L1",
  "SUPPORT_L2",
  "SUPPORT_L3",
  "FINANCE_TEAM",
  "OPERATIONS_TEAM",
  "DEVELOPER",
  "READ_ONLY",
  "MANAGER",
  "SUPERVISOR",
  "TEAM_LEAD",
  "COORDINATOR",
  "ANALYST",
  "SPECIALIST",
  "CONSULTANT",
  "INTERN",
  "TRAINEE",
  "QA_ENGINEER",
  "PRODUCT_MANAGER",
  "PROJECT_MANAGER",
  "HR_TEAM",
  "MARKETING_TEAM",
  "CUSTOMER_SUCCESS",
  "DATA_ANALYST",
  "BUSINESS_ANALYST",
]);

export const systemUserStatusEnum = pgEnum("system_user_status", [
  "ACTIVE",
  "SUSPENDED",
  "DISABLED",
  "PENDING_ACTIVATION",
  "LOCKED",
]);

/**
 * System Users table - Internal dashboard users (admins, agents, etc.)
 */
export const systemUsers = pgTable(
  "system_users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    systemUserId: text("system_user_id").notNull().unique(),
    fullName: text("full_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email").notNull().unique(),
    mobile: text("mobile").notNull(),
    alternateMobile: text("alternate_mobile"),
    primaryRole: systemUserRoleTypeEnum("primary_role").notNull(),
    subrole: text("subrole"),
    subroleOther: text("subrole_other"),
    roleDisplayName: text("role_display_name"),
    department: text("department"),
    team: text("team"),
    reportsToId: integer("reports_to_id").references((): any => systemUsers.id),
    managerName: text("manager_name"),
    status: systemUserStatusEnum("status").notNull().default("PENDING_ACTIVATION"),
    statusReason: text("status_reason"),
    isEmailVerified: boolean("is_email_verified").default(false),
    isMobileVerified: boolean("is_mobile_verified").default(false),
    twoFactorEnabled: boolean("two_factor_enabled").default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    loginCount: integer("login_count").default(0),
    failedLoginAttempts: integer("failed_login_attempts").default(0),
    accountLockedUntil: timestamp("account_locked_until", { withTimezone: true }),
    createdBy: integer("created_by").references((): any => systemUsers.id),
    createdByName: text("created_by_name"),
    approvedBy: integer("approved_by").references((): any => systemUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: integer("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    systemUserIdIdx: uniqueIndex("system_users_system_user_id_idx").on(
      table.systemUserId
    ),
    emailIdx: uniqueIndex("system_users_email_idx").on(table.email),
    mobileIdx: index("system_users_mobile_idx").on(table.mobile),
    primaryRoleIdx: index("system_users_primary_role_idx").on(table.primaryRole),
    statusIdx: index("system_users_status_idx").on(table.status),
    reportsToIdx: index("system_users_reports_to_idx").on(table.reportsToId),
  })
);

/**
 * Dashboard Access table - Stores which dashboards a user can access
 */
export const dashboardAccess = pgTable(
  "dashboard_access",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    systemUserId: integer("system_user_id")
      .notNull()
      .references((): any => systemUsers.id, { onDelete: "cascade" }),
    dashboardType: text("dashboard_type").notNull(),
    accessLevel: text("access_level").notNull().default("VIEW_ONLY"),
    isActive: boolean("is_active").default(true),
    grantedBy: integer("granted_by")
      .notNull()
      .references((): any => systemUsers.id),
    grantedByName: text("granted_by_name"),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: integer("revoked_by").references((): any => systemUsers.id),
    revokeReason: text("revoke_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    systemUserIdIdx: index("dashboard_access_user_id_idx").on(
      table.systemUserId
    ),
    dashboardTypeIdx: index("dashboard_access_dashboard_type_idx").on(
      table.dashboardType
    ),
    isActiveIdx: index("dashboard_access_is_active_idx").on(table.isActive),
    uniqueUserDashboard: uniqueIndex(
      "dashboard_access_user_dashboard_unique"
    ).on(table.systemUserId, table.dashboardType),
  })
);

/**
 * Dashboard Access Points table - Stores grouped access points (actions) within each dashboard
 */
export const dashboardAccessPoints = pgTable(
  "dashboard_access_points",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    systemUserId: integer("system_user_id")
      .notNull()
      .references((): any => systemUsers.id, { onDelete: "cascade" }),
    dashboardType: text("dashboard_type").notNull(),
    accessPointGroup: text("access_point_group").notNull(),
    accessPointName: text("access_point_name").notNull(),
    accessPointDescription: text("access_point_description"),
    allowedActions: jsonb("allowed_actions").notNull().default([]),
    context: jsonb("context").default({}),
    isActive: boolean("is_active").default(true),
    grantedBy: integer("granted_by")
      .notNull()
      .references((): any => systemUsers.id),
    grantedByName: text("granted_by_name"),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: integer("revoked_by").references((): any => systemUsers.id),
    revokeReason: text("revoke_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    systemUserIdIdx: index("dashboard_access_points_user_id_idx").on(
      table.systemUserId
    ),
    dashboardTypeIdx: index("dashboard_access_points_dashboard_type_idx").on(
      table.dashboardType
    ),
    accessPointGroupIdx: index("dashboard_access_points_group_idx").on(
      table.accessPointGroup
    ),
    isActiveIdx: index("dashboard_access_points_is_active_idx").on(
      table.isActive
    ),
    uniqueUserDashboardGroup: uniqueIndex(
      "dashboard_access_points_user_dashboard_group_unique"
    ).on(table.systemUserId, table.dashboardType, table.accessPointGroup),
  })
);

/**
 * Action Audit Log table - Tracks all actions performed by agents
 */
export const actionAuditLog = pgTable(
  "action_audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agentId: integer("agent_id")
      .notNull()
      .references((): any => systemUsers.id),
    agentEmail: text("agent_email").notNull(),
    agentName: text("agent_name"),
    agentRole: text("agent_role"),
    dashboardType: text("dashboard_type").notNull(),
    actionType: text("action_type").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    actionDetails: jsonb("action_details").default({}),
    previousValues: jsonb("previous_values"),
    newValues: jsonb("new_values"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestPath: text("request_path"),
    requestMethod: text("request_method"),
    actionStatus: text("action_status").default("SUCCESS"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("action_audit_log_agent_id_idx").on(table.agentId),
    dashboardTypeIdx: index("action_audit_log_dashboard_type_idx").on(
      table.dashboardType
    ),
    resourceTypeIdx: index("action_audit_log_resource_type_idx").on(
      table.resourceType
    ),
    createdAtIdx: index("action_audit_log_created_at_idx").on(table.createdAt),
    actionTypeIdx: index("action_audit_log_action_type_idx").on(
      table.actionType
    ),
  })
);

// ============================================================================
// TYPE EXPORTS FOR DASHBOARD ACCESS
// ============================================================================

export type DashboardType =
  | "RIDER"
  | "MERCHANT"
  | "CUSTOMER"
  | "ORDER"
  | "TICKET"
  | "OFFER"
  | "AREA_MANAGER"
  | "PAYMENT"
  | "SYSTEM"
  | "ANALYTICS";

export type AccessLevel = "VIEW_ONLY" | "FULL_ACCESS" | "RESTRICTED";

export type AccessPointGroup =
  | "RIDER_VIEW"
  | "RIDER_ACTIONS"
  | "MERCHANT_VIEW"
  | "MERCHANT_ONBOARDING"
  | "MERCHANT_OPERATIONS"
  | "MERCHANT_STORE_MANAGEMENT"
  | "MERCHANT_WALLET"
  | "CUSTOMER_VIEW"
  | "CUSTOMER_ACTIONS"
  | "ORDER_VIEW"
  | "ORDER_CANCEL_ASSIGN"
  | "ORDER_REFUND_DELIVER"
  | "TICKET_VIEW"
  | "TICKET_MERCHANT"
  | "TICKET_CUSTOMER"
  | "TICKET_RIDER"
  | "TICKET_OTHER"
  | "TICKET_ACTIONS"
  | "OFFER_RIDER"
  | "OFFER_CUSTOMER"
  | "OFFER_MERCHANT"
  | "AREA_MANAGER_MERCHANT"
  | "AREA_MANAGER_RIDER"
  | "PAYMENT_MANAGEMENT";

export type ActionType =
  | "VIEW"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "APPROVE"
  | "REJECT"
  | "ASSIGN"
  | "CANCEL"
  | "REFUND"
  | "BLOCK"
  | "UNBLOCK"
  | "EXPORT"
  | "IMPORT";

export type ActionStatus = "SUCCESS" | "FAILED" | "PENDING";

// ============================================================================
// RIDER CORE DOMAIN
// ============================================================================

/**
 * Core rider table with INTEGER primary key
 * Stores essential rider identity and status information
 */
const ridersTable = pgTable(
  "riders",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    mobile: text("mobile").notNull().unique(),
    countryCode: text("country_code").notNull().default("+91"),
    name: text("name"),
    aadhaarNumber: text("aadhaar_number"),
    panNumber: text("pan_number"),
    dob: date("dob"),
    selfieUrl: text("selfie_url"),
    onboardingStage: onboardingStageEnum("onboarding_stage")
      .notNull()
      .default("MOBILE_VERIFIED"),
    kycStatus: kycStatusEnum("kyc_status").notNull().default("PENDING"),
    status: riderStatusEnum("status").notNull().default("INACTIVE"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),
    address: text("address"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    referralCode: text("referral_code").unique(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    referredBy: integer("referred_by").references((): any => (ridersTable as any).id),
    defaultLanguage: text("default_language").notNull().default("en"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    mobileIdx: uniqueIndex("riders_mobile_idx").on(table.mobile),
    referralCodeIdx: uniqueIndex("riders_referral_code_idx").on(
      table.referralCode
    ),
    statusIdx: index("riders_status_idx").on(table.status),
    cityIdx: index("riders_city_idx").on(table.city),
    kycStatusIdx: index("riders_kyc_status_idx").on(table.kycStatus),
  })
);

export const riders = ridersTable;

/**
 * Rider documents with history support (allows reupload)
 * Tracks all document submissions for audit and compliance
 */
export const riderDocuments = pgTable(
  "rider_documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    docType: documentTypeEnum("doc_type").notNull(),
    fileUrl: text("file_url").notNull(),
    r2Key: text("r2_key"), // R2 storage key - allows URL regeneration if signed URL expires
    extractedName: text("extracted_name"),
    extractedDob: date("extracted_dob"),
    verified: boolean("verified").notNull().default(false),
    verifierUserId: integer("verifier_user_id"),
    rejectedReason: text("rejected_reason"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_documents_rider_id_idx").on(table.riderId),
    docTypeIdx: index("rider_documents_doc_type_idx").on(table.docType),
    verifiedIdx: index("rider_documents_verified_idx").on(table.verified),
  })
);

// ============================================================================
// DEVICE & SECURITY
// ============================================================================

/**
 * Rider device tracking for security and fraud prevention
 */
export const riderDevices = pgTable(
  "rider_devices",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    ipAddress: text("ip_address"),
    simId: text("sim_id"),
    model: text("model"),
    osVersion: text("os_version"),
    fcmToken: text("fcm_token"),
    allowed: boolean("allowed").notNull().default(true),
    lastSeen: timestamp("last_seen", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_devices_rider_id_idx").on(table.riderId),
    deviceIdIdx: index("rider_devices_device_id_idx").on(table.deviceId),
    allowedIdx: index("rider_devices_allowed_idx").on(table.allowed),
  })
);

/**
 * Blacklist history for audit trail
 */
export const blacklistHistory = pgTable(
  "blacklist_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    banned: boolean("banned").notNull().default(true),
    adminUserId: integer("admin_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("blacklist_history_rider_id_idx").on(table.riderId),
    bannedIdx: index("blacklist_history_banned_idx").on(table.banned),
  })
);

// ============================================================================
// DUTY & LOCATION TRACKING
// ============================================================================

/**
 * Duty logs - tracks rider ON/OFF duty status changes
 */
export const dutyLogs = pgTable(
  "duty_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    status: dutyStatusEnum("status").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("duty_logs_rider_id_idx").on(table.riderId),
    timestampIdx: index("duty_logs_timestamp_idx").on(table.timestamp),
    riderStatusIdx: index("duty_logs_rider_status_idx").on(
      table.riderId,
      table.status
    ),
  })
);

/**
 * Rider location events - for fraud detection and location tracking
 * Used by location ping endpoint
 */
export const riderLocationEvents = pgTable(
  "rider_location_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(), // This is the JWT sub (user ID from auth)
    deviceId: text("device_id").notNull(),
    tsMs: integer("ts_ms").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracyM: doublePrecision("accuracy_m"),
    altitudeM: doublePrecision("altitude_m"),
    speedMps: doublePrecision("speed_mps"),
    headingDeg: doublePrecision("heading_deg"),
    mocked: boolean("mocked").notNull().default(false),
    provider: text("provider").notNull().default("unknown"),
    fraudScore: integer("fraud_score").notNull().default(0),
    fraudSignals: jsonb("fraud_signals").notNull().default([]),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("rider_location_events_user_id_idx").on(table.userId),
    deviceIdIdx: index("rider_location_events_device_id_idx").on(table.deviceId),
    tsMsIdx: index("rider_location_events_ts_ms_idx").on(table.tsMs),
    userDeviceIdx: index("rider_location_events_user_device_idx").on(
      table.userId,
      table.deviceId
    ),
  })
);

/**
 * Location logs - high-volume time-series data
 * RECOMMENDED: Partition by month for performance
 */
export const locationLogs = pgTable(
  "location_logs",
  {
    id: bigserial("id", { mode: "number" }),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    batteryPercent: integer("battery_percent"),
    accuracy: doublePrecision("accuracy"),
    speed: doublePrecision("speed"),
    heading: doublePrecision("heading"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
    riderIdIdx: index("location_logs_rider_id_idx").on(table.riderId),
    createdAtIdx: index("location_logs_created_at_idx").on(table.createdAt),
    riderCreatedIdx: index("location_logs_rider_created_idx").on(
      table.riderId,
      table.createdAt
    ),
  })
);

// ============================================================================
// ORDERS & ORDER EVENTS
// ============================================================================

/**
 * Orders table - supports multiple order types (food, parcel, ride, 3pl)
 */
export const orders = pgTable(
  "orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderType: orderTypeEnum("order_type").notNull(),
    externalRef: text("external_ref"),
    riderId: integer("rider_id").references(() => riders.id),
    merchantId: integer("merchant_id"),
    customerId: integer("customer_id"),
    pickupAddress: text("pickup_address").notNull(),
    dropAddress: text("drop_address").notNull(),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLon: doublePrecision("pickup_lon").notNull(),
    dropLat: doublePrecision("drop_lat").notNull(),
    dropLon: doublePrecision("drop_lon").notNull(),
    distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
    etaSeconds: integer("eta_seconds"),
    fareAmount: numeric("fare_amount", { precision: 10, scale: 2 }),
    commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }),
    riderEarning: numeric("rider_earning", { precision: 10, scale: 2 }),
    status: orderStatusEnum("status").notNull().default("assigned"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("orders_rider_id_idx").on(table.riderId),
    statusIdx: index("orders_status_idx").on(table.status),
    orderTypeIdx: index("orders_order_type_idx").on(table.orderType),
    createdAtIdx: index("orders_created_at_idx").on(table.createdAt),
    riderStatusIdx: index("orders_rider_status_idx").on(
      table.riderId,
      table.status
    ),
    externalRefIdx: index("orders_external_ref_idx").on(table.externalRef),
  })
);

/**
 * Order actions - tracks accept/reject decisions
 */
export const orderActions = pgTable(
  "order_actions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    action: orderActionEnum("action").notNull(),
    reason: text("reason"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("order_actions_order_id_idx").on(table.orderId),
    riderIdIdx: index("order_actions_rider_id_idx").on(table.riderId),
    timestampIdx: index("order_actions_timestamp_idx").on(table.timestamp),
  })
);

/**
 * Order timeline events - comprehensive event log
 */
export const orderEvents = pgTable(
  "order_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    event: text("event").notNull(), // e.g., "assigned", "accepted", "reached_store", "picked_up", "delivered"
    actorType: text("actor_type"), // "rider", "system", "customer", "merchant"
    actorId: integer("actor_id"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("order_events_order_id_idx").on(table.orderId),
    eventIdx: index("order_events_event_idx").on(table.event),
    createdAtIdx: index("order_events_created_at_idx").on(table.createdAt),
    orderEventIdx: index("order_events_order_event_idx").on(
      table.orderId,
      table.event
    ),
  })
);

// ============================================================================
// WALLET, LEDGER & PAYMENTS
// ============================================================================

/**
 * Wallet ledger - immutable transaction log
 * RECOMMENDED: Partition by rider_id for high-volume scenarios
 */
export const walletLedger = pgTable(
  "wallet_ledger",
  {
    id: bigserial("id", { mode: "number" }),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    entryType: walletEntryTypeEnum("entry_type").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    balance: numeric("balance", { precision: 10, scale: 2 }), // Running balance
    ref: text("ref"), // Reference to order_id, withdrawal_id, etc.
    refType: text("ref_type"), // "order", "withdrawal", "penalty", etc.
    description: text("description"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.riderId] }),
    riderIdIdx: index("wallet_ledger_rider_id_idx").on(table.riderId),
    entryTypeIdx: index("wallet_ledger_entry_type_idx").on(table.entryType),
    createdAtIdx: index("wallet_ledger_created_at_idx").on(table.createdAt),
    riderCreatedIdx: index("wallet_ledger_rider_created_idx").on(
      table.riderId,
      table.createdAt
    ),
    refIdx: index("wallet_ledger_ref_idx").on(table.ref),
  })
);

/**
 * Withdrawal requests
 */
export const withdrawalRequests = pgTable(
  "withdrawal_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    status: withdrawalStatusEnum("status").notNull().default("pending"),
    bankAcc: text("bank_acc").notNull(),
    ifsc: text("ifsc").notNull(),
    accountHolderName: text("account_holder_name").notNull(),
    upiId: text("upi_id"),
    transactionId: text("transaction_id"),
    failureReason: text("failure_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("withdrawal_requests_rider_id_idx").on(table.riderId),
    statusIdx: index("withdrawal_requests_status_idx").on(table.status),
    createdAtIdx: index("withdrawal_requests_created_at_idx").on(
      table.createdAt
    ),
  })
);

/**
 * Onboarding payments (registration fees, etc.)
 */
export const onboardingPayments = pgTable(
  "onboarding_payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    provider: text("provider").notNull(), // "razorpay", "stripe", etc.
    refId: text("ref_id").notNull().unique(),
    paymentId: text("payment_id"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("onboarding_payments_rider_id_idx").on(table.riderId),
    refIdIdx: uniqueIndex("onboarding_payments_ref_id_idx").on(table.refId),
    statusIdx: index("onboarding_payments_status_idx").on(table.status),
  })
);

// ============================================================================
// OFFERS & PARTICIPATION
// ============================================================================

/**
 * Offers table
 */
export const offers = pgTable(
  "offers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    scope: offerScopeEnum("scope").notNull().default("global"),
    condition: jsonb("condition").notNull(), // e.g., {orders_required: 30, time_limit: "10 days", city: "Mumbai"}
    rewardType: rewardTypeEnum("reward_type").notNull().default("cash"),
    rewardAmount: numeric("reward_amount", { precision: 10, scale: 2 }),
    rewardMetadata: jsonb("reward_metadata").default({}),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    scopeIdx: index("offers_scope_idx").on(table.scope),
    activeIdx: index("offers_active_idx").on(table.active),
    datesIdx: index("offers_dates_idx").on(table.startDate, table.endDate),
  })
);

/**
 * Offer participation tracking
 */
export const offerParticipation = pgTable(
  "offer_participation",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    offerId: integer("offer_id")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    completed: boolean("completed").notNull().default(false),
    progress: jsonb("progress").default({}), // Track progress towards completion
    rewardClaimed: boolean("reward_claimed").notNull().default(false),
    rewardClaimedAt: timestamp("reward_claimed_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("offer_participation_rider_id_idx").on(table.riderId),
    offerIdIdx: index("offer_participation_offer_id_idx").on(table.offerId),
    completedIdx: index("offer_participation_completed_idx").on(
      table.completed
    ),
    riderOfferIdx: uniqueIndex("offer_participation_rider_offer_idx").on(
      table.riderId,
      table.offerId
    ),
  })
);

// ============================================================================
// RATINGS & REVIEWS
// ============================================================================

/**
 * Ratings table
 */
export const ratings = pgTable(
  "ratings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    orderId: integer("order_id").references(() => orders.id),
    fromType: ratingFromTypeEnum("from_type").notNull(),
    fromId: integer("from_id"), // customer_id or merchant_id
    rating: smallint("rating").notNull(), // 1-5
    comment: text("comment"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("ratings_rider_id_idx").on(table.riderId),
    orderIdIdx: index("ratings_order_id_idx").on(table.orderId),
    fromTypeIdx: index("ratings_from_type_idx").on(table.fromType),
    createdAtIdx: index("ratings_created_at_idx").on(table.createdAt),
  })
);

// ============================================================================
// TICKETS & COMPLAINTS
// ============================================================================

/**
 * Support tickets
 */
export const tickets = pgTable(
  "tickets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    orderId: integer("order_id").references(() => orders.id),
    category: text("category").notNull(), // "payment", "order", "technical", "account", etc.
    priority: text("priority").notNull().default("medium"), // "low", "medium", "high", "urgent"
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    assignedTo: integer("assigned_to"), // support agent user_id
    resolution: text("resolution"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({
    riderIdIdx: index("tickets_rider_id_idx").on(table.riderId),
    statusIdx: index("tickets_status_idx").on(table.status),
    categoryIdx: index("tickets_category_idx").on(table.category),
    createdAtIdx: index("tickets_created_at_idx").on(table.createdAt),
  })
);

// ============================================================================
// REFERRAL SYSTEM
// ============================================================================

/**
 * Referral tracking
 */
export const referrals = pgTable(
  "referrals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    referrerId: integer("referrer_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    referredId: integer("referred_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    referrerReward: numeric("referrer_reward", { precision: 10, scale: 2 }),
    referredReward: numeric("referred_reward", { precision: 10, scale: 2 }),
    referrerRewardPaid: boolean("referrer_reward_paid")
      .notNull()
      .default(false),
    referredRewardPaid: boolean("referred_reward_paid")
      .notNull()
      .default(false),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    referrerIdIdx: index("referrals_referrer_id_idx").on(table.referrerId),
    referredIdIdx: index("referrals_referred_id_idx").on(table.referredId),
    referredIdUniqueIdx: uniqueIndex("referrals_referred_id_unique_idx").on(
      table.referredId
    ),
  })
);

// ============================================================================
// ANALYTICS & AGGREGATES
// ============================================================================

/**
 * Daily analytics summary - populated via cron job
 */
export const riderDailyAnalytics = pgTable(
  "rider_daily_analytics",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    totalOrders: integer("total_orders").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    cancelled: integer("cancelled").notNull().default(0),
    acceptanceRate: numeric("acceptance_rate", { precision: 5, scale: 2 }), // percentage
    earningsTotal: numeric("earnings_total", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    penaltiesTotal: numeric("penalties_total", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    dutyHours: numeric("duty_hours", { precision: 5, scale: 2 }), // hours
    avgRating: numeric("avg_rating", { precision: 3, scale: 2 }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_daily_analytics_rider_id_idx").on(table.riderId),
    dateIdx: index("rider_daily_analytics_date_idx").on(table.date),
    riderDateIdx: uniqueIndex("rider_daily_analytics_rider_date_idx").on(
      table.riderId,
      table.date
    ),
  })
);

// ============================================================================
// FRAUD & SECURITY LOGS
// ============================================================================

/**
 * Fraud detection logs
 */
export const fraudLogs = pgTable(
  "fraud_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id").references(() => riders.id, {
      onDelete: "set null",
    }),
    orderId: integer("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    fraudType: text("fraud_type").notNull(), // "location_spoofing", "duplicate_account", "payment_fraud", etc.
    severity: text("severity").notNull().default("medium"), // "low", "medium", "high", "critical"
    description: text("description").notNull(),
    evidence: jsonb("evidence").default({}),
    actionTaken: text("action_taken"), // "warned", "blocked", "banned", etc.
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: integer("resolved_by"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("fraud_logs_rider_id_idx").on(table.riderId),
    fraudTypeIdx: index("fraud_logs_fraud_type_idx").on(table.fraudType),
    severityIdx: index("fraud_logs_severity_idx").on(table.severity),
    resolvedIdx: index("fraud_logs_resolved_idx").on(table.resolved),
    createdAtIdx: index("fraud_logs_created_at_idx").on(table.createdAt),
  })
);

// ============================================================================
// ADMIN & ACTION LOGS
// ============================================================================

/**
 * Admin action logs for audit trail
 */
export const adminActionLogs = pgTable(
  "admin_action_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    adminUserId: integer("admin_user_id").notNull(),
    action: text("action").notNull(), // "RIDER_APPROVE", "RIDER_BLOCK", "ORDER_CANCEL", etc.
    entityType: text("entity_type").notNull(), // "rider", "order", "ticket", etc.
    entityId: integer("entity_id").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    reason: text("reason"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    adminUserIdIdx: index("admin_action_logs_admin_user_id_idx").on(
      table.adminUserId
    ),
    entityTypeIdx: index("admin_action_logs_entity_type_idx").on(
      table.entityType
    ),
    actionIdx: index("admin_action_logs_action_idx").on(table.action),
    createdAtIdx: index("admin_action_logs_created_at_idx").on(
      table.createdAt
    ),
  })
);

// ============================================================================
// RELATIONS (Drizzle ORM)
// ============================================================================

export const ridersRelations = relations(riders, ({ one, many }) => ({
  referredByRider: one(riders, {
    fields: [riders.referredBy],
    references: [riders.id],
  }),
  referredRiders: many(riders),
  documents: many(riderDocuments),
  devices: many(riderDevices),
  dutyLogs: many(dutyLogs),
  locationLogs: many(locationLogs),
  blacklistHistory: many(blacklistHistory),
  orders: many(orders),
  orderActions: many(orderActions),
  walletLedger: many(walletLedger),
  withdrawalRequests: many(withdrawalRequests),
  onboardingPayments: many(onboardingPayments),
  offerParticipation: many(offerParticipation),
  ratings: many(ratings),
  tickets: many(tickets),
  referralsAsReferrer: many(referrals, { relationName: "referrer" }),
  referralsAsReferred: many(referrals, { relationName: "referred" }),
  dailyAnalytics: many(riderDailyAnalytics),
  fraudLogs: many(fraudLogs),
}));

export const riderDocumentsRelations = relations(
  riderDocuments,
  ({ one }) => ({
    rider: one(riders, {
      fields: [riderDocuments.riderId],
      references: [riders.id],
    }),
  })
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  rider: one(riders, {
    fields: [orders.riderId],
    references: [riders.id],
  }),
  actions: many(orderActions),
  events: many(orderEvents),
  ratings: many(ratings),
  tickets: many(tickets),
}));

export const walletLedgerRelations = relations(walletLedger, ({ one }) => ({
  rider: one(riders, {
    fields: [walletLedger.riderId],
    references: [riders.id],
  }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(riders, {
    fields: [referrals.referrerId],
    references: [riders.id],
    relationName: "referrer",
  }),
  referred: one(riders, {
    fields: [referrals.referredId],
    references: [riders.id],
    relationName: "referred",
  }),
}));
