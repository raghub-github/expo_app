import { create } from "zustand";

type RiderToastState = {
  message: string | null;
  showToast: (message: string) => void;
  clearToast: () => void;
};

export const useRiderToastStore = create<RiderToastState>((set) => ({
  message: null,
  showToast: (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    set({ message: trimmed });
  },
  clearToast: () => set({ message: null }),
}));
