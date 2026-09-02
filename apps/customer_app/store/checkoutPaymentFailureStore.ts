import { InteractionManager } from "react-native";
import { create } from "zustand";

export type CheckoutPaymentFailureState = {
  visible: boolean;
  amountInr: number | null;
  methodLabel: string;
  /** Incremented when user taps Try again on the root failure host. */
  retryNonce: number;
  /** Incremented when user taps Choose another payment method. */
  chooseMethodNonce: number;
  show: (payload: { amountInr: number | null; methodLabel: string }) => void;
  hide: () => void;
  requestRetry: () => void;
  requestChooseMethod: () => void;
};

export const useCheckoutPaymentFailureStore = create<CheckoutPaymentFailureState>((set) => ({
  visible: false,
  amountInr: null,
  methodLabel: "UPI",
  retryNonce: 0,
  chooseMethodNonce: 0,
  show: ({ amountInr, methodLabel }) =>
    set({
      visible: true,
      amountInr: amountInr != null && Number.isFinite(amountInr) ? amountInr : null,
      methodLabel: methodLabel.trim() || "UPI",
    }),
  hide: () => set({ visible: false }),
  requestRetry: () =>
    set((s) => ({
      visible: false,
      retryNonce: s.retryNonce + 1,
    })),
  requestChooseMethod: () =>
    set((s) => ({
      visible: false,
      chooseMethodNonce: s.chooseMethodNonce + 1,
    })),
}));

/** Show failure sheet after Razorpay/checkout overlays close (avoids nested Modal crashes). */
export function presentCheckoutPaymentFailure(payload: {
  amountInr: number | null;
  methodLabel: string;
}): void {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      useCheckoutPaymentFailureStore.getState().show(payload);
    });
  });
}
