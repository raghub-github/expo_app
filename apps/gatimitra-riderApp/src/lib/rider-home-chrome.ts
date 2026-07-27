import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { isActiveRiderOrder } from "@/src/lib/active-order-display";

/**
 * Rider home map chrome — visibility is driven by duty + order state.
 * Active Ride pill stays visible while an active order exists — even if OFF duty.
 */
export type RiderHomeChromeInput = {
  isOnDuty: boolean;
  activeOrders: RiderOrderSummary[];
  availableOrders: RiderOrderSummary[];
};

export type RiderHomeChrome = {
  /** OFF-DUTY CTA over the map. */
  showOffDutyBanner: boolean;
  /** Fetch + poll high-demand / heatmap data. */
  fetchDemandZones: boolean;
  /**
   * High Demand Zone row — ON duty and idle only.
   * Hidden while an active order is assigned (pickup / drop / navigation).
   */
  showHighDemandSection: boolean;
  /** Top "Searching for orders" pill. */
  showSearchingPill: boolean;
  /** Floating Active Ride card + badge — any time an active order exists. */
  showActiveRideFab: boolean;
  /** Radar pulse on the rider pin. */
  showSearchingRadar: boolean;
  hasActiveOrder: boolean;
  hasIncomingOffer: boolean;
};

export function resolveRiderHomeChrome({
  isOnDuty,
  activeOrders,
  availableOrders,
}: RiderHomeChromeInput): RiderHomeChrome {
  const hasActiveOrder = activeOrders.some(isActiveRiderOrder);
  const hasIncomingOffer =
    isOnDuty && !hasActiveOrder && availableOrders.length > 0;

  if (!isOnDuty) {
    return {
      showOffDutyBanner: true,
      fetchDemandZones: false,
      showHighDemandSection: false,
      showSearchingPill: false,
      // Keep Active Ride reachable after duty is toggled off mid-trip.
      showActiveRideFab: hasActiveOrder,
      showSearchingRadar: false,
      hasActiveOrder,
      hasIncomingOffer: false,
    };
  }

  // ON duty — demand suggestions only while idle (no active order).
  const showDemand = !hasActiveOrder;

  return {
    showOffDutyBanner: false,
    fetchDemandZones: showDemand,
    showHighDemandSection: showDemand,
    showSearchingPill: !hasActiveOrder && !hasIncomingOffer,
    showActiveRideFab: hasActiveOrder,
    showSearchingRadar: !hasActiveOrder && !hasIncomingOffer,
    hasActiveOrder,
    hasIncomingOffer,
  };
}
