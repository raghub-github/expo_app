import { create } from "zustand";

/**
 * Global incoming-offer signal. Realtime writes offer ids here so Home-local
 * query identity cannot swallow a new dispatch. IncomingRideOrderHost still
 * hydrates full summaries from pending/available queries.
 */
type IncomingDispatchOfferStore = {
  lastOfferId: string | null;
  ownerRiderId: string | null;
  lastOfferAtMs: number;
  ingestCount: number;
  cancelledOrderIds: string[];
  ingestOfferId: (orderId: string, riderId?: string | null) => boolean;
  cancelOffer: (orderId: string) => void;
  isCancelled: (orderId: string) => boolean;
  clearOfferId: (orderId: string) => void;
  reset: () => void;
};

const MAX_CANCELLED = 80;

export const useIncomingDispatchOfferStore = create<IncomingDispatchOfferStore>((set, get) => ({
  lastOfferId: null,
  ownerRiderId: null,
  lastOfferAtMs: 0,
  ingestCount: 0,
  cancelledOrderIds: [],
  ingestOfferId: (orderId, riderId) => {
    const id = orderId.trim();
    if (!id) return false;
    if (get().cancelledOrderIds.includes(id)) return false;
    set({
      lastOfferId: id,
      ownerRiderId: riderId?.trim() || get().ownerRiderId,
      lastOfferAtMs: Date.now(),
      ingestCount: get().ingestCount + 1,
    });
    return true;
  },
  cancelOffer: (orderId) => {
    const id = orderId.trim();
    if (!id) return;
    const prev = get().cancelledOrderIds;
    const cancelled = prev.includes(id) ? prev : [...prev, id].slice(-MAX_CANCELLED);
    set({
      cancelledOrderIds: cancelled,
      lastOfferId: get().lastOfferId === id ? null : get().lastOfferId,
    });
  },
  isCancelled: (orderId) => get().cancelledOrderIds.includes(orderId.trim()),
  clearOfferId: (orderId) => {
    const id = orderId.trim();
    if (!id) return;
    if (get().lastOfferId === id) {
      set({ lastOfferId: null });
    }
  },
  reset: () => {
    set({
      lastOfferId: null,
      ownerRiderId: null,
      lastOfferAtMs: 0,
      ingestCount: 0,
      cancelledOrderIds: [],
    });
  },
}));
