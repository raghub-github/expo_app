import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import {
  FoodHomeGridFirstHeader,
} from "@/components/home/FoodHomeGridFirstHeader";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  gridFirstStickyCategoryTop,
  gridFirstStickySearchTop,
  gridFirstStickySnapY,
  type GridFirstStickyMetrics,
} from "@/lib/gridFirstStickyLayout";

const PAGE_BG = GatiMitraColors.softBackground;

type Props = {
  scrollY: SharedValue<number>;
  metrics: GridFirstStickyMetrics;
  searchStickAt: SharedValue<number>;
  categoryStickAt: SharedValue<number>;
  filterStickAt: SharedValue<number>;
  onSearchPress: () => void;
  onLocationPress?: () => void;
  locationPrimary?: string;
  locationSecondary?: string;
  vegOnly: boolean;
  onVegChange: (value: boolean) => void;
  showVegToggle?: boolean;
  searchPlaceholders?: string[];
  categories: React.ReactNode;
  filters?: React.ReactNode;
  /** When false, only the search bar pins on scroll (classic 2-row category rail). */
  enableCategorySticky?: boolean;
  /** When false, filter row stays in scroll flow only. */
  enableFilterSticky?: boolean;
  /**
   * No-hero mode: keep search + category pinned from scroll y=0 so there is no
   * rest→sticky gap collapse jerk.
   */
  pinAtRest?: boolean;
  onOpenVegPopover?: (anchor: import("@/components/home/VegModePopover").VegPopoverAnchor) => void;
  /** Laid-out height of the pinned search block, including the status-bar inset. */
  onSearchChromeHeight?: (height: number) => void;
};

function stickyOn(y: number, stickAt: number): boolean {
  "worklet";
  if (stickAt <= 1) return false;
  return y >= stickAt;
}

export function FoodHomeGridFirstStickyChrome({
  scrollY,
  metrics,
  searchStickAt,
  categoryStickAt,
  filterStickAt,
  onSearchPress,
  onLocationPress = () => {},
  locationPrimary = "",
  locationSecondary = "",
  vegOnly,
  onVegChange,
  showVegToggle = true,
  searchPlaceholders,
  categories,
  filters,
  enableCategorySticky = true,
  enableFilterSticky = true,
  /** When true (no hero), pin search + category from y=0 — no rest→sticky gap jerk. */
  pinAtRest = false,
  onOpenVegPopover,
  onSearchChromeHeight,
}: Props) {
  const searchTop = gridFirstStickySearchTop(metrics);
  // Pin the search pill only. Putting the location row back into the sticky
  // copy made the search jump down when it locked.
  const categoryTop = gridFirstStickyCategoryTop(metrics);
  const filterTop = categoryTop + metrics.categoryBlockHeight;

  const [searchStickyOn, setSearchStickyOn] = useState(pinAtRest);
  const [categoryStickyOn, setCategoryStickyOn] = useState(
    pinAtRest && enableCategorySticky
  );
  const [filterStickyOn, setFilterStickyOn] = useState(false);

  useAnimatedReaction(
    () => (pinAtRest ? true : stickyOn(scrollY.value, searchStickAt.value)),
    (on, prev) => {
      if (on !== prev) runOnJS(setSearchStickyOn)(on);
    },
    [pinAtRest]
  );

  useAnimatedReaction(
    () =>
      enableCategorySticky &&
      (pinAtRest || stickyOn(scrollY.value, categoryStickAt.value)),
    (on, prev) => {
      if (on !== prev) runOnJS(setCategoryStickyOn)(on);
    },
    [enableCategorySticky, pinAtRest]
  );

  const hasFilters = Boolean(filters);
  useAnimatedReaction(
    () => {
      if (!enableFilterSticky || !hasFilters) return false;
      return stickyOn(scrollY.value, filterStickAt.value);
    },
    (on, prev) => {
      if (on !== prev) runOnJS(setFilterStickyOn)(on);
    },
    [enableFilterSticky, hasFilters]
  );

  const searchBarStyle = useAnimatedStyle(() => {
    if (pinAtRest) {
      return { opacity: 1, backgroundColor: PAGE_BG, zIndex: 32 };
    }
    const stickAt = searchStickAt.value;
    if (stickAt <= 1) {
      return { opacity: 0, backgroundColor: "transparent", zIndex: -1 };
    }
    const on = scrollY.value >= stickAt;
    return {
      opacity: on ? 1 : 0,
      backgroundColor: on ? PAGE_BG : "transparent",
      zIndex: on ? 32 : -1,
    };
  }, [pinAtRest]);

  const categoryBarStyle = useAnimatedStyle(() => {
    if (!enableCategorySticky) {
      return { opacity: 0, backgroundColor: "transparent", zIndex: -1 };
    }
    if (pinAtRest) {
      return { opacity: 1, backgroundColor: PAGE_BG, zIndex: 31 };
    }
    const stickAt = categoryStickAt.value;
    if (stickAt <= 1) {
      return { opacity: 0, backgroundColor: "transparent", zIndex: -1 };
    }
    const on = scrollY.value >= stickAt;
    return {
      opacity: on ? 1 : 0,
      backgroundColor: on ? PAGE_BG : "transparent",
      zIndex: on ? 31 : -1,
    };
  }, [enableCategorySticky, pinAtRest]);

  const filterBarStyle = useAnimatedStyle(() => {
    if (!enableFilterSticky || !filters) {
      return { opacity: 0, backgroundColor: "transparent", zIndex: -1 };
    }
    const stickAt = filterStickAt.value;
    if (stickAt <= 1) {
      return { opacity: 0, backgroundColor: "transparent", zIndex: -1 };
    }
    const snapY = gridFirstStickySnapY(stickAt, 8);
    const handoff = 4;
    const opacity = interpolate(
      scrollY.value,
      [snapY - handoff, snapY + handoff],
      [0, 1],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      backgroundColor: opacity > 0.05 ? PAGE_BG : "transparent",
      zIndex: opacity > 0.05 ? 30 : -1,
    };
  });

  // Always box-none so a lagged JS pointerEvents=none never blocks the opaque
  // sticky paint from receiving taps once it is visible.
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        style={[styles.searchLayer, searchBarStyle, { top: 0 }]}
        pointerEvents={searchStickyOn ? "box-none" : "none"}
      >
        <View
          style={{
            paddingTop: searchTop,
            paddingBottom: 0,
            backgroundColor: PAGE_BG,
          }}
          pointerEvents="box-none"
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 1) onSearchChromeHeight?.(h);
          }}
        >
          <FoodHomeGridFirstHeader
            variant="search"
            topInset={0}
            highlightSearchPill
            heroReady={false}
            locationPrimary={locationPrimary}
            locationSecondary={locationSecondary}
            onLocationPress={onLocationPress}
            onSearchPress={onSearchPress}
            vegOnly={vegOnly}
            onVegChange={onVegChange}
            onOpenVegPopover={onOpenVegPopover}
            showVegToggle={showVegToggle}
            searchPlaceholders={searchPlaceholders}
          />
        </View>
      </Animated.View>

      {enableCategorySticky && categories ? (
        <Animated.View
          style={[styles.categoryLayer, categoryBarStyle, { top: categoryTop }]}
          pointerEvents={categoryStickyOn ? "box-none" : "none"}
          collapsable={false}
        >
          <View
            style={[
              styles.categoryInner,
              pinAtRest && styles.categoryInnerTight,
              { backgroundColor: PAGE_BG },
            ]}
            pointerEvents="box-none"
            collapsable={false}
          >
            {categories}
          </View>
        </Animated.View>
      ) : null}

      {enableFilterSticky && filters ? (
        <Animated.View
          style={[styles.filterLayer, filterBarStyle, { top: filterTop }]}
          pointerEvents={filterStickyOn ? "box-none" : "none"}
        >
          <View
            style={[styles.filterInner, { backgroundColor: PAGE_BG }]}
            pointerEvents="box-none"
          >
            {filters}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  searchLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: PAGE_BG,
    // No drop shadow — Android elevation paints under the search pill and
    // covers the category row.
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    zIndex: 32,
  },
  categoryLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: PAGE_BG,
    overflow: "hidden",
    elevation: 0,
    shadowOpacity: 0,
    zIndex: 31,
  },
  categoryInner: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  categoryInnerTight: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  filterLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  filterInner: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
});
