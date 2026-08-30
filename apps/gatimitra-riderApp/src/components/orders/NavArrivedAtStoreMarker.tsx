import React from "react";
import { NavStoreGreenPinMarker } from "@/src/components/orders/NavStoreGreenPinMarker";

type Props = {
  headingDeg?: number;
};

/** Rider reached store — green destination pin (no vehicle icon). */
export function NavArrivedAtStoreMarker(_props: Props) {
  return <NavStoreGreenPinMarker />;
}

export const NAV_ARRIVED_MARKER_W = 44;
export const NAV_ARRIVED_MARKER_H = 56;
