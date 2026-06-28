import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import Animated from "react-native-reanimated";
import { StoreFilterBar, type StoreFilterId } from "@/components/store/StoreFilterBar";
import {
  MERCHANT_HEADER_TOP_GUTTER,
  STICKY_SEARCH_ROW_HEIGHT,
  FILTER_BAR_HEIGHT,
} from "../constants/layout";
import { StoreTheme } from "@/constants/storeTheme";
import { GatiMitraColors } from "@/constants/gatimitra";

export type MerchantStickyChromeProps = {
  topGutter?: number;
  stickySearchStyle: object;
  stickySearchBgStyle: object;
  stickyFilterStyle: object;
  stickyFilterTop: number;
  searchRow: React.ReactNode;
  filter: StoreFilterId;
  onFilterChange: (id: StoreFilterId) => void;
  onOpenFilters: () => void;
  showHighlyReordered: boolean;
  filtersActive: boolean;
  pointerEvents: "auto" | "box-none" | "none";
  stickySearchActive: boolean;
  stickyFilterActive: boolean;
  headerSearchExpanded: boolean;
};

export const MerchantStickyChrome = React.memo(function MerchantStickyChrome({
  topGutter = MERCHANT_HEADER_TOP_GUTTER,
  stickySearchStyle,
  stickySearchBgStyle,
  stickyFilterStyle,
  stickyFilterTop,
  searchRow,
  filter,
  onFilterChange,
  onOpenFilters,
  showHighlyReordered,
  filtersActive,
  pointerEvents,
  stickySearchActive,
  stickyFilterActive,
  headerSearchExpanded,
}: MerchantStickyChromeProps) {
  const stickySearchPointerEvents =
    headerSearchExpanded || stickySearchActive ? "auto" : "none";

  return (
    <View style={styles.root} pointerEvents={pointerEvents}>
      <Animated.View
        style={[styles.searchWrap, { paddingTop: topGutter }, stickySearchStyle]}
        pointerEvents={stickySearchPointerEvents}
      >
        <Animated.View style={[StyleSheet.absoluteFill, styles.searchBg, stickySearchBgStyle]} />
        <View style={styles.searchRowInner}>{searchRow}</View>
      </Animated.View>

      <Animated.View
        style={[
          styles.filterWrap,
          { top: stickyFilterTop, height: FILTER_BAR_HEIGHT + 8 },
          stickyFilterStyle,
        ]}
        pointerEvents={stickyFilterActive ? "auto" : "none"}
      >
        <View style={styles.filterBg} pointerEvents="none" />
        <StoreFilterBar
          active={filter}
          onChange={onFilterChange}
          onOpenFilters={onOpenFilters}
          showHighlyReordered={showHighlyReordered}
          filtersActive={filtersActive}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
  },
  searchWrap: {
    position: "relative",
    paddingHorizontal: 12,
    paddingBottom: 10,
    minHeight: STICKY_SEARCH_ROW_HEIGHT + 10,
    ...Platform.select({
      android: { elevation: 4 },
      ios: GatiMitraColors.elevationShadow as object,
    }),
  },
  searchBg: {
    backgroundColor: "#fff",
  },
  searchRowInner: {
    zIndex: 1,
    minHeight: STICKY_SEARCH_ROW_HEIGHT,
  },
  filterWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  filterBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: StoreTheme.background,
  },
});
