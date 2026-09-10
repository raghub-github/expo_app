/**
 * Rider bottom-dock layout math — one place for tab bar + panels + FABs + safe area.
 *
 * Stack (bottom → top):
 *   tab bar (+ system inset)
 *   optional bottom panel (demand / off-duty)
 *   floating controls
 *   optional bottom sheet (handled by sheet shell maxHeight)
 *
 * Pure module (no react-native) so Node unit tests can import it.
 */

/** Fallback until RiderTabBar onLayout — keep in sync with riderBottomDockStore. */
export const TAB_BAR_CONTENT_HEIGHT_FALLBACK = 58;

/** Mirror of resolveRiderTabBarBottomInset — pure (no Platform import). */
function fallbackTabBarBottomPad(safeBottomInset: number): number {
  if (safeBottomInset < 12) return 12;
  return Math.max(safeBottomInset, 4);
}

export type BottomDockLayers = {
  /** Measured full tab bar height (content + paddingBottom). Prefer this. */
  tabBarTotalHeight?: number | null;
  /** When tab bar not measured yet — safe-area inset used for fallback. */
  safeBottomInset?: number;
  /** Measured home demand / off-duty panel height. */
  bottomPanelHeight?: number;
  /** Extra gap above the dock for FABs. */
  fabGap?: number;
  /** Whether the tab bar is currently visible on this screen. */
  tabBarVisible?: boolean;
};

export type BottomDockResolved = {
  tabBarHeight: number;
  panelHeight: number;
  /** Offset from screen bottom for floating controls (Locate Me, Active Ride). */
  floatingBottom: number;
  /** Content padding so scrollables clear the tab bar. */
  contentBottomInset: number;
  /** Space available above tab bar for sheets / panels. */
  aboveTabBar: number;
};

/**
 * Resolve bottom chrome occupancy. Pure — safe for hooks / StyleSheet factories.
 */
export function resolveBottomDock(
  windowHeight: number,
  layers: BottomDockLayers = {}
): BottomDockResolved {
  const tabBarVisible = layers.tabBarVisible !== false;
  const measured = layers.tabBarTotalHeight;
  const safeBottom = layers.safeBottomInset ?? 0;

  const tabBarHeight = !tabBarVisible
    ? 0
    : measured != null && measured > 0
      ? measured
      : TAB_BAR_CONTENT_HEIGHT_FALLBACK + fallbackTabBarBottomPad(safeBottom);

  const panelHeight = Math.max(0, layers.bottomPanelHeight ?? 0);
  const fabGap = layers.fabGap ?? 16;

  const floatingBottom = tabBarVisible
    ? // FABs sit inside the map area above the in-map panel; tab bar is outside map.
      panelHeight > 0
      ? panelHeight + fabGap
      : fabGap
    : panelHeight + fabGap + (layers.safeBottomInset ?? 0);

  const contentBottomInset = tabBarHeight;
  const aboveTabBar = Math.max(0, windowHeight - tabBarHeight);

  return {
    tabBarHeight,
    panelHeight,
    floatingBottom,
    contentBottomInset,
    aboveTabBar,
  };
}

/** Floating control bottom inset when the host view is already above the tab bar (map section). */
export function floatingControlsBottomInMap(options: {
  panelHeight?: number;
  offDuty?: boolean;
  edge?: number;
}): number {
  const edge = options.edge ?? 16;
  const panel = Math.max(0, options.panelHeight ?? 0);
  if (options.offDuty && panel > 0) return panel + edge + 16;
  if (panel > 0) return panel + edge + 12;
  return edge;
}
