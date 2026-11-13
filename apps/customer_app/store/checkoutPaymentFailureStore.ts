import { InteractionManager } from "react-native";
import { create } from "zustand";

export type CheckoutPaymentFailureState = {
  visible: boolean;
  amountInr: number | null;
  methodLabel: string;
  /** Bumped on every show/hide so delayed present callbacks cannot revive a dismissed sheet. */
  presentGeneration: number;
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
  presentGeneration: 0,
  retryNonce: 0,
  chooseMethodNonce: 0,
  show: ({ amountInr, methodLabel }) =>
    set((s) => ({
      visible: true,
      amountInr: amountInr != null && Number.isFinite(amountInr) ? amountInr : null,
      methodLabel: methodLabel.trim() || "UPI",
      presentGeneration: s.presentGeneration + 1,
    })),
  hide: () =>
    set((s) => ({
      visible: false,
      // Invalidate any in-flight presentCheckoutPaymentFailure callbacks.
      presentGeneration: s.presentGeneration + 1,
    })),
  requestRetry: () =>
    set((s) => ({
      visible: false,
      presentGeneration: s.presentGeneration + 1,
      retryNonce: s.retryNonce + 1,
    })),
  requestChooseMethod: () =>
    set((s) => ({
      visible: false,
      presentGeneration: s.presentGeneration + 1,
      chooseMethodNonce: s.chooseMethodNonce + 1,
    })),
}));

/**
 * Show failure sheet after Razorpay/checkout overlays close (avoids nested Modal crashes).
 * If the user dismisses before the deferred show runs, the generation check drops it.
 */
export function presentCheckoutPaymentFailure(payload: {
  amountInr: number | null;
  methodLabel: string;
}): void {
  const generationAtSchedule = useCheckoutPaymentFailureStore.getState().presentGeneration;
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      const state = useCheckoutPaymentFailureStore.getState();
      // User already hid / retried / chose another method — do not auto-reopen.
      if (state.presentGeneration !== generationAtSchedule) return;
      state.show(payload);
    });
  });
}
