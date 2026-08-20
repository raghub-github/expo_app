import { create } from "zustand";

type SubscriptionDutyBlockedSheetStore = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

export const useSubscriptionDutyBlockedSheetStore = create<SubscriptionDutyBlockedSheetStore>(
  (set) => ({
    visible: false,
    open: () => set({ visible: true }),
    close: () => set({ visible: false }),
  })
);

export function openSubscriptionDutyBlockedSheet(): void {
  useSubscriptionDutyBlockedSheetStore.getState().open();
}
