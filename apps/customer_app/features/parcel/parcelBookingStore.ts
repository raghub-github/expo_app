/**
 * Parcel booking stops — pickup / drop selected from search or map.
 */

import { create } from "zustand";

export type ParcelStop = {
  primary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  contactName?: string | null;
  contactMobile?: string | null;
  label?: string | null;
};

export type ParcelReceiver = {
  name: string;
  mobile: string;
};

type ParcelBookingState = {
  pickup: ParcelStop | null;
  drop: ParcelStop | null;
  receiver: ParcelReceiver | null;
  /** Guidelines sheet shown once per booking session (survives search remount). */
  guidelinesShown: boolean;
  /** User has opened the map/book inner page at least once this session. */
  visitedInnerPage: boolean;
  /**
   * When true, next focus of Courier home keeps draft (returning from location/book).
   * Fresh entry from outside clears drop.
   */
  preserveDraftOnNextFocus: boolean;
  setPickup: (stop: ParcelStop | null) => void;
  setDrop: (stop: ParcelStop | null) => void;
  setReceiver: (receiver: ParcelReceiver | null) => void;
  markGuidelinesShown: () => void;
  markVisitedInnerPage: () => void;
  markPreserveDraftOnNextFocus: () => void;
  /** Clear drop + receiver for a fresh Courier visit (keeps pickup seed). */
  clearDropSession: () => void;
  swapStops: () => void;
  clear: () => void;
};

export const useParcelBookingStore = create<ParcelBookingState>((set, get) => ({
  pickup: null,
  drop: null,
  receiver: null,
  guidelinesShown: false,
  visitedInnerPage: false,
  preserveDraftOnNextFocus: false,
  setPickup: (pickup) => set({ pickup }),
  setDrop: (drop) => set({ drop }),
  setReceiver: (receiver) => set({ receiver }),
  markGuidelinesShown: () => set({ guidelinesShown: true }),
  markVisitedInnerPage: () => set({ visitedInnerPage: true }),
  markPreserveDraftOnNextFocus: () => set({ preserveDraftOnNextFocus: true }),
  clearDropSession: () =>
    set({
      drop: null,
      receiver: null,
      visitedInnerPage: false,
      preserveDraftOnNextFocus: false,
    }),
  swapStops: () => {
    const { pickup, drop } = get();
    set({ pickup: drop, drop: pickup });
  },
  clear: () =>
    set({
      pickup: null,
      drop: null,
      receiver: null,
      guidelinesShown: false,
      visitedInnerPage: false,
      preserveDraftOnNextFocus: false,
    }),
}));
