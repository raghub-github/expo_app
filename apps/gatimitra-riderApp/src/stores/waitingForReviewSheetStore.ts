import { create } from "zustand";
import { useVehicleGateStore } from "@/src/stores/vehicleGateStore";
import { useSubscriptionDutyBlockedSheetStore } from "@/src/stores/subscriptionDutyBlockedSheetStore";

type WaitingForReviewSheetStore = {
  visible: boolean;
  /** Rider id we already auto-opened the sheet for this session. */
  autoShownForRiderId: string | null;
  open: () => void;
  close: () => void;
  markAutoShown: (riderId: string) => void;
  resetAutoShown: () => void;
};

export const useWaitingForReviewSheetStore = create<WaitingForReviewSheetStore>((set) => ({
  visible: false,
  autoShownForRiderId: null,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  markAutoShown: (riderId) => set({ autoShownForRiderId: riderId }),
  resetAutoShown: () => set({ autoShownForRiderId: null }),
}));

export function openWaitingForReviewSheet(): void {
  // Never stack RC / subscription duty sheets under Waiting for Review.
  useVehicleGateStore.getState().closeSheet();
  useVehicleGateStore.getState().closeVerificationModal();
  useSubscriptionDutyBlockedSheetStore.getState().close();
  useWaitingForReviewSheetStore.getState().open();
}

export function closeWaitingForReviewSheet(): void {
  useWaitingForReviewSheetStore.getState().close();
}
