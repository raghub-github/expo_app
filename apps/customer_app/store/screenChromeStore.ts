import { create } from "zustand";

const DEFAULT_STATUS_BAR_BG = "#FFFFFF";
const DEFAULT_STATUS_BAR_STYLE = "dark" as const;

/** Top tint for no-service empty state — matches GMEmptyState ambient gradient. */
export const NON_SERVICEABLE_STATUS_BAR_BG = "#EFF9F3";

type StatusBarStyle = "light" | "dark";

type ScreenChromeState = {
  statusBarBackground: string;
  statusBarStyle: StatusBarStyle;
  setStatusBarBackground: (color: string, style?: StatusBarStyle) => void;
  resetStatusBarBackground: () => void;
};

export const useScreenChromeStore = create<ScreenChromeState>((set) => ({
  statusBarBackground: DEFAULT_STATUS_BAR_BG,
  statusBarStyle: DEFAULT_STATUS_BAR_STYLE,
  setStatusBarBackground: (color, style = DEFAULT_STATUS_BAR_STYLE) =>
    set({ statusBarBackground: color, statusBarStyle: style }),
  resetStatusBarBackground: () =>
    set({ statusBarBackground: DEFAULT_STATUS_BAR_BG, statusBarStyle: DEFAULT_STATUS_BAR_STYLE }),
}));
