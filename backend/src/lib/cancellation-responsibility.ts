/**
 * Centralized cancellation-responsibility mapping for the backend (auto-block path).
 *
 * Mirrors dashboard/src/lib/riders/cancellation-responsibility.ts — kept in sync so the
 * rider-fault definition that DRIVES a block is identical to the one the dashboard DISPLAYS.
 * Responsibility is derived from the existing business taxonomy
 * (order_cancellation_reason_catalog.attribute; RIDER => rider fault), never invented; a
 * cancellation is rider fault only when the reason is rider-attributed (or the actor is an
 * explicit rider self-cancel). Anything ambiguous is UNKNOWN — never inflated onto the rider.
 */

export type CancellationResponsibility =
  | "RIDER_FAULT"
  | "CUSTOMER_FAULT"
  | "MERCHANT_FAULT"
  | "COMPANY_FAULT"
  | "SYSTEM_FAULT"
  | "UNKNOWN";

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

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
  return "UNKNOWN";
}

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

export type CancellationLegSource =
  | "rider_cancel_assigned"
  | "admin_unassign"
  | (string & {})
  | null
  | undefined;

/** Resolve responsibility for one cancelled rider-accepted leg (see dashboard twin for rationale). */
export function resolveLegResponsibility(input: {
  exclusionSource?: CancellationLegSource;
  exclusionAttribute?: string | null;
  terminalAttribute?: string | null;
  cancelledBy?: string | null;
}): CancellationResponsibility {
  if (input.exclusionSource === "rider_cancel_assigned") {
    return responsibilityFromCatalogAttribute(input.exclusionAttribute) ?? "RIDER_FAULT";
  }
  if (input.exclusionSource === "admin_unassign") {
    return responsibilityFromCatalogAttribute(input.exclusionAttribute) ?? "UNKNOWN";
  }
  return (
    responsibilityFromCatalogAttribute(input.terminalAttribute) ??
    responsibilityFromRawActor(input.cancelledBy) ??
    "UNKNOWN"
  );
}
