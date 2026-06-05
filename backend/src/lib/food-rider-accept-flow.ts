/**
 * Super-admin configurable food rider accept flow.
 * Always reads fresh from DB — no cache, no hardcoded fallbacks for food.
 */

import { getSql } from "../db/client.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";
import { FOOD_DISPATCHABLE_ORDER_STATUSES } from "./order-assignment-engine.js";

export type RiderAcceptFlowMode = "before_merchant_accept" | "after_merchant_accept";

const VALID_MODES = new Set<RiderAcceptFlowMode>([
  "before_merchant_accept",
  "after_merchant_accept",
]);

/** Food statuses eligible for rider dispatch after merchant has accepted. */
export const FOOD_DISPATCHABLE_AFTER_MERCHANT_ACCEPT_STATUSES = [
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
] as const;

const AFTER_MERCHANT_ACCEPT_SET = new Set<string>(
  FOOD_DISPATCHABLE_AFTER_MERCHANT_ACCEPT_STATUSES
);

export class FoodRiderAcceptFlowConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoodRiderAcceptFlowConfigurationError";
  }
}

export async function fetchServiceRiderAcceptFlow(
  serviceType: DispatchServiceType
): Promise<RiderAcceptFlowMode> {
  const sql = getSql();
  const rows = (await sql`
    SELECT rider_accept_flow
    FROM platform_service_rider_accept_flow
    WHERE service_type = ${serviceType}
    LIMIT 1
  `) as Array<{ rider_accept_flow: string }>;

  const raw = String(rows[0]?.rider_accept_flow ?? "").trim();
  if (!VALID_MODES.has(raw as RiderAcceptFlowMode)) {
    throw new FoodRiderAcceptFlowConfigurationError(
      `Rider accept flow for "${serviceType}" is not configured in platform_service_rider_accept_flow`
    );
  }
  return raw as RiderAcceptFlowMode;
}

export async function fetchFoodRiderAcceptFlow(): Promise<RiderAcceptFlowMode> {
  return fetchServiceRiderAcceptFlow("food");
}

/** Whether a food order food_status allows rider dispatch under the configured flow. */
export async function isFoodStatusDispatchableForConfiguredFlow(
  foodStatus: string | null | undefined
): Promise<boolean> {
  const status = String(foodStatus ?? "").trim().toUpperCase();
  if (!status) return false;

  const flow = await fetchFoodRiderAcceptFlow();
  if (flow === "before_merchant_accept") {
    return (FOOD_DISPATCHABLE_ORDER_STATUSES as readonly string[]).includes(status);
  }
  return AFTER_MERCHANT_ACCEPT_SET.has(status);
}

/** Status list for SQL IN (...) filters — flow-aware. */
export async function fetchFoodDispatchableStatusesForFlow(): Promise<readonly string[]> {
  const flow = await fetchFoodRiderAcceptFlow();
  if (flow === "after_merchant_accept") {
    return FOOD_DISPATCHABLE_AFTER_MERCHANT_ACCEPT_STATUSES;
  }
  return FOOD_DISPATCHABLE_ORDER_STATUSES;
}
