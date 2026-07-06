import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { FoodHomeGridFirstHeader } from "@/components/home/FoodHomeGridFirstHeader";
import {
  GRID_FIRST_FILTER_SHOW_SCROLL_Y,
  GRID_FIRST_STICK_HANDOFF_PX,
  gridFirstStickyCategoryTop,
  gridFirstStickyFilterTop,
  gridFirstStickySearchTop,
  type GridFirstStickyMetrics,
} from "@/lib/gridFirstStickyLayout";

const STICK_FADE_PX = 10;

type Props = {
  scrollY: SharedValue<number>;
  metrics: GridFirstStickyMetrics;
  searchStickAt: SharedValue<number>;
  categoryStickAt: SharedValue<number>;
  filterStickAt: SharedValue<number>;
  onSearchPress: () => void;
  vegOnly: boolean;
  onVegChange: (value: boolean) => void;
  categories: React.ReactNode;
  filters?: React.ReactNode;
  /** When false, only the search bar pins on scroll (classic 2-row category rail). */
  enableCategorySticky?: boolean;
  /** When false, filter row stays in scroll flow only. */
  enableFilterSticky?: boolean;
};

export function FoodHomeGridFirstStickyChrome({
  scrollY,
  metrics,
  searchStickAt,
  categoryStickAt,
  filterStickAt,
  onSearchPress,
  vegOnly,
  onVegChange,
  categories,
  filters,
  enableCategorySticky = true,
  enableFilterSticky = true,
}: Props) {
  const searchTop = gridFirstStickySearchTop(metrics);
  const categoryTop = gridFirstStickyCategoryTop(metrics);
  const filterTop = gridFirstStickyFilterTop(metrics);

  const [searchStickyOn, setSearchStickyOn] = useState(false);
  const [categoryStickyOn, setCategoryStickyOn] = useState(false);
  const [filterStickyOn, setFilterStickyOn] = useState(false);

  useAnimatedReaction(
    () => scrollY.value >= searchStickAt.value - STICK_FADE_PX,
    (on, prev) => {
      if (on !== prev) runOnJS(setSearchStickyOn)(on);
    },
    [searchStickAt]
  );

  useAnimatedReaction(
    () =>
      enableCategorySticky && scrollY.value >= categoryStickAt.value - STICK_FADE_PX,
    (on, prev) => {
      if (on !== prev) runOnJS(setCategoryStickyOn)(on);
    },
    [categoryStickAt, enableCategorySticky]
  );

  useAnimatedReaction(
    () => {
      if (!enableFilterSticky || !filters) return false;
      const y = scrollY.value;
      const showAt = categoryStickAt.value - STICK_FADE_PX;
      const handoffAt = filterStickAt.value + GRID_FIRST_STICK_HANDOFF_PX;
      return y >= showAt && y < handoffAt;
    },
    (on, prev) => {
      if (on !== prev) runOnJS(setFilterStickyOn)(on);
    },
    [categoryStickAt, filterStickAt, enableFilterSticky, filters]
  );

  const chromeActive = searchStickyOn || categoryStickyOn || filterStickyOn;

  const searchBarStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    const stickAt = searchStickAt.value;
    if (stickAt <= 1) {
      return {
        opacity: 0,
        backgroundColor: "transparent",
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
        transform: [{ translateY: -6 }],
        zIndex: -1,
      };
    }
    const progress = interpolate(
      y,
      [stickAt - STICK_FADE_PX, stickAt + STICK_FADE_PX],
      [0, 1],
      Extrapolation.CLAMP
    );
    const on = progress > 0.01;
    const categoryOn =
      enableCategorySticky &&
      categoryStickAt.value > 1 &&
      y >= categoryStickAt.value - STICK_FADE_PX;
    return {
      opacity: progress,
      backgroundColor: interpolateColor(
        progress,
        [0, 1],
        ["rgba(255,255,255,0)", "rgba(255,255,255,1)"]
      ),
      elevation: on && !categoryOn ? 10 : 0,
      shadowOpacity: on && !categoryOn ? 0.08 : 0,
      borderBottomWidth: 0,
      transform: [
        {
          translateY: interpolate(
            y,
            [stickAt - STICK_FADE_PX, stickAt + STICK_FADE_PX],
            [-6, 0],
            Extrapolation.CLAMP
          ),
        },
      ],
      zIndex: on ? 32 : -1,
    };
  });

  const categoryBarStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    const stickAt = categoryStickAt.value;
    if (stickAt <= 1) {
      return {
        opacity: 0,
        backgroundColor: "transparent",
        elevation: 0,
        transform: [{ translateY: -6 }],
        zIndex: -1,
      };
    }
    const progress = interpolate(
      y,
      [stickAt - STICK_FADE_PX, stickAt + STICK_FADE_PX],
      [0, 1],
      Extrapolation.CLAMP
    );
    const on = progress > 0.01;
    const searchOn = y >= searchStickAt.value - STICK_FADE_PX;
    const filterOverlayOn =
      enableFilterSticky &&
      !!filters &&
      y >= stickAt - STICK_FADE_PX &&
      y < filterStickAt.value + GRID_FIRST_STICK_HANDOFF_PX;
    const showBottomChrome = on && !filterOverlayOn;
    return {
      opacity: progress,
      backgroundColor: interpolateColor(
        progress,
        [0, 1],
        ["rgba(255,255,255,0)", "rgba(255,255,255,1)"]
      ),
      elevation: showBottomChrome ? (searchOn ? 6 : 6) : 0,
      shadowOpacity: showBottomChrome && !searchOn ? 0.04 : 0,
      borderBottomWidth: 0,
      transform: [
        {
          translateY: interpolate(
            y,
            [stickAt - STICK_FADE_PX, stickAt + STICK_FADE_PX],
            [-6, 0],
            Extrapolation.CLAMP
          ),
        },
      ],
      zIndex: on ? 31 : -1,
    };
  });

  const filterBarStyle = useAnimatedStyle(() => {
    if (!enableFilterSticky || !filters) {
      return {
        opacity: 0,
        backgroundColor: "transparent",
        elevation: 0,
        transform: [{ translateY: -8 }],
        zIndex: -1,
      };
    }

    const y = scrollY.value;
    const showAt = categoryStickAt.value - STICK_FADE_PX;
    const handoffAt = filterStickAt.value + GRID_FIRST_STICK_HANDOFF_PX;

    if (y < showAt) {
      return {
        opacity: 0,
        backgroundColor: "transparent",
        elevation: 0,
        transform: [{ translateY: -8 }],
        zIndex: -1,
      };
    }

    if (y >= handoffAt) {
      return {
        opacity: 0,
        backgroundColor: "transparent",
        elevation: 0,
        transform: [{ translateY: 0 }],
        zIndex: -1,
      };
    }

    const enterProgress = interpolate(
      y,
      [showAt, showAt + STICK_FADE_PX],
      [0, 1],
      Extrapolation.CLAMP
    );
    const exitProgress =
      filterStickAt.value > showAt + STICK_FADE_PX
        ? interpolate(
            y,
            [filterStickAt.value - STICK_FADE_PX, handoffAt],
            [1, 0],
            Extrapolation.CLAMP
          )
        : 1;
    const progress = Math.min(enterProgress, exitProgress);
    const on = progress > 0.01;

    return {
      opacity: progress,
      backgroundColor: interpolateColor(
        progress,
        [0, 1],
        ["rgba(255,255,255,0)", "rgba(255,255,255,1)"]
      ),
      elevation: on ? 5 : 0,
      transform: [
        {
          translateY: interpolate(progress, [0, 1], [-8, 0], Extrapolation.CLAMP),
        },
      ],
      zIndex: on ? 30 : -1,
    };
  });

  return (
    <View style={styles.wrap} pointerEvents={chromeActive ? "box-none" : "none"}>
      <Animated.View
        style={[styles.searchLayer, searchBarStyle, { top: 0 }]}
        pointerEvents={searchStickyOn ? "box-none" : "none"}
      >
        <View
          style={[
            styles.searchInner,
            { paddingTop: searchTop, paddingBottom: categoryStickyOn ? 0 : 6 },
          ]}
          pointerEvents="box-none"
        >
          <FoodHomeGridFirstHeader
            variant="search"
            topInset={0}
            highlightSearchPill
            onSearchPress={onSearchPress}
            vegOnly={vegOnly}
            onVegChange={onVegChange}
          />
        </View>
      </Animated.View>

      {enableCategorySticky && categories ? (
        <Animated.View
          style={[styles.categoryLayer, categoryBarStyle, { top: categoryTop }]}
          pointerEvents={categoryStickyOn ? "box-none" : "none"}
        >
          <View style={styles.categoryInner} pointerEvents="box-none">
            {categories}
          </View>
        </Animated.View>
      ) : null}

      {enableFilterSticky && filters ? (
        <Animated.View
          style={[styles.filterLayer, filterBarStyle, { top: filterTop }]}
          pointerEvents={filterStickyOn ? "box-none" : "none"}
        >
          <View style={styles.filterInner} pointerEvents="box-none">
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
    zIndex: 20,
  },
  searchLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  searchInner: {
    paddingBottom: 6,
  },
  categoryLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
  },
  categoryInner: {
    paddingBottom: 6,
  },
  filterLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0, 0, 0, 0.06)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  filterInner: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
});
