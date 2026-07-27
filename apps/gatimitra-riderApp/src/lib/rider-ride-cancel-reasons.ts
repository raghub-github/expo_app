/** Offline fallback when cancellation catalog API is unavailable. */
export type RiderCancelReasonItem = {
  id?: number;
  reasonCode: string;
  label: string;
  serviceType?: string | null;
  sortOrder?: number;
};

export const RIDER_CANCEL_REASON_FALLBACK: RiderCancelReasonItem[] = [
  { reasonCode: "app_rider_vehicle_issue", label: "Vehicle breakdown / issue", serviceType: null, sortOrder: 1 },
  { reasonCode: "app_rider_customer_unreachable", label: "Customer not responding", serviceType: null, sortOrder: 2 },
  { reasonCode: "app_rider_wrong_pickup", label: "Wrong pickup location", serviceType: null, sortOrder: 3 },
  { reasonCode: "app_rider_unsafe_area", label: "Unsafe area", serviceType: null, sortOrder: 4 },
  { reasonCode: "app_rider_long_wait", label: "Waiting too long at pickup", serviceType: null, sortOrder: 5 },
  { reasonCode: "app_rider_other", label: "Other reason", serviceType: null, sortOrder: 99 },
];

export type RiderCancelServiceType = "food" | "person_ride" | "parcel";

export function mapVariantToServiceType(
  variant: "ride" | "food" | "parcel"
): RiderCancelServiceType {
  if (variant === "food") return "food";
  if (variant === "parcel") return "parcel";
  return "person_ride";
}

export function normalizeCancelServiceType(
  raw: string | null | undefined
): RiderCancelServiceType | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!v || v === "all") return null;
  if (v === "ride" || v === "person") return "person_ride";
  if (v === "food" || v === "person_ride" || v === "parcel") return v;
  return null;
}

/**
 * Catalog rule: Service=All (null) shows on every cancel sheet;
 * plus rows matching the active order's service type.
 */
export function filterCancelReasonsForService<
  T extends {
    attribute?: string | null;
    serviceType?: string | null;
    sortOrder?: number;
    id?: number;
    reasonCode: string;
    label: string;
  },
>(rows: T[], serviceType: RiderCancelServiceType): T[] {
  const filtered = rows.filter((r) => {
    if (String(r.attribute ?? "RIDER").trim().toUpperCase() !== "RIDER") return false;
    const st = normalizeCancelServiceType(r.serviceType);
    return st == null || st === serviceType;
  });

  return filtered.sort((a, b) => {
    const aAll = normalizeCancelServiceType(a.serviceType) == null ? 0 : 1;
    const bAll = normalizeCancelServiceType(b.serviceType) == null ? 0 : 1;
    if (aAll !== bAll) return aAll - bAll;
    const ao = Number(a.sortOrder ?? 0);
    const bo = Number(b.sortOrder ?? 0);
    if (ao !== bo) return ao - bo;
    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });
}
