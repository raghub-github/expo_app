import { create } from "zustand";

type VehicleGateState = {
  sheetOpen: boolean;
  verificationModalOpen: boolean;
  skippedThisSession: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  skipSheet: () => void;
  clearSkip: () => void;
  openVerificationModal: () => void;
  closeVerificationModal: () => void;
};

export const useVehicleGateStore = create<VehicleGateState>((set) => ({
  sheetOpen: false,
  verificationModalOpen: false,
  skippedThisSession: false,
  openSheet: () => set({ sheetOpen: true, verificationModalOpen: false }),
  closeSheet: () => set({ sheetOpen: false }),
  skipSheet: () => set({ sheetOpen: false, skippedThisSession: true }),
  clearSkip: () => set({ skippedThisSession: false }),
  openVerificationModal: () => set({ verificationModalOpen: true }),
  closeVerificationModal: () => set({ verificationModalOpen: false }),
}));
