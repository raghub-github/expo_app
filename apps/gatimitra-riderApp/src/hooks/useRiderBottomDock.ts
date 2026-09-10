/**
 * Live bottom-dock metrics for Rider UI.
 */

import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  resolveBottomDock,
  floatingControlsBottomInMap,
  type BottomDockResolved,
} from "@/src/lib/rider-bottom-dock";
import { useRiderBottomDockStore } from "@/src/stores/riderBottomDockStore";

export function useRiderBottomDock(options?: {
  tabBarVisible?: boolean;
  fabGap?: number;
  /** Override home panel height (defaults to store). */
  bottomPanelHeight?: number;
}): BottomDockResolved & {
  tabBarMeasured: boolean;
  setTabBarTotalHeight: (h: number) => void;
  setHomeDockHeight: (h: number) => void;
  clearHomeDockHeight: () => void;
  /** Map-local FAB bottom when panel is docked inside the map. */
  mapFloatingBottom: number;
} {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarTotalHeight = useRiderBottomDockStore((s) => s.tabBarTotalHeight);
  const tabBarMeasured = useRiderBottomDockStore((s) => s.tabBarMeasured);
  const homeDockHeight = useRiderBottomDockStore((s) => s.homeDockHeight);
  const setTabBarTotalHeight = useRiderBottomDockStore((s) => s.setTabBarTotalHeight);
  const setHomeDockHeight = useRiderBottomDockStore((s) => s.setHomeDockHeight);
  const clearHomeDockHeight = useRiderBottomDockStore((s) => s.clearHomeDockHeight);

  const panelHeight = options?.bottomPanelHeight ?? homeDockHeight;

  const dock = useMemo(
    () =>
      resolveBottomDock(height, {
        tabBarTotalHeight: tabBarMeasured ? tabBarTotalHeight : null,
        safeBottomInset: insets.bottom,
        bottomPanelHeight: panelHeight,
        fabGap: options?.fabGap,
        tabBarVisible: options?.tabBarVisible,
      }),
    [
      height,
      tabBarMeasured,
      tabBarTotalHeight,
      insets.bottom,
      panelHeight,
      options?.fabGap,
      options?.tabBarVisible,
    ]
  );

  const mapFloatingBottom = useMemo(
    () =>
      floatingControlsBottomInMap({
        panelHeight,
        edge: options?.fabGap ?? 16,
      }),
    [panelHeight, options?.fabGap]
  );

  return {
    ...dock,
    tabBarMeasured,
    setTabBarTotalHeight,
    setHomeDockHeight,
    clearHomeDockHeight,
    mapFloatingBottom,
  };
}

/** Bottom offset for content / FABs sitting above the measured tab bar. */
export function useMeasuredTabBarHeight(): number {
  const { tabBarHeight } = useRiderBottomDock();
  return tabBarHeight;
}
