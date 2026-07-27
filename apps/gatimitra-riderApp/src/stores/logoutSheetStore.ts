import { create } from "zustand";

export type RiderLogoutScope = "this_device" | "all_devices";
export type RiderLogoutSheetStep = "choice" | "reason";

type LogoutSheetStore = {
  visible: boolean;
  step: RiderLogoutSheetStep;
  scope: RiderLogoutScope | null;
  open: () => void;
  close: () => void;
  selectScope: (scope: RiderLogoutScope) => void;
  backToChoice: () => void;
};

export const useLogoutSheetStore = create<LogoutSheetStore>((set) => ({
  visible: false,
  step: "choice",
  scope: null,
  open: () => set({ visible: true, step: "choice", scope: null }),
  close: () => set({ visible: false, step: "choice", scope: null }),
  selectScope: (scope) => set({ scope, step: "reason" }),
  backToChoice: () => set({ step: "choice", scope: null }),
}));
