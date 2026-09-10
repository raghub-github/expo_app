/** Shared spacing for rider home map floating controls (Rapido / Uber style). */

import { floatingControlsBottomInMap } from "@/src/lib/rider-bottom-dock";

export const MAP_FLOATING_EDGE = 16;
export const MAP_FLOATING_STACK_GAP = 12;
export const OFF_DUTY_BANNER_HEIGHT = 62;
export const LOCATE_ME_FAB_SIZE = 48;
/** High-demand banner height when docked like OffDutyBanner. */
export const DEMAND_ZONES_BANNER_HEIGHT = 62;
export const DEMAND_ZONES_FAB_CLEARANCE = 12;

export {
  floatingControlsBottomInMap,
  type BottomDockLayers,
  type BottomDockResolved,
} from "@/src/lib/rider-bottom-dock";

/** @deprecated Prefer floatingControlsBottomInMap + measured dockHeight. */
export function mapRightControlsBottomInset(options: {
  showOffDutyBanner?: boolean;
  hasDemandZonesDock?: boolean;
  dockHeight?: number;
  edge?: number;
}): number {
  const edge = options.edge ?? MAP_FLOATING_EDGE;
  const measured = options.dockHeight;
  const panel =
    measured && measured > 0
      ? measured
      : options.showOffDutyBanner || options.hasDemandZonesDock
        ? DEMAND_ZONES_BANNER_HEIGHT
        : 0;
  return floatingControlsBottomInMap({
    panelHeight: panel,
    offDuty: options.showOffDutyBanner,
    edge,
  });
}
