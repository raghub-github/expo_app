import { create } from "zustand";

type MealsUnderPriceCartUiState = {
  /** Hide GlobalFloatingCart after View cart from meals-under-price (any screen). */
  suppressFloatingCart: boolean;
  setSuppressFloatingCart: (value: boolean) => void;
};

export const useMealsUnderPriceCartUiStore = create<MealsUnderPriceCartUiState>((set) => ({
  suppressFloatingCart: false,
  setSuppressFloatingCart: (suppressFloatingCart) => set({ suppressFloatingCart }),
}));
