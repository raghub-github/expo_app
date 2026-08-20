/**
 * Shared merchant list filtering/sorting for home and category browse.
 * Open stores always sort first; closed follow. Open Now + hideClosed drops closed.
 */

import type { MerchantSummary } from "@/services/merchant.service";
import type { LiveStatus } from "@/store/storeStatusStore";
import { toTimestamp } from "@/lib/storeScheduleUi";

export type MerchantListSort = "default" | "rating" | "distance";
export type DeliveryFilter = "any" | "30" | "45" | "60";

const NEAR_FAST_MAX_KM = 5;
const NEAR_FAST_MAX_MINS = 45;

export function resolveMerchantLiveStatus(
  merchant: Pick<MerchantSummary, "id" | "liveStatus" | "isOpen" | "nextOpenAt" | "nextCloseAt">,
  statusMap: Record<string, LiveStatus | undefined>
): LiveStatus {
  const rawApi = (merchant.liveStatus ?? "").toString().trim().toUpperCase();
  const apiStatus: LiveStatus | null =
    rawApi === "OPEN" ? "OPEN" : rawApi === "CLOSED" ? "CLOSED" : null;
  const fromIsOpen: LiveStatus | null =
    merchant.isOpen === true ? "OPEN" : merchant.isOpen === false ? "CLOSED" : null;
  return statusMap[merchant.id] ?? apiStatus ?? fromIsOpen ?? "CLOSED";
}

/** Same open/closed the list badge uses — live flag plus nextCloseAt / nextOpenAt. */
export function isMerchantCurrentlyOpen(
  merchant: Pick<MerchantSummary, "id" | "liveStatus" | "isOpen" | "nextOpenAt" | "nextCloseAt">,
  statusMap: Record<string, LiveStatus | undefined>,
  nowMs: number = Date.now()
): boolean {
  const live = resolveMerchantLiveStatus(merchant, statusMap);
  if (live !== "OPEN") return false;
  const nextCloseTs = toTimestamp(merchant.nextCloseAt);
  if (nextCloseTs != null && nextCloseTs <= nowMs) return false;
  return true;
}

export type MerchantListingFilters = {
  filterHasOffers?: boolean;
  deliveryFilter?: DeliveryFilter;
  selectedCuisines?: string[];
  noPackagingCharges?: boolean;
  nearFast?: boolean;
};

export function isTopBrandMerchant(m: MerchantSummary): boolean {
  const rating = Number(m.avgRating ?? 0);
  const reviews = Number(m.totalReviews ?? 0);
  const orders = Number(m.completedOrderCount ?? 0);
  return (rating >= 4 && reviews > 0) || orders >= 5;
}

function merchantHasPackagingCharge(m: MerchantSummary): boolean {
  const amount = m.packagingChargeAmount ?? 0;
  return Number.isFinite(amount) && amount > 0;
}

function parseDeliveryMinutes(deliveryTime?: string): number {
  if (!deliveryTime) return NaN;
  return parseInt(deliveryTime.replace(/\D/g, ""), 10);
}

function passesNearFast(m: MerchantSummary): boolean {
  const mins = parseDeliveryMinutes(m.deliveryTime);
  const km = m.distanceKm;
  const hasMins = Number.isFinite(mins);
  const hasKm = km != null && Number.isFinite(km);
  if (!hasMins && !hasKm) return true;
  const fast = hasMins && mins <= NEAR_FAST_MAX_MINS;
  const near = hasKm && km <= NEAR_FAST_MAX_KM;
  return fast || near;
}

function passesListingFilters(m: MerchantSummary, filters: MerchantListingFilters): boolean {
  if (filters.filterHasOffers && !m.offerText) return false;
  if (filters.noPackagingCharges && merchantHasPackagingCharge(m)) return false;
  if (filters.nearFast && !passesNearFast(m)) return false;
  if (filters.deliveryFilter && filters.deliveryFilter !== "any" && m.deliveryTime) {
    const mins = parseDeliveryMinutes(m.deliveryTime);
    if (!Number.isNaN(mins)) {
      const max = parseInt(filters.deliveryFilter, 10);
      if (mins > max) return false;
    }
  }
  const cuisines = filters.selectedCuisines ?? [];
  if (cuisines.length > 0 && m.cuisines?.length) {
    const hasMatch = cuisines.some((c) =>
      m.cuisines!.some((mc) => mc.toLowerCase().includes(c.toLowerCase()))
    );
    if (!hasMatch) return false;
  } else if (cuisines.length > 0) {
    return false;
  }
  return true;
}

/** Filter by delivery/cuisine/offers; open stores always sort before closed. */
export function filterAndSortMerchants(
  merchants: MerchantSummary[],
  statusMap: Record<string, LiveStatus | undefined>,
  options: {
    openNow: boolean;
    sortBy?: MerchantListSort;
    /** When true with openNow, closed stores are removed instead of sorted last. */
    hideClosed?: boolean;
  } & MerchantListingFilters
): MerchantSummary[] {
  const { openNow, sortBy = "default", hideClosed = false, ...filters } = options;
  let list = merchants.filter((m) => passesListingFilters(m, filters));
  const nowMs = Date.now();
  const isOpen = (m: MerchantSummary) => isMerchantCurrentlyOpen(m, statusMap, nowMs);
  if (hideClosed && openNow) {
    list = list.filter((m) => isOpen(m));
  }

  return [...list].sort((a, b) => {
    const aOpen = isOpen(a);
    const bOpen = isOpen(b);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (sortBy === "rating") return (b.avgRating ?? 0) - (a.avgRating ?? 0);
    if (sortBy === "distance") return (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
    return 0;
  });
}

export function merchantListingStoreCountLabel(
  merchants: MerchantSummary[],
  statusMap: Record<string, LiveStatus | undefined>,
  openNow: boolean
): string {
  const total = merchants.length;
  if (total === 0) return "0 stores";
  if (!openNow) return `${total} ${total === 1 ? "store" : "stores"}`;
  const open = merchants.filter((m) => resolveMerchantLiveStatus(m, statusMap) === "OPEN").length;
  const closed = total - open;
  if (closed > 0) {
    return `${open} open · ${closed} closed`;
  }
  return `${total} ${total === 1 ? "store" : "stores"}`;
}

/** Open-store count for the restaurant section subline (always from full nearby list). */
export function openRestaurantsDeliveringLabel(
  merchants: MerchantSummary[],
  statusMap: Record<string, LiveStatus | undefined>
): string {
  const open = merchants.filter((m) => resolveMerchantLiveStatus(m, statusMap) === "OPEN").length;
  if (open === 0) return "NO RESTAURANTS OPEN NEAR YOU";
  return `${open} RESTAURANT${open === 1 ? "" : "S"} DELIVERING TO YOU`;
}
