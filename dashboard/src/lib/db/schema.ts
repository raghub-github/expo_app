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
  bigint,
  bigserial,
  serial,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  uuid,
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
  "aadhaar_front",
  "aadhaar_back",
  "dl",
  "dl_front",
  "dl_back",
  "rc",
  "pan",
  "selfie",
  "rental_proof",
  "ev_proof",
  "insurance",
  "bank_proof",
  "upi_qr_proof",
  "profile_photo",
  "vehicle_image",
  "ev_ownership_proof",
  "other",
]);

export const documentVerificationStatusEnum = pgEnum("document_verification_status", [
  "pending",
  "approved",
  "rejected",
]);

export const documentFileSideEnum = pgEnum("document_file_side", [
  "front",
  "back",
  "single",
]);

export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
  "bank",
  "upi",
]);

export const paymentMethodVerificationStatusEnum = pgEnum("payment_method_verification_status", [
  "pending",
  "verified",
  "rejected",
]);

export const verificationProofTypeEnum = pgEnum("verification_proof_type", [
  "passbook",
  "cancelled_cheque",
  "statement",
  "upi_qr_image",
]);

export const riderAddressTypeEnum = pgEnum("rider_address_type", [
  "registered",
  "current",
  "other",
]);

export const verificationMethodEnum = pgEnum("verification_method", [
  "APP_VERIFIED",
  "MANUAL_UPLOAD",
]);

export const dutyStatusEnum = pgEnum("duty_status", [
  "ON",
  "OFF",
  "AUTO_OFF",
]);

export const orderTypeEnum = pgEnum("order_type", [
  "food",
  "parcel",
  "person_ride",
]);

// Service Type Enum (for blacklist and service-specific operations)
export const serviceTypeEnum = pgEnum("service_type", [
  "food",
  "parcel",
  "person_ride",
  "all",
]);

// Penalty Status Enum
export const penaltyStatusEnum = pgEnum("penalty_status", [
  "active",
  "reversed",
  "paid",
]);

// Penalty Type Enum
export const penaltyTypeEnum = pgEnum("penalty_type", [
  "late_delivery",
  "customer_complaint",
  "fraud",
  "cancellation",
  "damage",
  "wrong_delivery",
  "no_show",
  "behavior",
  "other",
]);

// Vehicle Type Enum (aligned with backend and 0085 migration)
export const vehicleTypeEnum = pgEnum("vehicle_type", [
  "bike",
  "ev_bike",
  "cycle",
  "car",
  "auto",
  "cng_auto",
  "ev_auto",
  "taxi",
  "e_rickshaw",
  "ev_car",
  "other",
]);

/** Ownership proof: ownership | rental | authorization_letter */
export const ownershipTypeEnum = pgEnum("ownership_type", [
  "ownership",
  "rental",
  "authorization_letter",
]);

/** Per-service activation: inactive | active | limited | suspended */
export const serviceActivationStatusEnum = pgEnum("service_activation_status", [
  "inactive",
  "active",
  "limited",
  "suspended",
]);

/** Rule scope for onboarding_rule_policies */
export const onboardingRuleScopeEnum = pgEnum("onboarding_rule_scope", [
  "global",
  "city",
  "service",
  "vehicle_type",
]);

// Fuel Type Enum
export const fuelTypeEnum = pgEnum("fuel_type", [
  "EV",
  "Petrol",
  "Diesel",
  "CNG",
]);

// Vehicle Category Enum
export const vehicleCategoryEnum = pgEnum("vehicle_category", [
  "Auto",
  "Bike",
  "Cab",
  "Taxi",
  "Bicycle",
  "Scooter",
]);

// AC Type Enum (for person_ride service)
export const acTypeEnum = pgEnum("ac_type", [
  "AC",
  "Non-AC",
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

// DB enum name order_status_type (used by orders_core); includes all timeline stages + legacy
export const orderStatusTypeEnum = pgEnum("order_status_type", [
  "assigned",
  "accepted",
  "reached_store",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
  "failed",
  "rejected",
  "created",
  "bill_ready",
  "payment_initiated_at",
  "payment_done",
  "pymt_assign_rx",
  "dispatch_ready",
  "dispatched",
  "rto_initiated",
  "rto_in_transit",
  "rto_delivered",
  "rto_lost",
]);

export const orderActionEnum = pgEnum("order_action", [
  "accept",
  "reject",
  "auto_reject",
  "timeout",
]);

// Order source (internal, swiggy, zomato, etc.) - for hybrid orders_core
export const orderSourceTypeEnum = pgEnum("order_source_type", [
  "internal",
  "swiggy",
  "zomato",
  "rapido",
  "ondc",
  "shiprocket",
  "other",
]);

// Payment status/mode for orders_core (extended)
export const paymentStatusTypeEnum = pgEnum("payment_status_type", [
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded",
  "partially_refunded",
  "cancelled",
]);
export const paymentModeTypeEnum = pgEnum("payment_mode_type", [
  "cash",
  "online",
  "wallet",
  "upi",
  "card",
  "netbanking",
  "cod",
  "other",
]);
export const vegNonVegTypeEnum = pgEnum("veg_non_veg_type", [
  "veg",
  "non_veg",
  "mixed",
  "na",
]);
export const orderOtpTypeEnum = pgEnum("order_otp_type", [
  "pickup",
  "delivery",
  "rto",
]);

export const walletEntryTypeEnum = pgEnum("wallet_entry_type", [
  "earning",
  "penalty",
  "onboarding_fee",
  "adjustment",
  "refund",
  "bonus",
  "referral_bonus",
  "withdrawal",
  "subscription_fee",
  "purchase",
  "cod_order",
  "other",
  "incentive",
  "surge",
  "failed_withdrawal_revert",
  "penalty_reversal",
  "cancellation_payout",
  "manual_add",
  "manual_deduct",
]);

export const withdrawalStatusEnum = pgEnum("withdrawal_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "aborted",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "completed",
  "failed",
  "refunded",
]);

// Customer Domain Enums
export const customerGenderEnum = pgEnum("customer_gender", [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
]);

export const customerStatusEnum = pgEnum("customer_status", [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "BLOCKED",
  "DELETED",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", [
  "CREDIT",
  "DEBIT",
  "REFUND",
  "BONUS",
  "CASHBACK",
  "REVERSAL",
]);

export const ticketStatusCustomerEnum = pgEnum("ticket_status_customer", [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "ESCALATED",
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

export const referralOfferTypeEnum = pgEnum("referral_offer_type", [
  "fixed_per_referral",
  "per_order_bonus",
  "tiered",
  "custom",
]);

export const referralFulfillmentStatusEnum = pgEnum("referral_fulfillment_status", [
  "pending",
  "fulfilled",
  "credited",
  "expired",
  "cancelled",
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

export const vehicleFuelTypeEnum = pgEnum("vehicle_fuel_type", [
  "EV",
  "Petrol",
  "Diesel",
  "CNG",
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

export const userLiveStatusEnum = pgEnum("user_live_status", [
  "online",
  "offline",
  "break",
  "emergency",
]);

export const areaManagerTypeEnum = pgEnum("area_manager_type", [
  "MERCHANT",
  "RIDER",
]);

export const areaManagerStatusEnum = pgEnum("area_manager_status", [
  "ACTIVE",
  "INACTIVE",
]);

export const storeStatusEnum = pgEnum("store_status", [
  "VERIFIED",
  "PENDING",
  "REJECTED",
]);

export const riderAvailabilityStatusEnum = pgEnum("rider_availability_status", [
  "ONLINE",
  "BUSY",
  "OFFLINE",
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
    suspensionExpiresAt: timestamp("suspension_expires_at", { withTimezone: true }),
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
    canTogglePortal: boolean("can_toggle_portal").notNull().default(false),
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
 * User sessions - Login/logout and live status per session (dashboard agents)
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => systemUsers.id, { onDelete: "cascade" }),
    loginTime: timestamp("login_time", { withTimezone: true }).notNull(),
    logoutTime: timestamp("logout_time", { withTimezone: true }),
    offlineAt: timestamp("offline_at", { withTimezone: true }),
    currentStatus: userLiveStatusEnum("current_status").notNull().default("online"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    workSeconds: integer("work_seconds").notNull().default(0),
    breakSeconds: integer("break_seconds").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("user_sessions_user_id_idx").on(table.userId),
    loginTimeIdx: index("user_sessions_login_time_idx").on(table.loginTime),
  })
);

/**
 * Area Managers - Links system users to area/locality and manager type (Merchant vs Rider)
 */
export const areaManagers = pgTable(
  "area_managers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => systemUsers.id, { onDelete: "cascade" }),
    managerType: areaManagerTypeEnum("manager_type").notNull(),
    areaCode: text("area_code"),
    localityCode: text("locality_code"),
    city: text("city"),
    status: areaManagerStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("area_managers_user_id_idx").on(table.userId),
    managerTypeIdx: index("area_managers_manager_type_idx").on(table.managerType),
    areaCodeIdx: index("area_managers_area_code_idx").on(table.areaCode),
    localityCodeIdx: index("area_managers_locality_code_idx").on(table.localityCode),
    cityIdx: index("area_managers_city_idx").on(table.city),
    statusIdx: index("area_managers_status_idx").on(table.status),
  })
);

/**
 * Stores - Merchant stores onboarded by Area Managers (Option A: standalone table)
 */
export const stores = pgTable(
  "stores",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    storeId: text("store_id").notNull().unique(),
    name: text("name").notNull(),
    ownerPhone: text("owner_phone").notNull(),
    areaManagerId: integer("area_manager_id")
      .notNull()
      .references(() => areaManagers.id, { onDelete: "restrict" }),
    parentStoreId: integer("parent_store_id").references((): any => stores.id, { onDelete: "set null" }),
    status: storeStatusEnum("status").notNull().default("PENDING"),
    localityCode: text("locality_code"),
    areaCode: text("area_code"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: integer("deleted_by"),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    areaManagerIdIdx: index("stores_area_manager_id_idx").on(table.areaManagerId),
    parentStoreIdIdx: index("stores_parent_store_id_idx").on(table.parentStoreId),
    statusIdx: index("stores_status_idx").on(table.status),
    storeIdIdx: index("stores_store_id_idx").on(table.storeId),
    nameIdx: index("stores_name_idx").on(table.name),
    ownerPhoneIdx: index("stores_owner_phone_idx").on(table.ownerPhone),
    deletedAtIdx: index("stores_deleted_at_idx").on(table.deletedAt),
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
    orderType: text("order_type"), // NULL = access to all order types, specific value = access to that type only
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
    orderType: text("order_type"), // NULL = access to all order types, specific value = access to that type only
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
    orderType: text("order_type"), // Order type for order-related actions
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

/**
 * Activity logs - Who onboarded/verified/rejected; area manager actions (dedicated table per spec)
 */
export const activityLogs = pgTable(
  "activity_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: integer("actor_id").references((): any => systemUsers.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: bigint("entity_id", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    actorIdIdx: index("activity_logs_actor_id_idx").on(table.actorId),
    entityTypeIdx: index("activity_logs_entity_type_idx").on(table.entityType),
    entityIdIdx: index("activity_logs_entity_id_idx").on(table.entityId),
    createdAtIdx: index("activity_logs_created_at_idx").on(table.createdAt),
  })
);

// ============================================================================
// TYPE EXPORTS FOR DASHBOARD ACCESS
// ============================================================================

export type DashboardType =
  | "RIDER"
  | "MERCHANT"
  | "CUSTOMER" // Customer dashboard (all customers with granular access control)
  | "ORDER_FOOD"
  | "ORDER_PERSON_RIDE"
  | "ORDER_PARCEL"
  | "TICKET" // Ticket dashboard (all tickets with granular access control)
  | "TICKET_FOOD"
  | "TICKET_PARCEL"
  | "TICKET_PERSON_RIDE"
  | "TICKET_GENERAL"
  | "TICKET_CUSTOMER_FOOD"
  | "TICKET_CUSTOMER_PARCEL"
  | "TICKET_CUSTOMER_PERSON_RIDE"
  | "TICKET_CUSTOMER_GENERAL"
  | "OFFER"
  | "AREA_MANAGER"
  | "PAYMENT"
  | "SYSTEM"
  | "ANALYTICS";

export type AccessLevel = "VIEW_ONLY" | "FULL_ACCESS" | "RESTRICTED";

export type AccessPointGroup =
  | "RIDER_VIEW"
  | "RIDER_ACTIONS_FOOD"
  | "RIDER_ACTIONS_PARCEL"
  | "RIDER_ACTIONS_PERSON_RIDE"
  | "RIDER_WALLET_CREDITS"
  | "MERCHANT_VIEW"
  | "MERCHANT_ONBOARDING"
  | "MERCHANT_OPERATIONS"
  | "MERCHANT_STORE_MANAGEMENT"
  | "MERCHANT_WALLET"
  | "MERCHANT_WALLET_REQUESTS"
  | "MERCHANT_MENU_MANAGEMENT"
  | "MERCHANT_OFFER_MANAGEMENT"
  | "MERCHANT_BANK_MANAGEMENT"
  | "MERCHANT_TIMING_MANAGEMENT"
  | "MERCHANT_STATUS_MANAGEMENT"
  | "MERCHANT_ITEM_APPROVAL"
  | "CUSTOMER_VIEW"
  | "CUSTOMER_ACTIONS_FOOD"
  | "CUSTOMER_ACTIONS_PARCEL"
  | "CUSTOMER_ACTIONS_PERSON_RIDE"
  | "ORDER_VIEW"
  | "ORDER_ASSIGN"
  | "ORDER_CANCEL"
  | "ORDER_REFUND"
  | "TICKET_VIEW_FOOD"
  | "TICKET_VIEW_PARCEL"
  | "TICKET_VIEW_PERSON_RIDE"
  | "TICKET_ACTIONS_FOOD"
  | "TICKET_ACTIONS_PARCEL"
  | "TICKET_ACTIONS_PERSON_RIDE"
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
  | "RIDER_DOCUMENT_APPROVED"
  | "RIDER_DOCUMENT_REJECTED"
  | "RIDER_DOCUMENT_UPDATED"
  | "RIDER_DOCUMENT_NUMBER_UPDATED"
  | "RIDER_DOCUMENT_IMAGE_UPDATED"
  | "RIDER_STATUS_UPDATED"
  | "RIDER_ONBOARDING_STAGE_UPDATED"
  | "RIDER_KYC_STATUS_UPDATED"
  | "RIDER_WALLET_ADJUSTED"
  | "RIDER_WALLET_ADD_BALANCE"
  | "RIDER_PENALTY_ADDED"
  | "RIDER_PENALTY_REVERTED"
  | "RIDER_BLACKLISTED"
  | "RIDER_WHITELISTED"
  | "RIDER_RIDE_CANCELLED"
  | "REQUEST_CREATE"
  | "REQUEST_APPROVE"
  | "REQUEST_REJECT"
  | "MERCHANT_STORE_STATUS_UPDATED"
  | "MERCHANT_PARENT_STATUS_UPDATED"
  | "MERCHANT_WALLET_CREDIT_REQUESTED"
  | "MERCHANT_WALLET_CREDIT_APPROVED"
  | "MERCHANT_WALLET_CREDIT_REJECTED"
  | "MERCHANT_STORE_VERIFIED"
  | "MERCHANT_STORE_REJECTED"
  | "MERCHANT_MENU_UPDATED"
  | "MERCHANT_OFFER_CREATED"
  | "MERCHANT_OFFER_UPDATED"
  | "MERCHANT_OFFER_DELETED"
  | "MERCHANT_BANK_ACCOUNT_ADDED"
  | "MERCHANT_BANK_ACCOUNT_UPDATED"
  | "MERCHANT_TIMING_UPDATED"
  | "MERCHANT_ITEM_APPROVED"
  | "EXPORT"
  | "IMPORT";

export type ActionStatus = "SUCCESS" | "FAILED" | "PENDING";

// ============================================================================
// REFERENCE: CITIES, SERVICE TYPES, VEHICLE-SERVICE RULES (backend source of truth)
// ============================================================================

export const cities = pgTable(
  "cities",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    state: text("state").notNull(),
    countryCode: text("country_code").notNull().default("IN"),
    timezone: text("timezone"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameStateIdx: index("cities_name_state_idx").on(table.name, table.state),
    isActiveIdx: index("cities_is_active_idx").on(table.isActive),
  })
);

export const serviceTypes = pgTable(
  "service_types",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeIdx: uniqueIndex("service_types_code_idx").on(table.code),
    isActiveIdx: index("service_types_is_active_idx").on(table.isActive),
  })
);

export const vehicleServiceMapping = pgTable(
  "vehicle_service_mapping",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    vehicleType: text("vehicle_type").notNull(),
    serviceTypeId: integer("service_type_id")
      .notNull()
      .references((): any => serviceTypes.id, { onDelete: "cascade" }),
    allowed: boolean("allowed").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vehicleServiceIdx: index("vehicle_service_mapping_vehicle_service_idx").on(
      table.vehicleType,
      table.serviceTypeId
    ),
  })
);

export const cityVehicleRules = pgTable(
  "city_vehicle_rules",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cityId: integer("city_id")
      .notNull()
      .references((): any => cities.id, { onDelete: "cascade" }),
    serviceTypeId: integer("service_type_id")
      .notNull()
      .references((): any => serviceTypes.id, { onDelete: "cascade" }),
    ruleType: text("rule_type").notNull(),
    ruleConfig: jsonb("rule_config").default({}),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cityServiceIdx: index("city_vehicle_rules_city_service_idx").on(
      table.cityId,
      table.serviceTypeId
    ),
    isActiveIdx: index("city_vehicle_rules_is_active_idx").on(table.isActive),
  })
);

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
    // Vehicle choice during onboarding (temporary, will be moved to rider_vehicles)
    vehicleChoice: text("vehicle_choice"), // 'EV' or 'Petrol'
    // Preferred service types (array stored as JSONB)
    preferredServiceTypes: jsonb("preferred_service_types").default([]), // ['food', 'parcel', 'person_ride']
    areaManagerId: integer("area_manager_id").references((): any => areaManagers.id, { onDelete: "set null" }),
    localityCode: text("locality_code"),
    availabilityStatus: riderAvailabilityStatusEnum("availability_status").notNull().default("OFFLINE"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: integer("deleted_by"),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    mobileIdx: uniqueIndex("riders_mobile_idx").on(table.mobile),
    deletedAtIdx: index("riders_deleted_at_idx").on(table.deletedAt),
    referralCodeIdx: uniqueIndex("riders_referral_code_idx").on(
      table.referralCode
    ),
    statusIdx: index("riders_status_idx").on(table.status),
    cityIdx: index("riders_city_idx").on(table.city),
    kycStatusIdx: index("riders_kyc_status_idx").on(table.kycStatus),
    areaManagerIdIdx: index("riders_area_manager_id_idx").on(table.areaManagerId),
    localityCodeIdx: index("riders_locality_code_idx").on(table.localityCode),
    availabilityStatusIdx: index("riders_availability_status_idx").on(table.availabilityStatus),
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
    fileUrl: text("file_url").notNull(), // For APP_VERIFIED, use placeholder URL (e.g., empty string or special URL)
    r2Key: text("r2_key"), // R2 storage key - allows URL regeneration if signed URL expires. NULL for APP_VERIFIED documents
    docNumber: text("doc_number"), // Document identification number (DL number, RC number, etc.) - REQUIRED for RC and DL
    verificationMethod: verificationMethodEnum("verification_method").notNull().default("MANUAL_UPLOAD"), // APP_VERIFIED or MANUAL_UPLOAD
    extractedName: text("extracted_name"),
    extractedDob: date("extracted_dob"),
    verified: boolean("verified").notNull().default(false),
    verificationStatus: documentVerificationStatusEnum("verification_status").default("pending"),
    expiryDate: date("expiry_date"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: integer("verified_by").references((): any => systemUsers.id, { onDelete: "set null" }),
    verifierUserId: integer("verifier_user_id"),
    rejectedReason: text("rejected_reason"),
    vehicleId: integer("vehicle_id"), // Link RC document to vehicle (optional, for future use)
    fraudFlags: jsonb("fraud_flags").default({}),
    duplicateDocumentId: bigint("duplicate_document_id", { mode: "number" }).references((): any => riderDocuments.id, { onDelete: "set null" }),
    requiresManualReview: boolean("requires_manual_review").notNull().default(false),
    metadata: jsonb("metadata").default({}),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_documents_rider_id_idx").on(table.riderId),
    docTypeIdx: index("rider_documents_doc_type_idx").on(table.docType),
    verifiedIdx: index("rider_documents_verified_idx").on(table.verified),
    verificationStatusIdx: index("rider_documents_verification_status_idx").on(table.verificationStatus),
    docNumberIdx: index("rider_documents_doc_number_idx").on(table.docNumber),
    verificationMethodIdx: index("rider_documents_verification_method_idx").on(table.verificationMethod),
    vehicleIdIdx: index("rider_documents_vehicle_id_idx").on(table.vehicleId),
  })
);

/**
 * Rider document files - multiple images per document (e.g. Aadhaar front + back)
 */
export const riderDocumentFiles = pgTable(
  "rider_document_files",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => riderDocuments.id, { onDelete: "cascade" }),
    fileUrl: text("file_url").notNull(),
    r2Key: text("r2_key"),
    side: documentFileSideEnum("side").notNull().default("single"),
    mimeType: text("mime_type"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentIdIdx: index("rider_document_files_document_id_idx").on(table.documentId),
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
 * Enhanced with service-specific blacklist support
 */
export const blacklistHistory = pgTable(
  "blacklist_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    serviceType: serviceTypeEnum("service_type").notNull().default("all"), // 'food', 'parcel', 'person_ride', 'all'
    reason: text("reason").notNull(),
    banned: boolean("banned").notNull().default(true),
    isPermanent: boolean("is_permanent").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // For temporary blacklists
    adminUserId: integer("admin_user_id"),
    /** Email of agent who performed the action (when source=agent); stored at insert for reliable display. */
    actorEmail: text("actor_email"),
    source: text("source").notNull().default("agent"), // 'agent' | 'system' | 'automated'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("blacklist_history_rider_id_idx").on(table.riderId),
    bannedIdx: index("blacklist_history_banned_idx").on(table.banned),
    serviceTypeIdx: index("blacklist_history_service_type_idx").on(table.serviceType),
    riderServiceIdx: index("blacklist_history_rider_service_idx").on(
      table.riderId,
      table.serviceType
    ),
    sourceIdx: index("blacklist_history_source_idx").on(table.source),
  })
);

// ============================================================================
// PENALTIES
// ============================================================================

/**
 * Rider penalties - tracks penalties per service type
 */
export const riderPenalties = pgTable(
  "rider_penalties",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    serviceType: orderTypeEnum("service_type"), // 'food', 'parcel', 'person_ride'; null = unspecified
    penaltyType: text("penalty_type").notNull(), // 'late_delivery', 'customer_complaint', 'fraud', 'cancellation', etc.
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("active"), // 'active', 'reversed', 'paid'
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    imposedBy: integer("imposed_by").references(() => systemUsers.id, { onDelete: "set null" }),
    source: text("source").default("agent"), // 'agent' = manual/dashboard, 'system' = automatic
    imposedAt: timestamp("imposed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNotes: text("resolution_notes"),
    reversedBy: integer("reversed_by").references(() => systemUsers.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").default({}),
  },
  (table) => ({
    riderIdIdx: index("rider_penalties_rider_id_idx").on(table.riderId),
    serviceTypeIdx: index("rider_penalties_service_type_idx").on(table.serviceType),
    statusIdx: index("rider_penalties_status_idx").on(table.status),
    orderIdIdx: index("rider_penalties_order_id_idx").on(table.orderId),
    imposedAtIdx: index("rider_penalties_imposed_at_idx").on(table.imposedAt),
    riderServiceIdx: index("rider_penalties_rider_service_idx").on(
      table.riderId,
      table.serviceType
    ),
  })
);

// ============================================================================
// VEHICLES
// ============================================================================

/**
 * Rider vehicles - stores vehicle information for each rider
 * Enhanced with fuel type, category, AC type, and service types
 */
export const riderVehicles = pgTable(
  "rider_vehicles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(), // bike, ev_bike, cycle, car, auto, taxi, e_rickshaw, ev_car, etc.
    registrationNumber: text("registration_number").notNull(), // Official RC number - use consistently, NOT "bike_number" or "vehicle_number"
    registrationState: text("registration_state"),
    make: text("make"), // e.g., 'Honda', 'Hero'
    model: text("model"), // e.g., 'Activa', 'Splendor'
    year: integer("year"),
    color: text("color"),
    fuelType: fuelTypeEnum("fuel_type"), // 'EV', 'Petrol', 'Diesel', 'CNG'
    vehicleCategory: vehicleCategoryEnum("vehicle_category"), // 'Auto', 'Bike', 'Cab', 'Taxi', 'Bicycle', 'Scooter'
    acType: acTypeEnum("ac_type"), // 'AC', 'Non-AC' (for person_ride)
    serviceTypes: jsonb("service_types").default([]), // Array: ['food', 'parcel', 'person_ride']
    ownershipType: text("ownership_type"), // ownership | rental | authorization_letter
    limitationFlags: jsonb("limitation_flags").default({}),
    isCommercial: boolean("is_commercial").default(false),
    permitExpiry: date("permit_expiry"),
    insuranceExpiry: date("insurance_expiry"),
    vehicleActiveStatus: text("vehicle_active_status").default("active"),
    seatingCapacity: integer("seating_capacity"),
    rcDocumentUrl: text("rc_document_url"),
    insuranceDocumentUrl: text("insurance_document_url"),
    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: integer("verified_by"), // Admin user ID
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_vehicles_rider_id_idx").on(table.riderId),
    vehicleTypeIdx: index("rider_vehicles_vehicle_type_idx").on(table.vehicleType),
    registrationNumberIdx: index("rider_vehicles_registration_number_idx").on(table.registrationNumber),
    verifiedIdx: index("rider_vehicles_verified_idx").on(table.verified),
    isActiveIdx: index("rider_vehicles_is_active_idx").on(table.isActive),
    fuelTypeIdx: index("rider_vehicles_fuel_type_idx").on(table.fuelType),
    vehicleCategoryIdx: index("rider_vehicles_vehicle_category_idx").on(table.vehicleCategory),
    // Note: Unique constraint for one active vehicle per rider handled at application level
    // or via database trigger (not directly supported in Drizzle uniqueIndex with WHERE)
  })
);

/**
 * Rider addresses - high-precision geo; one rider can have multiple addresses (backend source of truth)
 */
export const riderAddresses = pgTable(
  "rider_addresses",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    addressType: riderAddressTypeEnum("address_type").notNull().default("registered"),
    fullAddress: text("full_address").notNull(),
    cityId: integer("city_id").references((): any => cities.id, { onDelete: "set null" }),
    state: text("state"),
    pincode: text("pincode"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_addresses_rider_id_idx").on(table.riderId),
    cityIdIdx: index("rider_addresses_city_id_idx").on(table.cityId),
    isPrimaryIdx: index("rider_addresses_is_primary_idx").on(table.riderId, table.isPrimary),
  })
);

/**
 * Onboarding rule policies - configurable rule engine (commercial-only cities, EV incentives, etc.)
 */
export const onboardingRulePolicies = pgTable(
  "onboarding_rule_policies",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ruleCode: text("rule_code").notNull().unique(),
    ruleName: text("rule_name").notNull(),
    scope: onboardingRuleScopeEnum("scope").notNull().default("global"),
    scopeRefId: bigint("scope_ref_id", { mode: "number" }),
    ruleType: text("rule_type").notNull(),
    ruleConfig: jsonb("rule_config").notNull().default({}),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ruleCodeIdx: uniqueIndex("onboarding_rule_policies_rule_code_idx").on(table.ruleCode),
    isActiveIdx: index("onboarding_rule_policies_is_active_idx").on(table.isActive),
    scopeIdx: index("onboarding_rule_policies_scope_idx").on(table.scope),
  })
);

/**
 * Rider service activation - per-rider per-service status; driven by Service Activation Engine
 */
export const riderServiceActivation = pgTable(
  "rider_service_activation",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    serviceTypeId: bigint("service_type_id", { mode: "number" })
      .notNull()
      .references((): any => serviceTypes.id, { onDelete: "cascade" }),
    status: serviceActivationStatusEnum("status").notNull().default("inactive"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    vehicleId: bigint("vehicle_id", { mode: "number" }).references((): any => riderVehicles.id, { onDelete: "set null" }),
    limitationFlags: jsonb("limitation_flags").default({}),
    activatedByRuleId: bigint("activated_by_rule_id", { mode: "number" }).references((): any => onboardingRulePolicies.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderServiceUnique: uniqueIndex("rider_service_activation_rider_service_unique").on(table.riderId, table.serviceTypeId),
    riderIdIdx: index("rider_service_activation_rider_id_idx").on(table.riderId),
    serviceTypeIdIdx: index("rider_service_activation_service_type_id_idx").on(table.serviceTypeId),
    statusIdx: index("rider_service_activation_status_idx").on(table.status),
    vehicleIdIdx: index("rider_service_activation_vehicle_id_idx").on(table.vehicleId),
  })
);

/**
 * Onboarding status transitions - state machine audit log for rider onboarding
 */
export const onboardingStatusTransitions = pgTable(
  "onboarding_status_transitions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    fromStage: text("from_stage"),
    toStage: text("to_stage"),
    fromKyc: text("from_kyc"),
    toKyc: text("to_kyc"),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    triggerType: text("trigger_type").notNull(),
    triggerRefId: bigint("trigger_ref_id", { mode: "number" }),
    performedBySystemUserId: bigint("performed_by_system_user_id", { mode: "number" }).references((): any => systemUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("onboarding_status_transitions_rider_id_idx").on(table.riderId),
    createdAtIdx: index("onboarding_status_transitions_created_at_idx").on(table.createdAt),
    riderCreatedIdx: index("onboarding_status_transitions_rider_created_idx").on(table.riderId, table.createdAt),
  })
);

// ============================================================================
// DUTY & LOCATION TRACKING
// ============================================================================

/**
 * Duty logs - tracks rider ON/OFF duty status changes with service-specific tracking
 * When rider goes online, service_types array contains which services they are available for
 * Every ON/OFF transition must create a new entry to enable accurate duty time calculations
 */
export const dutyLogs = pgTable(
  "duty_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    status: dutyStatusEnum("status").notNull(), // 'ON', 'OFF', 'AUTO_OFF'
    serviceTypes: jsonb("service_types").default([]), // Array of services: ['food', 'parcel', 'person_ride'] - which services rider is online for. Empty when offline.
    vehicleId: integer("vehicle_id").references(() => riderVehicles.id, { onDelete: "set null" }), // Which vehicle rider is using
    lat: doublePrecision("lat"), // Latitude when going online/offline
    lon: doublePrecision("lon"), // Longitude when going online/offline
    sessionId: text("session_id"), // Unique session ID to track duty sessions (ON -> OFF cycle)
    deviceId: text("device_id"), // Device ID from which rider went online/offline
    metadata: jsonb("metadata").default({}), // Additional metadata (battery level, network type, app version, etc.)
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
    riderTimestampIdx: index("duty_logs_rider_timestamp_idx").on(
      table.riderId,
      table.timestamp
    ),
    serviceTypesIdx: index("duty_logs_service_types_idx").on(table.serviceTypes),
    vehicleIdIdx: index("duty_logs_vehicle_id_idx").on(table.vehicleId),
    sessionIdIdx: index("duty_logs_session_id_idx").on(table.sessionId),
    riderStatusServiceIdx: index("duty_logs_rider_status_service_idx").on(
      table.riderId,
      table.status,
      table.timestamp
    ),
  })
);

/**
 * Rider activity sessions - one row per login session per service
 * For activity logs: login time per day/week/month, which service rider was on
 */
export const riderActivitySessions = pgTable(
  "rider_activity_sessions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    serviceType: text("service_type").notNull(), // 'food' | 'parcel' | 'person_ride'
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_activity_sessions_rider_id_idx").on(table.riderId),
    startedAtIdx: index("rider_activity_sessions_started_at_idx").on(table.startedAt),
    riderStartedIdx: index("rider_activity_sessions_rider_started_idx").on(
      table.riderId,
      table.startedAt
    ),
    serviceTypeIdx: index("rider_activity_sessions_service_type_idx").on(table.serviceType),
  })
);

/**
 * Rider activity daily - one row per rider per day per service (aggregates)
 * For dashboard: login time, orders completed/cancelled, earnings (orders, offers, incentives)
 */
export const riderActivityDaily = pgTable(
  "rider_activity_daily",
  {
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    activityDate: date("activity_date").notNull(),
    serviceType: text("service_type").notNull(), // 'food' | 'parcel' | 'person_ride'
    totalLoginSeconds: integer("total_login_seconds").notNull().default(0),
    firstLoginAt: timestamp("first_login_at", { withTimezone: true }),
    lastLogoutAt: timestamp("last_logout_at", { withTimezone: true }),
    ordersCompleted: integer("orders_completed").notNull().default(0),
    ordersCancelled: integer("orders_cancelled").notNull().default(0),
    earningsOrders: numeric("earnings_orders", { precision: 12, scale: 2 }).notNull().default("0"),
    earningsOffers: numeric("earnings_offers", { precision: 12, scale: 2 }).notNull().default("0"),
    earningsIncentives: numeric("earnings_incentives", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.riderId, table.activityDate, table.serviceType] }),
    riderIdIdx: index("rider_activity_daily_rider_id_idx").on(table.riderId),
    activityDateIdx: index("rider_activity_daily_activity_date_idx").on(table.activityDate),
    serviceTypeIdx: index("rider_activity_daily_service_type_idx").on(table.serviceType),
    riderDateIdx: index("rider_activity_daily_rider_date_idx").on(
      table.riderId,
      table.activityDate
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
 * Order-level remarks added by agents, CS, or other actors.
 * Stores the latest version of each remark; edit history is in orderRemarkEdits.
 */
export const orderRemarks = pgTable(
  "order_remarks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: bigint("actor_id", { mode: "number" }),
    actorName: text("actor_name"),
    actionTaken: text("action_taken"),
    remark: text("remark").notNull(),
    remarkCategory: text("remark_category"),
    remarkPriority: text("remark_priority").default("normal"),
    visibleTo: text("visible_to").array(),
    isInternal: boolean("is_internal").default(false),
    remarkMetadata: jsonb("remark_metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
    lastEditedByActorType: text("last_edited_by_actor_type"),
    lastEditedByActorId: bigint("last_edited_by_actor_id", { mode: "number" }),
    lastEditedByActorName: text("last_edited_by_actor_name"),
  },
  (table) => ({
    orderIdIdx: index("order_remarks_order_id_idx").on(table.orderId),
    actorTypeIdx: index("order_remarks_actor_type_idx").on(table.actorType),
    actorIdIdx: index("order_remarks_actor_id_idx").on(table.actorId),
    remarkCategoryIdx: index("order_remarks_remark_category_idx").on(table.remarkCategory),
    createdAtIdx: index("order_remarks_created_at_idx").on(table.createdAt),
    orderCreatedIdx: index("order_remarks_order_created_idx").on(
      table.orderId,
      table.createdAt.desc()
    ),
    isInternalIdx: index("order_remarks_is_internal_idx").on(table.isInternal),
  })
);

/**
 * Immutable edit history for order remarks.
 * Each row captures a single edit with before/after values.
 */
export const orderRemarkEdits = pgTable(
  "order_remarks_edits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    remarkId: bigint("remark_id", { mode: "number" })
      .notNull()
      .references(() => orderRemarks.id, { onDelete: "cascade" }),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
    editedByActorType: text("edited_by_actor_type").notNull(),
    editedByActorId: bigint("edited_by_actor_id", { mode: "number" }),
    editedByActorName: text("edited_by_actor_name"),
    oldRemark: text("old_remark").notNull(),
    newRemark: text("new_remark").notNull(),
    oldRemarkCategory: text("old_remark_category"),
    newRemarkCategory: text("new_remark_category"),
    oldRemarkPriority: text("old_remark_priority"),
    newRemarkPriority: text("new_remark_priority"),
    oldIsInternal: boolean("old_is_internal"),
    newIsInternal: boolean("new_is_internal"),
    oldVisibleTo: text("old_visible_to").array(),
    newVisibleTo: text("new_visible_to").array(),
    oldRemarkMetadata: jsonb("old_remark_metadata"),
    newRemarkMetadata: jsonb("new_remark_metadata"),
  },
  (table) => ({
    remarkIdIdx: index("order_remarks_edits_remark_id_idx").on(table.remarkId),
    editedAtIdx: index("order_remarks_edits_edited_at_idx").on(table.editedAt),
  })
);

// ============================================================================
// Order cancellation reasons (orders_core.cancellation_reason_id references this)
export const orderCancellationReasons = pgTable(
  "order_cancellation_reasons",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" }).notNull(),
    cancelledBy: text("cancelled_by").notNull(),
    cancelledById: integer("cancelled_by_id"),
    reasonCode: text("reason_code").notNull(),
    reasonText: text("reason_text"),
    refundStatus: text("refund_status").default("pending"),
    refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }),
    penaltyApplied: boolean("penalty_applied").default(false),
    penaltyAmount: numeric("penalty_amount", { precision: 10, scale: 2 }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("order_cancellation_reasons_order_id_idx").on(table.orderId),
    cancelledByIdx: index("order_cancellation_reasons_cancelled_by_idx").on(table.cancelledBy),
    reasonCodeIdx: index("order_cancellation_reasons_reason_code_idx").on(table.reasonCode),
  })
);

// HYBRID ORDER TABLES (orders_core + service-specific + provider mapping)
// ============================================================================

export const orderProviders = pgTable(
  "order_providers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    codeIdx: index("order_providers_code_idx").on(table.code),
    isActiveIdx: index("order_providers_is_active_idx").on(table.isActive),
  })
);

export const ordersCore = pgTable(
  "orders_core",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderUuid: uuid("order_uuid").notNull().unique().defaultRandom(),
    orderType: orderTypeEnum("order_type").notNull(),
    orderSource: orderSourceTypeEnum("order_source").notNull().default("internal"),
    externalRef: text("external_ref"),
    riderId: integer("rider_id").references(() => riders.id, { onDelete: "set null" }),
    customerId: bigint("customer_id", { mode: "number" }),
    merchantStoreId: bigint("merchant_store_id", { mode: "number" }),
    merchantParentId: bigint("merchant_parent_id", { mode: "number" }),
    pickupAddressRaw: text("pickup_address_raw").notNull(),
    pickupAddressNormalized: text("pickup_address_normalized"),
    pickupAddressGeocoded: text("pickup_address_geocoded"),
    pickupLat: numeric("pickup_lat", { precision: 9, scale: 6 }).notNull(),
    pickupLon: numeric("pickup_lon", { precision: 9, scale: 6 }).notNull(),
    dropAddressRaw: text("drop_address_raw").notNull(),
    dropAddressNormalized: text("drop_address_normalized"),
    dropAddressGeocoded: text("drop_address_geocoded"),
    dropLat: numeric("drop_lat", { precision: 9, scale: 6 }).notNull(),
    dropLon: numeric("drop_lon", { precision: 9, scale: 6 }).notNull(),
    distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
    etaSeconds: integer("eta_seconds"),
    pickupAddressDeviationMeters: numeric("pickup_address_deviation_meters", {
      precision: 8,
      scale: 2,
    }),
    dropAddressDeviationMeters: numeric("drop_address_deviation_meters", {
      precision: 8,
      scale: 2,
    }),
    distanceMismatchFlagged: boolean("distance_mismatch_flagged").notNull().default(false),
    fareAmount: numeric("fare_amount", { precision: 10, scale: 2 }),
    commissionAmount: numeric("commission_amount", { precision: 10, scale: 2 }),
    riderEarning: numeric("rider_earning", { precision: 10, scale: 2 }),
    itemTotal: numeric("item_total", { precision: 12, scale: 2 }),
    addonTotal: numeric("addon_total", { precision: 12, scale: 2 }),
    grandTotal: numeric("grand_total", { precision: 12, scale: 2 }),
    tipAmount: numeric("tip_amount", { precision: 12, scale: 2 }),
    status: orderStatusTypeEnum("status").notNull().default("assigned"),
    currentStatus: text("current_status"),
    paymentStatus: paymentStatusTypeEnum("payment_status"),
    paymentMethod: paymentModeTypeEnum("payment_method"),
    riskFlagged: boolean("risk_flagged").notNull().default(false),
    riskReason: text("risk_reason"),
    isBulkOrder: boolean("is_bulk_order").notNull().default(false),
    bulkOrderGroupId: text("bulk_order_group_id"),
    cancellationReasonId: bigint("cancellation_reason_id", { mode: "number" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelledById: bigint("cancelled_by_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    estimatedPickupTime: timestamp("estimated_pickup_time", { withTimezone: true }),
    estimatedDeliveryTime: timestamp("estimated_delivery_time", { withTimezone: true }),
    /** First ETA (expected delivery) set when order accepted / first estimated; for sidebar "First ETA". */
    firstEtaAt: timestamp("first_eta_at", { withTimezone: true }),
    /** When ETA was first breached (now > expected delivery); used for ETA breached tag. */
    etaBreachedAt: timestamp("eta_breached_at", { withTimezone: true }),
    /** order_timelines.id of the stage current when ETA was first breached (red dot on timeline). */
    etaBreachedTimelineId: bigint("eta_breached_timeline_id", { mode: "number" }),
    actualPickupTime: timestamp("actual_pickup_time", { withTimezone: true }),
    actualDeliveryTime: timestamp("actual_delivery_time", { withTimezone: true }),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    formattedOrderId: text("formatted_order_id"),
    orderId: text("order_id"),
    /** Email of the last dashboard user who manually updated order status (Dispatch Ready / Dispatched / Delivered). */
    manualStatusUpdatedByEmail: text("manual_status_updated_by_email"),
  },
  (table) => ({
    riderIdIdx: index("orders_core_rider_id_idx").on(table.riderId),
    statusIdx: index("orders_core_status_idx").on(table.status),
    orderTypeIdx: index("orders_core_order_type_idx").on(table.orderType),
    createdAtIdx: index("orders_core_created_at_idx").on(table.createdAt),
    customerIdIdx: index("orders_core_customer_id_idx").on(table.customerId),
    orderSourceIdx: index("orders_core_order_source_idx").on(table.orderSource),
    orderUuidIdx: index("orders_core_order_uuid_idx").on(table.orderUuid),
    riderStatusIdx: index("orders_core_rider_status_idx").on(
      table.riderId,
      table.status
    ),
    typeStatusCreatedIdx: index("orders_core_type_status_created_idx").on(
      table.orderType,
      table.status,
      table.createdAt
    ),
    activeRiderIdx: index("orders_core_active_rider_idx").on(
      table.riderId,
      table.orderType,
      table.createdAt
    ),
    riskFlaggedIdx: index("orders_core_risk_flagged_idx").on(table.riskFlagged),
    distanceMismatchIdx: index("orders_core_distance_mismatch_idx").on(
      table.distanceMismatchFlagged
    ),
  })
);

/** Manual status updates from dashboard (Dispatch Ready / Dispatched / Delivered) with actor email. */
export const orderManualStatusHistory = pgTable(
  "order_manual_status_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    toStatus: text("to_status").notNull(),
    updatedByEmail: text("updated_by_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("order_manual_status_history_order_id_idx").on(table.orderId),
    createdAtIdx: index("order_manual_status_history_created_at_idx").on(table.createdAt),
  })
);

/** Immutable order timeline: one row per status change. Never update or delete. */
export const orderTimelines = pgTable(
  "order_timelines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    previousStatus: text("previous_status"),
    actorType: text("actor_type").notNull(),
    actorId: bigint("actor_id", { mode: "number" }),
    actorName: text("actor_name"),
    statusMessage: text("status_message"),
    metadata: jsonb("metadata").default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expectedByAt: timestamp("expected_by_at", { withTimezone: true }),
  },
  (table) => ({
    orderIdIdx: index("order_timelines_order_id_idx").on(table.orderId),
    occurredAtIdx: index("order_timelines_occurred_at_idx").on(table.occurredAt),
    orderOccurredIdx: index("order_timelines_order_occurred_idx").on(
      table.orderId,
      table.occurredAt
    ),
  })
);

export const ordersFood = pgTable(
  "orders_food",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .unique()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    merchantStoreId: bigint("merchant_store_id", { mode: "number" }),
    merchantParentId: bigint("merchant_parent_id", { mode: "number" }),
    restaurantName: text("restaurant_name"),
    restaurantPhone: text("restaurant_phone"),
    preparationTimeMinutes: integer("preparation_time_minutes"),
    foodItemsCount: integer("food_items_count"),
    foodItemsTotalValue: numeric("food_items_total_value", {
      precision: 12,
      scale: 2,
    }),
    requiresUtensils: boolean("requires_utensils").default(false),
    isFragile: boolean("is_fragile").notNull().default(false),
    isHighValue: boolean("is_high_value").notNull().default(false),
    vegNonVeg: vegNonVegTypeEnum("veg_non_veg"),
    deliveryInstructions: text("delivery_instructions"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("orders_food_order_id_idx").on(table.orderId),
    merchantStoreIdIdx: index("orders_food_merchant_store_id_idx").on(
      table.merchantStoreId
    ),
  })
);

export const ordersParcel = pgTable(
  "orders_parcel",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .unique()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    weightKg: numeric("weight_kg", { precision: 10, scale: 2 }),
    lengthCm: numeric("length_cm", { precision: 5, scale: 2 }),
    widthCm: numeric("width_cm", { precision: 5, scale: 2 }),
    heightCm: numeric("height_cm", { precision: 5, scale: 2 }),
    parcelType: text("parcel_type"),
    declaredValue: numeric("declared_value", { precision: 12, scale: 2 }),
    insuranceRequired: boolean("insurance_required").notNull().default(false),
    insuranceAmount: numeric("insurance_amount", { precision: 10, scale: 2 }),
    isCod: boolean("is_cod").default(false),
    codAmount: numeric("cod_amount", { precision: 10, scale: 2 }),
    requiresSignature: boolean("requires_signature").default(false),
    requiresOtpVerification: boolean("requires_otp_verification").default(false),
    instructions: text("instructions"),
    scheduledPickupTime: timestamp("scheduled_pickup_time", { withTimezone: true }),
    scheduledDeliveryTime: timestamp("scheduled_delivery_time", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("orders_parcel_order_id_idx").on(table.orderId),
  })
);

export const ordersRide = pgTable(
  "orders_ride",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigserial("order_id", { mode: "number" })
      .notNull()
      .unique()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    passengerName: text("passenger_name"),
    passengerPhone: text("passenger_phone"),
    passengerCount: integer("passenger_count").default(1),
    rideType: text("ride_type"),
    vehicleTypeRequired: text("vehicle_type_required"),
    waitingCharges: numeric("waiting_charges", { precision: 10, scale: 2 }).default("0"),
    tollCharges: numeric("toll_charges", { precision: 10, scale: 2 }).default("0"),
    parkingCharges: numeric("parking_charges", { precision: 10, scale: 2 }).default("0"),
    scheduledRide: boolean("scheduled_ride").default(false),
    scheduledPickupTime: timestamp("scheduled_pickup_time", { withTimezone: true }),
    returnTrip: boolean("return_trip").default(false),
    returnPickupAddress: text("return_pickup_address"),
    returnPickupLat: numeric("return_pickup_lat", { precision: 9, scale: 6 }),
    returnPickupLon: numeric("return_pickup_lon", { precision: 9, scale: 6 }),
    returnPickupTime: timestamp("return_pickup_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("orders_ride_order_id_idx").on(table.orderId),
    scheduledIdx: index("orders_ride_scheduled_idx").on(
      table.scheduledRide,
      table.scheduledPickupTime
    ),
  })
);

export const orderProviderMapping = pgTable(
  "order_provider_mapping",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    providerId: bigint("provider_id", { mode: "number" })
      .notNull()
      .references(() => orderProviders.id, { onDelete: "restrict" }),
    providerOrderId: text("provider_order_id").notNull(),
    providerReference: text("provider_reference"),
    providerStatus: text("provider_status"),
    providerStatusUpdatedAt: timestamp("provider_status_updated_at", {
      withTimezone: true,
    }),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    syncStatus: text("sync_status"),
    syncError: text("sync_error"),
    providerMetadata: jsonb("provider_metadata").default({}),
    providerFare: numeric("provider_fare", { precision: 12, scale: 2 }),
    providerCommission: numeric("provider_commission", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("order_provider_mapping_order_id_idx").on(table.orderId),
    providerOrderIdx: uniqueIndex("order_provider_mapping_provider_order_idx").on(
      table.providerId,
      table.providerOrderId
    ),
  })
);

export const orderOtps = pgTable(
  "order_otps",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    otpType: orderOtpTypeEnum("otp_type").notNull(),
    code: text("code").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    bypassReason: text("bypass_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("order_otps_order_id_idx").on(table.orderId),
    otpTypeIdx: index("order_otps_otp_type_idx").on(table.otpType),
    uniqueOrderOtp: uniqueIndex("order_otps_order_id_otp_type_unique").on(
      table.orderId,
      table.otpType
    ),
  })
);

export const orderDeliveryImages = pgTable(
  "order_delivery_images",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigserial("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    riderAssignmentId: bigserial("rider_assignment_id", { mode: "number" }),
    imageType: text("image_type").notNull(),
    url: text("url").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("order_delivery_images_order_id_idx").on(table.orderId),
    imageTypeIdx: index("order_delivery_images_image_type_idx").on(table.imageType),
    takenAtIdx: index("order_delivery_images_taken_at_idx").on(table.takenAt),
  })
);

export const orderRouteSnapshots = pgTable(
  "order_route_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    snapshotType: text("snapshot_type").notNull(),
    distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
    durationSeconds: integer("duration_seconds"),
    polyline: text("polyline"),
    mapboxResponse: jsonb("mapbox_response"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("order_route_snapshots_order_id_idx").on(table.orderId),
    recordedAtIdx: index("order_route_snapshots_recorded_at_idx").on(
      table.recordedAt
    ),
  })
);

// ============================================================================
// CUSTOMER DOMAIN TABLES
// ============================================================================

/**
 * Customers - Core customer profile table
 */
export const customers = pgTable(
  "customers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: text("customer_id").notNull().unique(),
    fullName: text("full_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email").unique(),
    emailVerified: boolean("email_verified").default(false),
    primaryMobile: text("primary_mobile").notNull().unique(),
    primaryMobileNormalized: text("primary_mobile_normalized"),
    primaryMobileCountryCode: text("primary_mobile_country_code").default("+91"),
    mobileVerified: boolean("mobile_verified").default(true),
    alternateMobile: text("alternate_mobile"),
    whatsappNumber: text("whatsapp_number"),
    gender: customerGenderEnum("gender"),
    dateOfBirth: date("date_of_birth"),
    profileImageUrl: text("profile_image_url"),
    bio: text("bio"),
    preferredLanguage: text("preferred_language").default("en"),
    referralCode: text("referral_code").unique(),
    referredBy: text("referred_by"),
    referrerCustomerId: bigint("referrer_customer_id", { mode: "number" }),
    accountStatus: customerStatusEnum("account_status").notNull().default("ACTIVE"),
    statusReason: text("status_reason"),
    riskFlag: riskLevelEnum("risk_flag").default("LOW"),
    trustScore: numeric("trust_score", { precision: 5, scale: 2 }).default("100.0"),
    fraudScore: numeric("fraud_score", { precision: 5, scale: 2 }).default("0.0"),
    walletBalance: numeric("wallet_balance", { precision: 12, scale: 2 }).default("0.0"),
    walletLockedAmount: numeric("wallet_locked_amount", { precision: 12, scale: 2 }).default("0.0"),
    isIdentityVerified: boolean("is_identity_verified").default(false),
    isEmailVerified: boolean("is_email_verified").default(false),
    isMobileVerified: boolean("is_mobile_verified").default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: integer("deleted_by"),
    deletionReason: text("deletion_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdVia: text("created_via").default("app"),
    updatedBy: text("updated_by"),
  },
  (table) => ({
    customerIdIdx: index("customers_customer_id_idx").on(table.customerId),
    primaryMobileIdx: index("customers_primary_mobile_idx").on(table.primaryMobile),
    emailIdx: index("customers_email_idx").on(table.email),
    referralCodeIdx: index("customers_referral_code_idx").on(table.referralCode),
    accountStatusIdx: index("customers_account_status_idx").on(table.accountStatus),
    riskFlagIdx: index("customers_risk_flag_idx").on(table.riskFlag),
    isActiveIdx: index("customers_is_active_idx").on(table.accountStatus),
    createdAtIdx: index("customers_created_at_idx").on(table.createdAt),
    lastOrderAtIdx: index("customers_last_order_at_idx").on(table.lastOrderAt),
    activeIdx: index("customers_active_idx").on(table.accountStatus, table.createdAt),
  })
);

/**
 * Customer Wallet - Customer wallet information
 */
export const customerWallet = pgTable(
  "customer_wallet",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .unique()
      .references(() => customers.id, { onDelete: "cascade" }),
    currentBalance: numeric("current_balance", { precision: 12, scale: 2 }).default("0.0"),
    lockedAmount: numeric("locked_amount", { precision: 12, scale: 2 }).default("0.0"),
    availableBalance: numeric("available_balance", { precision: 12, scale: 2 }).default("0.0"),
    maxBalance: numeric("max_balance", { precision: 12, scale: 2 }).default("10000.0"),
    minTransactionAmount: numeric("min_transaction_amount", { precision: 10, scale: 2 }).default("1.0"),
    maxTransactionAmount: numeric("max_transaction_amount", { precision: 10, scale: 2 }).default("10000.0"),
    isActive: boolean("is_active").default(true),
    kycVerified: boolean("kyc_verified").default(false),
    lastTransactionAt: timestamp("last_transaction_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    customerIdIdx: index("customer_wallet_customer_id_idx").on(table.customerId),
    isActiveIdx: index("customer_wallet_is_active_idx").on(table.isActive),
  })
);

/**
 * Customer Wallet Transactions - Wallet transaction history
 */
export const customerWalletTransactions = pgTable(
  "customer_wallet_transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id").notNull().unique(),
    transactionType: walletTransactionTypeEnum("transaction_type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    balanceBefore: numeric("balance_before", { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),
    referenceId: text("reference_id"),
    referenceType: text("reference_type"),
    description: text("description").notNull(),
    status: text("status").default("COMPLETED"),
    pgTransactionId: text("pg_transaction_id"),
    pgResponse: jsonb("pg_response").default({}),
    transactionMetadata: jsonb("transaction_metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    customerIdIdx: index("customer_wallet_transactions_customer_id_idx").on(table.customerId),
    transactionIdIdx: index("customer_wallet_transactions_transaction_id_idx").on(table.transactionId),
    transactionTypeIdx: index("customer_wallet_transactions_transaction_type_idx").on(table.transactionType),
    referenceIdx: index("customer_wallet_transactions_reference_idx").on(table.referenceId, table.referenceType),
    createdAtIdx: index("customer_wallet_transactions_created_at_idx").on(table.createdAt),
    statusIdx: index("customer_wallet_transactions_status_idx").on(table.status),
    customerCreatedIdx: index("customer_wallet_transactions_customer_created_idx").on(table.customerId, table.createdAt),
  })
);

/**
 * Customer Tickets - Customer support tickets
 */
export const customerTickets = pgTable(
  "customer_tickets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: text("ticket_id").notNull().unique(),
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    orderId: bigint("order_id", { mode: "number" }),
    serviceType: serviceTypeEnum("service_type"),
    issueCategory: text("issue_category").notNull(),
    issueSubcategory: text("issue_subcategory"),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    attachments: text("attachments").array(),
    priority: text("priority").notNull().default("MEDIUM"),
    status: ticketStatusCustomerEnum("status").notNull().default("OPEN"),
    assignedToAgentId: integer("assigned_to_agent_id"),
    assignedToAgentName: text("assigned_to_agent_name"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    resolution: text("resolution"),
    resolutionTimeMinutes: integer("resolution_time_minutes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: integer("resolved_by"),
    customerSatisfactionRating: smallint("customer_satisfaction_rating"),
    followUpRequired: boolean("follow_up_required").default(false),
    followUpDate: timestamp("follow_up_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    customerIdIdx: index("customer_tickets_customer_id_idx").on(table.customerId),
    ticketIdIdx: index("customer_tickets_ticket_id_idx").on(table.ticketId),
    orderIdIdx: index("customer_tickets_order_id_idx").on(table.orderId),
    statusIdx: index("customer_tickets_status_idx").on(table.status),
    priorityIdx: index("customer_tickets_priority_idx").on(table.priority),
    assignedToAgentIdIdx: index("customer_tickets_assigned_to_agent_id_idx").on(table.assignedToAgentId),
    openIdx: index("customer_tickets_open_idx").on(table.status, table.createdAt),
  })
);

// ============================================================================
// ORDER ACTIONS & EVENTS (legacy orders table)
// ============================================================================

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
 * Rider wallet - unified wallet with service-specific earnings tracking
 * Total balance is sum of all service earnings minus penalties minus withdrawals
 */
export const riderWallet = pgTable(
  "rider_wallet",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .unique()
      .references(() => riders.id, { onDelete: "cascade" }),
    totalBalance: numeric("total_balance", { precision: 10, scale: 2 })
      .notNull()
      .default("0"), // Total balance (sum of all services)
    // Service-specific earnings
    earningsFood: numeric("earnings_food", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    earningsParcel: numeric("earnings_parcel", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    earningsPersonRide: numeric("earnings_person_ride", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Service-specific penalties
    penaltiesFood: numeric("penalties_food", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    penaltiesParcel: numeric("penalties_parcel", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    penaltiesPersonRide: numeric("penalties_person_ride", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // FIFO unblock: generic credit allocated per service for block logic (effective_net = earnings - penalties + unblock_alloc)
    unblockAllocFood: numeric("unblock_alloc_food", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    unblockAllocParcel: numeric("unblock_alloc_parcel", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    unblockAllocPersonRide: numeric("unblock_alloc_person_ride", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Service-level negative: amount of negative balance attributed to each service (threshold -50). Reset when total_balance >= 0.
    negativeUsedFood: numeric("negative_used_food", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    negativeUsedParcel: numeric("negative_used_parcel", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    negativeUsedPersonRide: numeric("negative_used_person_ride", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Withdrawals (from total balance, not per service)
    totalWithdrawn: numeric("total_withdrawn", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Wallet freeze: when true rider cannot withdraw; track who froze and when
    isFrozen: boolean("is_frozen").notNull().default(false),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    frozenBySystemUserId: integer("frozen_by_system_user_id").references(
      () => systemUsers.id,
      { onDelete: "set null" }
    ),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: uniqueIndex("rider_wallet_rider_id_idx").on(table.riderId),
    totalBalanceIdx: index("rider_wallet_total_balance_idx").on(table.totalBalance),
    isFrozenIdx: index("rider_wallet_is_frozen_idx").on(table.isFrozen),
  })
);

/**
 * Rider wallet freeze history - audit log of freeze/unfreeze actions with agent tracking
 */
export const riderWalletFreezeHistory = pgTable(
  "rider_wallet_freeze_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // 'freeze' | 'unfreeze'
    performedBySystemUserId: integer("performed_by_system_user_id")
      .notNull()
      .references(() => systemUsers.id, { onDelete: "set null" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_wallet_freeze_history_rider_id_idx").on(table.riderId),
    createdAtIdx: index("rider_wallet_freeze_history_created_at_idx").on(table.createdAt),
    performedByIdx: index("rider_wallet_freeze_history_performed_by_idx").on(
      table.performedBySystemUserId
    ),
  })
);

/**
 * Rider temporary block due to negative wallet (per service).
 * When net balance (earnings - penalties) for a service <= -50, rider is blocked for that service.
 * Auto-removed when balance recovers to >= 0 (adjustment or penalty revert). Not time-based.
 */
export const riderNegativeWalletBlocks = pgTable(
  "rider_negative_wallet_blocks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    serviceType: text("service_type").notNull(), // 'food' | 'parcel' | 'person_ride'
    reason: text("reason").notNull().default("negative_wallet"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_negative_wallet_blocks_rider_id_idx").on(table.riderId),
    serviceTypeIdx: index("rider_negative_wallet_blocks_service_type_idx").on(table.serviceType),
    riderServiceIdx: uniqueIndex("rider_negative_wallet_blocks_rider_service_idx").on(
      table.riderId,
      table.serviceType
    ),
  })
);

/**
 * Wallet ledger - immutable transaction log
 * RECOMMENDED: Partition by rider_id for high-volume scenarios
 * Enhanced with service_type for service-specific tracking
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
    serviceType: text("service_type"), // 'food', 'parcel', 'person_ride', or NULL for non-service-specific
    ref: text("ref"), // Reference to order_id, withdrawal_id, penalty_id, etc.
    refType: text("ref_type"), // "order", "withdrawal", "penalty", etc.
    description: text("description"),
    metadata: jsonb("metadata").default({}),
    performedByType: text("performed_by_type").default("system"), // 'agent' | 'system' | 'rider' | 'automated'
    performedById: integer("performed_by_id"), // system_users.id when performed_by_type = 'agent'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.riderId] }),
    riderIdIdx: index("wallet_ledger_rider_id_idx").on(table.riderId),
    entryTypeIdx: index("wallet_ledger_entry_type_idx").on(table.entryType),
    serviceTypeIdx: index("wallet_ledger_service_type_idx").on(table.serviceType),
    createdAtIdx: index("wallet_ledger_created_at_idx").on(table.createdAt),
    riderCreatedIdx: index("wallet_ledger_rider_created_idx").on(
      table.riderId,
      table.createdAt
    ),
    riderServiceIdx: index("wallet_ledger_rider_service_idx").on(
      table.riderId,
      table.serviceType
    ),
    refIdx: index("wallet_ledger_ref_idx").on(table.ref),
    performedByTypeIdx: index("wallet_ledger_performed_by_type_idx").on(table.performedByType),
    performedByIdIdx: index("wallet_ledger_performed_by_id_idx").on(table.performedById),
  })
);

/**
 * Rider payment methods - verified bank/UPI for withdrawals (backend source of truth)
 */
export const riderPaymentMethods = pgTable(
  "rider_payment_methods",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    methodType: paymentMethodTypeEnum("method_type").notNull(),
    accountHolderName: text("account_holder_name").notNull(),
    bankName: text("bank_name"),
    ifsc: text("ifsc"),
    branch: text("branch"),
    accountNumberEncrypted: text("account_number_encrypted"),
    upiId: text("upi_id"),
    verificationStatus: paymentMethodVerificationStatusEnum("verification_status").notNull().default("pending"),
    verificationProofType: verificationProofTypeEnum("verification_proof_type"),
    proofDocumentId: integer("proof_document_id").references(() => riderDocuments.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: integer("verified_by").references((): any => systemUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    riderIdIdx: index("rider_payment_methods_rider_id_idx").on(table.riderId),
    verificationStatusIdx: index("rider_payment_methods_verification_status_idx").on(table.verificationStatus),
    deletedAtIdx: index("rider_payment_methods_deleted_at_idx").on(table.deletedAt),
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
    paymentMethodId: integer("payment_method_id").references(() => riderPaymentMethods.id, { onDelete: "set null" }),
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
    paymentMethodIdIdx: index("withdrawal_requests_payment_method_id_idx").on(table.paymentMethodId),
    statusIdx: index("withdrawal_requests_status_idx").on(table.status),
    createdAtIdx: index("withdrawal_requests_created_at_idx").on(
      table.createdAt
    ),
  })
);

/**
 * Wallet credit requests - agents request credits; approvers approve/reject.
 * On approval: wallet_ledger entry + rider_wallet update (FIFO/block sync).
 */
export const walletCreditRequests = pgTable(
  "wallet_credit_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    orderId: bigint("order_id", { mode: "number" }).references(() => orders.id, {
      onDelete: "set null",
    }),
    serviceType: text("service_type"), // 'food' | 'parcel' | 'person_ride'
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
    idempotencyKey: text("idempotency_key"),
    requestedBySystemUserId: integer("requested_by_system_user_id")
      .notNull()
      .references((): any => systemUsers.id, { onDelete: "cascade" }),
    requestedByEmail: text("requested_by_email"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedBySystemUserId: integer("reviewed_by_system_user_id").references(
      (): any => systemUsers.id,
      { onDelete: "set null" }
    ),
    reviewedByEmail: text("reviewed_by_email"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    approvedLedgerRef: text("approved_ledger_ref").unique(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => ({
    riderStatusRequestedIdx: index(
      "wallet_credit_requests_rider_status_requested_idx"
    ).on(table.riderId, table.status, table.requestedAt),
    statusRequestedIdx: index(
      "wallet_credit_requests_status_requested_idx"
    ).on(table.status, table.requestedAt),
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
    resolvedBy: integer("resolved_by").references(() => systemUsers.id, { onDelete: "set null" }),
  },
  (table) => ({
    riderIdIdx: index("tickets_rider_id_idx").on(table.riderId),
    resolvedByIdx: index("tickets_resolved_by_idx").on(table.resolvedBy),
    statusIdx: index("tickets_status_idx").on(table.status),
    categoryIdx: index("tickets_category_idx").on(table.category),
    createdAtIdx: index("tickets_created_at_idx").on(table.createdAt),
  })
);

// ============================================================================
// REFERRAL SYSTEM
// ============================================================================

/**
 * Referral offer/campaign definition. Default T&C, amount, order count, limits;
 * city-wise overrides in referral_offer_city_rules.
 */
export const referralOffers = pgTable(
  "referral_offers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    offerCode: text("offer_code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    offerType: referralOfferTypeEnum("offer_type").notNull().default("fixed_per_referral"),
    amount: numeric("amount", { precision: 10, scale: 2 }),
    amountConfig: jsonb("amount_config").notNull().default({}),
    serviceTypes: text("service_types").array().default([]),
    minOrdersPerReferred: integer("min_orders_per_referred").notNull().default(0),
    minReferredCount: integer("min_referred_count").notNull().default(1),
    maxReferralsPerReferrer: integer("max_referrals_per_referrer"), // global cap per referrer (null = no limit)
    termsAndConditions: text("terms_and_conditions"),
    termsSnapshot: jsonb("terms_snapshot").default({}),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    cityIds: bigint("city_ids", { mode: "number" }).array(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: bigint("created_by", { mode: "number" }).references(() => systemUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    offerCodeIdx: uniqueIndex("referral_offers_offer_code_idx").on(table.offerCode),
    isActiveIdx: index("referral_offers_is_active_idx").on(table.isActive),
    offerTypeIdx: index("referral_offers_offer_type_idx").on(table.offerType),
  })
);

/**
 * City-wise overrides for referral offers: amount, min_orders, max_referrals limit, T&C.
 * Resolve: lookup (offer_id, city_id) here; if not found use referral_offers defaults.
 */
export const referralOfferCityRules = pgTable(
  "referral_offer_city_rules",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    offerId: bigint("offer_id", { mode: "number" })
      .notNull()
      .references(() => referralOffers.id, { onDelete: "cascade" }),
    cityId: bigint("city_id", { mode: "number" })
      .notNull()
      .references((): any => cities.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }),
    minOrdersPerReferred: integer("min_orders_per_referred"),
    maxReferralsPerReferrer: integer("max_referrals_per_referrer"),
    termsAndConditions: text("terms_and_conditions"),
    termsSnapshot: jsonb("terms_snapshot").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    offerIdIdx: index("referral_offer_city_rules_offer_id_idx").on(table.offerId),
    cityIdIdx: index("referral_offer_city_rules_city_id_idx").on(table.cityId),
    offerCityUniqueIdx: uniqueIndex("referral_offer_city_rules_offer_city_idx").on(
      table.offerId,
      table.cityId
    ),
  })
);

/**
 * Referral tracking (who referred whom; optional link to offer and city)
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
    offerId: bigint("offer_id", { mode: "number" }).references(() => referralOffers.id, { onDelete: "set null" }),
    referralCodeUsed: text("referral_code_used"),
    referredCityId: bigint("referred_city_id", { mode: "number" }).references((): any => cities.id, { onDelete: "set null" }),
    referredCityName: text("referred_city_name"),
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
    offerIdIdx: index("referrals_offer_id_idx").on(table.offerId),
    referredCityIdIdx: index("referrals_referred_city_id_idx").on(table.referredCityId),
  })
);

/**
 * Per-referral fulfillment: order counts, amount credited to referrer, status, T&C snapshot.
 */
export const referralFulfillments = pgTable(
  "referral_fulfillments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    referralId: bigint("referral_id", { mode: "number" })
      .notNull()
      .references(() => referrals.id, { onDelete: "cascade" }),
    offerId: bigint("offer_id", { mode: "number" })
      .notNull()
      .references(() => referralOffers.id, { onDelete: "restrict" }),
    referrerRiderId: integer("referrer_rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    referredRiderId: integer("referred_rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    status: referralFulfillmentStatusEnum("status").notNull().default("pending"),
    minOrdersRequired: integer("min_orders_required").notNull().default(0),
    ordersCompletedByReferred: integer("orders_completed_by_referred").notNull().default(0),
    ordersCompletedFood: integer("orders_completed_food").notNull().default(0),
    ordersCompletedParcel: integer("orders_completed_parcel").notNull().default(0),
    ordersCompletedPersonRide: integer("orders_completed_person_ride").notNull().default(0),
    amountCredited: numeric("amount_credited", { precision: 10, scale: 2 }).notNull().default("0"),
    amountCreditedFood: numeric("amount_credited_food", { precision: 10, scale: 2 }).notNull().default("0"),
    amountCreditedParcel: numeric("amount_credited_parcel", { precision: 10, scale: 2 }).notNull().default("0"),
    amountCreditedPersonRide: numeric("amount_credited_person_ride", { precision: 10, scale: 2 }).notNull().default("0"),
    walletLedgerId: bigint("wallet_ledger_id", { mode: "number" }),
    creditedAt: timestamp("credited_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    cityId: bigint("city_id", { mode: "number" }).references((): any => cities.id, { onDelete: "set null" }),
    cityName: text("city_name"),
    termsSnapshot: jsonb("terms_snapshot").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    referralIdIdx: uniqueIndex("referral_fulfillments_referral_id_unique").on(table.referralId),
    referrerRiderIdIdx: index("referral_fulfillments_referrer_rider_id_idx").on(table.referrerRiderId),
    referredRiderIdIdx: index("referral_fulfillments_referred_rider_id_idx").on(table.referredRiderId),
    offerIdIdx: index("referral_fulfillments_offer_id_idx").on(table.offerId),
    statusIdx: index("referral_fulfillments_status_idx").on(table.status),
    cityIdIdx: index("referral_fulfillments_city_id_idx").on(table.cityId),
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
  areaManager: one(areaManagers, {
    fields: [riders.areaManagerId],
    references: [areaManagers.id],
  }),
  referredByRider: one(riders, {
    fields: [riders.referredBy],
    references: [riders.id],
  }),
  referredRiders: many(riders),
  documents: many(riderDocuments),
  devices: many(riderDevices),
  vehicles: many(riderVehicles),
  addresses: many(riderAddresses),
  paymentMethods: many(riderPaymentMethods),
  penalties: many(riderPenalties),
  wallet: one(riderWallet, {
    fields: [riders.id],
    references: [riderWallet.riderId],
  }),
  dutyLogs: many(dutyLogs),
  riderActivitySessions: many(riderActivitySessions),
  riderActivityDaily: many(riderActivityDaily),
  locationLogs: many(locationLogs),
  blacklistHistory: many(blacklistHistory),
  negativeWalletBlocks: many(riderNegativeWalletBlocks),
  orders: many(orders),
  orderActions: many(orderActions),
  walletLedger: many(walletLedger),
  walletFreezeHistory: many(riderWalletFreezeHistory),
  withdrawalRequests: many(withdrawalRequests),
  walletCreditRequests: many(walletCreditRequests),
  onboardingPayments: many(onboardingPayments),
  offerParticipation: many(offerParticipation),
  ratings: many(ratings),
  tickets: many(tickets),
  referralsAsReferrer: many(referrals, { relationName: "referrer" }),
  referralsAsReferred: many(referrals, { relationName: "referred" }),
  dailyAnalytics: many(riderDailyAnalytics),
  fraudLogs: many(fraudLogs),
}));

export const areaManagersRelations = relations(areaManagers, ({ one, many }) => ({
  user: one(systemUsers, {
    fields: [areaManagers.userId],
    references: [systemUsers.id],
  }),
  stores: many(stores),
  riders: many(riders),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  areaManager: one(areaManagers, {
    fields: [stores.areaManagerId],
    references: [areaManagers.id],
  }),
  parentStore: one(stores, {
    fields: [stores.parentStoreId],
    references: [stores.id],
    relationName: "storeChildren",
  }),
  childStores: many(stores, { relationName: "storeChildren" }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  actor: one(systemUsers, {
    fields: [activityLogs.actorId],
    references: [systemUsers.id],
  }),
}));

export const riderDocumentsRelations = relations(
  riderDocuments,
  ({ one, many }) => ({
    rider: one(riders, {
      fields: [riderDocuments.riderId],
      references: [riders.id],
    }),
    files: many(riderDocumentFiles),
  })
);

export const riderDocumentFilesRelations = relations(
  riderDocumentFiles,
  ({ one }) => ({
    document: one(riderDocuments, {
      fields: [riderDocumentFiles.documentId],
      references: [riderDocuments.id],
    }),
  })
);

export const riderAddressesRelations = relations(
  riderAddresses,
  ({ one }) => ({
    rider: one(riders, {
      fields: [riderAddresses.riderId],
      references: [riders.id],
    }),
    city: one(cities, {
      fields: [riderAddresses.cityId],
      references: [cities.id],
    }),
  })
);

export const riderPaymentMethodsRelations = relations(
  riderPaymentMethods,
  ({ one, many }) => ({
    rider: one(riders, {
      fields: [riderPaymentMethods.riderId],
      references: [riders.id],
    }),
    proofDocument: one(riderDocuments, {
      fields: [riderPaymentMethods.proofDocumentId],
      references: [riderDocuments.id],
    }),
    verifiedByUser: one(systemUsers, {
      fields: [riderPaymentMethods.verifiedBy],
      references: [systemUsers.id],
    }),
    withdrawalRequests: many(withdrawalRequests),
  })
);

export const withdrawalRequestsRelations = relations(
  withdrawalRequests,
  ({ one }) => ({
    rider: one(riders, {
      fields: [withdrawalRequests.riderId],
      references: [riders.id],
    }),
    paymentMethod: one(riderPaymentMethods, {
      fields: [withdrawalRequests.paymentMethodId],
      references: [riderPaymentMethods.id],
    }),
  })
);

export const riderPenaltiesRelations = relations(
  riderPenalties,
  ({ one }) => ({
    rider: one(riders, {
      fields: [riderPenalties.riderId],
      references: [riders.id],
    }),
    order: one(orders, {
      fields: [riderPenalties.orderId],
      references: [orders.id],
    }),
    imposedByUser: one(systemUsers, {
      fields: [riderPenalties.imposedBy],
      references: [systemUsers.id],
      relationName: "penaltyImposedBy",
    }),
    reversedByUser: one(systemUsers, {
      fields: [riderPenalties.reversedBy],
      references: [systemUsers.id],
      relationName: "penaltyReversedBy",
    }),
  })
);

export const riderVehiclesRelations = relations(
  riderVehicles,
  ({ one }) => ({
    rider: one(riders, {
      fields: [riderVehicles.riderId],
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
  walletCreditRequests: many(walletCreditRequests),
}));

export const orderProvidersRelations = relations(orderProviders, ({ many }) => ({
  providerMappings: many(orderProviderMapping),
}));

export const ordersCoreRelations = relations(ordersCore, ({ one, many }) => ({
  rider: one(riders, {
    fields: [ordersCore.riderId],
    references: [riders.id],
  }),
  food: one(ordersFood),
  parcel: one(ordersParcel),
  ride: one(ordersRide),
  providerMappings: many(orderProviderMapping),
  otps: many(orderOtps),
  deliveryImages: many(orderDeliveryImages),
  routeSnapshots: many(orderRouteSnapshots),
  manualStatusHistory: many(orderManualStatusHistory),
  timelines: many(orderTimelines),
}));

export const orderManualStatusHistoryRelations = relations(
  orderManualStatusHistory,
  ({ one }) => ({
    order: one(ordersCore, {
      fields: [orderManualStatusHistory.orderId],
      references: [ordersCore.id],
    }),
  })
);

export const orderTimelinesRelations = relations(orderTimelines, ({ one }) => ({
  order: one(ordersCore, {
    fields: [orderTimelines.orderId],
    references: [ordersCore.id],
  }),
}));

export const ordersFoodRelations = relations(ordersFood, ({ one }) => ({
  order: one(ordersCore, {
    fields: [ordersFood.orderId],
    references: [ordersCore.id],
  }),
}));

export const ordersParcelRelations = relations(ordersParcel, ({ one }) => ({
  order: one(ordersCore, {
    fields: [ordersParcel.orderId],
    references: [ordersCore.id],
  }),
}));

export const ordersRideRelations = relations(ordersRide, ({ one }) => ({
  order: one(ordersCore, {
    fields: [ordersRide.orderId],
    references: [ordersCore.id],
  }),
}));

export const orderProviderMappingRelations = relations(
  orderProviderMapping,
  ({ one }) => ({
    order: one(ordersCore, {
      fields: [orderProviderMapping.orderId],
      references: [ordersCore.id],
    }),
    provider: one(orderProviders, {
      fields: [orderProviderMapping.providerId],
      references: [orderProviders.id],
    }),
  })
);

export const orderOtpsRelations = relations(orderOtps, ({ one }) => ({
  order: one(ordersCore, {
    fields: [orderOtps.orderId],
    references: [ordersCore.id],
  }),
}));

export const orderDeliveryImagesRelations = relations(
  orderDeliveryImages,
  ({ one }) => ({
    order: one(ordersCore, {
      fields: [orderDeliveryImages.orderId],
      references: [ordersCore.id],
    }),
  })
);

export const orderRouteSnapshotsRelations = relations(
  orderRouteSnapshots,
  ({ one }) => ({
    order: one(ordersCore, {
      fields: [orderRouteSnapshots.orderId],
      references: [ordersCore.id],
    }),
  })
);

export const walletLedgerRelations = relations(walletLedger, ({ one }) => ({
  rider: one(riders, {
    fields: [walletLedger.riderId],
    references: [riders.id],
  }),
}));

export const riderWalletRelations = relations(riderWallet, ({ one }) => ({
  rider: one(riders, {
    fields: [riderWallet.riderId],
    references: [riders.id],
  }),
  frozenByUser: one(systemUsers, {
    fields: [riderWallet.frozenBySystemUserId],
    references: [systemUsers.id],
  }),
}));

export const riderWalletFreezeHistoryRelations = relations(
  riderWalletFreezeHistory,
  ({ one }) => ({
    rider: one(riders, {
      fields: [riderWalletFreezeHistory.riderId],
      references: [riders.id],
    }),
    performedByUser: one(systemUsers, {
      fields: [riderWalletFreezeHistory.performedBySystemUserId],
      references: [systemUsers.id],
    }),
  })
);

export const riderNegativeWalletBlocksRelations = relations(
  riderNegativeWalletBlocks,
  ({ one }) => ({
    rider: one(riders, {
      fields: [riderNegativeWalletBlocks.riderId],
      references: [riders.id],
    }),
  })
);

export const walletCreditRequestsRelations = relations(
  walletCreditRequests,
  ({ one }) => ({
    rider: one(riders, {
      fields: [walletCreditRequests.riderId],
      references: [riders.id],
    }),
    order: one(orders, {
      fields: [walletCreditRequests.orderId],
      references: [orders.id],
    }),
    requestedByUser: one(systemUsers, {
      fields: [walletCreditRequests.requestedBySystemUserId],
      references: [systemUsers.id],
      relationName: "walletCreditRequestedBy",
    }),
    reviewedByUser: one(systemUsers, {
      fields: [walletCreditRequests.reviewedBySystemUserId],
      references: [systemUsers.id],
      relationName: "walletCreditReviewedBy",
    }),
  })
);

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

// Customer Relations
export const customersRelations = relations(customers, ({ one, many }) => ({
  referrer: one(customers, {
    fields: [customers.referrerCustomerId],
    references: [customers.id],
    relationName: "referrer",
  }),
  wallet: one(customerWallet, {
    fields: [customers.id],
    references: [customerWallet.customerId],
  }),
  walletTransactions: many(customerWalletTransactions),
  tickets: many(customerTickets),
}));

export const customerWalletRelations = relations(customerWallet, ({ one }) => ({
  customer: one(customers, {
    fields: [customerWallet.customerId],
    references: [customers.id],
  }),
}));

export const customerWalletTransactionsRelations = relations(
  customerWalletTransactions,
  ({ one }) => ({
    customer: one(customers, {
      fields: [customerWalletTransactions.customerId],
      references: [customers.id],
    }),
  })
);

export const customerTicketsRelations = relations(customerTickets, ({ one }) => ({
  customer: one(customers, {
    fields: [customerTickets.customerId],
    references: [customers.id],
  }),
}));
