import { create } from "zustand";

/**
 * Published by GlobalFloatingCart so screens (e.g. discovery Relevance/Filters)
 * can hide overlapping chrome while View Cart or order tracking is on screen.
 */
type FloatingDockUiState = {
  dockVisible: boolean;
  setDockVisible: (dockVisible: boolean) => void;
};

export const useFloatingDockUiStore = create<FloatingDockUiState>((set) => ({
  dockVisible: false,
  setDockVisible: (dockVisible) => set({ dockVisible }),
}));
