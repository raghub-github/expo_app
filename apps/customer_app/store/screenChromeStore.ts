import { create } from "zustand";

const DEFAULT_STATUS_BAR_BG = "#FFFFFF";
const DEFAULT_STATUS_BAR_STYLE = "dark" as const;

/** Top tint for no-service empty state — matches GMEmptyState ambient gradient. */
export const NON_SERVICEABLE_STATUS_BAR_BG = "#EFF9F3";

type StatusBarStyle = "light" | "dark";

type ScreenChromeState = {
  statusBarBackground: string;
  statusBarStyle: StatusBarStyle;
  /** When true, root layout omits the status-bar spacer so content can draw behind it. */
  hideStatusBarSpacer: boolean;
  setStatusBarBackground: (color: string, style?: StatusBarStyle) => void;
  resetStatusBarBackground: () => void;
  /** Grid-first food home — immersive hero under status bar while screen is focused. */
  setImmersiveStatusBarChrome: (active: boolean) => void;
  /** @deprecated Use setImmersiveStatusBarChrome */
  setGridFirstFoodHomeImmersive: (active: boolean) => void;
};

const applyImmersiveChrome = (active: boolean) =>
  active
    ? {
        statusBarBackground: "transparent",
        statusBarStyle: DEFAULT_STATUS_BAR_STYLE,
        hideStatusBarSpacer: true,
      }
    : {
        hideStatusBarSpacer: false,
      };

export const useScreenChromeStore = create<ScreenChromeState>((set) => ({
  statusBarBackground: DEFAULT_STATUS_BAR_BG,
  statusBarStyle: DEFAULT_STATUS_BAR_STYLE,
  hideStatusBarSpacer: false,
  setStatusBarBackground: (color, style = DEFAULT_STATUS_BAR_STYLE) =>
    set({ statusBarBackground: color, statusBarStyle: style }),
  resetStatusBarBackground: () =>
    set({
      statusBarBackground: DEFAULT_STATUS_BAR_BG,
      statusBarStyle: DEFAULT_STATUS_BAR_STYLE,
      hideStatusBarSpacer: false,
    }),
  setImmersiveStatusBarChrome: (active) => set(applyImmersiveChrome(active)),
  setGridFirstFoodHomeImmersive: (active) => set(applyImmersiveChrome(active)),
}));
