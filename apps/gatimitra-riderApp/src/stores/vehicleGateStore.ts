import { create } from "zustand";

type VehicleGateState = {
  sheetOpen: boolean;
  verificationModalOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  openVerificationModal: () => void;
  closeVerificationModal: () => void;
};

export const useVehicleGateStore = create<VehicleGateState>((set) => ({
  sheetOpen: false,
  verificationModalOpen: false,
  openSheet: () => set({ sheetOpen: true, verificationModalOpen: false }),
  closeSheet: () => set({ sheetOpen: false }),
  openVerificationModal: () => set({ verificationModalOpen: true }),
  closeVerificationModal: () => set({ verificationModalOpen: false }),
}));
