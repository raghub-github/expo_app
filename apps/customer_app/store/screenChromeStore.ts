import { create } from "zustand";

const DEFAULT_STATUS_BAR_BG = "#FFFFFF";

/** Top tint for no-service empty state — matches GMEmptyState ambient gradient. */
export const NON_SERVICEABLE_STATUS_BAR_BG = "#EFF9F3";

type ScreenChromeState = {
  statusBarBackground: string;
  setStatusBarBackground: (color: string) => void;
  resetStatusBarBackground: () => void;
};

export const useScreenChromeStore = create<ScreenChromeState>((set) => ({
  statusBarBackground: DEFAULT_STATUS_BAR_BG,
  setStatusBarBackground: (color) => set({ statusBarBackground: color }),
  resetStatusBarBackground: () => set({ statusBarBackground: DEFAULT_STATUS_BAR_BG }),
}));
