/**
 * Shared merchant list filtering/sorting for home and category browse.
 * Open Now: open stores first, closed greyed at bottom (card handles dim). Does not hide closed.
 */

import type { MerchantSummary } from "@/services/merchant.service";
import type { LiveStatus } from "@/store/storeStatusStore";

export type MerchantListSort = "default" | "rating" | "distance";
export type DeliveryFilter = "any" | "30" | "45" | "60";

export function resolveMerchantLiveStatus(
  merchant: Pick<MerchantSummary, "id" | "liveStatus">,
  statusMap: Record<string, LiveStatus | undefined>
): LiveStatus {
  const rawApi = (merchant.liveStatus ?? "").toString().trim().toUpperCase();
  const apiStatus: LiveStatus | null =
    rawApi === "OPEN" ? "OPEN" : rawApi === "CLOSED" ? "CLOSED" : null;
  return statusMap[merchant.id] ?? apiStatus ?? "CLOSED";
}

export type MerchantListingFilters = {
  filterHasOffers?: boolean;
  deliveryFilter?: DeliveryFilter;
  selectedCuisines?: string[];
};

function passesListingFilters(m: MerchantSummary, filters: MerchantListingFilters): boolean {
  if (filters.filterHasOffers && !m.offerText) return false;
  if (filters.deliveryFilter && filters.deliveryFilter !== "any" && m.deliveryTime) {
    const mins = parseInt(m.deliveryTime.replace(/\D/g, ""), 10);
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

/** Filter by delivery/cuisine/offers; sort open-first when openNow, else by sortBy only. */
export function filterAndSortMerchants(
  merchants: MerchantSummary[],
  statusMap: Record<string, LiveStatus | undefined>,
  options: {
    openNow: boolean;
    sortBy?: MerchantListSort;
  } & MerchantListingFilters
): MerchantSummary[] {
  const { openNow, sortBy = "default", ...filters } = options;
  const list = merchants.filter((m) => passesListingFilters(m, filters));
  const isOpen = (m: MerchantSummary) => resolveMerchantLiveStatus(m, statusMap) === "OPEN";

  return [...list].sort((a, b) => {
    if (openNow) {
      const aOpen = isOpen(a);
      const bOpen = isOpen(b);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
    }
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
