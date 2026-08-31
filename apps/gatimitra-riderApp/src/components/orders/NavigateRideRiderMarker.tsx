import React from "react";
import { NavRiderDotMarker } from "@/src/components/orders/NavRiderDotMarker";

type Props = {
  headingDeg?: number;
};

/**
 * @deprecated Navigation uses {@link NavRiderDotMarker} (mint live-location dot).
 * Kept as a compatibility alias so legacy imports never render a vehicle icon.
 */
export function NavigateRideRiderMarker(_props: Props) {
  return <NavRiderDotMarker />;
}

export const NAV_RIDER_MARKER_W = 22;
export const NAV_RIDER_MARKER_H = 22;
