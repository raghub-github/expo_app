import { create } from "zustand";

export type PendingCheckoutOffer = {
  type: "coupon" | "merchant" | "platform";
  couponCode?: string | null;
  couponLabel?: string | null;
  merchantOfferId?: number | null;
  platformOfferId?: number | null;
};

type CheckoutOfferState = {
  pending: PendingCheckoutOffer | null;
  setPending: (offer: PendingCheckoutOffer | null) => void;
  /** Read and clear — used once when checkout mounts. */
  consumePending: () => PendingCheckoutOffer | null;
};

export const useCheckoutOfferStore = create<CheckoutOfferState>((set, get) => ({
  pending: null,
  setPending: (offer) => set({ pending: offer }),
  consumePending: () => {
    const pending = get().pending;
    if (pending) set({ pending: null });
    return pending;
  },
}));
