import { create } from "zustand";

type LogoutSheetStore = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

export const useLogoutSheetStore = create<LogoutSheetStore>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}));
