/**
 * Measured bottom chrome for the Rider App.
 * Prefer these values over RIDER_TAB_BAR_CONTENT_HEIGHT approximations.
 */

import { create } from "zustand";
import { TAB_BAR_CONTENT_HEIGHT_FALLBACK } from "@/src/lib/rider-bottom-dock";

export { TAB_BAR_CONTENT_HEIGHT_FALLBACK };

type RiderBottomDockState = {
  /** Full rendered tab bar height including system inset padding. */
  tabBarTotalHeight: number;
  /** True after RiderTabBar reports onLayout at least once. */
  tabBarMeasured: boolean;
  /** Home demand / off-duty dock height (map chrome). */
  homeDockHeight: number;
  setTabBarTotalHeight: (height: number) => void;
  setHomeDockHeight: (height: number) => void;
  clearHomeDockHeight: () => void;
};

export const useRiderBottomDockStore = create<RiderBottomDockState>((set) => ({
  tabBarTotalHeight: TAB_BAR_CONTENT_HEIGHT_FALLBACK,
  tabBarMeasured: false,
  homeDockHeight: 0,
  setTabBarTotalHeight: (height) => {
    const next = Math.max(0, Math.round(height));
    set((s) =>
      s.tabBarTotalHeight === next && s.tabBarMeasured
        ? s
        : { tabBarTotalHeight: next, tabBarMeasured: true }
    );
  },
  setHomeDockHeight: (height) => {
    const next = Math.max(0, Math.round(height));
    set((s) => (s.homeDockHeight === next ? s : { homeDockHeight: next }));
  },
  clearHomeDockHeight: () => set({ homeDockHeight: 0 }),
}));
