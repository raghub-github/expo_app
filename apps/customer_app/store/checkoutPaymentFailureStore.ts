import { create } from "zustand";

export type CheckoutPaymentFailureState = {
  visible: boolean;
  amountInr: number | null;
  methodLabel: string;
  show: (payload: { amountInr: number | null; methodLabel: string }) => void;
  hide: () => void;
};

export const useCheckoutPaymentFailureStore = create<CheckoutPaymentFailureState>((set) => ({
  visible: false,
  amountInr: null,
  methodLabel: "UPI",
  show: ({ amountInr, methodLabel }) =>
    set({
      visible: true,
      amountInr: amountInr != null && Number.isFinite(amountInr) ? amountInr : null,
      methodLabel: methodLabel.trim() || "UPI",
    }),
  hide: () => set({ visible: false }),
}));
