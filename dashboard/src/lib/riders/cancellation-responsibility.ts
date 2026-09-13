/**
 * Centralized cancellation-responsibility mapping (single source of truth).
 *
 * Responsibility is NOT invented here — it is derived from the existing business
 * taxonomy already in the database:
 *   - order_cancellation_reason_catalog.attribute  (per reason_code: CUSTOMER | MERCHANT | RIDER | OTHER, extensible)
 *   - order_cancellation_attributes                (the fault-party master; RIDER => 3pl_fault)
 * with a defensive fallback to the raw actor recorded on orders_core.cancelled_by
 * (customer | merchant | rider | system/SYSTEM | admin/agent/company).
 *
 * Business rule (do NOT over-blame the rider): a cancellation is RIDER_FAULT ONLY
 * when the catalog attribute for its reason is 'RIDER', or the raw actor is explicitly
 * 'rider'. Anything ambiguous resolves to UNKNOWN — never silently dropped, never
 * inflated onto the rider.
 */

export type CancellationResponsibility =
  | "RIDER_FAULT"
  | "CUSTOMER_FAULT"
  | "MERCHANT_FAULT"
  | "COMPANY_FAULT"
  | "SYSTEM_FAULT"
  | "UNKNOWN";

export const CANCELLATION_RESPONSIBILITIES: readonly CancellationResponsibility[] = [
  "RIDER_FAULT",
  "CUSTOMER_FAULT",
  "MERCHANT_FAULT",
  "COMPANY_FAULT",
  "SYSTEM_FAULT",
  "UNKNOWN",
] as const;

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Map an order_cancellation_reason_catalog.attribute to a canonical responsibility.
 * Attributes are configurable (super admin can add more), so this is name-based and
 * tolerant of new values rather than a closed enum.
 */
export function responsibilityFromCatalogAttribute(
  attribute: string | null | undefined
): CancellationResponsibility | null {
  const a = norm(attribute);
  if (!a) return null;
  if (a === "rider" || a === "3pl" || a === "3pl_fault") return "RIDER_FAULT";
  if (a === "customer") return "CUSTOMER_FAULT";
  if (a === "merchant") return "MERCHANT_FAULT";
  if (a === "company" || a === "admin" || a === "platform" || a === "gatimitra") return "COMPANY_FAULT";
  if (a === "system") return "SYSTEM_FAULT";
  if (a === "other") return "UNKNOWN";
  // Unrecognized (newly-added) attribute: do not guess rider fault.
  return "UNKNOWN";
}

/**
 * Map the raw actor stored on orders_core.cancelled_by (or order_cancellation_reasons.cancelled_by)
 * to a canonical responsibility. Used only when no catalog attribute is available.
 */
export function responsibilityFromRawActor(
  actor: string | null | undefined
): CancellationResponsibility | null {
  const a = norm(actor);
  if (!a) return null;
  if (a === "rider") return "RIDER_FAULT";
  if (a === "customer") return "CUSTOMER_FAULT";
  if (a === "merchant") return "MERCHANT_FAULT";
  if (a === "system" || a === "timeout" || a === "auto") return "SYSTEM_FAULT";
  if (a === "admin" || a === "agent" || a === "company" || a === "platform") return "COMPANY_FAULT";
  return "UNKNOWN";
}

/**
 * Resolve the final responsibility for one cancellation. Catalog attribute (the explicit
 * business classification) wins; raw actor is the fallback; UNKNOWN is the floor.
 */
export function resolveCancellationResponsibility(input: {
  catalogAttribute?: string | null;
  cancelledBy?: string | null;
}): CancellationResponsibility {
  return (
    responsibilityFromCatalogAttribute(input.catalogAttribute) ??
    responsibilityFromRawActor(input.cancelledBy) ??
    "UNKNOWN"
  );
}
