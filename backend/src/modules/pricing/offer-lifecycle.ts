/**
 * Offer lifecycle helpers — V3 status transitions without deleting legacy is_active.
 */
import type { OfferLifecycleStatus } from "./pricing.types.js";

export function resolveLifecycleOnPublish(
  validFrom: Date,
  validTill: Date,
  now: Date = new Date()
): { lifecycleStatus: OfferLifecycleStatus; isActive: boolean } {
  if (validTill < now) {
    return { lifecycleStatus: "EXPIRED", isActive: false };
  }
  if (validFrom > now) {
    return { lifecycleStatus: "SCHEDULED", isActive: true };
  }
  return { lifecycleStatus: "ACTIVE", isActive: true };
}

export function resolveLifecycleOnDraft(): {
  lifecycleStatus: OfferLifecycleStatus;
  isActive: boolean;
} {
  return { lifecycleStatus: "DRAFT", isActive: false };
}

export function resolveLifecycleOnDisable(): {
  lifecycleStatus: OfferLifecycleStatus;
  isActive: boolean;
} {
  return { lifecycleStatus: "DISABLED", isActive: false };
}

export function syncLifecycleFromDates(
  current: OfferLifecycleStatus,
  validFrom: Date,
  validTill: Date,
  isActiveFlag: boolean,
  now: Date = new Date()
): OfferLifecycleStatus {
  if (current === "DRAFT" || current === "DISABLED") return current;
  if (!isActiveFlag && current !== "EXPIRED") return "DISABLED";
  if (validTill < now) return "EXPIRED";
  if (validFrom > now) return "SCHEDULED";
  return "ACTIVE";
}

export function lifecycleEligibleForPricing(status: OfferLifecycleStatus | null | undefined): boolean {
  return status === "ACTIVE" || status == null;
}
