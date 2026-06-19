import { create } from "zustand";

type EarningsBankSheetStore = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

export const useEarningsBankSheetStore = create<EarningsBankSheetStore>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
