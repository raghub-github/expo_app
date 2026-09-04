import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
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
  GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP,
  gridFirstStickyCategoryTop,
  gridFirstStickyFilterTop,
  gridFirstStickySearchTop,
  type GridFirstStickyMetrics,
} from "@/lib/gridFirstStickyLayout";

/**
 * Snap sticky chrome on slightly early so JS-thread scroll lag never leaves a
 * transparent gap (content "overlapping" under a fading header).
 */
const STICK_EARLY_PX = 24;
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
};

function stickyOn(y: number, stickAt: number): boolean {
  "worklet";
  if (stickAt <= 1) return false;
  return y >= Math.max(0, stickAt - STICK_EARLY_PX);
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
}: Props) {
  const pinFullHeader = Boolean(locationPrimary || locationSecondary);
  const searchTop = gridFirstStickySearchTop(metrics);
  const stickyHeaderHeight = pinFullHeader
    ? metrics.headerBlockHeight
    : metrics.searchRowHeight;
  const categoryTop = pinFullHeader
    ? gridFirstStickyCategoryTop(metrics)
    : metrics.topInset + stickyHeaderHeight;
  const filterTop = pinFullHeader
    ? categoryTop + metrics.categoryBlockHeight
    : gridFirstStickyFilterTop(metrics);

  const [searchStickyOn, setSearchStickyOn] = useState(false);
  const [categoryStickyOn, setCategoryStickyOn] = useState(false);
  const [filterStickyOn, setFilterStickyOn] = useState(false);

  useAnimatedReaction(
    () => stickyOn(scrollY.value, searchStickAt.value),
    (on, prev) => {
      if (on !== prev) runOnJS(setSearchStickyOn)(on);
    }
  );

  useAnimatedReaction(
    () =>
      enableCategorySticky && stickyOn(scrollY.value, categoryStickAt.value),
    (on, prev) => {
      if (on !== prev) runOnJS(setCategoryStickyOn)(on);
    },
    [enableCategorySticky]
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
    const on = stickyOn(scrollY.value, searchStickAt.value);
    return {
      opacity: on ? 1 : 0,
      backgroundColor: on ? PAGE_BG : "transparent",
      zIndex: on ? 32 : -1,
    };
  });

  const categoryBarStyle = useAnimatedStyle(() => {
    if (!enableCategorySticky) {
      return { opacity: 0, backgroundColor: "transparent", zIndex: -1 };
    }
    const on = stickyOn(scrollY.value, categoryStickAt.value);
    return {
      opacity: on ? 1 : 0,
      backgroundColor: on ? PAGE_BG : "transparent",
      zIndex: on ? 31 : -1,
    };
  });

  const filterBarStyle = useAnimatedStyle(() => {
    if (!enableFilterSticky || !filters) {
      return { opacity: 0, backgroundColor: "transparent", zIndex: -1 };
    }
    const on = stickyOn(scrollY.value, filterStickAt.value);
    return {
      opacity: on ? 1 : 0,
      backgroundColor: on ? PAGE_BG : "transparent",
      zIndex: on ? 30 : -1,
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
            paddingBottom: GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP,
            backgroundColor: PAGE_BG,
          }}
          pointerEvents="box-none"
        >
          <FoodHomeGridFirstHeader
            variant={pinFullHeader ? "full" : "search"}
            topInset={0}
            highlightSearchPill
            heroReady={false}
            locationPrimary={locationPrimary}
            locationSecondary={locationSecondary}
            onLocationPress={onLocationPress}
            onSearchPress={onSearchPress}
            vegOnly={vegOnly}
            onVegChange={onVegChange}
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
            style={[styles.categoryInner, { backgroundColor: PAGE_BG }]}
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
    backgroundColor: "transparent",
  },
  categoryLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  categoryInner: {
    paddingTop: GRID_FIRST_STICKY_SEARCH_CATEGORY_GAP,
    paddingBottom: 4,
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
