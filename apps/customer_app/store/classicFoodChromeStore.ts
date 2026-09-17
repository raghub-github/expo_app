import { create } from "zustand";

/** Who owns Food classic bottom chrome — mirrors Discovery filters vs nav. */
export type ClassicFoodFootingOwner = "edge" | "nav";

const NAV_AUTO_COLLAPSE_MS = 30_000;
const SCROLL_DIR_THRESHOLD = 8;

let navCollapseTimer: ReturnType<typeof setTimeout> | null = null;
let lastScrollY = 0;

function clearNavCollapseTimer() {
  if (navCollapseTimer) {
    clearTimeout(navCollapseTimer);
    navCollapseTimer = null;
  }
}

function scheduleNavCollapse() {
  clearNavCollapseTimer();
  navCollapseTimer = setTimeout(() => {
    navCollapseTimer = null;
    const s = useClassicFoodChromeStore.getState();
    if (s.active && s.footingOwner === "nav") {
      s.collapseToEdge();
    }
  }, NAV_AUTO_COLLAPSE_MS);
}

function resolvePillVisible(state: {
  active: boolean;
  categoriesSticky: boolean;
  scrollDir: "up" | "down" | "idle";
  onSearchPress: (() => void) | null;
}): boolean {
  // Once categories stick, keep Search visible on scroll up AND down.
  if (!state.active || !state.onSearchPress || !state.categoriesSticky) return false;
  return true;
}

/**
 * Classic Food tab chrome:
 * - Default: HOME edge only (no permanent nav row).
 * - Tap HOME edge → expand full nav capsule.
 * - Idle 30s without tab change, or Food list scroll → collapse to edge.
 * - Leave Food → reset to edge.
 * - Search pill: visible as soon as categories stick; stays visible while sticky (scroll up or down).
 */
type ClassicFoodChromeState = {
  active: boolean;
  footingOwner: ClassicFoodFootingOwner;
  categoriesSticky: boolean;
  scrollDir: "up" | "down" | "idle";
  searchPillVisible: boolean;
  onSearchPress: (() => void) | null;
  setActive: (active: boolean) => void;
  setSearchPressHandler: (onPress: (() => void) | null) => void;
  setCategoriesSticky: (sticky: boolean) => void;
  /** Drive pill show/hide from Food list scroll offset. */
  onFoodListScrollY: (y: number) => void;
  setSearchPill: (visible: boolean, onPress?: (() => void) | null) => void;
  expandNav: () => void;
  collapseToEdge: () => void;
  /** Call when Food list starts scrolling — collapses expanded nav immediately. */
  onFoodScroll: () => void;
};

export const useClassicFoodChromeStore = create<ClassicFoodChromeState>((set, get) => ({
  active: false,
  footingOwner: "edge",
  categoriesSticky: false,
  scrollDir: "idle",
  searchPillVisible: false,
  onSearchPress: null,
  setActive: (active) => {
    if (!active) {
      clearNavCollapseTimer();
      lastScrollY = 0;
    }
    set((prev) => {
      const next = {
        active,
        footingOwner: active && !prev.active ? ("edge" as const) : active ? prev.footingOwner : ("edge" as const),
        ...(active
          ? {}
          : {
              searchPillVisible: false,
              categoriesSticky: false,
              scrollDir: "idle" as const,
              onSearchPress: null,
            }),
      };
      if (!active) return next;
      return {
        ...next,
        searchPillVisible: resolvePillVisible({ ...prev, ...next }),
      };
    });
    if (active && get().footingOwner === "nav") scheduleNavCollapse();
  },
  setSearchPressHandler: (onPress) =>
    set((prev) => {
      const next = { ...prev, onSearchPress: onPress };
      return { onSearchPress: onPress, searchPillVisible: resolvePillVisible(next) };
    }),
  setCategoriesSticky: (sticky) =>
    set((prev) => {
      const next = {
        ...prev,
        categoriesSticky: sticky,
        // Stick → show pill instantly. Unstick → reset.
        scrollDir: sticky ? ("up" as const) : ("idle" as const),
      };
      return {
        categoriesSticky: sticky,
        scrollDir: next.scrollDir,
        searchPillVisible: resolvePillVisible(next),
      };
    }),
  onFoodListScrollY: (y) => {
    const dy = y - lastScrollY;
    lastScrollY = y;
    if (Math.abs(dy) < SCROLL_DIR_THRESHOLD) return;
    // Content offset ↑ = browsing down → hide. Offset ↓ = scroll up → show.
    const scrollDir = dy > 0 ? "down" : "up";
    set((prev) => {
      // Once sticky, pill visibility is constant — skip store writes during
      // fling so chrome subscribers do not re-render mid-momentum.
      if (prev.categoriesSticky) return prev;
      if (prev.scrollDir === scrollDir) return prev;
      return { scrollDir, searchPillVisible: false };
    });
  },
  /** @deprecated Prefer setSearchPressHandler + sticky/scroll drivers. */
  setSearchPill: (visible, onPress) =>
    set((prev) => {
      const handler = onPress === undefined ? prev.onSearchPress : onPress;
      const next = {
        ...prev,
        onSearchPress: handler,
        // Force-visible path kept for tests; production uses sticky+scrollDir.
        searchPillVisible: visible && !!handler,
        ...(visible && handler ? { categoriesSticky: true, scrollDir: "up" as const } : {}),
      };
      return {
        onSearchPress: handler,
        searchPillVisible: next.searchPillVisible,
        categoriesSticky: next.categoriesSticky,
        scrollDir: next.scrollDir,
      };
    }),
  expandNav: () => {
    set({ footingOwner: "nav" });
    scheduleNavCollapse();
  },
  collapseToEdge: () => {
    clearNavCollapseTimer();
    set({ footingOwner: "edge" });
  },
  onFoodScroll: () => {
    if (get().footingOwner === "nav") {
      get().collapseToEdge();
    }
  },
}));
