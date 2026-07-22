import { create } from "zustand";

/**
 * Bridges /location-address → checkout after creating/selecting a delivery address.
 * Consumed once on checkout focus so selection is deterministic (not nearest-coord guess).
 */
export type CheckoutAddressHandoff = {
  addressId: number;
  merchantId?: string | null;
  /** Canonical drop quote resolved during save for instant checkout handoff. */
  serviceable?: boolean;
  ts: number;
};

type State = {
  pending: CheckoutAddressHandoff | null;
  setPending: (handoff: CheckoutAddressHandoff) => void;
  /** Read and clear — used once when checkout mounts/focuses. */
  consumePending: () => CheckoutAddressHandoff | null;
  clear: () => void;
};

export const useCheckoutAddressHandoffStore = create<State>((set, get) => ({
  pending: null,
  setPending: (handoff) => set({ pending: handoff }),
  consumePending: () => {
    const pending = get().pending;
    if (pending) set({ pending: null });
    return pending;
  },
  clear: () => set({ pending: null }),
}));
