import { create } from "zustand";

type CustomerServiceBlockSheetState = {
  visible: boolean;
  serviceLabel: string;
  reason: string;
  serviceAssetKey: string;
  open: (input: { serviceLabel: string; reason: string; serviceAssetKey: string }) => void;
  close: () => void;
};

export const useCustomerServiceBlockSheetStore = create<CustomerServiceBlockSheetState>((set) => ({
  visible: false,
  serviceLabel: "",
  reason: "",
  serviceAssetKey: "",
  open: (input) =>
    set({
      visible: true,
      serviceLabel: input.serviceLabel,
      reason: input.reason,
      serviceAssetKey: input.serviceAssetKey,
    }),
  close: () => set({ visible: false }),
}));
