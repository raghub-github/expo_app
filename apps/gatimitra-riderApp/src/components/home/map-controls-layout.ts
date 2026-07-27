/** Shared spacing for rider home map floating controls (Rapido / Uber style). */
export const MAP_FLOATING_EDGE = 20;
export const MAP_FLOATING_STACK_GAP = 16;
export const OFF_DUTY_BANNER_HEIGHT = 62;
export const LOCATE_ME_FAB_SIZE = 48;
/** High-demand banner height when docked like OffDutyBanner. */
export const DEMAND_ZONES_BANNER_HEIGHT = 62;
export const DEMAND_ZONES_FAB_CLEARANCE = 12;

export function mapRightControlsBottomInset(options: {
  showOffDutyBanner?: boolean;
  hasDemandZonesDock?: boolean;
}): number {
  if (options.showOffDutyBanner) {
    // Keep Locate FAB clearly above the Turn On CTA (avoid stealing the first tap).
    return OFF_DUTY_BANNER_HEIGHT + MAP_FLOATING_EDGE + 16;
  }
  if (options.hasDemandZonesDock) {
    return DEMAND_ZONES_BANNER_HEIGHT + MAP_FLOATING_EDGE;
  }
  return MAP_FLOATING_EDGE;
}
