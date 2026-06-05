/**
 * Service-based active assignment limit engine (DB-driven).
 * Used by dispatch pool, waves, push, socket, and accept validation.
 */

import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { ordersCore, ordersFood, ordersRide } from "../db/schema.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";

export type ServiceAssignmentLimitRow = {
  serviceType: DispatchServiceType;
  maxActiveAssignments: number;
  exclusiveMode: boolean;
  isActive: boolean;
};

export type DispatchAssignmentSettings = {
  allowCrossServiceAssignments: boolean;
  personRideExclusiveMode: boolean;
  isActive: boolean;
};

export type ServiceAssignmentLimitsConfig = {
  limits: Record<DispatchServiceType, ServiceAssignmentLimitRow>;
  global: DispatchAssignmentSettings;
};

export type RiderActiveAssignmentCounts = {
  food: number;
  parcel: number;
  person_ride: number;
  total: number;
};

export type AssignmentEligibilityResult = {
  eligible: boolean;
  serviceType: DispatchServiceType;
  counts: RiderActiveAssignmentCounts;
  assignmentLimitUsed: number;
  crossServiceRuleApplied: boolean;
  personRideExclusiveApplied: boolean;
  blockReason: string | null;
};

export type AssignmentEligibilityAuditContext = {
  orderCoreId?: number;
  orderId?: string;
  eventContext?: "dispatch_offer" | "dispatch_accept" | "pool_list";
};

const ACTIVE_CORE_TERMINAL = ["delivered", "cancelled", "failed"] as const;
const ACTIVE_FOOD_TERMINAL = ["DELIVERED", "CANCELLED", "RTO"] as const;

const ALL_SERVICES: DispatchServiceType[] = ["food", "parcel", "person_ride"];

export class RiderAssignmentControlConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RiderAssignmentControlConfigError";
  }
}

/** Load per-service limits + global dispatch assignment settings from DB. */
export async function fetchServiceAssignmentLimitsConfig(): Promise<ServiceAssignmentLimitsConfig> {
  const sqlClient = getSql();

  const limitRows = (await sqlClient`
    SELECT service_type, max_active_assignments, exclusive_mode, is_active
    FROM platform_service_assignment_limits
    WHERE is_active = true
  `) as Array<{
    service_type: string;
    max_active_assignments: number;
    exclusive_mode: boolean;
    is_active: boolean;
  }>;

  const globalRows = (await sqlClient`
    SELECT
      allow_cross_service_assignments,
      person_ride_exclusive_mode,
      is_active
    FROM platform_dispatch_assignment_settings
    WHERE id = 1 AND is_active = true
    LIMIT 1
  `) as Array<{
    allow_cross_service_assignments: boolean;
    person_ride_exclusive_mode: boolean;
    is_active: boolean;
  }>;

  const globalRow = globalRows[0];
  if (!globalRow) {
    throw new RiderAssignmentControlConfigError(
      "platform_dispatch_assignment_settings row missing (id=1)"
    );
  }

  const limits = {} as Record<DispatchServiceType, ServiceAssignmentLimitRow>;
  for (const st of ALL_SERVICES) {
    const row = limitRows.find((r) => r.service_type === st);
    if (!row) {
      throw new RiderAssignmentControlConfigError(
        `platform_service_assignment_limits missing active row for ${st}`
      );
    }
    const max = Number(row.max_active_assignments);
    if (!Number.isFinite(max) || max < 1) {
      throw new RiderAssignmentControlConfigError(`Invalid max_active_assignments for ${st}`);
    }
    limits[st] = {
      serviceType: st,
      maxActiveAssignments: Math.round(max),
      exclusiveMode: Boolean(row.exclusive_mode),
      isActive: Boolean(row.is_active),
    };
  }

  return {
    limits,
    global: {
      allowCrossServiceAssignments: Boolean(globalRow.allow_cross_service_assignments),
      personRideExclusiveMode: Boolean(globalRow.person_ride_exclusive_mode),
      isActive: Boolean(globalRow.is_active),
    },
  };
}

/** Count non-terminal assigned orders per service for a rider. */
export async function countRiderActiveAssignments(
  riderId: number
): Promise<RiderActiveAssignmentCounts> {
  const db = getDb();

  const [foodCountRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "food"),
        notInArray(ordersCore.status, [...ACTIVE_CORE_TERMINAL]),
        notInArray(ordersFood.orderStatus, [...ACTIVE_FOOD_TERMINAL])
      )
    );

  const [parcelCountRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ordersCore)
    .where(
      and(
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "parcel"),
        notInArray(ordersCore.status, [...ACTIVE_CORE_TERMINAL])
      )
    );

  const [rideCountRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.riderId, riderId),
        eq(ordersCore.orderType, "person_ride"),
        notInArray(ordersCore.status, [...ACTIVE_CORE_TERMINAL]),
        isNull(ordersRide.cancelledAt)
      )
    );

  const food = Number(foodCountRow?.n ?? 0);
  const parcel = Number(parcelCountRow?.n ?? 0);
  const person_ride = Number(rideCountRow?.n ?? 0);

  return { food, parcel, person_ride, total: food + parcel + person_ride };
}

function sameServiceCount(
  counts: RiderActiveAssignmentCounts,
  serviceType: DispatchServiceType
): number {
  if (serviceType === "food") return counts.food;
  if (serviceType === "parcel") return counts.parcel;
  return counts.person_ride;
}

/**
 * Core eligibility for receiving one more offer of `serviceType` (simulates accept).
 * Person ride: blocks food/parcel when any food/parcel active; blocks all when person ride active (exclusive).
 */
export function evaluateRiderAssignmentEligibility(
  counts: RiderActiveAssignmentCounts,
  serviceType: DispatchServiceType,
  config: ServiceAssignmentLimitsConfig
): AssignmentEligibilityResult {
  const limit = config.limits[serviceType];
  const { global } = config;
  const crossServiceRuleApplied = !global.allowCrossServiceAssignments;
  const personRideExclusiveApplied =
    global.personRideExclusiveMode && config.limits.person_ride.exclusiveMode;

  const base: AssignmentEligibilityResult = {
    eligible: true,
    serviceType,
    counts,
    assignmentLimitUsed: limit.maxActiveAssignments,
    crossServiceRuleApplied,
    personRideExclusiveApplied,
    blockReason: null,
  };

  // Active person ride → no food, parcel, or additional person rides
  if (counts.person_ride > 0) {
    if (serviceType !== "person_ride") {
      return {
        ...base,
        eligible: false,
        blockReason: "Rider has an active person ride; no other service offers allowed",
        personRideExclusiveApplied: true,
      };
    }
    if (counts.person_ride >= limit.maxActiveAssignments) {
      return {
        ...base,
        eligible: false,
        blockReason: `Person ride limit reached (${limit.maxActiveAssignments})`,
      };
    }
    return base;
  }

  // Active food or parcel → no person ride offers
  if (serviceType === "person_ride" && (counts.food > 0 || counts.parcel > 0)) {
    return {
      ...base,
      eligible: false,
      blockReason: "Rider has active food/parcel; person ride offers blocked",
      personRideExclusiveApplied: true,
    };
  }

  const sameCount = sameServiceCount(counts, serviceType);
  if (sameCount >= limit.maxActiveAssignments) {
    return {
      ...base,
      eligible: false,
      blockReason: `${serviceType} limit reached (${limit.maxActiveAssignments} active)`,
    };
  }

  if (!global.allowCrossServiceAssignments) {
    const otherFood = serviceType !== "food" ? counts.food : 0;
    const otherParcel = serviceType !== "parcel" ? counts.parcel : 0;
    const otherRide = serviceType !== "person_ride" ? counts.person_ride : 0;
    if (otherFood > 0 || otherParcel > 0 || otherRide > 0) {
      return {
        ...base,
        eligible: false,
        blockReason: "Cross-service assignments disabled",
        crossServiceRuleApplied: true,
      };
    }
  }

  return base;
}

/** Human-readable rule summary for Super Admin UI. */
export function buildAssignmentRuleSummary(
  config: ServiceAssignmentLimitsConfig
): string[] {
  const { limits, global } = config;
  const lines: string[] = [
    `Food: up to ${limits.food.maxActiveAssignments} active order(s) at a time.`,
    `Parcel: up to ${limits.parcel.maxActiveAssignments} active order(s) at a time.`,
    `Person ride: up to ${limits.person_ride.maxActiveAssignments} active ride(s) at a time.`,
  ];

  if (global.personRideExclusiveMode && limits.person_ride.exclusiveMode) {
    lines.push(
      "Person ride exclusive: any active ride blocks Food, Parcel, and extra rides; Food/Parcel block new person rides."
    );
  }

  if (global.allowCrossServiceAssignments) {
    lines.push(
      "Cross-service ON: limits apply per service (e.g. Food + Parcel can stack within each cap)."
    );
  } else {
    lines.push(
      "Cross-service OFF: rider may only stack orders within the same service until that service limit is reached."
    );
  }

  return lines;
}

export async function recordRiderDispatchEligibilityAudit(
  riderId: number,
  result: AssignmentEligibilityResult,
  ctx?: AssignmentEligibilityAuditContext
): Promise<void> {
  const sqlClient = getSql();
  try {
    await sqlClient`
      INSERT INTO rider_dispatch_eligibility_audit (
        order_core_id,
        order_id,
        rider_id,
        service_type,
        active_food_orders,
        active_parcel_orders,
        active_person_rides,
        assignment_limit_used,
        cross_service_rule_applied,
        person_ride_exclusive_applied,
        eligibility_result,
        block_reason,
        event_context
      )
      VALUES (
        ${ctx?.orderCoreId ?? null},
        ${ctx?.orderId?.trim() ?? null},
        ${riderId},
        ${result.serviceType},
        ${result.counts.food},
        ${result.counts.parcel},
        ${result.counts.person_ride},
        ${result.assignmentLimitUsed},
        ${result.crossServiceRuleApplied},
        ${result.personRideExclusiveApplied},
        ${result.eligible ? "eligible" : "blocked"},
        ${result.blockReason},
        ${ctx?.eventContext ?? "dispatch_offer"}
      )
    `;
  } catch (err) {
    console.warn("[assignment-control] eligibility audit insert failed", (err as Error).message);
  }
}

export async function evaluateAndAuditRiderAssignmentEligibility(
  riderId: number,
  serviceType: DispatchServiceType,
  ctx?: AssignmentEligibilityAuditContext
): Promise<AssignmentEligibilityResult> {
  const [config, counts] = await Promise.all([
    fetchServiceAssignmentLimitsConfig(),
    countRiderActiveAssignments(riderId),
  ]);
  const result = evaluateRiderAssignmentEligibility(counts, serviceType, config);
  if (ctx?.orderCoreId != null || ctx?.eventContext === "dispatch_accept") {
    void recordRiderDispatchEligibilityAudit(riderId, result, ctx);
  }
  return result;
}

export async function canRiderReceiveDispatchOffer(
  riderId: number,
  serviceType: DispatchServiceType,
  auditCtx?: AssignmentEligibilityAuditContext
): Promise<boolean> {
  try {
    const result = await evaluateAndAuditRiderAssignmentEligibility(
      riderId,
      serviceType,
      auditCtx
    );
    return result.eligible;
  } catch (err) {
    console.error("[assignment-control] eligibility check failed", (err as Error).message);
    return false;
  }
}

export async function assertRiderCanAcceptDispatchOffer(
  riderId: number,
  serviceType: DispatchServiceType,
  auditCtx?: AssignmentEligibilityAuditContext
): Promise<void> {
  const result = await evaluateAndAuditRiderAssignmentEligibility(riderId, serviceType, {
    ...auditCtx,
    eventContext: "dispatch_accept",
  });
  if (!result.eligible) {
    const err = Object.assign(
      new Error(
        result.blockReason ??
          "You already have an active order. Complete or cancel it before accepting another."
      ),
      { statusCode: 403, code: "RIDER_ACTIVE_ASSIGNMENT_LIMIT" }
    );
    throw err;
  }
}

/** @deprecated Use fetchServiceAssignmentLimitsConfig */
export async function fetchRiderAssignmentControlSettings(): Promise<never> {
  throw new RiderAssignmentControlConfigError(
    "rider_assignment_control_settings is deprecated; use platform_service_assignment_limits"
  );
}

/** @deprecated */
export function evaluateRiderCanAddAssignment(): never {
  throw new RiderAssignmentControlConfigError("evaluateRiderCanAddAssignment is deprecated");
}
