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
import { relations, sql } from "drizzle-orm";

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
  "onboarding_vehicle_selection",
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
  "auto_verified",
  "expired",
  "consent_denied",
  "timeout",
]);

export const documentFileSideEnum = pgEnum("document_file_side", [
  "front",
  "back",
  "single",
]);

export const riderPayoutMethodTypeEnum = pgEnum("rider_payout_method_type", [
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
  "CASHFREE_AUTO",
  "CASHFREE_ASSISTED",
  "CASHFREE_MANUAL_FALLBACK",
  "RAZORPAY_BANK",
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
  "reached_user",
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
  "reached_user",
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
  "subscription_fee",
  // Present in the DB enum (migration 0318) but previously omitted from this
  // definition — riders' manual credits / withdrawal reverts / cancellation payouts.
  "manual_add",
  "failed_withdrawal_revert",
  "cancellation_payout",
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
    /** Per-step onboarding progress map (aadhaar/face/pan/vehicle/payment/approval). */
    onboardingProgress: jsonb("onboarding_progress").notNull().default({}),
    lastCompletedStep: text("last_completed_step"),
    nextRequiredStep: text("next_required_step"),
    onboardingProgressPct: integer("onboarding_progress_pct").notNull().default(0),
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
    /** Up to 2 personal SOS contacts: [{ label, phone }] */
    emergencyContacts: jsonb("emergency_contacts").notNull().default([]),
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
// Customers table (public.customers) â€“ customer app auth & profile
// Enums and table match DDL; use this for customer OTP verify and /me/profile
// ---------------------------------------------------------------------------
export const customerGenderEnum = pgEnum("customer_gender", ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]);
export const customerHearingAccessibilityEnum = pgEnum("customer_hearing_accessibility", [
  "deaf",
  "hard_of_hearing",
  "none",
]);
export const customerVisionAccessibilityEnum = pgEnum("customer_vision_accessibility", [
  "blind",
  "visual_impairment",
  "none",
]);
export const customerMobilityAccessibilityEnum = pgEnum("customer_mobility_accessibility", [
  "wheelchair_or_mobility_aid",
  "physical_disability_mobility",
  "none",
]);
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
    trustScore: numeric("trust_score", { precision: 5, scale: 2 }).default("5.0"),
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
    // App profile/onboarding (add via migration 0065 if your DDL doesnâ€™t have these)
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
    gmitraPlusActive: boolean("gmitra_plus_active").notNull().default(false),
    hearingAccessibility: customerHearingAccessibilityEnum("hearing_accessibility")
      .notNull()
      .default("none"),
    visionAccessibility: customerVisionAccessibilityEnum("vision_accessibility")
      .notNull()
      .default("none"),
    mobilityAccessibility: customerMobilityAccessibilityEnum("mobility_accessibility")
      .notNull()
      .default("none"),
    legalConsentPackVersion: text("legal_consent_pack_version"),
    legalConsentAt: timestamp("legal_consent_at", { withTimezone: true }),
  },
  (table) => ({
    customerIdIdx: index("customers_customer_id_idx").on(table.customerId),
    primaryMobileIdx: index("customers_primary_mobile_idx").on(table.primaryMobile),
    emailIdx: index("customers_email_idx").on(table.email),
    accountStatusIdx: index("customers_account_status_idx").on(table.accountStatus),
  })
);

/**
 * Account deletion requests — review queue for customer-initiated account
 * closure. The customer raises a request from the app with a reason; the
 * account is deactivated and retained (identity/documents/number kept per
 * Indian law), and ops reviews each row before final closure. See
 * Account Deletion & Closure Policy.
 */
export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    customerId: text("customer_id").notNull(),
    phoneE164: text("phone_e164"),
    reasonCode: text("reason_code").notNull().default("other"),
    reasonText: text("reason_text"),
    // pending_review | approved | rejected | completed
    status: text("status").notNull().default("pending_review"),
    // app | web
    source: text("source").notNull().default("app"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index("account_deletion_requests_customer_idx").on(table.customerId),
    statusIdx: index("account_deletion_requests_status_idx").on(table.status),
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
    deliveryInstructionsList: jsonb("delivery_instructions_list")
      .notNull()
      .$type<string[]>()
      .default([]),
    deliveryDoorImageUrl: text("delivery_door_image_url"),
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

/** Cached OpenWeather snapshot per serviceable zone (~1.1 km grid). */
/** Frozen weather at order placement — never updated after insert. */
export const orderWeatherSnapshots = pgTable(
  "order_weather_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderCoreId: bigint("order_core_id", { mode: "number" }).notNull().unique(),
    orderId: text("order_id").notNull(),
    weatherCondition: text("weather_condition").notNull(),
    weatherSeverity: text("weather_severity").notNull(),
    rainDetected: boolean("rain_detected").notNull().default(false),
    rainIntensityMm: numeric("rain_intensity_mm", { precision: 8, scale: 3 }).notNull().default("0"),
    temperatureC: numeric("temperature_c", { precision: 5, scale: 2 }),
    weatherDelayMinutes: integer("weather_delay_minutes").notNull().default(0),
    zoneName: text("zone_name"),
    zoneKey: text("zone_key"),
    city: text("city"),
    dispatchPriorityBoost: integer("dispatch_priority_boost").notNull().default(0),
    surgeEligible: boolean("surge_eligible").notNull().default(false),
    weatherPriorityBoost: boolean("weather_priority_boost").notNull().default(false),
    weatherDispatchWeight: integer("weather_dispatch_weight").notNull().default(0),
    snapshotTimestamp: timestamp("snapshot_timestamp", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("order_weather_snapshots_order_id_idx").on(table.orderId),
    index("order_weather_snapshots_zone_key_idx").on(table.zoneKey),
    index("order_weather_snapshots_snapshot_ts_idx").on(table.snapshotTimestamp),
  ]
);

export const zoneWeatherSnapshots = pgTable(
  "zone_weather_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    zoneKey: text("zone_key").notNull().unique(),
    city: text("city").notNull(),
    zone: text("zone").notNull(),
    latitude: numeric("latitude", { precision: 10, scale: 6 }).notNull(),
    longitude: numeric("longitude", { precision: 11, scale: 6 }).notNull(),
    weatherCondition: text("weather_condition").notNull().default("Clear"),
    rainDetected: boolean("rain_detected").notNull().default(false),
    rainIntensityMm: numeric("rain_intensity_mm", { precision: 8, scale: 3 }).notNull().default("0"),
    temperatureC: numeric("temperature_c", { precision: 5, scale: 2 }),
    humidityPct: numeric("humidity_pct", { precision: 5, scale: 2 }),
    windSpeedKmh: numeric("wind_speed_kmh", { precision: 6, scale: 2 }),
    weatherSeverity: text("weather_severity").notNull().default("CLEAR"),
    providerPayload: jsonb("provider_payload"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("zone_weather_snapshots_city_idx").on(table.city),
    index("zone_weather_snapshots_updated_at_idx").on(table.updatedAt),
    index("zone_weather_snapshots_severity_idx").on(table.weatherSeverity),
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
  /** Explicit saved-address selection; null when browsing on live GPS / map pin only. */
  addressId: bigint("address_id", { mode: "number" }).references(() => customerAddresses.id, {
    onDelete: "set null",
  }),
  lockedForOrder: boolean("locked_for_order").default(false),
  orderId: bigint("order_id", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/** Self-learning delivery locations (orders + manual); powers local search fallback and cityâ†’area suggestions. */
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
    lastVerificationId: text("last_verification_id"),
    lastProviderReference: text("last_provider_reference"),
    extractedDataSummary: jsonb("extracted_data_summary").notNull().default({}),
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
    /** TEXT or fuel_type enum in production — app layer resolves the stored label. */
    fuelType: text("fuel_type"),
    vehicleCategory: text("vehicle_category"),
    vehicleNumber: text("vehicle_number"),
    isCommercial: boolean("is_commercial").notNull().default(false),
    registrationNumber: text("registration_number").notNull(),
    registrationState: text("registration_state"),
    insuranceExpiry: date("insurance_expiry"),
    permitExpiry: date("permit_expiry"),
    /** DB column is TEXT in production (see dashboard 0083); not the vehicle_active_status enum type. */
    vehicleActiveStatus: text("vehicle_active_status").notNull().default("active"),
    ownershipType: text("ownership_type"), // ownership | rental | authorization_letter (from ownership_type enum or config)
    limitationFlags: jsonb("limitation_flags").default({}),
    serviceTypes: jsonb("service_types").default([]),
    seatingCapacity: integer("seating_capacity"),
    acType: acTypeEnum("ac_type"),
    make: text("make"),
    model: text("model"),
    year: integer("year"),
    color: text("color"),
    rcDocumentUrl: text("rc_document_url"),
    insuranceDocumentUrl: text("insurance_document_url"),
    /** Cashfree RC chassis / engine / fitness / PUC + owner (vehicle ownership). */
    chassisNumber: text("chassis_number"),
    engineNumber: text("engine_number"),
    fitnessExpiry: date("fitness_expiry"),
    pucExpiry: date("puc_expiry"),
    rcOwnerName: text("rc_owner_name"),
    cashfreeRcPayload: jsonb("cashfree_rc_payload").notNull().default({}),
    verified: boolean("verified").default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: integer("verified_by"),
    isActive: boolean("is_active").default(true),
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
    isActiveIdx: index("rider_vehicles_is_active_idx").on(table.isActive),
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
 * Rider onboarding vehicle categories — 2 / 3 / 4 wheeler groups.
 */
export const riderOnboardingVehicleCategories = pgTable(
  "rider_onboarding_vehicle_categories",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    hint: text("hint"),
    icon: text("icon"),
    wheelCount: integer("wheel_count").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUq: uniqueIndex("rider_onboarding_vehicle_categories_code_uq").on(table.code),
    sortIdx: index("rider_onboarding_vehicle_categories_sort_idx").on(table.sortOrder, table.id),
  })
);

/**
 * Super-admin: which dispatch services each vehicle category may receive offers for.
 */
export const riderVehicleCategoryServiceAssignments = pgTable(
  "rider_vehicle_category_service_assignments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    categoryCode: text("category_code")
      .notNull()
      .references((): any => riderOnboardingVehicleCategories.code, { onDelete: "cascade" }),
    serviceType: text("service_type").notNull(),
    isAssigned: boolean("is_assigned").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryServiceUq: uniqueIndex("rider_vcsa_category_service_uq").on(
      table.categoryCode,
      table.serviceType
    ),
    categoryIdx: index("rider_vcsa_category_idx").on(table.categoryCode),
  })
);

/**
 * Rider onboarding vehicle types — super-admin catalog for operating vehicle selection UI.
 */
export const riderOnboardingVehicleTypes = pgTable(
  "rider_onboarding_vehicle_types",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull(),
    categoryCode: text("category_code"),
    label: text("label").notNull(),
    hint: text("hint"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    onboardingFlow: text("onboarding_flow").notNull().default("dl_rc"),
    documentRequirements: jsonb("document_requirements").notNull().default({}),
    infoMessage: text("info_message"),
    mapsToVehicleType: text("maps_to_vehicle_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUq: uniqueIndex("rider_onboarding_vehicle_types_code_uq").on(table.code),
    sortIdx: index("rider_onboarding_vehicle_types_sort_idx").on(table.sortOrder, table.id),
    categoryIdx: index("rider_onboarding_vehicle_types_category_idx").on(
      table.categoryCode,
      table.sortOrder,
      table.id
    ),
  })
);

/**
 * Super-admin: per onboarding vehicle type → dispatch service (granular vs category).
 */
export const riderOnboardingVehicleTypeServiceAssignments = pgTable(
  "rider_onboarding_vehicle_type_service_assignments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    vehicleTypeCode: text("vehicle_type_code")
      .notNull()
      .references((): any => riderOnboardingVehicleTypes.code, { onDelete: "cascade" }),
    serviceType: text("service_type").notNull(),
    isAssigned: boolean("is_assigned").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    vehicleServiceUq: uniqueIndex("rider_ovtsa_vehicle_service_uq").on(
      table.vehicleTypeCode,
      table.serviceType
    ),
    vehicleIdx: index("rider_ovtsa_vehicle_idx").on(table.vehicleTypeCode),
  })
);

export const riderOnboardingDocumentTypes = pgTable(
  "rider_onboarding_document_types",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    hint: text("hint"),
    icon: text("icon"),
    captureGroup: text("capture_group").notNull().default("dl_rc"),
    requiresTextField: boolean("requires_text_field").notNull().default(false),
    textFieldLabel: text("text_field_label"),
    textFieldPlaceholder: text("text_field_placeholder"),
    minTextLength: integer("min_text_length").notNull().default(4),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUq: uniqueIndex("rider_onboarding_document_types_code_uq").on(table.code),
    sortIdx: index("rider_onboarding_document_types_sort_idx").on(
      table.captureGroup,
      table.sortOrder,
      table.id
    ),
  })
);

/**
 * Rider onboarding fee config — super-admin singleton for rider app payment screen.
 */
export const riderOnboardingCommissionConfig = pgTable(
  "rider_onboarding_commission_config",
  {
    id: smallint("id").primaryKey().default(1),
    standardOnboardingFee: numeric("standard_onboarding_fee", { precision: 12, scale: 2 }).notNull(),
    discountedOnboardingFee: numeric("discounted_onboarding_fee", { precision: 12, scale: 2 }).notNull(),
    discountPercent: numeric("discount_percent", { precision: 6, scale: 2 }).notNull(),
    gstPercent: numeric("gst_percent", { precision: 6, scale: 2 }).notNull().default("18"),
    discountPeriodLabel: text("discount_period_label").notNull().default("for limited time"),
    headline: text("headline").notNull().default("Onboarding Fee"),
    subtitle: text("subtitle").notNull(),
    feeLabel: text("fee_label").notNull().default("One-time onboarding fee"),
    infoMessage: text("info_message").notNull(),
    alertNotice: text("alert_notice").notNull(),
    footerNote: text("footer_note").notNull(),
    payButtonText: text("pay_button_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
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
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    sessionId: text("session_id"),
    deviceId: text("device_id"),
    metadata: jsonb("metadata").default({}),
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

/** Rider app logout events with self-reported reason */
export const riderLogoutEvents = pgTable(
  "rider_logout_events",
  {
    id: text("id").primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    deviceId: text("device_id"),
    reasonCode: text("reason_code").notNull(),
    reasonText: text("reason_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_logout_events_rider_id_idx").on(table.riderId),
    reasonCodeIdx: index("rider_logout_events_reason_code_idx").on(table.reasonCode),
    createdAtIdx: index("rider_logout_events_created_at_idx").on(table.createdAt),
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
    tsMs: bigint("ts_ms", { mode: "number" }).notNull(),
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
    userDeviceTsIdx: index("rider_location_events_user_device_ts_idx").on(
      table.userId,
      table.deviceId,
      table.tsMs
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
    /** First-mile allowance (rupees) snapshotted at accept; paid on delivery. 0 until rate configured. */
    riderPrePickupAllowance: numeric("rider_pre_pickup_allowance", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    riderPickupDistanceMeters: integer("rider_pickup_distance_meters"),
    status: orderStatusTypeEnum("status").notNull().default("assigned"),
    currentStatus: text("current_status"),
    itemTotal: numeric("item_total", { precision: 12, scale: 2 }),
    addonTotal: numeric("addon_total", { precision: 12, scale: 2 }),
    grandTotal: numeric("grand_total", { precision: 12, scale: 2 }),
    tipAmount: numeric("tip_amount", { precision: 12, scale: 2 }),
    donationAmount: numeric("donation_amount", { precision: 12, scale: 2 }),
    placedAt: timestamp("placed_at", { withTimezone: true }),
    paymentStatus: paymentStatusTypeEnum("payment_status"),
    paymentMethod: paymentModeTypeEnum("payment_method"),
    /** 'delivery' = standard courier delivery, 'self_pickup' = customer collects from store (delivery fee waived). */
    deliveryType: text("delivery_type").notNull().default("delivery"),
    riskFlagged: boolean("risk_flagged").notNull().default(false),
    riskReason: text("risk_reason"),
    isBulkOrder: boolean("is_bulk_order").notNull().default(false),
    bulkOrderGroupId: text("bulk_order_group_id"),
    cancellationReasonId: bigint("cancellation_reason_id", { mode: "number" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelledById: bigint("cancelled_by_id", { mode: "number" }),
    /** Admin cancelled rider only — block auto dispatch until manual assign. */
    dispatchManualHold: boolean("dispatch_manual_hold").notNull().default(false),
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
    handedOverToRiderAt: timestamp("handed_over_to_rider_at", { withTimezone: true }),
    riderPickedUpAt: timestamp("rider_picked_up_at", { withTimezone: true }),
    items: jsonb("items"),
    /** leaveAtDoor, notes, subscriptionOptIn mirror; billing remains in billing_snapshot. */
    checkoutMetadata: jsonb("checkout_metadata"),
    deliveryLatitude: numeric("delivery_latitude", { precision: 10, scale: 7 }),
    deliveryLongitude: numeric("delivery_longitude", { precision: 10, scale: 7 }),
    deliveryAddress: text("delivery_address"),
    /** Full billing engine snapshot at checkout (copied from pending_orders on finalize). */
    billingSnapshot: jsonb("billing_snapshot"),
    /**
     * Standard/gross delivery fare (pre-subsidy) — the Rider Fare Engine's % base,
     * independent of the customer delivery fee. Kept in sync with
     * billing_snapshot.delivery_fee_gross by a DB trigger (migration 0440).
     */
    deliveryFeeGross: numeric("delivery_fee_gross", { precision: 10, scale: 2 }),
    /** Platform-absorbed delivery subsidy = delivery_fee_gross − net delivery fee. Never reduces rider payout. */
    deliverySubsidy: numeric("delivery_subsidy", { precision: 10, scale: 2 }),
    /** Merchant-funded cart/precision discount (₹, CTM scale) frozen at placement. */
    merchantPrecisionDiscount: numeric("merchant_precision_discount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    billingRulesetVersion: integer("billing_ruleset_version"),
    formattedOrderId: text("formatted_order_id"),
    pickupOtp: text("pickup_otp"),
    deliveryOtp: text("delivery_otp"),
    rtoOtp: text("rto_otp"),
    deliveryInstructionsList: jsonb("delivery_instructions_list").notNull().default([]),
    merchantInstructionsList: jsonb("merchant_instructions_list").notNull().default([]),
    /** Customer help — alternate receiver contact for this order only. */
    alternateContactName: text("alternate_contact_name"),
    alternateContactPhone: text("alternate_contact_phone"),
    alternateContactSetAt: timestamp("alternate_contact_set_at", { withTimezone: true }),
    deliveryPrimaryContactName: text("delivery_primary_contact_name"),
    deliveryPrimaryContactPhone: text("delivery_primary_contact_phone"),
    isScheduledOrder: boolean("is_scheduled_order").notNull().default(false),
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
    /** Per-line customer cooking / special instructions (merchant-facing only). */
    specialInstructions: text("special_instructions"),
    /** Offer Engine v2 — false when MRP / Boost / BOGO already on the line. */
    isDiscountEligible: boolean("is_discount_eligible"),
    /** Customer-visible unit price after store item offers (null = legacy). */
    effectiveUnitPrice: numeric("effective_unit_price", { precision: 12, scale: 2 }),
    /** Customer-visible line total after store item offers. */
    effectiveLineTotal: numeric("effective_line_total", { precision: 12, scale: 2 }),
    offerDiscountAmount: numeric("offer_discount_amount", { precision: 12, scale: 2 }),
    appliedOfferId: bigint("applied_offer_id", { mode: "number" }),
    appliedOfferLabel: text("applied_offer_label"),
    appliedOfferType: text("applied_offer_type"),
    ineligibilityReason: text("ineligibility_reason"),
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
    menuAddonId: text("menu_addon_id"),
    customizationId: text("customization_id"),
    menuAddonPk: bigint("menu_addon_pk", { mode: "number" }),
    addonName: text("addon_name"),
    addonPrice: numeric("addon_price", { precision: 12, scale: 2 }),
    quantity: integer("quantity").default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orderItemIdIdx: index("orders_core_item_addons_order_item_id_idx").on(table.orderItemId),
  })
);

export const orderItemAddonCommissionSnapshots = pgTable(
  "order_item_addon_commission_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    orderItemId: bigint("order_item_id", { mode: "number" })
      .notNull()
      .references(() => ordersCoreItems.id, { onDelete: "cascade" }),
    orderItemAddonId: bigint("order_item_addon_id", { mode: "number" })
      .notNull()
      .references(() => ordersCoreItemAddons.id, { onDelete: "cascade" }),
    storeId: bigint("store_id", { mode: "number" }).notNull(),
    menuAddonId: text("menu_addon_id").notNull(),
    customizationId: text("customization_id"),
    menuAddonPk: bigint("menu_addon_pk", { mode: "number" }),
    addonName: text("addon_name"),
    quantity: integer("quantity").notNull().default(1),
    merchantBasePrice: numeric("merchant_base_price", { precision: 12, scale: 2 }).notNull(),
    commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).notNull(),
    customerVisiblePrice: numeric("customer_visible_price", { precision: 12, scale: 2 }).notNull(),
    platformEarning: numeric("platform_earning", { precision: 12, scale: 2 }).notNull(),
    sourceRuleKind: text("source_rule_kind").notNull(),
    sourceRuleId: bigint("source_rule_id", { mode: "number" }),
    sourcePlanId: bigint("source_plan_id", { mode: "number" }),
    sourceSubscriptionId: bigint("source_subscription_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orderIdx: index("idx_oiacs_order").on(table.orderId),
    orderItemIdx: index("idx_oiacs_order_item").on(table.orderItemId),
  })
);

/** Immutable Merchant CTM line pricing — SSOT for merchant-facing order screens. */
export const merchantCtmPricingSnapshot = pgTable(
  "merchant_ctm_pricing_snapshot",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    coreOrderId: bigint("core_order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    orderItemId: bigint("order_item_id", { mode: "number" })
      .notNull()
      .references(() => ordersCoreItems.id, { onDelete: "cascade" }),
    menuItemId: bigint("menu_item_id", { mode: "number" }),
    grossValue: numeric("gross_value", { precision: 12, scale: 2 }).notNull(),
    merchantOfferType: text("merchant_offer_type").notNull().default("NONE"),
    merchantOfferName: text("merchant_offer_name"),
    merchantOfferDiscount: numeric("merchant_offer_discount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    netCtmValue: numeric("net_ctm_value", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    coreOrderIdx: index("idx_merchant_ctm_core_order").on(table.coreOrderId),
    orderItemUid: uniqueIndex("merchant_ctm_pricing_snapshot_order_item_uid").on(table.orderItemId),
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
// BILLING (rule engine: pricing rules, tax, coupons, merchant overrides)
// ============================================================================

export const billingRuleTypeEnum = pgEnum("billing_rule_type", [
  "DISCOUNT",
  "OFFER",
  "DELIVERY",
  "PLATFORM_FEE",
  "TAX",
  "PACKAGING",
  "SURGE",
  "FEE",
  "SUBSCRIPTION",
  "DONATION",
  /** Customer rider tip from checkout; amount from `tipAmount`, not rule value. */
  "RIDER_TIP",
  "OTHER",
  "SMALL_ORDER_FEE",
  "CONVENIENCE_FEE",
]);

export const billingOfferOwnerEnum = pgEnum("billing_offer_owner", [
  "GATIMITRA",
  "MERCHANT",
  "OTHER",
]);

export const billingCalculationTypeEnum = pgEnum("billing_calculation_type", [
  "FIXED",
  "PERCENTAGE",
  "FORMULA_KEY",
]);

export const billingAppliesToEnum = pgEnum("billing_applies_to", ["ORDER", "ITEM", "DELIVERY"]);

export const billingConditionTypeEnum = pgEnum("billing_condition_type", [
  "ORDER_VALUE",
  "DISTANCE_KM",
  "TIME_WINDOW",
  "MERCHANT_ID",
  "MERCHANT_STORE_ID",
  "ITEM_CATEGORY",
  "USER_TYPE",
]);

export const billingConditionOperatorEnum = pgEnum("billing_condition_operator", [
  "GT",
  "GTE",
  "LT",
  "LTE",
  "EQ",
  "NEQ",
  "BETWEEN",
]);

export const billingTaxApplicableBaseEnum = pgEnum("billing_tax_applicable_base", [
  "ITEM_SUBTOTAL",
  "AFTER_DISCOUNTS",
  "ITEM_AFTER_DISCOUNT",
  "DELIVERY_FEE",
  "PLATFORM_FEE",
  "PACKAGING_FEE",
  "SURGE_FEE",
  "SMALL_ORDER_FEE",
  "CONVENIENCE_FEE",
  "GRAND_BEFORE_TAX",
]);

export const billingDiscountAppliesOnEnum = pgEnum("billing_discount_applies_on", [
  "ITEMS_TOTAL",
  "SUBTOTAL",
  "DELIVERY_FEE",
  "PLATFORM_FEE",
  "PACKAGING_FEE",
]);

export const billingTaxGroupEnum = pgEnum("billing_tax_group", [
  "item",
  "delivery",
  "platform",
  "packaging",
  "surge",
  "fee",
  "other",
]);

export const billingDiscountTypeEnum = pgEnum("billing_discount_type", ["FIXED", "PERCENTAGE"]);

export const billingRulesetVersion = pgTable("billing_ruleset_version", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingPricingRules = pgTable(
  "billing_pricing_rules",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name"),
    type: billingRuleTypeEnum("type").notNull(),
    calculationType: billingCalculationTypeEnum("calculation_type").notNull(),
    valueNumeric: numeric("value_numeric", { precision: 14, scale: 4 }),
    valueJson: jsonb("value_json"),
    priority: integer("priority").notNull().default(100),
    /** Global execution order (rules + TAX slabs). Engine sorts by this, not unique `priority`. */
    chargeOrderKey: bigint("charge_order_key", { mode: "number" }).notNull().default(100000),
    isActive: boolean("is_active").notNull().default(true),
    stackable: boolean("stackable").notNull().default(true),
    appliesTo: billingAppliesToEnum("applies_to").notNull().default("ORDER"),
    offerOwner: billingOfferOwnerEnum("offer_owner").notNull().default("GATIMITRA"),
    isHidden: boolean("is_hidden").notNull().default(false),
    metadata: jsonb("metadata"),
    serviceType: text("service_type").notNull().default("FOOD"),
    /** For DISCOUNT/OFFER: which base is reduced (charges applied before discounts). */
    discountAppliesOn: billingDiscountAppliesOnEnum("discount_applies_on").notNull().default("ITEMS_TOTAL"),
    chargeSubtype: text("charge_subtype"),
    /** When type=TAX, points at billing_tax_configs (formula). Slab priority/active/hidden live on this row. */
    taxConfigId: bigint("tax_config_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chargeOrderKeyIdx: index("billing_pricing_rules_charge_order_key_idx").on(table.chargeOrderKey),
    activePriorityIdx: index("billing_pricing_rules_active_priority_idx").on(table.isActive, table.priority),
    typeActiveIdx: index("billing_pricing_rules_type_active_idx").on(table.type, table.isActive),
    serviceActiveIdx: index("billing_pricing_rules_service_active_idx").on(table.serviceType, table.isActive),
    taxConfigIdIdx: index("billing_pricing_rules_tax_config_id_idx").on(table.taxConfigId),
  })
);

export const billingPricingRuleConditions = pgTable(
  "billing_pricing_rule_conditions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ruleId: bigint("rule_id", { mode: "number" })
      .notNull()
      .references(() => billingPricingRules.id, { onDelete: "cascade" }),
    conditionType: billingConditionTypeEnum("condition_type").notNull(),
    operator: billingConditionOperatorEnum("operator").notNull(),
    valueMin: numeric("value_min", { precision: 14, scale: 4 }),
    valueMax: numeric("value_max", { precision: 14, scale: 4 }),
    valueText: text("value_text"),
    valueJson: jsonb("value_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ruleIdIdx: index("billing_pricing_rule_conditions_rule_id_idx").on(table.ruleId),
  })
);

export const billingDeliverySlabs = pgTable(
  "billing_delivery_slabs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name"),
    minKm: numeric("min_km", { precision: 10, scale: 2 }),
    maxKm: numeric("max_km", { precision: 10, scale: 2 }),
    feeFixed: numeric("fee_fixed", { precision: 14, scale: 4 }).notNull().default("0"),
    feePerKm: numeric("fee_per_km", { precision: 14, scale: 4 }).notNull().default("0"),
    scopeType: text("scope_type").notNull().default("global"),
    scopeId: bigint("scope_id", { mode: "number" }),
    metadata: jsonb("metadata"),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeActivePriorityIdx: index("billing_delivery_slabs_scope_active_priority_idx").on(
      table.scopeType,
      table.scopeId,
      table.isActive,
      table.priority
    ),
  })
);

export const billingPackagingSlabs = pgTable(
  "billing_packaging_slabs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name"),
    minCart: numeric("min_cart", { precision: 14, scale: 4 }),
    maxCart: numeric("max_cart", { precision: 14, scale: 4 }),
    feeFixed: numeric("fee_fixed", { precision: 14, scale: 4 }).notNull().default("0"),
    feePerAddonQty: numeric("fee_per_addon_qty", { precision: 14, scale: 4 }).notNull().default("0"),
    scopeType: text("scope_type").notNull().default("global"),
    scopeId: bigint("scope_id", { mode: "number" }),
    metadata: jsonb("metadata"),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeActivePriorityIdx: index("billing_packaging_slabs_scope_active_priority_idx").on(
      table.scopeType,
      table.scopeId,
      table.isActive,
      table.priority
    ),
  })
);

export const billingTaxConfigs = pgTable(
  "billing_tax_configs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    rate: numeric("rate", { precision: 10, scale: 6 }).notNull(),
    applicableBase: billingTaxApplicableBaseEnum("applicable_base").notNull(),
    taxGroup: billingTaxGroupEnum("tax_group"),
    metadata: jsonb("metadata"),
    serviceType: text("service_type").notNull().default("FOOD"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => ({})
);

export const billingDiscounts = pgTable("billing_discounts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  code: text("code").notNull(),
  discountType: billingDiscountTypeEnum("discount_type").notNull(),
  valueNumeric: numeric("value_numeric", { precision: 14, scale: 4 }),
  maxDiscountCap: numeric("max_discount_cap", { precision: 14, scale: 4 }),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  pricingRuleId: bigint("pricing_rule_id", { mode: "number" }).references(() => billingPricingRules.id, {
    onDelete: "set null",
  }),
  metadata: jsonb("metadata"),
  isActive: boolean("is_active").notNull().default(true),
  isHidden: boolean("is_hidden").notNull().default(false),
  serviceType: text("service_type").notNull().default("FOOD"),
  /** CUSTOMER | MERCHANT | RIDER — must match checkout actor for coupon to apply. */
  offerAudience: text("offer_audience").notNull().default("CUSTOMER"),
  /** Max redemptions per actor; null = unlimited per user (total cap is usage_limit). */
  perUserUsageLimit: integer("per_user_usage_limit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingDeliveryRateCards = pgTable(
  "billing_delivery_rate_cards",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name"),
    serviceType: text("service_type").notNull().default("FOOD"),
    cityName: text("city_name"),
    timeSlot: text("time_slot"),
    baseFare: numeric("base_fare", { precision: 14, scale: 4 }).notNull().default("0"),
    perKmRate: numeric("per_km_rate", { precision: 14, scale: 4 }).notNull().default("0"),
    surgeMultiplier: numeric("surge_multiplier", { precision: 10, scale: 4 }).notNull().default("1"),
    minKm: numeric("min_km", { precision: 10, scale: 2 }),
    maxKm: numeric("max_km", { precision: 10, scale: 2 }),
    freeDeliveryAbove: numeric("free_delivery_above", { precision: 14, scale: 4 }),
    scopeType: text("scope_type").notNull().default("global"),
    scopeId: bigint("scope_id", { mode: "number" }),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    lookupIdx: index("billing_delivery_rate_cards_lookup_idx").on(table.serviceType, table.isActive, table.priority),
  })
);

export const billingPlatformOffers = pgTable(
  "billing_platform_offers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name"),
    serviceType: text("service_type").notNull().default("FOOD"),
    discountType: text("discount_type").notNull().default("PERCENTAGE"),
    valueNumeric: numeric("value_numeric", { precision: 14, scale: 4 }),
    deliveryDiscountType: text("delivery_discount_type"),
    deliveryDiscountValue: numeric("delivery_discount_value", { precision: 14, scale: 4 }),
    offerKind: text("offer_kind").notNull().default("DISCOUNT"),
    offerAudience: text("offer_audience").notNull().default("CUSTOMER"),
    fundingMode: text("funding_mode").notNull().default("PLATFORM_ONLY"),
    platformSharePct: numeric("platform_share_pct", { precision: 5, scale: 2 }).notNull().default("100"),
    merchantSharePct: numeric("merchant_share_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    maxPlatformContribution: numeric("max_platform_contribution", { precision: 14, scale: 4 }),
    maxMerchantContribution: numeric("max_merchant_contribution", { precision: 14, scale: 4 }),
    targetScope: text("target_scope").notNull().default("GLOBAL"),
    geoLevel: text("geo_level"),
    geoIds: jsonb("geo_ids").notNull().default([]),
    merchantIds: jsonb("merchant_ids").notNull().default([]),
    customerSegment: text("customer_segment").notNull().default("ALL"),
    minOrderAmount: numeric("min_order_amount", { precision: 14, scale: 4 }),
    maxDiscountAmount: numeric("max_discount_amount", { precision: 14, scale: 4 }),
    buyQty: integer("buy_qty"),
    getQty: integer("get_qty"),
    isStackable: boolean("is_stackable").notNull().default(false),
    exclusionGroup: text("exclusion_group"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    budgetTotal: numeric("budget_total", { precision: 14, scale: 4 }),
    budgetUsed: numeric("budget_used", { precision: 14, scale: 4 }).notNull().default("0"),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    isHidden: boolean("is_hidden").notNull().default(false),
    conditions: jsonb("conditions").notNull().default({}),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    serviceActiveIdx: index("billing_platform_offers_service_active_idx").on(
      table.serviceType,
      table.isActive,
      table.priority
    ),
  })
);

export const merchantBillingOverrides = pgTable(
  "merchant_billing_overrides",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    merchantStoreId: bigint("merchant_store_id", { mode: "number" }).notNull().unique(),
    overrides: jsonb("overrides").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
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
    /** Delivery type chosen at checkout. 'delivery' = courier-fulfilled, 'self_pickup' = customer collects from store. */
    deliveryType: text("delivery_type").notNull().default("delivery"),
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
    billingSnapshot: jsonb("billing_snapshot"),
    billingRulesetVersion: integer("billing_ruleset_version"),
    /** GatiCash wallet applied toward payment at checkout (INR). */
    gatiCashApplied: numeric("gati_cash_applied", { precision: 12, scale: 2 }).default("0"),
    /** Missed-offer discount subtracted from payable at checkout (INR). */
    missedOfferDiscount: numeric("missed_offer_discount", { precision: 12, scale: 2 }).default("0"),
    /** Missed-offer gap amount added to payable; credited to GatiCash after order (INR). */
    missedOfferWalletAdd: numeric("missed_offer_wallet_add", { precision: 12, scale: 2 }).default("0"),
    couponCode: text("coupon_code"),
    checkoutMetadata: jsonb("checkout_metadata"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    paymentState: text("payment_state").notNull().default("created"),
    paymentStartedAt: timestamp("payment_started_at", { withTimezone: true }),
    paymentConfirmBy: timestamp("payment_confirm_by", { withTimezone: true }),
    paymentVerifiedAt: timestamp("payment_verified_at", { withTimezone: true }),
    paymentFailureCode: text("payment_failure_code"),
    paymentFailureMessage: text("payment_failure_message"),
    refundStatus: text("refund_status"),
    refundReference: text("refund_reference"),
    refundInitiatedAt: timestamp("refund_initiated_at", { withTimezone: true }),
    lastGatewayPayload: jsonb("last_gateway_payload"),
    finalizedOrderId: text("finalized_order_id"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pendingIdIdx: index("pending_orders_pending_id_idx").on(table.pendingId),
    customerIdIdx: index("pending_orders_customer_id_idx").on(table.customerId),
    razorpayOrderIdIdx: index("pending_orders_razorpay_order_id_idx").on(table.razorpayOrderId),
    razorpayPaymentIdIdx: index("pending_orders_razorpay_payment_id_idx").on(table.razorpayPaymentId),
    paymentStateIdx: index("pending_orders_payment_state_idx").on(table.paymentState, table.createdAt),
    paymentConfirmByIdx: index("pending_orders_payment_confirm_by_idx").on(table.paymentConfirmBy),
    finalizedOrderIdIdx: index("pending_orders_finalized_order_id_idx").on(table.finalizedOrderId),
    expiresAtIdx: index("pending_orders_expires_at_idx").on(table.expiresAt),
  })
);

/**
 * payment_events (migration 0198): append-only audit log for every observed
 * state change on a pending_orders row. Never updated, only inserted — gives
 * us a replayable timeline per payment across API / webhook / reconciler
 * sources.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pendingId: text("pending_id"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    orderId: text("order_id"),
    eventType: text("event_type").notNull(),
    source: text("source").notNull(),
    prevState: text("prev_state"),
    newState: text("new_state"),
    amountPaise: bigint("amount_paise", { mode: "number" }),
    currency: text("currency"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pendingIdIdx: index("payment_events_pending_id_idx").on(table.pendingId),
    razorpayOrderIdIdx: index("payment_events_razorpay_order_id_idx").on(table.razorpayOrderId),
    razorpayPaymentIdIdx: index("payment_events_razorpay_payment_id_idx").on(table.razorpayPaymentId),
    orderIdIdx: index("payment_events_order_id_idx").on(table.orderId),
    eventTypeIdx: index("payment_events_event_type_idx").on(table.eventType, table.createdAt),
  })
);

/**
 * payment_webhook_events (migration 0198): Razorpay event-id dedup. Razorpay
 * retries webhooks up to ~24 times on non-2xx responses, and occasionally
 * duplicates on 2xx as well. Unique on `event_id`, so we short-circuit dupes
 * at the edge.
 */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: text("event_id").notNull().unique(),
    provider: text("provider").notNull().default("razorpay"),
    eventType: text("event_type").notNull(),
    signature: text("signature"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventTypeIdx: index("payment_webhook_events_event_type_idx").on(table.eventType, table.createdAt),
    processedAtIdx: index("payment_webhook_events_processed_at_idx").on(table.processedAt),
  })
);

/**
 * order_notifications (outbox, migration 0197)
 * Post-placement fan-out for merchant, rider-dispatch, and customer channels.
 * Rows are inserted inside the finalize transaction so delivery is at-least-once.
 * A worker / realtime listener consumes rows with status='pending'.
 */
export const orderNotifications = pgTable(
  "order_notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    audience: text("audience").notNull(), // 'merchant' | 'customer' | 'rider_dispatch'
    channel: text("channel").notNull(), // 'push' | 'realtime' | 'email' | 'sms' | 'internal'
    eventType: text("event_type").notNull(), // e.g. 'ORDER_PLACED'
    recipientType: text("recipient_type"), // 'merchant_store' | 'customer' | 'rider_pool'
    recipientId: text("recipient_id"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("order_notifications_order_id_idx").on(table.orderId),
    statusNextIdx: index("order_notifications_status_next_idx").on(table.status, table.nextAttemptAt),
    audienceStatusIdx: index("order_notifications_audience_status_idx").on(table.audience, table.status),
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
    // Phase-1 tracking foundation (migration 0471) — link each coordinate to an
    // independent per-assignment tracking session. Nullable/defaulted so the
    // existing insert path is unaffected.
    sessionId: bigint("session_id", { mode: "number" }),
    assignmentId: bigint("assignment_id", { mode: "number" }),
    serviceType: text("service_type"),
    sequenceNumber: integer("sequence_number"),
    source: text("source").notNull().default("gps"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdCreatedIdx: index("order_rider_tracking_order_id_created_idx").on(table.orderId, table.createdAt),
    sessionSeqIdx: index("order_rider_tracking_session_seq_idx").on(table.sessionId, table.sequenceNumber),
  })
);

/**
 * tracking_config — single global row (id=1) of Super Admin tunables for the
 * real-time tracking + geo-scoping engine (migration 0471). Distances in
 * meters, durations in seconds.
 */
export const trackingConfig = pgTable("tracking_config", {
  id: smallint("id").primaryKey().default(1),
  trackingIntervalSeconds: integer("tracking_interval_seconds").notNull().default(60),
  gpsAccuracyThresholdM: integer("gps_accuracy_threshold_m").notNull().default(50),
  speedThresholdKmh: integer("speed_threshold_kmh").notNull().default(120),
  etaRefreshSeconds: integer("eta_refresh_seconds").notNull().default(60),
  // Geofence radii/enforcement are owned by platform_rider_status_radius_rules
  // (per-milestone) — deliberately not duplicated here.
  movementThresholdM: integer("movement_threshold_m").notNull().default(30),
  stationaryTimeoutSeconds: integer("stationary_timeout_seconds").notNull().default(600),
  deviationDistanceM: integer("deviation_distance_m").notNull().default(300),
  wrongDirectionThresholdM: integer("wrong_direction_threshold_m").notNull().default(200),
  enableStationaryRule: boolean("enable_stationary_rule").notNull().default(true),
  enableDeviationRule: boolean("enable_deviation_rule").notNull().default(true),
  enableWrongDirectionRule: boolean("enable_wrong_direction_rule").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * tracking_sessions — one INDEPENDENT session per rider↔order assignment
 * (migration 0471). Reassigning an order opens a new session; prior sessions
 * and their coordinates are never overwritten (permanent, auditable history).
 */
export const trackingSessions = pgTable(
  "tracking_sessions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    orderSource: text("order_source").notNull().default("orders_core"),
    riderId: integer("rider_id").notNull(),
    assignmentId: bigint("assignment_id", { mode: "number" }),
    serviceType: text("service_type").notNull().default("food"),
    status: text("status").notNull().default("active"),
    stopReason: text("stop_reason"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastSeq: integer("last_seq").notNull().default(0),
    coordinateCount: integer("coordinate_count").notNull().default(0),
    lastLatitude: numeric("last_latitude", { precision: 10, scale: 7 }),
    lastLongitude: numeric("last_longitude", { precision: 10, scale: 7 }),
    lastRecordedAt: timestamp("last_recorded_at", { withTimezone: true }),
    // Geo-engine running state (migration 0473): last-moved point, closest
    // approach to the current target, and per-signal dedup/escalation counters.
    geoState: jsonb("geo_state").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderStartedIdx: index("tracking_sessions_order_started_idx").on(table.orderId, table.startedAt),
    riderStatusIdx: index("tracking_sessions_rider_status_idx").on(table.riderId, table.status),
    assignmentIdx: index("tracking_sessions_assignment_idx").on(table.assignmentId),
  })
);

/**
 * tracking_events — immutable event log for the tracking + geo-scoping engine
 * (migration 0472). Geofence verified/blocked, session start/stop, milestones,
 * and (Phase 3) geo-engine signals. Linked to tracking_sessions for per-
 * assignment replay + permanent audit.
 */
export const trackingEvents = pgTable(
  "tracking_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    orderSource: text("order_source").notNull().default("orders_core"),
    riderId: integer("rider_id"),
    sessionId: bigint("session_id", { mode: "number" }),
    assignmentId: bigint("assignment_id", { mode: "number" }),
    serviceType: text("service_type"),
    eventType: text("event_type").notNull(),
    milestoneKey: text("milestone_key"),
    severity: text("severity").notNull().default("info"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    distanceM: integer("distance_m"),
    radiusM: integer("radius_m"),
    message: text("message"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderCreatedIdx: index("tracking_events_order_created_idx").on(table.orderId, table.createdAt),
    sessionCreatedIdx: index("tracking_events_session_created_idx").on(table.sessionId, table.createdAt),
    riderCreatedIdx: index("tracking_events_rider_created_idx").on(table.riderId, table.createdAt),
    typeIdx: index("tracking_events_type_idx").on(table.eventType),
  })
);

/**
 * tracking_violations — geo-engine violations (long stop / route deviation /
 * opposite direction) (migration 0473). Generated by the backend geo engine,
 * never auto-penalized — the penalty engine / admin review consumes them.
 */
export const trackingViolations = pgTable(
  "tracking_violations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: text("order_id").notNull(),
    orderSource: text("order_source").notNull().default("orders_core"),
    riderId: integer("rider_id"),
    sessionId: bigint("session_id", { mode: "number" }),
    assignmentId: bigint("assignment_id", { mode: "number" }),
    serviceType: text("service_type"),
    violationType: text("violation_type").notNull(),
    level: integer("level").notNull().default(1),
    status: text("status").notNull().default("open"),
    distanceM: integer("distance_m"),
    durationSeconds: integer("duration_seconds"),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    message: text("message"),
    eventId: bigint("event_id", { mode: "number" }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderCreatedIdx: index("tracking_violations_order_created_idx").on(table.orderId, table.createdAt),
    riderStatusIdx: index("tracking_violations_rider_status_idx").on(table.riderId, table.status, table.createdAt),
    sessionIdx: index("tracking_violations_session_idx").on(table.sessionId),
    typeIdx: index("tracking_violations_type_idx").on(table.violationType),
    statusIdx: index("tracking_violations_status_idx").on(table.status),
  })
);

export const orderPartnerChatSenderEnum = pgEnum("order_partner_chat_sender", [
  "CUSTOMER",
  "RIDER",
  "SYSTEM",
]);

export const orderPartnerChatMessages = pgTable(
  "order_partner_chat_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderCoreId: bigint("order_core_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    orderPublicId: text("order_public_id").notNull(),
    senderType: orderPartnerChatSenderEnum("sender_type").notNull(),
    senderCustomerId: bigint("sender_customer_id", { mode: "number" }).references(
      () => customers.id,
      { onDelete: "set null" }
    ),
    senderRiderId: integer("sender_rider_id").references(() => riders.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    readByCustomerAt: timestamp("read_by_customer_at", { withTimezone: true }),
    readByRiderAt: timestamp("read_by_rider_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    coreCreatedIdx: index("order_partner_chat_messages_core_created_idx").on(
      table.orderCoreId,
      table.createdAt
    ),
    publicCreatedIdx: index("order_partner_chat_messages_public_created_idx").on(
      table.orderPublicId,
      table.createdAt
    ),
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

/** Latest rider GPS — one UPSERT row per rider; dispatch source of truth. */
export const riderCurrentLocations = pgTable(
  "rider_current_locations",
  {
    userId: text("user_id").primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .unique()
      .references(() => riders.id, { onDelete: "cascade" }),
    deviceId: text("device_id"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracyM: doublePrecision("accuracy_m"),
    speedMps: doublePrecision("speed_mps"),
    headingDeg: doublePrecision("heading_deg"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderIdIdx: index("rider_current_locations_rider_id_idx").on(table.riderId),
    updatedAtIdx: index("rider_current_locations_updated_at_idx").on(table.updatedAt),
    lastSeenAtIdx: index("rider_current_locations_last_seen_at_idx").on(table.lastSeenAt),
  })
);

/** @deprecated Read-only SQL view alias — use riderCurrentLocations in application code. */
export const riderLiveLocations = riderCurrentLocations;

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

export const tripShareLinks = pgTable(
  "trip_share_links",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tripId: text("trip_id").notNull(),
    token: text("token").notNull().unique(),
    createdBy: bigint("created_by", { mode: "number" }).references(() => customers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => ({
    tripIdIdx: index("trip_share_links_trip_id_idx").on(table.tripId),
  })
);

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

// ============================================================================
// ROUTE DISTANCE CACHE (Postgres-backed; avoids repeated Mapbox calls)
// ============================================================================

export const routeDistanceCache = pgTable(
  "route_distance_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    originLat: numeric("origin_lat", { precision: 9, scale: 6 }).notNull(),
    originLng: numeric("origin_lng", { precision: 9, scale: 6 }).notNull(),
    destLat: numeric("dest_lat", { precision: 9, scale: 6 }).notNull(),
    destLng: numeric("dest_lng", { precision: 9, scale: 6 }).notNull(),
    profile: text("profile").notNull().default("driving"),
    distanceMeters: integer("distance_meters").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    geometry: text("geometry"),
    provider: text("provider").notNull().default("mapbox"),
    approximate: boolean("approximate").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    expiresIdx: index("route_distance_cache_expires_idx").on(table.expiresAt),
    pointsIdx: index("route_distance_cache_points_idx").on(
      table.originLat,
      table.originLng,
      table.destLat,
      table.destLng,
      table.profile
    ),
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
    preparingAt: timestamp("preparing_at", { withTimezone: true }),
    prepReadyByAt: timestamp("prep_ready_by_at", { withTimezone: true }),
    prepDelayMinutes: integer("prep_delay_minutes").default(0),
    foodItemsCount: integer("food_items_count"),
    foodItemsTotalValue: numeric("food_items_total_value", {
      precision: 12,
      scale: 2,
    }),
    items: jsonb("items"),
    requiresUtensils: boolean("requires_utensils").default(false),
    isFragile: boolean("is_fragile").notNull().default(false),
    isHighValue: boolean("is_high_value").notNull().default(false),
    vegNonVeg: vegNonVegTypeEnum("veg_non_veg"),
    deliveryInstructions: text("delivery_instructions"),
    deliveryInstructionsList: jsonb("delivery_instructions_list").notNull().default([]),
    merchantInstructionsList: jsonb("merchant_instructions_list").notNull().default([]),
    isScheduledOrder: boolean("is_scheduled_order").notNull().default(false),
    customerId: bigint("customer_id", { mode: "number" }),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    customerEmail: text("customer_email"),
    riderId: integer("rider_id"),
    riderName: text("rider_name"),
    riderPhone: text("rider_phone"),
    formattedOrderId: text("formatted_order_id"),
    pickupOtp: text("pickup_otp"),
    deliveryOtp: text("delivery_otp"),
    rtoOtp: text("rto_otp"),
    orderStatus: text("order_status"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    riderReachedPickupAt: timestamp("rider_reached_pickup_at", { withTimezone: true }),
    handedOverToRiderAt: timestamp("handed_over_to_rider_at", { withTimezone: true }),
    riderPickedUpAt: timestamp("rider_picked_up_at", { withTimezone: true }),
    pickupWaitSeconds: integer("pickup_wait_seconds"),
    pickupTimerStartedAt: timestamp("pickup_timer_started_at", { withTimezone: true }),
    pickupDurationSeconds: integer("pickup_duration_seconds"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    cancelledByLabel: text("cancelled_by_label"),
    customerPackagingFeedback: text("customer_packaging_feedback"),
    customerPackagingReportedAt: timestamp("customer_packaging_reported_at", {
      withTimezone: true,
    }),
    isRto: boolean("is_rto").notNull().default(false),
    rtoAt: timestamp("rto_at", { withTimezone: true }),
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

/** Customer ride book catalog — filtered by nearby on-duty rider supply. */
export const customerRideServiceCatalog = pgTable("customer_ride_service_catalog", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  subtitle: text("subtitle"),
  baseFare: numeric("base_fare", { precision: 10, scale: 2 }).notNull(),
  etaMins: integer("eta_mins").notNull().default(3),
  capacity: integer("capacity"),
  tag: text("tag"),
  imageKey: text("image_key").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  vehicleTypes: text("vehicle_types").array().notNull().default([]),
});

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
    bookedForSelf: boolean("booked_for_self").notNull().default(true),
    pickupDistanceFromBookerKm: numeric("pickup_distance_from_booker_km", {
      precision: 8,
      scale: 2,
    }),
    farPickupPromptShown: boolean("far_pickup_prompt_shown").notNull().default(false),
    farPickupAcknowledged: boolean("far_pickup_acknowledged").notNull().default(false),
    intermediateStops: jsonb("intermediate_stops").notNull().default([]),
    pickupAddress: text("pickup_address"),
    pickupLat: numeric("pickup_lat", { precision: 9, scale: 6 }),
    pickupLon: numeric("pickup_lon", { precision: 9, scale: 6 }),
    dropAddress: text("drop_address"),
    dropLat: numeric("drop_lat", { precision: 9, scale: 6 }),
    dropLon: numeric("drop_lon", { precision: 9, scale: 6 }),
    stop1Address: text("stop_1_address"),
    stop1Lat: numeric("stop_1_lat", { precision: 9, scale: 6 }),
    stop1Lon: numeric("stop_1_lon", { precision: 9, scale: 6 }),
    stop2Address: text("stop_2_address"),
    stop2Lat: numeric("stop_2_lat", { precision: 9, scale: 6 }),
    stop2Lon: numeric("stop_2_lon", { precision: 9, scale: 6 }),
    pickupOtp: text("pickup_otp"),
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
    estimatedFare: numeric("estimated_fare", { precision: 10, scale: 2 }).notNull().default("0"),
    finalFare: numeric("final_fare", { precision: 10, scale: 2 }),
    amountCollected: numeric("amount_collected", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("INR"),
    paymentMethod: text("payment_method"),
    assignedRiderId: integer("assigned_rider_id").references(() => riders.id, {
      onDelete: "set null",
    }),
    riderAssignedAt: timestamp("rider_assigned_at", { withTimezone: true }),
    riderReachedPickupAt: timestamp("rider_reached_pickup_at", { withTimezone: true }),
    pickupWaitSeconds: integer("pickup_wait_seconds"),
    pickupOtpVerifiedAt: timestamp("pickup_otp_verified_at", { withTimezone: true }),
    searchStartedAt: timestamp("search_started_at", { withTimezone: true }),
    searchExpiresAt: timestamp("search_expires_at", { withTimezone: true }),
    customerTipAmount: numeric("customer_tip_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    prebookTipAmount: numeric("prebook_tip_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    searchBoostTip1: numeric("search_boost_tip_1", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    searchBoostTip2: numeric("search_boost_tip_2", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    dispatchRetryCount: integer("dispatch_retry_count").notNull().default(0),
    searchExtendedUntil: timestamp("search_extended_until", { withTimezone: true }),
    tipBoostApplied: boolean("tip_boost_applied").notNull().default(false),
    higherDispatchPriority: boolean("higher_dispatch_priority").notNull().default(false),
    awaitingTipBoost: boolean("awaiting_tip_boost").notNull().default(false),
    adminRiderPaymentClearedAt: timestamp("admin_rider_payment_cleared_at", { withTimezone: true }),
    acceptPayoutSnapshot: jsonb("accept_payout_snapshot"),
    cancelledByType: text("cancelled_by_type"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReasonCode: text("cancellation_reason_code"),
    cancellationReasonText: text("cancellation_reason_text"),
    cancelMode: text("cancel_mode"),
    // Ride Billing Architecture — populated by the cash settlement engine.
    cashCollectedAt: timestamp("cash_collected_at", { withTimezone: true }),
    cashCollectedByRiderId: integer("cash_collected_by_rider_id"),
    settlementId: text("settlement_id"),
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
    bookedForSelfIdx: index("orders_ride_booked_for_self_idx").on(table.bookedForSelf),
    farPickupIdx: index("orders_ride_far_pickup_idx").on(
      table.farPickupPromptShown,
      table.farPickupAcknowledged
    ),
    cashCollectedIdx: index("orders_ride_cash_collected_idx").on(table.cashCollectedAt),
    settlementIdx: index("orders_ride_settlement_idx").on(table.settlementId),
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
    imageType: text("image_type").notNull().default("delivery_proof"),
    imageUrl: text("image_url").notNull(),
    r2Key: text("r2_key"),
    uploadedBy: text("uploaded_by").default("rider"),
    uploadedById: bigint("uploaded_by_id", { mode: "number" }),
    imageMetadata: jsonb("image_metadata").default({}),
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
    methodType: riderPayoutMethodTypeEnum("method_type").notNull(),
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
 * rider_wallet_payments (migration 0443): immutable audit of every rider wallet
 * payment attempt — negative-wallet recovery today — in ANY status. Never deleted.
 * `status` is plain text so future gateway statuses need no schema change.
 */
export const riderWalletPayments = pgTable(
  "rider_wallet_payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull().default("negative_wallet_recovery"),
    amountPaise: integer("amount_paise").notNull(),
    walletBefore: numeric("wallet_before", { precision: 10, scale: 2 }),
    walletAfter: numeric("wallet_after", { precision: 10, scale: 2 }),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    razorpaySignature: text("razorpay_signature"),
    gateway: text("gateway").notNull().default("razorpay"),
    method: text("method"),
    status: text("status").notNull().default("initiated"),
    remarks: text("remarks"),
    refundId: text("refund_id"),
    refundAmountPaise: integer("refund_amount_paise"),
    refundStatus: text("refund_status"),
    metadata: jsonb("metadata").notNull().default({}),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    rzpPaymentIdUidx: uniqueIndex("rider_wallet_payments_rzp_payment_id_uidx").on(table.razorpayPaymentId),
    riderCreatedIdx: index("rider_wallet_payments_rider_created_idx").on(table.riderId, table.createdAt),
    statusIdx: index("rider_wallet_payments_status_idx").on(table.status),
    orderIdIdx: index("rider_wallet_payments_order_id_idx").on(table.razorpayOrderId),
  })
);

/**
 * rider_service_block_history (migration 0443): immutable log of every service
 * block/unblock transition with its reason, so the exact lifecycle (why blocked,
 * why unblocked, by whom, wallet before/after) is fully auditable. Never deleted.
 */
export const riderServiceBlockHistory = pgTable(
  "rider_service_block_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    serviceType: text("service_type").notNull(),
    action: text("action").notNull(), // blocked | unblocked
    previousStatus: text("previous_status"),
    newStatus: text("new_status"),
    reason: text("reason").notNull(),
    paymentRef: text("payment_ref"),
    walletBefore: numeric("wallet_before", { precision: 10, scale: 2 }),
    walletAfter: numeric("wallet_after", { precision: 10, scale: 2 }),
    performedBy: text("performed_by").notNull().default("system"),
    remarks: text("remarks"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderCreatedIdx: index("rider_service_block_history_rider_created_idx").on(table.riderId, table.createdAt),
    actionIdx: index("rider_service_block_history_action_idx").on(table.serviceType, table.action),
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
    subtotalPaise: integer("subtotal_paise"),
    gstPercentApplied: numeric("gst_percent_applied", { precision: 6, scale: 2 }),
    gstAmountPaise: integer("gst_amount_paise"),
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
// RIDER INCENTIVES (formerly "offers" — renamed to avoid confusion with
// customer-facing discount offers in merchant_offers / billing_platform_offers)
// ============================================================================

/** Rider incentive programmes (e.g. complete N deliveries in M days). */
export const riderIncentives = pgTable(
  "rider_incentives",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    scope: offerScopeEnum("scope").notNull().default("global"),
    condition: jsonb("condition").notNull(),
    rewardType: rewardTypeEnum("reward_type").notNull().default("cash"),
    rewardAmount: numeric("reward_amount", { precision: 10, scale: 2 }),
    rewardMetadata: jsonb("reward_metadata").default({}),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    scopeIdx:  index("rider_incentives_scope_idx").on(table.scope),
    activeIdx: index("rider_incentives_active_idx").on(table.active),
    datesIdx:  index("rider_incentives_dates_idx").on(table.startDate, table.endDate),
  })
);

/** Tracks rider progress and reward-claimed state for rider_incentives. */
export const riderIncentiveParticipation = pgTable(
  "rider_incentive_participation",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    riderId: integer("rider_id")
      .notNull()
      .references(() => riders.id, { onDelete: "cascade" }),
    incentiveId: integer("offer_id")
      .notNull()
      .references(() => riderIncentives.id, { onDelete: "cascade" }),
    completed: boolean("completed").notNull().default(false),
    progress: jsonb("progress").default({}),
    rewardClaimed: boolean("reward_claimed").notNull().default(false),
    rewardClaimedAt: timestamp("reward_claimed_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    riderIdIdx:    index("rider_incentive_participation_rider_id_idx").on(table.riderId),
    incentiveIdx:  index("rider_incentive_participation_offer_id_idx").on(table.incentiveId),
    completedIdx:  index("rider_incentive_participation_completed_idx").on(table.completed),
    riderOfferIdx: uniqueIndex("rider_incentive_participation_rider_offer_idx").on(
      table.riderId,
      table.incentiveId
    ),
  })
);

// ============================================================================
// MERCHANT OFFERS — canonical store-level discount offers
// ============================================================================

/**
 * Merchant store offers — created by merchant (MERCHANT_APP / MERCHANT_PORTAL),
 * agent (AGENT_DASHBOARD), or admin (ADMIN_DASHBOARD).
 * Canonical offer_type values: PERCENTAGE | FLAT | BUY_X_GET_Y | BUY_N_GET_M |
 * FREE_ITEM | FREE_DELIVERY | CART_PERCENTAGE | CART_FLAT | TIERED | BOGO | BUNDLE | COUPON
 *
 * Percentage paths use offer_metadata.conditions_mode:
 *   'boost'     — menu strike / Get for ₹ (item or all-menu)
 *   'precision' — checkout / offer-sheet only (always ALL_ORDERS, no item pick)
 * BOGO uses offer_type BUY_X_GET_Y / BUY_N_GET_M / BOGO (separate create path).
 * Legacy unused tables merchant_offer_conditions / merchant_offer_usage dropped in 0407
 * (0407 replaces former 0399–0406 offer migrations).
 */
export const merchantOffers = pgTable(
  "merchant_offers",
  {
    id:                  bigserial("id", { mode: "number" }).primaryKey(),
    offerId:             text("offer_id").notNull().unique(),
    storeId:             bigint("store_id", { mode: "number" }).notNull(),
    offerTitle:          text("offer_title").notNull(),
    offerDescription:    text("offer_description"),
    offerImageUrl:       text("offer_image_url"),
    offerTerms:          text("offer_terms"),
    offerType:           text("offer_type").notNull(),
    offerSubType:        text("offer_sub_type"),
    discountValue:       numeric("discount_value",      { precision: 10, scale: 2 }),
    discountPercentage:  numeric("discount_percentage", { precision: 5,  scale: 2 }),
    maxDiscountAmount:   numeric("max_discount_amount", { precision: 10, scale: 2 }),
    minOrderAmount:      numeric("min_order_amount",    { precision: 10, scale: 2 }),
    maxOrderAmount:      numeric("max_order_amount",    { precision: 10, scale: 2 }),
    minItems:            integer("min_items"),
    applicableOnDays:    text("applicable_on_days").array(),
    applicableTimeStart: text("applicable_time_start"),
    applicableTimeEnd:   text("applicable_time_end"),
    buyQuantity:         integer("buy_quantity"),
    getQuantity:         integer("get_quantity"),
    maxUsesTotal:        integer("max_uses_total"),
    maxUsesPerUser:      integer("max_uses_per_user"),
    currentUses:         integer("current_uses").default(0),
    validFrom:           timestamp("valid_from", { withTimezone: true }).notNull(),
    validTill:           timestamp("valid_till", { withTimezone: true }).notNull(),
    isActive:            boolean("is_active").default(true),
    isFeatured:          boolean("is_featured").default(false),
    displayPriority:     integer("display_priority").default(0),
    offerMetadata:       jsonb("offer_metadata").default({}),
    couponCode:          text("coupon_code"),
    autoApply:           boolean("auto_apply").default(true),
    isStackable:         boolean("is_stackable").default(false),
    priority:            integer("priority").default(0),
    perOrderLimit:       integer("per_order_limit").default(1),
    firstOrderOnly:      boolean("first_order_only").default(false),
    newUserOnly:         boolean("new_user_only").default(false),
    userSegment:         jsonb("user_segment").default({}),
    maxDiscountPerOrder: numeric("max_discount_per_order", { precision: 10, scale: 2 }),
    usageResetPeriod:    text("usage_reset_period"),
    createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy:           integer("created_by"),
    updatedBy:           integer("updated_by"),
    createdByName:       text("created_by_name"),
    updatedByName:       text("updated_by_name"),
    updatedByAt:         timestamp("updated_by_at", { withTimezone: true }),
    // Ownership tracking (added in migration 0215)
    createdSourcePlatform: text("created_source_platform").notNull().default("MERCHANT_APP"),
    updatedSourcePlatform: text("updated_source_platform"),
    createdByRole:         text("created_by_role").notNull().default("MERCHANT"),
    updatedByRole:         text("updated_by_role"),
    createdByUserId:       bigint("created_by_user_id", { mode: "number" }),
    updatedByUserId:       bigint("updated_by_user_id", { mode: "number" }),
    createdByOrgId:        bigint("created_by_org_id",  { mode: "number" }),
    managedByAgent:        bigint("managed_by_agent",   { mode: "number" }),
    approvedByAdmin:       bigint("approved_by_admin",  { mode: "number" }),
    approvalStatus:        text("approval_status").notNull().default("AUTO_APPROVED"),
    approvalNote:          text("approval_note"),
    // Offer Engine V3 lifecycle (migration 0407)
    lifecycleStatus:       text("lifecycle_status").notNull().default("ACTIVE"),
    publishedAt:           timestamp("published_at", { withTimezone: true }),
    disabledAt:            timestamp("disabled_at", { withTimezone: true }),
    disabledReason:        text("disabled_reason"),
  },
  (table) => ({
    storeIdIdx:      index("merchant_offers_store_id_idx").on(table.storeId),
    offerIdIdx:      index("merchant_offers_offer_id_idx").on(table.offerId),
    isActiveIdx:     index("merchant_offers_is_active_idx").on(table.isActive),
    validityIdx:     index("merchant_offers_validity_idx").on(table.validFrom, table.validTill),
    offerTypeIdx:    index("merchant_offers_offer_type_idx").on(table.offerType),
    isFeaturedIdx:   index("merchant_offers_is_featured_idx").on(table.isFeatured),
    activeLookupIdx: index("idx_active_offer_lookup").on(table.storeId, table.isActive, table.validFrom, table.validTill),
    lifecycleIdx:    index("idx_merchant_offers_v3_runtime_lookup").on(table.storeId, table.lifecycleStatus, table.isActive),
    sourcePlatIdx:   index("merchant_offers_created_source_platform_idx").on(table.createdSourcePlatform),
    createdRoleIdx:  index("merchant_offers_created_by_role_idx").on(table.createdByRole),
    approvalIdx:     index("merchant_offers_approval_status_idx").on(table.approvalStatus),
  })
);

// ============================================================================
// MERCHANT OFFER USAGES — per-user redemption tracking
// ============================================================================

/** Per-user, per-order usage log. Enforces max_uses_per_user and supports refund reversal. */
export const merchantOfferUsages = pgTable(
  "merchant_offer_usages",
  {
    id:             bigserial("id", { mode: "number" }).primaryKey(),
    offerId:        bigint("offer_id",  { mode: "number" }).notNull().references(() => merchantOffers.id, { onDelete: "cascade" }),
    userId:         bigint("user_id",   { mode: "number" }).notNull(),
    orderId:        bigint("order_id",  { mode: "number" }),
    usedAt:         timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    isReversed:     boolean("is_reversed").notNull().default(false),
    reversedAt:     timestamp("reversed_at", { withTimezone: true }),
  },
  (table) => ({
    offerIdIdx:    index("merchant_offer_usages_offer_id_idx").on(table.offerId),
    userIdIdx:     index("merchant_offer_usages_user_id_idx").on(table.userId),
    orderIdIdx:    index("merchant_offer_usages_order_id_idx").on(table.orderId),
    offerUserIdx:  index("merchant_offer_usages_offer_user_idx").on(table.offerId, table.userId),
  })
);

// ============================================================================
// OFFER ORDER APPLICATIONS — immutable snapshot at order placement
// ============================================================================

/**
 * Immutable record of every discount applied at order placement time.
 * snapshot_json stores the full offer row so history is preserved even if offers change.
 */
export const offerOrderApplications = pgTable(
  "offer_order_applications",
  {
    id:              bigserial("id", { mode: "number" }).primaryKey(),
    orderId:         bigint("order_id",          { mode: "number" }).notNull(),
    offerSource:     text("offer_source").notNull(),
    merchantOfferId: bigint("merchant_offer_id", { mode: "number" }).references(() => merchantOffers.id, { onDelete: "set null" }),
    platformOfferId: bigint("platform_offer_id", { mode: "number" }).references(() => billingPlatformOffers.id, { onDelete: "set null" }),
    offerType:       text("offer_type").notNull(),
    offerTitle:      text("offer_title").notNull(),
    couponCode:      text("coupon_code"),
    discountAmount:  numeric("discount_amount",  { precision: 10, scale: 2 }).notNull().default("0"),
    platformShare:   numeric("platform_share",   { precision: 10, scale: 2 }).notNull().default("0"),
    merchantShare:   numeric("merchant_share",   { precision: 10, scale: 2 }).notNull().default("0"),
    fundingMode:     text("funding_mode").notNull().default("MERCHANT_ONLY"),
    snapshotJson:    jsonb("snapshot_json").notNull().default({}),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdIdx:          index("offer_order_applications_order_id_idx").on(table.orderId),
    merchantOfferIdIdx:  index("offer_order_applications_merchant_offer_id_idx").on(table.merchantOfferId),
    platformOfferIdIdx:  index("offer_order_applications_platform_offer_id_idx").on(table.platformOfferId),
    offerSourceIdx:      index("offer_order_applications_offer_source_idx").on(table.offerSource),
    createdAtIdx:        index("offer_order_applications_created_at_idx").on(table.createdAt),
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
    storeReviewTags: jsonb("store_review_tags").$type<string[]>().notNull().default([]),
    riderReviewTags: jsonb("rider_review_tags").$type<string[]>().notNull().default([]),
    riderReviewText: text("rider_review_text"),
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
  logoutEvents: many(riderLogoutEvents),
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
  riderIncentiveParticipation: many(riderIncentiveParticipation),
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

// ============================================================================
// EXPO PUSH (unified device tokens for customer / merchant / rider apps)
// ============================================================================

export const expoPushTokens = pgTable(
  "expo_push_tokens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    deviceType: text("device_type").notNull(),
    expoPushToken: text("expo_push_token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Device / app / locale fingerprint (migration 0419). All nullable so
    // pre-1.0.1 APKs continue to register successfully. Used for targeted
    // sends (e.g. only app_version >= X), analytics, and locale-aware
    // template rendering.
    deviceModel: text("device_model"),
    deviceBrand: text("device_brand"),
    osName: text("os_name"),
    osVersion: text("os_version"),
    appVersion: text("app_version"),
    locale: text("locale"),
    timezone: text("timezone"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userRoleIdx: index("expo_push_tokens_user_id_role_idx").on(t.userId, t.role),
    roleIdx: index("expo_push_tokens_role_idx").on(t.role),
  })
);

/** Native FCM / APNs device tokens (migration 0436). */
export const nativeDevicePushTokens = pgTable(
  "native_device_push_tokens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    platform: text("platform").notNull(),
    tokenType: text("token_type").notNull(),
    nativeToken: text("native_token").notNull().unique(),
    storeId: bigint("store_id", { mode: "number" }),
    subscribedTopics: jsonb("subscribed_topics").$type<string[]>().notNull().default([]),
    /** app | partnersite | dashboard | browser */
    source: text("source").notNull().default("app"),
    deviceModel: text("device_model"),
    deviceBrand: text("device_brand"),
    osName: text("os_name"),
    osVersion: text("os_version"),
    appVersion: text("app_version"),
    locale: text("locale"),
    timezone: text("timezone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userRoleIdx: index("native_device_push_tokens_user_role_idx").on(t.userId, t.role),
    roleIdx: index("native_device_push_tokens_role_idx").on(t.role),
    storeIdx: index("native_device_push_tokens_store_idx").on(t.storeId),
    typeIdx: index("native_device_push_tokens_type_idx").on(t.tokenType),
  })
);

// ============================================================================
// RIDER INCENTIVE RELATIONS
// ============================================================================

export const riderIncentivesRelations = relations(riderIncentives, ({ many }) => ({
  participation: many(riderIncentiveParticipation),
}));

export const riderIncentiveParticipationRelations = relations(riderIncentiveParticipation, ({ one }) => ({
  rider:     one(riders,          { fields: [riderIncentiveParticipation.riderId],    references: [riders.id] }),
  incentive: one(riderIncentives, { fields: [riderIncentiveParticipation.incentiveId], references: [riderIncentives.id] }),
}));

// ============================================================================
// RIDER INCENTIVE ENGINE (V1 — state-scoped programs, PRD 0354)
// ============================================================================

export const incentivePrograms = pgTable(
  "incentive_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    service: text("service").notNull(),
    vehicleType: text("vehicle_type"),
    status: text("status").notNull().default("draft"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    recurrenceType: text("recurrence_type").notNull().default("one_time"),
    slotMode: text("slot_mode").notNull().default("all_day"),
    slotDayMode: text("slot_day_mode").notNull().default("full_week"),
    activeDays: jsonb("active_days").notNull().default([]),
    calendarBadges: jsonb("calendar_badges").notNull().default([]),
    geoScopeMode: text("geo_scope_mode").notNull().default("selected_states"),
    visibilityMode: text("visibility_mode").notNull().default("scoped_visible"),
    requiresGmitraMax: boolean("requires_gmitra_max").notNull().default(true),
    showToNonSubscribers: boolean("show_to_non_subscribers").notNull().default(true),
    showBeforeEligible: boolean("show_before_eligible").notNull().default(true),
    rewardType: text("reward_type").notNull(),
    payoutMode: text("payout_mode").notNull().default("manual_approve"),
    payoutCapMode: text("payout_cap_mode").notNull().default("top_n"),
    maxWinners: integer("max_winners"),
    maxTotalPayout: numeric("max_total_payout", { precision: 12, scale: 2 }),
    maxPayoutPerRider: numeric("max_payout_per_rider", { precision: 12, scale: 2 }),
    stopOnBudgetExhaust: boolean("stop_on_budget_exhaust").notNull().default(false),
    sortBasis: text("sort_basis"),
    tieBreaker: text("tie_breaker"),
    isActive: boolean("is_active").notNull().default(false),
    isPaused: boolean("is_paused").notNull().default(false),
    createdBy: integer("created_by"),
    updatedBy: integer("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    serviceStatusIdx: index("incentive_programs_service_status_idx").on(table.service, table.status),
    activeDatesIdx: index("incentive_programs_active_dates_idx").on(table.isActive, table.startAt, table.endAt),
  }),
);

export const incentiveProgramGeoScopes = pgTable(
  "incentive_program_geo_scopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => incentivePrograms.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    stateId: uuid("state_id"),
    cityId: uuid("city_id"),
    zoneId: uuid("zone_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programIdx: index("incentive_program_geo_scopes_program_idx").on(table.programId),
    stateIdx: index("incentive_program_geo_scopes_state_idx").on(table.stateId),
  }),
);

export const incentiveProgramRules = pgTable("incentive_program_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  programId: uuid("program_id")
    .notNull()
    .unique()
    .references(() => incentivePrograms.id, { onDelete: "cascade" }),
  minCompletedOrders: integer("min_completed_orders"),
  minAcceptedOrders: integer("min_accepted_orders"),
  minActiveMinutes: integer("min_active_minutes"),
  minAcceptanceRate: numeric("min_acceptance_rate", { precision: 5, scale: 2 }),
  maxCancellationRate: numeric("max_cancellation_rate", { precision: 5, scale: 2 }),
  minCustomerRating: numeric("min_customer_rating", { precision: 3, scale: 2 }),
  minLoginDays: integer("min_login_days"),
  minPeakSlotOrders: integer("min_peak_slot_orders"),
  maxFraudScore: integer("max_fraud_score").default(0),
  excludeSuspendedRiders: boolean("exclude_suspended_riders").notNull().default(true),
  excludeLowRatingRiders: boolean("exclude_low_rating_riders").notNull().default(false),
  excludeIfAnyFraudFlag: boolean("exclude_if_any_fraud_flag").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incentiveProgramTimeWindows = pgTable(
  "incentive_program_time_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => incentivePrograms.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week"),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    label: text("label"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programIdx: index("incentive_program_time_windows_program_idx").on(table.programId),
  }),
);

export const incentiveProgramRewardTiers = pgTable(
  "incentive_program_reward_tiers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => incentivePrograms.id, { onDelete: "cascade" }),
    tierNo: integer("tier_no").notNull(),
    tierType: text("tier_type").notNull(),
    minOrders: integer("min_orders"),
    maxOrders: integer("max_orders"),
    rankFrom: integer("rank_from"),
    rankTo: integer("rank_to"),
    rewardAmount: numeric("reward_amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programIdx: index("incentive_program_reward_tiers_program_idx").on(table.programId, table.tierNo),
  }),
);

export const riderIncentiveProgress = pgTable(
  "rider_incentive_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => incentivePrograms.id, { onDelete: "cascade" }),
    riderUserId: text("rider_user_id").notNull(),
    riderId: integer("rider_id").references(() => riders.id, { onDelete: "set null" }),
    stateId: uuid("state_id"),
    service: text("service").notNull(),
    cycleStartAt: timestamp("cycle_start_at", { withTimezone: true }).notNull(),
    cycleEndAt: timestamp("cycle_end_at", { withTimezone: true }).notNull(),
    completedOrders: integer("completed_orders").notNull().default(0),
    acceptedOrders: integer("accepted_orders").notNull().default(0),
    cancelledOrders: integer("cancelled_orders").notNull().default(0),
    activeMinutes: integer("active_minutes").notNull().default(0),
    grossEarnings: numeric("gross_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
    acceptanceRate: numeric("acceptance_rate", { precision: 5, scale: 2 }),
    cancellationRate: numeric("cancellation_rate", { precision: 5, scale: 2 }),
    customerRating: numeric("customer_rating", { precision: 3, scale: 2 }),
    fraudScore: integer("fraud_score").notNull().default(0),
    fraudFlags: jsonb("fraud_flags").notNull().default([]),
    visible: boolean("visible").notNull().default(false),
    baseEligible: boolean("base_eligible").notNull().default(false),
    rankEligible: boolean("rank_eligible").notNull().default(false),
    winnerSelected: boolean("winner_selected").notNull().default(false),
    disqualified: boolean("disqualified").notNull().default(false),
    riderStatus: text("rider_status").notNull().default("NOT_ELIGIBLE_YET"),
    projectedReward: numeric("projected_reward", { precision: 12, scale: 2 }),
    finalReward: numeric("final_reward", { precision: 12, scale: 2 }),
    rankPosition: integer("rank_position"),
    payoutStatus: text("payout_status"),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programIdx: index("rider_incentive_progress_program_idx").on(table.programId),
    riderUserIdx: index("rider_incentive_progress_rider_idx").on(table.riderUserId),
    programRiderIdx: index("rider_incentive_progress_program_rider_idx").on(table.programId, table.riderUserId),
    cycleUniq: uniqueIndex("rider_incentive_progress_cycle_uniq").on(
      table.programId,
      table.riderUserId,
      table.cycleStartAt,
      table.cycleEndAt,
    ),
  }),
);

export const incentiveRewardLedger = pgTable(
  "incentive_reward_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => incentivePrograms.id),
    riderUserId: text("rider_user_id").notNull(),
    riderProgressId: uuid("rider_progress_id").references(() => riderIncentiveProgress.id, { onDelete: "set null" }),
    rewardAmount: numeric("reward_amount", { precision: 12, scale: 2 }).notNull(),
    rewardStatus: text("reward_status").notNull().default("pending"),
    approvalNote: text("approval_note"),
    creditedAt: timestamp("credited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    programIdx: index("incentive_reward_ledger_program_idx").on(table.programId),
    riderIdx: index("incentive_reward_ledger_rider_idx").on(table.riderUserId),
    statusIdx: index("incentive_reward_ledger_status_idx").on(table.rewardStatus),
  }),
);

// ============================================================================
// MERCHANT OFFER RELATIONS
// ============================================================================

export const merchantOffersRelations = relations(merchantOffers, ({ many }) => ({
  usages:            many(merchantOfferUsages),
  orderApplications: many(offerOrderApplications),
}));

export const merchantOfferUsagesRelations = relations(merchantOfferUsages, ({ one }) => ({
  offer: one(merchantOffers, { fields: [merchantOfferUsages.offerId], references: [merchantOffers.id] }),
}));

export const offerOrderApplicationsRelations = relations(offerOrderApplications, ({ one }) => ({
  merchantOffer: one(merchantOffers,       { fields: [offerOrderApplications.merchantOfferId], references: [merchantOffers.id] }),
  platformOffer: one(billingPlatformOffers, { fields: [offerOrderApplications.platformOfferId], references: [billingPlatformOffers.id] }),
}));

// ============================================================================
// RIDE CUSTOMER PAYMENT SNAPSHOTS
// ============================================================================

export const rideCustomerPaymentSnapshots = pgTable(
  "ride_customer_payment_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderCoreId: bigint("order_core_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    orderId: text("order_id").notNull(),
    customerId: bigint("customer_id", { mode: "number" }).references(() => customers.id, {
      onDelete: "set null",
    }),
    snapshotPhase: text("snapshot_phase").notNull(),
    rideType: text("ride_type"),
    pickupAddress: text("pickup_address"),
    dropAddress: text("drop_address"),
    distanceKm: numeric("distance_km", { precision: 10, scale: 2 }),
    rideFare: numeric("ride_fare", { precision: 14, scale: 2 }).notNull().default("0"),
    addonTotal: numeric("addon_total", { precision: 14, scale: 2 }).notNull().default("0"),
    platformFee: numeric("platform_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    convenienceFee: numeric("convenience_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    deliveryFee: numeric("delivery_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    packagingFee: numeric("packaging_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    surgeFee: numeric("surge_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    smallOrderFee: numeric("small_order_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    miscFee: numeric("misc_fee", { precision: 14, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    tipAmount: numeric("tip_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    donationAmount: numeric("donation_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    waitingCharge: numeric("waiting_charge", { precision: 14, scale: 2 }).notNull().default("0"),
    tollCharge: numeric("toll_charge", { precision: 14, scale: 2 }).notNull().default("0"),
    discountTotal: numeric("discount_total", { precision: 14, scale: 2 }).notNull().default("0"),
    payableTotal: numeric("payable_total", { precision: 14, scale: 2 }).notNull().default("0"),
    gatiCashApplied: numeric("gati_cash_applied", { precision: 14, scale: 2 }).notNull().default("0"),
    razorpayAmount: numeric("razorpay_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }),
    couponCode: text("coupon_code"),
    platformOfferId: bigint("platform_offer_id", { mode: "number" }),
    merchantOfferId: bigint("merchant_offer_id", { mode: "number" }),
    paymentMethod: text("payment_method"),
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    billingRulesetVersion: integer("billing_ruleset_version"),
    billingSnapshot: jsonb("billing_snapshot").notNull().default({}),
    charges: jsonb("charges").notNull().default([]),
    discounts: jsonb("discounts").notNull().default([]),
    taxes: jsonb("taxes").notNull().default([]),
    breakdownSteps: jsonb("breakdown_steps").notNull().default([]),
    gstComponents: jsonb("gst_components").notNull().default({}),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderCoreCreatedIdx: index("ride_customer_payment_snapshots_order_core_idx").on(
      table.orderCoreId,
      table.createdAt
    ),
    orderIdCreatedIdx: index("ride_customer_payment_snapshots_order_id_idx").on(
      table.orderId,
      table.createdAt
    ),
    phaseIdx: index("ride_customer_payment_snapshots_phase_idx").on(
      table.orderCoreId,
      table.snapshotPhase,
      table.createdAt
    ),
  })
);

// ============================================================================
// EXPO PUSH TOKENS
// ============================================================================

export const expoPushNotificationLogs = pgTable("expo_push_notification_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  notificationType: text("notification_type").notNull(),
  targetRole: text("target_role").notNull(),
  targetUserIds: jsonb("target_user_ids"),
  tokensTargeted: integer("tokens_targeted").notNull().default(0),
  expoTicketsOk: integer("expo_tickets_ok").notNull().default(0),
  expoTicketsError: integer("expo_tickets_error").notNull().default(0),
  detail: jsonb("detail"),
});

// ============================================================================
// VERIFICATION (Cashfree Secure ID auto/manual/hybrid) — migrations 0390-0395
//
// See backend/drizzle/0390_verification_enums.sql for the pgEnum values these
// mirror. Drizzle enums must list every value in the same order — any future
// ALTER TYPE ADD VALUE has to be reflected here too.
// ============================================================================

export const verificationStatusKindEnum = pgEnum("verification_status_kind", [
  "draft", "initiated", "otp_sent", "otp_verified",
  "provider_processing", "webhook_received", "manual_review",
  "verified", "rejected", "consent_denied", "expired", "timeout", "failed",
  "duplicate", "fraud_suspected", "provider_down", "fallback_manual",
  "overridden", "cancelled",
]);

export const verificationDocumentKindEnum = pgEnum("verification_document_kind", [
  "pan", "pan_360", "aadhaar_digilocker",
  "driving_licence", "vehicle_rc", "passport",
  "ifsc", "bank_account", "reverse_penny_drop", "upi_penny_drop",
  "gstin", "cin",
  "face_liveness", "face_match", "name_match",
]);

export const verificationProviderKindEnum = pgEnum("verification_provider_kind", [
  "cashfree", "razorpay", "manual",
]);

export const verificationActorKindEnum = pgEnum("verification_actor_kind", [
  "provider", "webhook", "admin", "system", "rider", "merchant",
]);

export const verificationEventKindEnum = pgEnum("verification_event_kind", [
  "submit", "provider_response", "webhook_apply", "poll_result",
  "retry_scheduled", "retry_started", "artifact_mirror",
  "auto_approve", "manual_review_queued", "manual_review_resolved",
  "override", "fallback_to_manual", "projection_applied", "cancelled",
]);

export const verificationPolicyModeEnum = pgEnum("verification_policy_mode", [
  "auto", "manual", "hybrid", "disabled",
]);

export const verificationSwitchStateEnum = pgEnum("verification_switch_state", [
  "enabled", "disabled", "force_manual", "force_hybrid",
]);

export const verificationRetryStatusEnum = pgEnum("verification_retry_status", [
  "pending", "in_flight", "exhausted", "succeeded", "cancelled",
]);

export const verificationManualReviewStateEnum = pgEnum("verification_manual_review_state", [
  "queued", "in_review", "approved", "rejected", "reassigned", "cancelled",
]);

export const verificationSubjectKindEnum = pgEnum("verification_subject_kind", [
  "rider", "merchant_store", "rider_document", "merchant_document",
]);

// ── Configuration layer ────────────────────────────────────────────────────

export const verificationProviderConfigs = pgTable(
  "verification_provider_configs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: verificationProviderKindEnum("provider").notNull(),
    environment: text("environment").notNull(),
    baseUrl: text("base_url").notNull(),
    credentialRef: text("credential_ref").notNull(),
    webhookSecretRef: text("webhook_secret_ref"),
    apiVersion: text("api_version"),
    timeoutMs: integer("timeout_ms").notNull().default(15000),
    rateLimitTpm: integer("rate_limit_tpm").notNull().default(100),
    enabledProducts: jsonb("enabled_products").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    envUq: uniqueIndex("verification_provider_configs_env_uq").on(t.provider, t.environment),
  }),
);

export const verificationPolicies = pgTable(
  "verification_policies",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    subjectType: verificationSubjectKindEnum("subject_type").notNull(),
    documentKind: verificationDocumentKindEnum("document_kind").notNull(),
    mode: verificationPolicyModeEnum("mode").notNull().default("manual"),
    provider: verificationProviderKindEnum("provider"),
    autoApprove: boolean("auto_approve").notNull().default(true),
    confidenceThreshold: numeric("confidence_threshold", { precision: 4, scale: 3 }),
    retryLimit: integer("retry_limit").notNull().default(2),
    retryBackoffSeconds: integer("retry_backoff_seconds").notNull().default(30),
    timeoutMs: integer("timeout_ms").notNull().default(15000),
    fallbackToManual: boolean("fallback_to_manual").notNull().default(true),
    subjectFilter: jsonb("subject_filter").notNull().default({}),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdBy: integer("created_by"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    lookupIdx: index("verification_policies_lookup_idx").on(t.subjectType, t.documentKind, t.effectiveFrom),
  }),
);

export const verificationPolicyVersions = pgTable(
  "verification_policy_versions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    policyId: bigint("policy_id", { mode: "number" }).notNull().references(() => verificationPolicies.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    policySnapshot: jsonb("policy_snapshot").notNull(),
    changedBy: integer("changed_by"),
    changeReason: text("change_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    policyIdx: index("verification_policy_versions_policy_idx").on(t.policyId, t.versionNumber),
  }),
);

export const verificationSwitches = pgTable(
  "verification_switches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: verificationProviderKindEnum("provider").notNull(),
    documentKind: verificationDocumentKindEnum("document_kind"),
    state: verificationSwitchStateEnum("state").notNull().default("enabled"),
    reason: text("reason"),
    trippedBy: text("tripped_by"),
    trippedAt: timestamp("tripped_at", { withTimezone: true }),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// ── Operational core ───────────────────────────────────────────────────────

export const verificationRequests = pgTable(
  "verification_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    verificationId: text("verification_id").notNull(),
    parentRequestId: bigint("parent_request_id", { mode: "number" }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    provider: verificationProviderKindEnum("provider").notNull(),
    providerConfigId: bigint("provider_config_id", { mode: "number" }).references(() => verificationProviderConfigs.id, { onDelete: "set null" }),
    documentKind: verificationDocumentKindEnum("document_kind").notNull(),
    subjectType: verificationSubjectKindEnum("subject_type").notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    riderDocumentId: bigint("rider_document_id", { mode: "number" }),
    merchantDocumentId: bigint("merchant_document_id", { mode: "number" }),
    policySnapshotId: bigint("policy_snapshot_id", { mode: "number" }).references(() => verificationPolicyVersions.id, { onDelete: "set null" }),
    status: verificationStatusKindEnum("status").notNull().default("draft"),
    statusReason: text("status_reason"),
    businessIdentifier: text("business_identifier"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    httpStatus: integer("http_status"),
    durationMs: integer("duration_ms"),
    providerReference: text("provider_reference"),
    providerDedupeBehaviour: text("provider_dedupe_behaviour").notNull().default("enforces_409"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    verificationIdUq: uniqueIndex("verification_requests_verification_id_uq").on(t.verificationId),
    subjectIdx: index("verification_requests_subject_idx").on(t.subjectType, t.subjectId, t.documentKind, t.createdAt),
    statusIdx: index("verification_requests_status_idx").on(t.status, t.createdAt),
  }),
);

export const verificationProviderPayloads = pgTable(
  "verification_provider_payloads",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requestId: bigint("request_id", { mode: "number" }).notNull().references(() => verificationRequests.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(),
    httpStatus: integer("http_status"),
    headers: jsonb("headers").notNull().default({}),
    body: jsonb("body").notNull().default({}),
    bodySha256: text("body_sha256"),
    r2Key: text("r2_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index("verification_provider_payloads_request_idx").on(t.requestId, t.createdAt),
  }),
);

export const verificationWebhooks = pgTable(
  "verification_webhooks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: verificationProviderKindEnum("provider").notNull(),
    providerEventId: text("provider_event_id"),
    eventType: text("event_type").notNull(),
    verificationId: text("verification_id").notNull(),
    signatureScheme: text("signature_scheme").notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    eventTime: timestamp("event_time", { withTimezone: true }),
    payloadRef: bigint("payload_ref", { mode: "number" }).references(() => verificationProviderPayloads.id, { onDelete: "set null" }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedEventId: bigint("applied_event_id", { mode: "number" }),
  },
  (t) => ({
    correlationIdx: index("verification_webhooks_correlation_idx").on(t.verificationId, t.receivedAt),
  }),
);

export const verificationEvents = pgTable(
  "verification_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requestId: bigint("request_id", { mode: "number" }).notNull().references(() => verificationRequests.id, { onDelete: "cascade" }),
    eventKind: verificationEventKindEnum("event_kind").notNull(),
    fromStatus: verificationStatusKindEnum("from_status"),
    toStatus: verificationStatusKindEnum("to_status").notNull(),
    actorType: verificationActorKindEnum("actor_type").notNull(),
    actorId: integer("actor_id"),
    payloadRef: bigint("payload_ref", { mode: "number" }).references(() => verificationProviderPayloads.id, { onDelete: "set null" }),
    webhookRef: bigint("webhook_ref", { mode: "number" }).references(() => verificationWebhooks.id, { onDelete: "set null" }),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index("verification_events_request_idx").on(t.requestId, t.createdAt),
    statusIdx: index("verification_events_status_idx").on(t.toStatus, t.createdAt),
  }),
);

export const verificationFiles = pgTable(
  "verification_files",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requestId: bigint("request_id", { mode: "number" }).notNull().references(() => verificationRequests.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    providerUrl: text("provider_url"),
    providerUrlExpiresAt: timestamp("provider_url_expires_at", { withTimezone: true }),
    r2Key: text("r2_key"),
    r2MirroredAt: timestamp("r2_mirrored_at", { withTimezone: true }),
    bytes: bigint("bytes", { mode: "number" }),
    contentType: text("content_type"),
    sha256: text("sha256"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index("verification_files_request_idx").on(t.requestId),
  }),
);

export const verificationDocuments = pgTable(
  "verification_documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requestId: bigint("request_id", { mode: "number" }).notNull().references(() => verificationRequests.id, { onDelete: "cascade" }),
    riderDocumentId: bigint("rider_document_id", { mode: "number" }),
    merchantDocumentId: bigint("merchant_document_id", { mode: "number" }),
    appliedToProjectionAt: timestamp("applied_to_projection_at", { withTimezone: true }),
    projectionSnapshot: jsonb("projection_snapshot").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestUq: uniqueIndex("verification_documents_request_uq").on(t.requestId),
  }),
);

// ── Ops layer ──────────────────────────────────────────────────────────────

export const verificationRetryQueue = pgTable(
  "verification_retry_queue",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requestId: bigint("request_id", { mode: "number" }).notNull().references(() => verificationRequests.id, { onDelete: "cascade" }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    status: verificationRetryStatusEnum("status").notNull().default("pending"),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const verificationProviderHealth = pgTable(
  "verification_provider_health",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: verificationProviderKindEnum("provider").notNull(),
    documentKind: verificationDocumentKindEnum("document_kind"),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    totalRequests: integer("total_requests").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    p50Ms: integer("p50_ms"),
    p95Ms: integer("p95_ms"),
    p99Ms: integer("p99_ms"),
    avgConfidence: numeric("avg_confidence", { precision: 4, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const verificationManualReviews = pgTable(
  "verification_manual_reviews",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    requestId: bigint("request_id", { mode: "number" }).notNull().references(() => verificationRequests.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    assignedTo: integer("assigned_to"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    state: verificationManualReviewStateEnum("state").notNull().default("queued"),
    notes: text("notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: integer("resolved_by"),
    resolutionDecision: verificationStatusKindEnum("resolution_decision"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    queueIdx: index("verification_manual_reviews_queue_idx").on(t.state, t.createdAt),
  }),
);

export const verificationAuditLogs = pgTable(
  "verification_audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: integer("actor_id").notNull(),
    action: text("action").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: bigint("target_id", { mode: "number" }).notNull(),
    beforeSnapshot: jsonb("before_snapshot"),
    afterSnapshot: jsonb("after_snapshot"),
    reason: text("reason"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index("verification_audit_logs_actor_idx").on(t.actorId, t.createdAt),
    targetIdx: index("verification_audit_logs_target_idx").on(t.targetKind, t.targetId, t.createdAt),
  }),
);

/** Secure KOT pickup QR tokens — see drizzle/0438_order_pickup_tokens.sql */
export const orderPickupTokens = pgTable(
  "order_pickup_tokens",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    merchantId: bigint("merchant_id", { mode: "number" }),
    storeId: bigint("store_id", { mode: "number" }),
    token: text("token").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    assignedRiderId: bigint("assigned_rider_id", { mode: "number" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    scannedByRiderId: bigint("scanned_by_rider_id", { mode: "number" }),
    scannedDevice: text("scanned_device"),
    kotNumber: text("kot_number"),
    kotVersion: integer("kot_version").notNull().default(1),
    lastKotPrintedAt: timestamp("last_kot_printed_at", { withTimezone: true }),
    kotPrintCount: integer("kot_print_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderUq: uniqueIndex("order_pickup_tokens_order_uq").on(t.orderId),
    tokenUq: uniqueIndex("order_pickup_tokens_token_uq").on(t.token),
  })
);

export const storeKotCounters = pgTable("store_kot_counters", {
  storeId: bigint("store_id", { mode: "number" }).primaryKey(),
  lastValue: bigint("last_value", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderKotPrintEvents = pgTable(
  "order_kot_print_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => ordersCore.id, { onDelete: "cascade" }),
    storeId: bigint("store_id", { mode: "number" }),
    tokenId: bigint("token_id", { mode: "number" }),
    kotNumber: text("kot_number"),
    printedAt: timestamp("printed_at", { withTimezone: true }).notNull().defaultNow(),
    printedBy: text("printed_by"),
    printChannel: text("print_channel"),
    kotVersion: integer("kot_version").notNull().default(1),
    payloadSnapshot: jsonb("payload_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("order_kot_print_events_order_idx").on(t.orderId),
    storeIdx: index("order_kot_print_events_store_idx").on(t.storeId),
  })
);

