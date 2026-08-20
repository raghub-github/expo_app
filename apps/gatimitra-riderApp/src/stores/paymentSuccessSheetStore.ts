import { create } from "zustand";

type PaymentSuccessSheetStore = {
  visible: boolean;
  title: string;
  message: string;
  show: (input: { title: string; message: string }) => void;
  hide: () => void;
};

export const usePaymentSuccessSheetStore = create<PaymentSuccessSheetStore>((set) => ({
  visible: false,
  title: "",
  message: "",
  show: ({ title, message }) => set({ visible: true, title, message }),
  hide: () => set({ visible: false, title: "", message: "" }),
}));

export function showRiderPaymentSuccess(title: string, message: string): void {
  usePaymentSuccessSheetStore.getState().show({ title, message });
}
