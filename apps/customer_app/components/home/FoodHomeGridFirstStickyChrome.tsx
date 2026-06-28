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
import { FoodHomeGridFirstHeader } from "@/components/home/FoodHomeGridFirstHeader";
import {
  gridFirstStickyCategoryTop,
  gridFirstStickySearchTop,
  type GridFirstStickyMetrics,
} from "@/lib/gridFirstStickyLayout";

const STICK_FADE_PX = 10;

type Props = {
  scrollY: SharedValue<number>;
  metrics: GridFirstStickyMetrics;
  searchStickAt: SharedValue<number>;
  categoryStickAt: SharedValue<number>;
  onSearchPress: () => void;
  vegOnly: boolean;
  onVegChange: (value: boolean) => void;
  categories: React.ReactNode;
  /** When false, only the search bar pins on scroll (classic 2-row category rail). */
  enableCategorySticky?: boolean;
};

export function FoodHomeGridFirstStickyChrome({
  scrollY,
  metrics,
  searchStickAt,
  categoryStickAt,
  onSearchPress,
  vegOnly,
  onVegChange,
  categories,
  enableCategorySticky = true,
}: Props) {
  const searchTop = gridFirstStickySearchTop(metrics);
  const categoryTop = gridFirstStickyCategoryTop(metrics);

  const [searchStickyOn, setSearchStickyOn] = useState(false);
  const [categoryStickyOn, setCategoryStickyOn] = useState(false);

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

  const chromeActive = searchStickyOn || categoryStickyOn;

  const searchBarStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    const stickAt = searchStickAt.value;
    const on = y >= stickAt - STICK_FADE_PX;
    return {
      opacity: interpolate(
        y,
        [stickAt - STICK_FADE_PX, stickAt + STICK_FADE_PX],
        [0, 1],
        Extrapolation.CLAMP
      ),
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
    const on = y >= stickAt - STICK_FADE_PX;
    return {
      opacity: interpolate(
        y,
        [stickAt - STICK_FADE_PX, stickAt + STICK_FADE_PX],
        [0, 1],
        Extrapolation.CLAMP
      ),
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

  return (
    <View style={styles.wrap} pointerEvents={chromeActive ? "box-none" : "none"}>
      <Animated.View
        style={[styles.searchLayer, searchBarStyle, { top: 0 }]}
        pointerEvents={searchStickyOn ? "box-none" : "none"}
      >
        <View style={[styles.statusBarBand, { height: searchTop }]} pointerEvents="none" />
        <View style={styles.searchInner} pointerEvents="box-none">
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
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 10,
  },
  statusBarBand: {
    width: "100%",
    backgroundColor: "#FFFFFF",
  },
  searchInner: {
    paddingBottom: 6,
  },
  categoryLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 6,
  },
  categoryInner: {
    paddingBottom: 6,
  },
});
