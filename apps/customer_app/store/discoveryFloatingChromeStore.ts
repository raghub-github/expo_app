import { create } from "zustand";

export type DiscoverySortOption = "default" | "rating" | "distance";
/** Who owns the bottom footing — mirrors cart/track vs HOME edge. */
export type DiscoveryFootingOwner = "filters" | "nav";

/**
 * Bridges Food discovery list (sort/filter handlers) → CustomerTabBar row chrome.
 * Default: filters own footing (HOME edge + Relevance|Filters dock).
 * Expand HOME → full nav + filters right edge.
 */
type DiscoveryFloatingChromeState = {
  active: boolean;
  sortBy: DiscoverySortOption;
  hasActiveFilters: boolean;
  footingOwner: DiscoveryFootingOwner;
  onSortPress: (() => void) | null;
  onFiltersPress: (() => void) | null;
  setChrome: (next: {
    sortBy: DiscoverySortOption;
    hasActiveFilters: boolean;
    onSortPress: () => void;
    onFiltersPress: () => void;
  }) => void;
  expandNav: () => void;
  expandFilters: () => void;
  clearChrome: () => void;
};

export const useDiscoveryFloatingChromeStore = create<DiscoveryFloatingChromeState>((set) => ({
  active: false,
  sortBy: "default",
  hasActiveFilters: false,
  footingOwner: "filters",
  onSortPress: null,
  onFiltersPress: null,
  setChrome: ({ sortBy, hasActiveFilters, onSortPress, onFiltersPress }) =>
    set((prev) => ({
      active: true,
      sortBy,
      hasActiveFilters,
      onSortPress,
      onFiltersPress,
      // Keep expand/collapse while chrome stays active on the same Food session.
      footingOwner: prev.active ? prev.footingOwner : "filters",
    })),
  expandNav: () => set({ footingOwner: "nav" }),
  expandFilters: () => set({ footingOwner: "filters" }),
  clearChrome: () =>
    set({
      active: false,
      sortBy: "default",
      hasActiveFilters: false,
      footingOwner: "filters",
      onSortPress: null,
      onFiltersPress: null,
    }),
}));
