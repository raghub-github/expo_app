/** Shared spacing for rider home map floating controls (Rapido / Uber style). */
export const MAP_FLOATING_EDGE = 20;
export const MAP_FLOATING_STACK_GAP = 16;
export const OFF_DUTY_BANNER_HEIGHT = 62;
export const LOCATE_ME_FAB_SIZE = 48;
/** Full-width active ride dock above tab bar (pill + padding). */
export const ACTIVE_RIDE_DOCK_HEIGHT = 56;
export const ACTIVE_RIDE_DOCK_BOTTOM_GAP = 0;
export const MAP_CONTROLS_ABOVE_DOCK_GAP = 14;

export function mapRightControlsBottomInset(options: {
  showOffDutyBanner?: boolean;
  hasActiveRideDock?: boolean;
}): number {
  if (options.showOffDutyBanner) {
    return OFF_DUTY_BANNER_HEIGHT + MAP_FLOATING_EDGE;
  }
  if (options.hasActiveRideDock) {
    return (
      MAP_FLOATING_EDGE +
      ACTIVE_RIDE_DOCK_HEIGHT +
      ACTIVE_RIDE_DOCK_BOTTOM_GAP +
      MAP_CONTROLS_ABOVE_DOCK_GAP
    );
  }
  return MAP_FLOATING_EDGE;
}
