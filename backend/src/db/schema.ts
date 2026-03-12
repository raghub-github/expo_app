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
  uuid,
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

/** Ownership proof: ownership | rental | authorization_letter (stored as TEXT in rider_vehicles) */
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

/** Document verification method */
export const verificationMethodEnum = pgEnum("verification_method", [
  "APP_VERIFIED",
  "MANUAL_UPLOAD",
]);

export const fuelTypeEnum = pgEnum("fuel_type", [
  "petrol",
  "diesel",
  "cng",
  "electric",
  "hybrid",
]);

export const vehicleActiveStatusEnum = pgEnum("vehicle_active_status", [
  "active",
  "inactive",
  "suspended",
]);

export const acTypeEnum = pgEnum("ac_type", [
  "AC",
  "Non-AC",
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

export const orderStatusTypeEnum = pgEnum("order_status_type", [
  "assigned",
  "accepted",
  "reached_store",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
  "failed",
]);

export const orderSourceTypeEnum = pgEnum("order_source_type", [
  "internal",
  "swiggy",
  "zomato",
  "rapido",
  "ondc",
  "shiprocket",
  "other",
]);

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

// Legacy ticket status enum (kept for backward compatibility)
export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

// Enterprise Ticket System Enums
export const ticketServiceTypeEnum = pgEnum("ticket_service_type", [
  "food",
  "parcel",
  "person_ride",
  "other",
]);

export const ticketCategoryEnum = pgEnum("ticket_category", [
  "order_related",
  "non_order",
  "other",
]);

export const ticketSectionEnum = pgEnum("ticket_section", [
  "customer",
  "rider",
  "merchant",
  "system",
  "other",
]);

export const ticketSourceRoleEnum = pgEnum("ticket_source_role", [
  "customer",
  "customer_pickup",
  "customer_drop",
  "rider",
  "rider_3pl",
  "merchant",
  "provider",
  "system",
]);

export const enterpriseTicketStatusEnum = pgEnum("ticket_status", [
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "rejected",
  "reopened",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low",
  "medium",
  "high",
  "urgent",
  "critical",
]);

export const ticketParticipantRoleEnum = pgEnum("ticket_participant_role", [
  "creator",
  "affected_party",
  "pickup",
  "drop",
]);

export const ticketEntityTypeEnum = pgEnum("ticket_entity_type", [
  "customer",
  "rider",
  "rider_3pl",
  "merchant",
  "system",
  "provider",
]);

export const ticketMessageTypeEnum = pgEnum("ticket_message_type", [
  "reply",
  "internal_note",
  "system",
]);

export const ticketSenderTypeEnum = pgEnum("ticket_sender_type", [
  "customer",
  "rider",
  "merchant",
  "agent",
  "system",
]);

export const ticketRatedByTypeEnum = pgEnum("ticket_rated_by_type", [
  "customer",
  "rider",
  "merchant",
]);

// System user (minimal for rider-domain FKs; full definition may live in dashboard)
export const systemUserStatusEnum = pgEnum("system_user_status", [
  "ACTIVE",
  "SUSPENDED",
  "DISABLED",
  "PENDING_ACTIVATION",
  "LOCKED",
]);

// ============================================================================
// SYSTEM USERS (minimal for rider-domain FKs)
// ============================================================================

/**
 * System users - internal dashboard users (admins, agents). Minimal def for backend; full schema may be in dashboard.
 */
export const systemUsers = pgTable(
  "system_users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    systemUserId: text("system_user_id").notNull().unique(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull().unique(),
    mobile: text("mobile").notNull(),
    primaryRole: text("primary_role").notNull(),
    status: systemUserStatusEnum("status").notNull().default("PENDING_ACTIVATION"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    systemUserIdIdx: uniqueIndex("system_users_system_user_id_idx").on(table.systemUserId),
    emailIdx: uniqueIndex("system_users_email_idx").on(table.email),
    statusIdx: index("system_users_status_idx").on(table.status),
  })
);

// ============================================================================
// REFERENCE: CITIES, SERVICE TYPES, VEHICLE-SERVICE RULES
// ============================================================================

/**
 * Cities - for address normalization and city-based vehicle rules
 */
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

/**
 * Service types master - food, parcel, person_ride
 */
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

/**
 * Vehicle-service mapping - which vehicle types can do which services (global)
 */
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

/**
 * City-vehicle rules - e.g. "Commercial vehicle mandatory for person_ride in Bangalore"
 */
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
    referralCodeIdx: uniqueIndex("riders_referral_code_idx").on(
      table.referralCode
    ),
    statusIdx: index("riders_status_idx").on(table.status),
    cityIdx: index("riders_city_idx").on(table.city),
    kycStatusIdx: index("riders_kyc_status_idx").on(table.kycStatus),
    deletedAtIdx: index("riders_deleted_at_idx").on(table.deletedAt),
  })
);

export const riders = ridersTable;

/**
 * Customer user profiles (GatiMitra customer app onboarding).
 * user_id format: GM100001, GM100002, ... (auto-generated from id).
 */
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id").notNull().unique(),
    mobileNumber: text("mobile_number").notNull().unique(),
    fullName: text("full_name"),
    email: text("email").unique(),
    ageGroup: text("age_group"),
    gender: text("gender"),
    profileCompleted: boolean("profile_completed").notNull().default(false),
    smsPermission: boolean("sms_permission").default(false),
    locationPermission: boolean("location_permission").default(false),
    contactsPermission: boolean("contacts_permission").default(false),
    lastLoginIp: text("last_login_ip"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    sessionsInvalidBefore: timestamp("sessions_invalid_before", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: uniqueIndex("user_profiles_user_id_idx").on(table.userId),
    mobileIdx: uniqueIndex("user_profiles_mobile_idx").on(table.mobileNumber),
  })
);

// ---------------------------------------------------------------------------
// Customers table (public.customers) – customer app auth & profile
// Enums and table match DDL; use this for customer OTP verify and /me/profile
// ---------------------------------------------------------------------------
export const customerGenderEnum = pgEnum("customer_gender", ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]);
export const customerStatusEnum = pgEnum("customer_status", ["ACTIVE", "SUSPENDED", "BLOCKED", "DEACTIVATED", "PENDING_VERIFICATION"]);
export const riskLevelEnum = pgEnum("risk_level", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
/** Customer address label (HOME / WORK / HOTEL / OTHER). Matches public.address_type. */
export const addressTypeEnum = pgEnum("address_type", ["HOME", "WORK", "HOTEL", "OTHER"]);

export const customers = pgTable(
  "customers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: text("customer_id").notNull().unique(),
    fullName: text("full_name").notNull(),
    email: text("email").unique(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdVia: text("created_via").default("app"),
    updatedBy: text("updated_by"),
    // App profile/onboarding (add via migration 0065 if your DDL doesn’t have these)
    ageGroup: text("age_group"),
    profileCompleted: boolean("profile_completed").default(false),
    smsPermission: boolean("sms_permission").default(false),
    locationPermission: boolean("location_permission").default(false),
    contactsPermission: boolean("contacts_permission").default(false),
    sessionsInvalidBefore: timestamp("sessions_invalid_before", { withTimezone: true }),
    // Address / location (saved from app)
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),
    country: text("country"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    customerUuid: uuid("customer_uuid").notNull().$defaultFn(() => crypto.randomUUID()),
  },
  (table) => ({
    customerIdIdx: index("customers_customer_id_idx").on(table.customerId),
    primaryMobileIdx: index("customers_primary_mobile_idx").on(table.primaryMobile),
    emailIdx: index("customers_email_idx").on(table.email),
    accountStatusIdx: index("customers_account_status_idx").on(table.accountStatus),
  })
);

/** Saved delivery addresses per customer. Matches public.customer_addresses (address_id, address_line1, city, state, postal_code, etc.). */
export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    addressId: text("address_id").notNull().unique(),
    label: addressTypeEnum("label").notNull().default("HOME"),
    customLabel: text("custom_label"),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    addressAuto: text("address_auto"),
    addressManual: text("address_manual"),
    landmark: text("landmark"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").default("IN"),
    latitude: numeric("latitude", { precision: 10, scale: 8 }),
    longitude: numeric("longitude", { precision: 11, scale: 8 }),
    isDeliveryAddress: boolean("is_delivery_address").default(true),
    isPickupAddress: boolean("is_pickup_address").default(false),
    contactName: text("contact_name"),
    contactMobile: text("contact_mobile"),
    deliveryInstructions: text("delivery_instructions"),
    accessCode: text("access_code"),
    floorNumber: text("floor_number"),
    isDefault: boolean("is_default").default(false),
    isVerified: boolean("is_verified").default(false),
    isActive: boolean("is_active").default(true),
    orderCount: integer("order_count").default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    isLastUsed: boolean("is_last_used").default(false),
  },
  (table) => [
    index("customer_addresses_customer_id_idx").on(table.customerId),
    index("customer_addresses_address_id_idx").on(table.addressId),
    index("idx_customer_address_location").on(table.latitude, table.longitude),
  ]
);

/** Session-level active delivery location. Locked when order placed; unlock after delivery. */
export const customerActiveLocation = pgTable("customer_active_location", {
  customerId: bigint("customer_id", { mode: "number" })
    .primaryKey()
    .references(() => customers.id, { onDelete: "cascade" }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  address: text("address"),
  lockedForOrder: boolean("locked_for_order").default(false),
  orderId: bigint("order_id", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/** Self-learning delivery locations (orders + manual); powers local search fallback and city→area suggestions. */
export const popularLocations = pgTable(
  "popular_locations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cityName: text("city_name").notNull(),
    areaName: text("area_name").notNull(),
    displayName: text("display_name"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    searchRank: smallint("search_rank").default(0),
    usageCount: bigint("usage_count", { mode: "number" }).default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_popular_locations_city").on(table.cityName),
    index("idx_popular_locations_area").on(table.areaName),
    index("idx_popular_locations_usage").on(table.usageCount),
  ]
);

/** Customer reports about restaurant (menu, pricing, fraud). store_id = merchant_stores.id from Supabase. */
export const restaurantReports = pgTable(
  "restaurant_reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    storeId: bigint("store_id", { mode: "number" }).notNull(),
    reportType: text("report_type").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_restaurant_reports_customer_id").on(table.customerId),
    index("idx_restaurant_reports_store_id").on(table.storeId),
    index("idx_restaurant_reports_created_at").on(table.createdAt),
  ]
);

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
    docNumber: text("doc_number"),
    fileUrl: text("file_url").notNull(),
    r2Key: text("r2_key"),
    extractedName: text("extracted_name"),
    extractedDob: date("extracted_dob"),
    verified: boolean("verified").notNull().default(false),
    verificationStatus: documentVerificationStatusEnum("verification_status").default("pending"),
    expiryDate: date("expiry_date"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: integer("verified_by").references((): any => systemUsers.id, { onDelete: "set null" }),
    verifierUserId: integer("verifier_user_id"),
    rejectedReason: text("rejected_reason"),
    vehicleId: integer("vehicle_id"), // FK to rider_vehicles.id
    fraudFlags: jsonb("fraud_flags").default({}),
    duplicateDocumentId: bigint("duplicate_document_id", { mode: "number" }).references((): any => riderDocuments.id, { onDelete: "set null" }),
    requiresManualReview: boolean("requires_manual_review").notNull().default(false),
    verificationMethod: verificationMethodEnum("verification_method").notNull().default("MANUAL_UPLOAD"),
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
 * Blacklist history for audit trail.
 * service_type: 'food' | 'parcel' | 'person_ride' | 'all'. Temporary bans use expires_at; permanent use is_permanent.
 */
export const blacklistHistory = pgTable(
  "blacklist_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    serviceType: text("service_type").notNull().default("all"),
    reason: text("reason").notNull(),
    banned: boolean("banned").notNull().default(true),
    isPermanent: boolean("is_permanent").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    adminUserId: integer("admin_user_id"),
    source: text("source").notNull().default("agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("blacklist_history_rider_id_idx").on(table.riderId),
    bannedIdx: index("blacklist_history_banned_idx").on(table.banned),
    serviceTypeIdx: index("blacklist_history_service_type_idx").on(table.serviceType),
  })
);

/**
 * Rider vehicles - vehicle master per rider (supports multiple vehicles).
 * Regulatory-ready: registration_state, permit_expiry, is_commercial, seating_capacity, ac_type.
 */
export const riderVehicles = pgTable(
  "rider_vehicles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
    fuelType: fuelTypeEnum("fuel_type"),
    isCommercial: boolean("is_commercial").notNull().default(false),
    registrationNumber: text("registration_number").notNull(),
    registrationState: text("registration_state"),
    insuranceExpiry: date("insurance_expiry"),
    permitExpiry: date("permit_expiry"),
    vehicleActiveStatus: vehicleActiveStatusEnum("vehicle_active_status").notNull().default("active"),
    ownershipType: text("ownership_type"), // ownership | rental | authorization_letter (from ownership_type enum or config)
    limitationFlags: jsonb("limitation_flags").default({}),
    seatingCapacity: integer("seating_capacity"),
    acType: acTypeEnum("ac_type"),
    make: text("make"),
    model: text("model"),
    year: integer("year"),
    color: text("color"),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    deletedBy: integer("deleted_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    riderIdIdx: index("rider_vehicles_rider_id_idx").on(table.riderId),
    registrationNumberIdx: index("rider_vehicles_registration_number_idx").on(table.registrationNumber),
    vehicleActiveStatusIdx: index("rider_vehicles_vehicle_active_status_idx").on(table.vehicleActiveStatus),
    deletedAtIdx: index("rider_vehicles_deleted_at_idx").on(table.deletedAt),
  })
);

/**
 * Rider addresses - high-precision geo; one rider can have multiple addresses
 */
export const riderAddressTypeEnum = pgEnum("rider_address_type", [
  "registered",
  "current",
  "other",
]);

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
      .references(() => serviceTypes.id, { onDelete: "cascade" }),
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
 * Duty logs - tracks rider ON/OFF duty status changes.
 * service_types: array of services rider is online for, e.g. ['food','parcel','person_ride']; empty when OFF.
 */
export const dutyLogs = pgTable(
  "duty_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    status: dutyStatusEnum("status").notNull(),
    serviceTypes: jsonb("service_types").default([]),
    vehicleId: integer("vehicle_id").references((): any => riderVehicles.id, { onDelete: "set null" }),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("duty_logs_rider_id_idx").on(table.riderId),
    vehicleIdIdx: index("duty_logs_vehicle_id_idx").on(table.vehicleId),
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

// ============================================================================
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
    orderId: text("order_id").unique(),
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
    status: orderStatusTypeEnum("status").notNull().default("assigned"),
    currentStatus: text("current_status"),
    itemTotal: numeric("item_total", { precision: 12, scale: 2 }),
    addonTotal: numeric("addon_total", { precision: 12, scale: 2 }),
    grandTotal: numeric("grand_total", { precision: 12, scale: 2 }),
    tipAmount: numeric("tip_amount", { precision: 12, scale: 2 }),
    placedAt: timestamp("placed_at", { withTimezone: true }),
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
    actualPickupTime: timestamp("actual_pickup_time", { withTimezone: true }),
    actualDeliveryTime: timestamp("actual_delivery_time", { withTimezone: true }),
    items: jsonb("items"),
    deliveryLatitude: numeric("delivery_latitude", { precision: 10, scale: 7 }),
    deliveryLongitude: numeric("delivery_longitude", { precision: 10, scale: 7 }),
    deliveryAddress: text("delivery_address"),
  },
  (table) => ({
    orderIdIdx: index("orders_core_order_id_idx").on(table.orderId),
    riderIdIdx: index("orders_core_rider_id_idx").on(table.riderId),
    statusIdx: index("orders_core_status_idx").on(table.status),
    orderTypeIdx: index("orders_core_order_type_idx").on(table.orderType),
    createdAtIdx: index("orders_core_created_at_idx").on(table.createdAt),
    customerIdIdx: index("orders_core_customer_id_idx").on(table.customerId),
    orderSourceIdx: index("orders_core_order_source_idx").on(table.orderSource),
    orderUuidIdx: index("orders_core_order_uuid_idx").on(table.orderUuid),
    placedAtIdx: index("orders_core_placed_at_idx").on(table.placedAt),
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

// ============================================================================
// ORDERS CORE ITEMS / ADDONS / PAYMENTS (references orders_core.order_id)
// ============================================================================

export const ordersCoreItems = pgTable(
  "orders_core_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersCore.orderId, { onDelete: "cascade" }),
    menuItemId: bigint("menu_item_id", { mode: "number" }).notNull(),
    itemName: text("item_name").notNull(),
    categoryName: text("category_name"),
    vegNonveg: text("veg_nonveg"),
    variantId: bigint("variant_id", { mode: "number" }),
    variantName: text("variant_name"),
    quantity: integer("quantity").notNull(),
    basePrice: numeric("base_price", { precision: 12, scale: 2 }).notNull(),
    addonPrice: numeric("addon_price", { precision: 12, scale: 2 }).default("0"),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
    itemSnapshot: jsonb("item_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("orders_core_items_order_id_idx").on(table.orderId),
    menuItemIdIdx: index("orders_core_items_menu_item_id_idx").on(table.menuItemId),
  })
);

export const ordersCoreItemAddons = pgTable(
  "orders_core_item_addons",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderItemId: bigint("order_item_id", { mode: "number" })
      .notNull()
      .references(() => ordersCoreItems.id, { onDelete: "cascade" }),
    addonId: bigint("addon_id", { mode: "number" }),
    addonName: text("addon_name"),
    addonPrice: numeric("addon_price", { precision: 12, scale: 2 }),
    quantity: integer("quantity").default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orderItemIdIdx: index("orders_core_item_addons_order_item_id_idx").on(table.orderItemId),
  })
);

export const ordersCorePayments = pgTable(
  "orders_core_payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").references(() => ordersCore.orderId, { onDelete: "set null" }),
    paymentGateway: text("payment_gateway"),
    paymentMethod: text("payment_method"),
    transactionId: text("transaction_id"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").default("INR"),
    paymentStatus: text("payment_status").default("INITIATED"),
    gatewayResponse: jsonb("gateway_response"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("orders_core_payments_order_id_idx").on(table.orderId),
    transactionIdIdx: index("orders_core_payments_transaction_id_idx").on(table.transactionId),
  })
);

// ============================================================================
// PENDING ORDERS (payment-first: lock cart until payment success)
// ============================================================================

export const pendingOrders = pgTable(
  "pending_orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pendingId: text("pending_id").notNull().unique(),
    customerId: bigint("customer_id", { mode: "number" }).notNull(),
    merchantStoreId: bigint("merchant_store_id", { mode: "number" }).notNull(),
    merchantParentId: bigint("merchant_parent_id", { mode: "number" }),
    itemsSnapshot: jsonb("items_snapshot").notNull(),
    addressIdUsed: bigint("address_id_used", { mode: "number" }).notNull(),
    paymentMethod: text("payment_method").notNull(),
    tipAmount: numeric("tip_amount", { precision: 12, scale: 2 }).default("0"),
    donationAmount: numeric("donation_amount", { precision: 12, scale: 2 }).default("0"),
    itemTotal: numeric("item_total", { precision: 12, scale: 2 }).notNull(),
    addonTotal: numeric("addon_total", { precision: 12, scale: 2 }).default("0"),
    grandTotal: numeric("grand_total", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").default("INR"),
    deliveryAddress: text("delivery_address"),
    dropLat: numeric("drop_lat", { precision: 9, scale: 6 }),
    dropLon: numeric("drop_lon", { precision: 9, scale: 6 }),
    pickupAddressNormalized: text("pickup_address_normalized"),
    pickupLat: numeric("pickup_lat", { precision: 9, scale: 6 }),
    pickupLon: numeric("pickup_lon", { precision: 9, scale: 6 }),
    distanceKm: numeric("distance_km", { precision: 8, scale: 2 }),
    razorpayOrderId: text("razorpay_order_id"),
    finalizedOrderId: text("finalized_order_id"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pendingIdIdx: index("pending_orders_pending_id_idx").on(table.pendingId),
    customerIdIdx: index("pending_orders_customer_id_idx").on(table.customerId),
    razorpayOrderIdIdx: index("pending_orders_razorpay_order_id_idx").on(table.razorpayOrderId),
    finalizedOrderIdIdx: index("pending_orders_finalized_order_id_idx").on(table.finalizedOrderId),
    expiresAtIdx: index("pending_orders_expires_at_idx").on(table.expiresAt),
  })
);

// ============================================================================
// LEVEL-2: Order events, rider tracking, kitchen timeline, ETA
// ============================================================================

export const orderEvents = pgTable(
  "order_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    orderSource: text("order_source").notNull().default("orders_core"),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    payload: jsonb("payload"),
    actorType: text("actor_type"),
    actorId: bigint("actor_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdCreatedIdx: index("order_events_order_id_created_idx").on(table.orderId, table.createdAt),
  })
);

export const orderRiderTracking = pgTable(
  "order_rider_tracking",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    orderSource: text("order_source").notNull().default("orders_core"),
    riderId: integer("rider_id"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    headingDegrees: numeric("heading_degrees", { precision: 5, scale: 2 }),
    speedKmh: numeric("speed_kmh", { precision: 5, scale: 2 }),
    accuracyMeters: numeric("accuracy_meters", { precision: 6, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdCreatedIdx: index("order_rider_tracking_order_id_created_idx").on(table.orderId, table.createdAt),
  })
);

// Level-2: delivery_assignments, rider_live_locations, rider_location_history, order_tracking_tokens
export const deliveryAssignments = pgTable(
  "delivery_assignments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull().unique(),
    riderId: integer("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    assignmentStatus: text("assignment_status").notNull().default("ASSIGNED"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    currentEtaMinutes: integer("current_eta_minutes"),
    distanceRemainingKm: numeric("distance_remaining_km", { precision: 6, scale: 2 }),
    routePolyline: text("route_polyline"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("delivery_assignments_order_id_idx").on(table.orderId),
    riderIdIdx: index("delivery_assignments_rider_id_idx").on(table.riderId),
    statusIdx: index("delivery_assignments_status_idx").on(table.assignmentStatus),
  })
);

export const riderLiveLocations = pgTable("rider_live_locations", {
  riderId: integer("rider_id").primaryKey().references(() => riders.id, { onDelete: "cascade" }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
  speedKmh: numeric("speed_kmh", { precision: 5, scale: 2 }),
  heading: numeric("heading", { precision: 6, scale: 2 }),
  accuracyMeters: numeric("accuracy_meters", { precision: 6, scale: 2 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const riderLocationHistory = pgTable(
  "rider_location_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id").notNull().references(() => riders.id, { onDelete: "cascade" }),
    orderId: text("order_id"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    speedKmh: numeric("speed_kmh", { precision: 5, scale: 2 }),
    heading: numeric("heading", { precision: 6, scale: 2 }),
    accuracyMeters: numeric("accuracy_meters", { precision: 6, scale: 2 }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderRecordedIdx: index("rider_location_history_rider_id_recorded_idx").on(table.riderId, table.recordedAt),
    orderIdIdx: index("rider_location_history_order_id_idx").on(table.orderId),
  })
);

export const orderTrackingTokens = pgTable("order_tracking_tokens", {
  orderId: text("order_id").primaryKey(),
  trackingToken: text("tracking_token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const orderKitchenTimeline = pgTable(
  "order_kitchen_timeline",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    orderSource: text("order_source").notNull().default("orders_core"),
    step: text("step").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
  },
  (table) => ({
    orderIdIdx: index("order_kitchen_timeline_order_id_idx").on(table.orderId),
  })
);

export const orderEtaSnapshots = pgTable(
  "order_eta_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    orderSource: text("order_source").notNull().default("orders_core"),
    etaSeconds: integer("eta_seconds").notNull(),
    etaAt: timestamp("eta_at", { withTimezone: true }).notNull().defaultNow(),
    triggerEvent: text("trigger_event"),
    distanceKm: numeric("distance_km", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdCreatedIdx: index("order_eta_snapshots_order_id_created_idx").on(table.orderId, table.createdAt),
  })
);

export const ordersFood = pgTable(
  "orders_food",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .unique()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    coreOrderId: text("core_order_id").unique(),
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
    customerId: bigint("customer_id", { mode: "number" }),
    orderStatus: text("order_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("orders_food_order_id_idx").on(table.orderId),
    coreOrderIdIdx: index("orders_food_core_order_id_idx").on(table.coreOrderId),
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
    orderId: bigint("order_id", { mode: "number" })
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
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    riderAssignmentId: bigint("rider_assignment_id", { mode: "number" }),
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
 * Rider payment methods - verified bank/UPI for withdrawals (separate from request snapshot)
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
 * Rider penalties - per service type
 */
export const riderPenalties = pgTable(
  "rider_penalties",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    serviceType: orderTypeEnum("service_type"), // null = unspecified
    penaltyType: text("penalty_type").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("active"),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    imposedBy: integer("imposed_by").references((): any => systemUsers.id, { onDelete: "set null" }),
    source: text("source").default("agent"),
    imposedAt: timestamp("imposed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNotes: text("resolution_notes"),
    reversedBy: integer("reversed_by").references((): any => systemUsers.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").default({}),
  },
  (table) => ({
    riderIdIdx: index("rider_penalties_rider_id_idx").on(table.riderId),
    serviceTypeIdx: index("rider_penalties_service_type_idx").on(table.serviceType),
    statusIdx: index("rider_penalties_status_idx").on(table.status),
    orderIdIdx: index("rider_penalties_order_id_idx").on(table.orderId),
    imposedAtIdx: index("rider_penalties_imposed_at_idx").on(table.imposedAt),
  })
);

/**
 * Rider wallet - unified balance and service-specific earnings/penalties
 */
export const riderWallet = pgTable(
  "rider_wallet",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .unique()
      .references(() => riders.id, { onDelete: "cascade" }),
    totalBalance: numeric("total_balance", { precision: 10, scale: 2 }).notNull().default("0"),
    earningsFood: numeric("earnings_food", { precision: 10, scale: 2 }).notNull().default("0"),
    earningsParcel: numeric("earnings_parcel", { precision: 10, scale: 2 }).notNull().default("0"),
    earningsPersonRide: numeric("earnings_person_ride", { precision: 10, scale: 2 }).notNull().default("0"),
    penaltiesFood: numeric("penalties_food", { precision: 10, scale: 2 }).notNull().default("0"),
    penaltiesParcel: numeric("penalties_parcel", { precision: 10, scale: 2 }).notNull().default("0"),
    penaltiesPersonRide: numeric("penalties_person_ride", { precision: 10, scale: 2 }).notNull().default("0"),
    unblockAllocFood: numeric("unblock_alloc_food", { precision: 10, scale: 2 }).notNull().default("0"),
    unblockAllocParcel: numeric("unblock_alloc_parcel", { precision: 10, scale: 2 }).notNull().default("0"),
    unblockAllocPersonRide: numeric("unblock_alloc_person_ride", { precision: 10, scale: 2 }).notNull().default("0"),
    /** Service-level negative tracking: amount of negative balance attributed to each service (threshold -50). Reset when total_balance >= 0. */
    negativeUsedFood: numeric("negative_used_food", { precision: 10, scale: 2 }).notNull().default("0"),
    negativeUsedParcel: numeric("negative_used_parcel", { precision: 10, scale: 2 }).notNull().default("0"),
    negativeUsedPersonRide: numeric("negative_used_person_ride", { precision: 10, scale: 2 }).notNull().default("0"),
    totalWithdrawn: numeric("total_withdrawn", { precision: 10, scale: 2 }).notNull().default("0"),
    isFrozen: boolean("is_frozen").notNull().default(false),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    frozenBySystemUserId: integer("frozen_by_system_user_id").references((): any => systemUsers.id, { onDelete: "set null" }),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderIdIdx: uniqueIndex("rider_wallet_rider_id_idx").on(table.riderId),
    isFrozenIdx: index("rider_wallet_is_frozen_idx").on(table.isFrozen),
  })
);

/**
 * Rider wallet freeze history - audit of freeze/unfreeze
 */
export const riderWalletFreezeHistory = pgTable(
  "rider_wallet_freeze_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    performedBySystemUserId: integer("performed_by_system_user_id")
      .notNull()
      .references((): any => systemUsers.id, { onDelete: "set null" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_wallet_freeze_history_rider_id_idx").on(table.riderId),
    createdAtIdx: index("rider_wallet_freeze_history_created_at_idx").on(table.createdAt),
  })
);

/**
 * Rider negative wallet blocks - per service when balance <= threshold
 */
export const riderNegativeWalletBlocks = pgTable(
  "rider_negative_wallet_blocks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    serviceType: text("service_type").notNull(),
    reason: text("reason").notNull().default("negative_wallet"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_negative_wallet_blocks_rider_id_idx").on(table.riderId),
    riderServiceIdx: uniqueIndex("rider_negative_wallet_blocks_rider_service_idx").on(table.riderId, table.serviceType),
  })
);

/**
 * Wallet credit requests - agent-requested credits; approver approves/rejects
 */
export const walletCreditRequests = pgTable(
  "wallet_credit_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    serviceType: text("service_type"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key"),
    requestedBySystemUserId: integer("requested_by_system_user_id")
      .notNull()
      .references((): any => systemUsers.id, { onDelete: "cascade" }),
    requestedByEmail: text("requested_by_email"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBySystemUserId: integer("reviewed_by_system_user_id").references((): any => systemUsers.id, { onDelete: "set null" }),
    reviewedByEmail: text("reviewed_by_email"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    approvedLedgerRef: text("approved_ledger_ref").unique(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => ({
    riderStatusRequestedIdx: index("wallet_credit_requests_rider_status_requested_idx").on(table.riderId, table.status, table.requestedAt),
    statusRequestedIdx: index("wallet_credit_requests_status_requested_idx").on(table.status, table.requestedAt),
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

export const ratings = pgTable(
  "ratings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    orderId: integer("order_id").references(() => orders.id),
    fromType: ratingFromTypeEnum("from_type").notNull(),
    fromId: integer("from_id"),
    rating: smallint("rating").notNull(),
    comment: text("comment"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("ratings_rider_id_idx").on(table.riderId),
    orderIdIdx: index("ratings_order_id_idx").on(table.orderId),
    fromTypeIdx: index("ratings_from_type_idx").on(table.fromType),
    createdAtIdx: index("ratings_created_at_idx").on(table.createdAt),
  })
);

export const merchantStoreRatings = pgTable(
  "merchant_store_ratings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    storeId: bigserial("store_id", { mode: "number" }),
    orderId: bigserial("order_id", { mode: "number" }),
    customerId: bigserial("customer_id", { mode: "number" }),
    rating: smallint("rating").notNull(),
    foodRating: smallint("food_rating"),
    serviceRating: smallint("service_rating"),
    packagingRating: smallint("packaging_rating"),
    reviewText: text("review_text"),
    reviewTitle: text("review_title"),
    reviewImages: jsonb("review_images").$type<string[] | null>().default(null),
    helpfulCount: integer("helpful_count").default(0),
    notHelpfulCount: integer("not_helpful_count").default(0),
    merchantResponse: text("merchant_response"),
    merchantRespondedAt: timestamp("merchant_responded_at", {
      withTimezone: true,
    }),
    isVerified: boolean("is_verified").default(false),
    isFlagged: boolean("is_flagged").default(false),
    flagReason: text("flag_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    storeIdIdx: index("merchant_store_ratings_store_id_idx").on(table.storeId),
    orderIdIdx: index("merchant_store_ratings_order_id_idx").on(table.orderId),
    customerIdIdx: index("merchant_store_ratings_customer_id_idx").on(table.customerId),
    ratingIdx: index("merchant_store_ratings_rating_idx").on(table.rating),
    createdAtIdx: index("merchant_store_ratings_created_at_idx").on(table.createdAt),
    storeIdCreatedIdx: index("merchant_store_ratings_store_id_created_idx").on(
      table.storeId,
      table.createdAt
    ),
    merchantResponseIdx: index("merchant_store_ratings_merchant_response_idx").on(
      table.merchantRespondedAt
    ),
  })
);

export const customerRatingsGiven = pgTable(
  "customer_ratings_given",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: bigserial("customer_id", { mode: "number" }),
    orderId: bigserial("order_id", { mode: "number" }),
    // For now model service_type as a free-text column; when a dedicated
    // enum type is added we can switch this to that helper.
    serviceType: text("service_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: bigserial("target_id", { mode: "number" }),
    overallRating: smallint("overall_rating").notNull(),
    foodQualityRating: smallint("food_quality_rating"),
    deliveryRating: smallint("delivery_rating"),
    packagingRating: smallint("packaging_rating"),
    reviewTitle: text("review_title"),
    reviewText: text("review_text"),
    reviewImages: jsonb("review_images").$type<string[] | null>().default(null),
    reviewTags: jsonb("review_tags").$type<string[] | null>().default(null),
    helpfulCount: integer("helpful_count").default(0),
    notHelpfulCount: integer("not_helpful_count").default(0),
    merchantResponse: text("merchant_response"),
    merchantRespondedAt: timestamp("merchant_responded_at", {
      withTimezone: true,
    }),
    isVerified: boolean("is_verified").default(false),
    isFeatured: boolean("is_featured").default(false),
    isFlagged: boolean("is_flagged").default(false),
    flagReason: text("flag_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdIdx: index("customer_ratings_given_customer_id_idx").on(table.customerId),
    orderIdIdx: index("customer_ratings_given_order_id_idx").on(table.orderId),
    targetIdx: index("customer_ratings_given_target_idx").on(
      table.targetType,
      table.targetId
    ),
    serviceTypeIdx: index("customer_ratings_given_service_type_idx").on(
      table.serviceType
    ),
    overallRatingIdx: index("customer_ratings_given_overall_rating_idx").on(
      table.overallRating
    ),
    createdAtIdx: index("customer_ratings_given_created_at_idx").on(table.createdAt),
    targetMerchantIdx: index("customer_ratings_given_target_merchant_idx").on(
      table.targetType,
      table.targetId
    ),
    merchantResponseIdx: index("customer_ratings_given_merchant_response_idx").on(
      table.merchantRespondedAt
    ),
    isFlaggedIdx: index("customer_ratings_given_is_flagged_idx").on(table.isFlagged),
    merchantRatingIdx: index("customer_ratings_given_merchant_rating_idx").on(
      table.targetType,
      table.targetId,
      table.overallRating,
      table.createdAt
    ),
  })
);

// ============================================================================
// ENTERPRISE TICKET SYSTEM
// ============================================================================

/**
 * Ticket Groups - Flexible grouping system for future planning
 */
export const ticketGroups = pgTable(
  "ticket_groups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    groupCode: text("group_code").notNull().unique(),
    groupName: text("group_name").notNull(),
    groupDescription: text("group_description"),
    parentGroupId: integer("parent_group_id").references((): any => ticketGroups.id, {
      onDelete: "set null",
    }),
    groupLevel: integer("group_level").notNull().default(1),
    displayOrder: integer("display_order").default(0),
    serviceType: ticketServiceTypeEnum("service_type"),
    ticketSection: ticketSectionEnum("ticket_section"),
    ticketCategory: ticketCategoryEnum("ticket_category"),
    sourceRole: ticketSourceRoleEnum("source_role"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    groupCodeIdx: uniqueIndex("ticket_groups_group_code_idx").on(table.groupCode),
    parentGroupIdIdx: index("ticket_groups_parent_group_id_idx").on(table.parentGroupId),
    serviceSectionIdx: index("ticket_groups_service_section_idx").on(
      table.serviceType,
      table.ticketSection,
      table.isActive
    ),
    displayOrderIdx: index("ticket_groups_display_order_idx").on(table.displayOrder),
  })
);

/**
 * Ticket Titles - Dynamic catalog of ticket titles
 */
export const ticketTitles = pgTable(
  "ticket_titles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    groupId: integer("group_id").references(() => ticketGroups.id, {
      onDelete: "set null",
    }),
    serviceType: ticketServiceTypeEnum("service_type").notNull(),
    ticketSection: ticketSectionEnum("ticket_section").notNull(),
    sourceRole: ticketSourceRoleEnum("source_role").notNull(),
    titleCode: text("title_code").notNull().unique(),
    titleText: text("title_text").notNull(),
    description: text("description"),
    displayOrder: integer("display_order").default(0),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    groupIdIdx: index("ticket_titles_group_id_idx").on(table.groupId),
    serviceSectionSourceIdx: index("ticket_titles_service_section_source_idx").on(
      table.serviceType,
      table.ticketSection,
      table.sourceRole,
      table.isActive
    ),
    titleCodeIdx: uniqueIndex("ticket_titles_title_code_idx").on(table.titleCode),
    isActiveIdx: index("ticket_titles_is_active_idx").on(table.isActive),
    displayOrderIdx: index("ticket_titles_display_order_idx").on(table.displayOrder),
  })
);

/**
 * Enterprise Tickets - Main ticket table (replaces old tickets table)
 */
export const enterpriseTickets = pgTable(
  "tickets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketNumber: text("ticket_number").notNull().unique(),
    serviceType: ticketServiceTypeEnum("service_type").notNull(),
    ticketCategory: ticketCategoryEnum("ticket_category").notNull(),
    ticketSection: ticketSectionEnum("ticket_section").notNull(),
    sourceRole: ticketSourceRoleEnum("source_role").notNull(),
    titleId: integer("title_id").references(() => ticketTitles.id, {
      onDelete: "set null",
    }),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    status: enterpriseTicketStatusEnum("status").notNull().default("open"),
    priority: ticketPriorityEnum("priority").notNull().default("medium"),
    orderId: integer("order_id"), // FK to orders if exists
    orderServiceType: ticketServiceTypeEnum("order_service_type"),
    is3plOrder: boolean("is_3pl_order").default(false),
    tplProviderId: integer("tpl_provider_id"), // FK to tpl_providers if exists
    tplDirection: text("tpl_direction"), // 'inbound' or 'outbound'
    externalOrderId: text("external_order_id"), // External provider's order ID
    externalProviderName: text("external_provider_name"), // Name of external provider
    createdByUserId: integer("created_by_user_id"), // FK to system_users
    currentAssigneeUserId: integer("current_assignee_user_id"), // FK to system_users
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ticketNumberIdx: uniqueIndex("tickets_ticket_number_idx").on(table.ticketNumber),
    serviceStatusCreatedIdx: index("tickets_service_status_created_idx").on(
      table.serviceType,
      table.status,
      table.createdAt
    ),
    assigneeStatusIdx: index("tickets_assignee_status_idx").on(
      table.currentAssigneeUserId,
      table.status
    ),
    orderIdIdx: index("tickets_order_id_idx").on(table.orderId),
    statusPriorityCreatedIdx: index("tickets_status_priority_created_idx").on(
      table.status,
      table.priority,
      table.createdAt
    ),
    slaDueIdx: index("tickets_sla_due_idx").on(table.slaDueAt),
    createdAtIdx: index("tickets_created_at_idx").on(table.createdAt),
    titleIdIdx: index("tickets_title_id_idx").on(table.titleId),
    serviceTypeIdx: index("tickets_service_type_idx").on(table.serviceType),
    ticketSectionIdx: index("tickets_ticket_section_idx").on(table.ticketSection),
    sourceRoleIdx: index("tickets_source_role_idx").on(table.sourceRole),
    is3plOrderIdx: index("tickets_3pl_order_idx").on(table.is3plOrder, table.tplProviderId),
    externalOrderIdIdx: index("tickets_external_order_id_idx").on(table.externalOrderId),
  })
);

/**
 * Ticket Participants - Polymorphic actors in tickets
 */
export const ticketParticipants = pgTable(
  "ticket_participants",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => enterpriseTickets.id, { onDelete: "cascade" }),
    participantRole: ticketParticipantRoleEnum("participant_role").notNull(),
    entityType: ticketEntityTypeEnum("entity_type").notNull(),
    customerId: integer("customer_id"), // FK to customers if exists
    riderId: integer("rider_id"), // FK to riders if exists - internal riders
    rider3plId: text("rider_3pl_id"), // 3PL/external rider ID
    merchantId: integer("merchant_id"), // FK to merchant_stores if exists
    systemUserId: integer("system_user_id"), // FK to system_users
    providerId: integer("provider_id"), // FK to tpl_providers if exists
    externalProviderName: text("external_provider_name"), // Name of external provider
    externalEntityId: text("external_entity_id"), // External entity ID from provider
    externalEntityName: text("external_entity_name"), // External entity name for display
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ticketIdIdx: index("ticket_participants_ticket_id_idx").on(table.ticketId),
    customerIdIdx: index("ticket_participants_customer_id_idx").on(table.customerId),
    riderIdIdx: index("ticket_participants_rider_id_idx").on(table.riderId),
    merchantIdIdx: index("ticket_participants_merchant_id_idx").on(table.merchantId),
    entityTypeIdx: index("ticket_participants_entity_type_idx").on(
      table.entityType,
      table.participantRole
    ),
  })
);

/**
 * Ticket Assignments - Assignment history
 */
export const ticketAssignments = pgTable(
  "ticket_assignments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => enterpriseTickets.id, { onDelete: "cascade" }),
    assignedToUserId: integer("assigned_to_user_id").notNull(), // FK to system_users
    assignedByUserId: integer("assigned_by_user_id").notNull(), // FK to system_users
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
    reason: text("reason"),
  },
  (table) => ({
    ticketIdIdx: index("ticket_assignments_ticket_id_idx").on(
      table.ticketId,
      table.assignedAt
    ),
    assignedToIdx: index("ticket_assignments_assigned_to_idx").on(
      table.assignedToUserId,
      table.unassignedAt
    ),
    assignedByIdx: index("ticket_assignments_assigned_by_idx").on(table.assignedByUserId),
  })
);

/**
 * Ticket Messages - Conversation thread
 */
export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => enterpriseTickets.id, { onDelete: "cascade" }),
    senderType: ticketSenderTypeEnum("sender_type").notNull(),
    senderId: integer("sender_id"), // Polymorphic
    messageType: ticketMessageTypeEnum("message_type").notNull().default("reply"),
    message: text("message").notNull(),
    attachments: jsonb("attachments").default([]),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ticketIdIdx: index("ticket_messages_ticket_id_idx").on(
      table.ticketId,
      table.createdAt
    ),
    senderIdx: index("ticket_messages_sender_idx").on(table.senderType, table.senderId),
    messageTypeIdx: index("ticket_messages_message_type_idx").on(table.messageType),
    createdAtIdx: index("ticket_messages_created_at_idx").on(table.createdAt),
  })
);

/**
 * Ticket Status History - Status transitions
 */
export const ticketStatusHistory = pgTable(
  "ticket_status_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => enterpriseTickets.id, { onDelete: "cascade" }),
    oldStatus: enterpriseTicketStatusEnum("old_status").notNull(),
    newStatus: enterpriseTicketStatusEnum("new_status").notNull(),
    changedByUserId: integer("changed_by_user_id").notNull(), // FK to system_users
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ticketIdIdx: index("ticket_status_history_ticket_id_idx").on(
      table.ticketId,
      table.createdAt
    ),
    newStatusIdx: index("ticket_status_history_new_status_idx").on(
      table.newStatus,
      table.createdAt
    ),
    changedByIdx: index("ticket_status_history_changed_by_idx").on(table.changedByUserId),
  })
);

/**
 * Ticket Actions Audit - Immutable audit log
 */
export const ticketActionsAudit = pgTable(
  "ticket_actions_audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => enterpriseTickets.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    actorUserId: integer("actor_user_id"), // FK to system_users
    actorType: ticketEntityTypeEnum("actor_type"),
    actorId: integer("actor_id"), // Polymorphic
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ticketIdIdx: index("ticket_actions_audit_ticket_id_idx").on(
      table.ticketId,
      table.createdAt
    ),
    actionTypeIdx: index("ticket_actions_audit_action_type_idx").on(
      table.actionType,
      table.createdAt
    ),
    actorUserIdIdx: index("ticket_actions_audit_actor_user_id_idx").on(
      table.actorUserId,
      table.createdAt
    ),
    createdAtIdx: index("ticket_actions_audit_created_at_idx").on(table.createdAt),
  })
);

/**
 * Ticket Ratings - Post-resolution feedback
 */
export const ticketRatings = pgTable(
  "ticket_ratings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => enterpriseTickets.id, { onDelete: "cascade" }),
    ratedByType: ticketRatedByTypeEnum("rated_by_type").notNull(),
    ratedById: integer("rated_by_id").notNull(),
    ratingValue: smallint("rating_value").notNull(),
    feedbackText: text("feedback_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ticketIdIdx: index("ticket_ratings_ticket_id_idx").on(
      table.ticketId,
      table.ratedByType
    ),
    ratedByIdx: index("ticket_ratings_rated_by_idx").on(
      table.ratedByType,
      table.ratingValue,
      table.createdAt
    ),
    ratingValueIdx: index("ticket_ratings_rating_value_idx").on(
      table.ratingValue,
      table.createdAt
    ),
    uniquePerActor: uniqueIndex("ticket_ratings_unique_per_actor").on(
      table.ticketId,
      table.ratedByType,
      table.ratedById
    ),
  })
);

/**
 * Ticket Tags - Tag master
 */
export const ticketTags = pgTable(
  "ticket_tags",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tagCode: text("tag_code").notNull().unique(),
    tagName: text("tag_name").notNull(),
    tagDescription: text("tag_description"),
    tagColor: text("tag_color"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tagCodeIdx: uniqueIndex("ticket_tags_tag_code_idx").on(table.tagCode),
    isActiveIdx: index("ticket_tags_is_active_idx").on(table.isActive),
  })
);

/**
 * Ticket Tag Map - Many-to-many mapping
 */
export const ticketTagMap = pgTable(
  "ticket_tag_map",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => enterpriseTickets.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => ticketTags.id, { onDelete: "cascade" }),
    addedByUserId: integer("added_by_user_id").notNull(), // FK to system_users
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ticketIdIdx: index("ticket_tag_map_ticket_id_idx").on(table.ticketId),
    tagIdIdx: index("ticket_tag_map_tag_id_idx").on(table.tagId),
    addedByIdx: index("ticket_tag_map_added_by_idx").on(table.addedByUserId),
    uniqueMapping: uniqueIndex("ticket_tag_map_unique").on(table.ticketId, table.tagId),
  })
);

// Legacy tickets table (kept for backward compatibility - will be deprecated)
export const tickets = pgTable(
  "tickets_legacy",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    orderId: integer("order_id").references(() => orders.id),
    category: text("category").notNull(),
    priority: text("priority").notNull().default("medium"),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    assignedTo: integer("assigned_to"),
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
    riderIdIdx: index("tickets_legacy_rider_id_idx").on(table.riderId),
    statusIdx: index("tickets_legacy_status_idx").on(table.status),
    categoryIdx: index("tickets_legacy_category_idx").on(table.category),
    createdAtIdx: index("tickets_legacy_created_at_idx").on(table.createdAt),
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
  vehicles: many(riderVehicles),
  addresses: many(riderAddresses),
  dutyLogs: many(dutyLogs),
  locationLogs: many(locationLogs),
  blacklistHistory: many(blacklistHistory),
  penalties: many(riderPenalties),
  wallet: one(riderWallet),
  walletFreezeHistory: many(riderWalletFreezeHistory),
  negativeWalletBlocks: many(riderNegativeWalletBlocks),
  orders: many(orders),
  orderActions: many(orderActions),
  walletLedger: many(walletLedger),
  paymentMethods: many(riderPaymentMethods),
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

export const riderVehiclesRelations = relations(riderVehicles, ({ one }) => ({
  rider: one(riders, {
    fields: [riderVehicles.riderId],
    references: [riders.id],
  }),
}));

export const riderAddressesRelations = relations(riderAddresses, ({ one }) => ({
  rider: one(riders, {
    fields: [riderAddresses.riderId],
    references: [riders.id],
  }),
  city: one(cities, {
    fields: [riderAddresses.cityId],
    references: [cities.id],
  }),
}));

export const riderPenaltiesRelations = relations(riderPenalties, ({ one }) => ({
  rider: one(riders, {
    fields: [riderPenalties.riderId],
    references: [riders.id],
  }),
  order: one(orders, {
    fields: [riderPenalties.orderId],
    references: [orders.id],
  }),
}));

export const riderWalletRelations = relations(riderWallet, ({ one }) => ({
  rider: one(riders, {
    fields: [riderWallet.riderId],
    references: [riders.id],
  }),
}));

export const riderWalletFreezeHistoryRelations = relations(
  riderWalletFreezeHistory,
  ({ one }) => ({
    rider: one(riders, {
      fields: [riderWalletFreezeHistory.riderId],
      references: [riders.id],
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
    withdrawalRequests: many(withdrawalRequests),
  })
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  rider: one(riders, {
    fields: [orders.riderId],
    references: [riders.id],
  }),
  actions: many(orderActions),
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

export const withdrawalRequestsRelations = relations(withdrawalRequests, ({ one }) => ({
  rider: one(riders, {
    fields: [withdrawalRequests.riderId],
    references: [riders.id],
  }),
  paymentMethod: one(riderPaymentMethods, {
    fields: [withdrawalRequests.paymentMethodId],
    references: [riderPaymentMethods.id],
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

// ============================================================================
// ENTERPRISE TICKET SYSTEM RELATIONS
// ============================================================================

export const ticketGroupsRelations = relations(ticketGroups, ({ one, many }) => ({
  parentGroup: one(ticketGroups, {
    fields: [ticketGroups.parentGroupId],
    references: [ticketGroups.id],
    relationName: "parent",
  }),
  childGroups: many(ticketGroups, { relationName: "parent" }),
  titles: many(ticketTitles),
}));

export const ticketTitlesRelations = relations(ticketTitles, ({ one, many }) => ({
  group: one(ticketGroups, {
    fields: [ticketTitles.groupId],
    references: [ticketGroups.id],
  }),
  tickets: many(enterpriseTickets),
}));

export const enterpriseTicketsRelations = relations(
  enterpriseTickets,
  ({ one, many }) => ({
    title: one(ticketTitles, {
      fields: [enterpriseTickets.titleId],
      references: [ticketTitles.id],
    }),
    participants: many(ticketParticipants),
    assignments: many(ticketAssignments),
    messages: many(ticketMessages),
    statusHistory: many(ticketStatusHistory),
    auditLogs: many(ticketActionsAudit),
    ratings: many(ticketRatings),
    tagMappings: many(ticketTagMap),
  })
);

// ============================================================================
// AGENT ACTIVITY TRACKING
// ============================================================================

/**
 * Agent Profiles - Extended profile with online status and capacity
 */
export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references((): any => systemUsers.id, { onDelete: "cascade" }),
    maxConcurrentTickets: integer("max_concurrent_tickets").default(10),
    maxDailyTickets: integer("max_daily_tickets").default(50),
    skillTags: jsonb("skill_tags").default([]),
    supportedLanguages: jsonb("supported_languages").default(["en"]),
    availabilitySchedule: jsonb("availability_schedule").default({}),
    avgResolutionTimeMinutes: integer("avg_resolution_time_minutes"),
    avgFirstResponseTimeMinutes: integer("avg_first_response_time_minutes"),
    totalTicketsResolved: integer("total_tickets_resolved").default(0),
    csatAvgScore: numeric("csat_avg_score", { precision: 3, scale: 2 }),
    isOnline: boolean("is_online").default(false),
    lastOnlineAt: timestamp("last_online_at", { withTimezone: true }),
    currentStatus: text("current_status").default("offline"), // online, offline, break, busy
    breakStartedAt: timestamp("break_started_at", { withTimezone: true }),
    totalOnlineTimeMinutes: integer("total_online_time_minutes").default(0),
    totalBreakTimeMinutes: integer("total_break_time_minutes").default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("agent_profiles_user_id_idx").on(table.userId),
    isOnlineIdx: index("agent_profiles_is_online_idx").on(table.isOnline),
    currentStatusIdx: index("agent_profiles_current_status_idx").on(table.currentStatus),
    skillTagsIdx: index("agent_profiles_skill_tags_idx").on(table.skillTags),
  })
);

/**
 * Agent Availability Logs - History of status changes
 */
export const agentAvailabilityLogs = pgTable(
  "agent_availability_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agentUserId: integer("agent_user_id")
      .notNull()
      .references((): any => systemUsers.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // online, offline, away, busy, break
    previousStatus: text("previous_status"),
    reason: text("reason"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    durationMinutes: integer("duration_minutes"),
  },
  (table) => ({
    agentIdIdx: index("agent_availability_logs_agent_id_idx").on(
      table.agentUserId,
      table.changedAt
    ),
    statusIdx: index("agent_availability_logs_status_idx").on(
      table.status,
      table.changedAt
    ),
  })
);

/**
 * Agent Activity Logs - Daily aggregated activity metrics
 */
export const agentActivityLogs = pgTable(
  "agent_activity_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agentUserId: integer("agent_user_id")
      .notNull()
      .references((): any => systemUsers.id, { onDelete: "cascade" }),
    activityDate: date("activity_date").notNull().defaultNow(),
    onlineTimeMinutes: integer("online_time_minutes").default(0),
    breakTimeMinutes: integer("break_time_minutes").default(0),
    activeTimeMinutes: integer("active_time_minutes").default(0),
    ticketsAssigned: integer("tickets_assigned").default(0),
    ticketsResolved: integer("tickets_resolved").default(0),
    ticketsClosed: integer("tickets_closed").default(0),
    ticketsReopened: integer("tickets_reopened").default(0),
    ticketsUpdated: integer("tickets_updated").default(0),
    ticketsReplied: integer("tickets_replied").default(0),
    avgFirstResponseTimeMinutes: numeric("avg_first_response_time_minutes", {
      precision: 10,
      scale: 2,
    }),
    avgResolutionTimeMinutes: numeric("avg_resolution_time_minutes", {
      precision: 10,
      scale: 2,
    }),
    csatScore: numeric("csat_score", { precision: 3, scale: 2 }),
    dsatCount: integer("dsat_count").default(0),
    csatCount: integer("csat_count").default(0),
    serviceBreakdown: jsonb("service_breakdown").default({}),
    statusSummary: jsonb("status_summary").default({}),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("agent_activity_logs_agent_id_idx").on(
      table.agentUserId,
      table.activityDate
    ),
    activityDateIdx: index("agent_activity_logs_activity_date_idx").on(
      table.activityDate
    ),
    agentDateIdx: uniqueIndex("agent_activity_logs_agent_date_unique").on(
      table.agentUserId,
      table.activityDate
    ),
  })
);

/**
 * Agent Break Logs - Individual break sessions
 */
export const agentBreakLogs = pgTable(
  "agent_break_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agentUserId: integer("agent_user_id")
      .notNull()
      .references((): any => systemUsers.id, { onDelete: "cascade" }),
    breakType: text("break_type").default("other"), // lunch, tea, personal, other
    reason: text("reason"),
    breakStartedAt: timestamp("break_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    breakEndedAt: timestamp("break_ended_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    isActive: boolean("is_active").default(true),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentIdIdx: index("agent_break_logs_agent_id_idx").on(
      table.agentUserId,
      table.breakStartedAt
    ),
    activeIdx: index("agent_break_logs_active_idx").on(
      table.agentUserId,
      table.isActive
    ),
    dateIdx: index("agent_break_logs_date_idx").on(
      table.agentUserId,
      table.breakStartedAt
    ),
  })
);

export const ticketParticipantsRelations = relations(
  ticketParticipants,
  ({ one }) => ({
    ticket: one(enterpriseTickets, {
      fields: [ticketParticipants.ticketId],
      references: [enterpriseTickets.id],
    }),
  })
);

export const ticketAssignmentsRelations = relations(
  ticketAssignments,
  ({ one }) => ({
    ticket: one(enterpriseTickets, {
      fields: [ticketAssignments.ticketId],
      references: [enterpriseTickets.id],
    }),
  })
);

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(enterpriseTickets, {
    fields: [ticketMessages.ticketId],
    references: [enterpriseTickets.id],
  }),
}));

export const ticketStatusHistoryRelations = relations(
  ticketStatusHistory,
  ({ one }) => ({
    ticket: one(enterpriseTickets, {
      fields: [ticketStatusHistory.ticketId],
      references: [enterpriseTickets.id],
    }),
  })
);

export const ticketActionsAuditRelations = relations(
  ticketActionsAudit,
  ({ one }) => ({
    ticket: one(enterpriseTickets, {
      fields: [ticketActionsAudit.ticketId],
      references: [enterpriseTickets.id],
    }),
  })
);

export const ticketRatingsRelations = relations(ticketRatings, ({ one }) => ({
  ticket: one(enterpriseTickets, {
    fields: [ticketRatings.ticketId],
    references: [enterpriseTickets.id],
  }),
}));

export const ticketTagsRelations = relations(ticketTags, ({ many }) => ({
  tagMappings: many(ticketTagMap),
}));

export const ticketTagMapRelations = relations(ticketTagMap, ({ one }) => ({
  ticket: one(enterpriseTickets, {
    fields: [ticketTagMap.ticketId],
    references: [enterpriseTickets.id],
  }),
  tag: one(ticketTags, {
    fields: [ticketTagMap.tagId],
    references: [ticketTags.id],
  }),
}));

// ============================================================================
// AGENT ACTIVITY RELATIONS
// ============================================================================

export const agentProfilesRelations = relations(agentProfiles, ({ one }) => ({
  user: one(systemUsers, {
    fields: [agentProfiles.userId],
    references: [systemUsers.id],
  }),
}));

export const agentAvailabilityLogsRelations = relations(agentAvailabilityLogs, ({ one }) => ({
  agent: one(systemUsers, {
    fields: [agentAvailabilityLogs.agentUserId],
    references: [systemUsers.id],
  }),
}));

export const agentActivityLogsRelations = relations(agentActivityLogs, ({ one }) => ({
  agent: one(systemUsers, {
    fields: [agentActivityLogs.agentUserId],
    references: [systemUsers.id],
  }),
}));

export const agentBreakLogsRelations = relations(agentBreakLogs, ({ one }) => ({
  agent: one(systemUsers, {
    fields: [agentBreakLogs.agentUserId],
    references: [systemUsers.id],
  }),
}));
