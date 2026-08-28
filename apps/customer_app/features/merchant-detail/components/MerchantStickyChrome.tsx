import React from "react";
import { View, StyleSheet, Platform, Pressable } from "react-native";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import {
  MERCHANT_HEADER_TOP_GUTTER,
  STICKY_SEARCH_ROW_HEIGHT,
  STICKY_SEARCH_WRAP_PADDING_BOTTOM,
  STICKY_TITLE_ROW_HEIGHT,
} from "../constants/layout";
import { StoreTheme } from "@/constants/storeTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MerchantDarkPalette, useMerchantUiDark } from "../merchantUiTheme";

const FILTER_MINT = "#D1FAE5";

export type MerchantStickyChromeProps = {
  topGutter?: number;
  stickySearchStyle: object;
  stickySearchBgStyle: object;
  searchRow: React.ReactNode;
  pointerEvents: "auto" | "box-none" | "none";
  stickySearchActive: boolean;
  headerSearchExpanded: boolean;
  onBack: () => void;
  storeName?: string;
  onOpenFilters?: () => void;
  filtersActive?: boolean;
  onGroupOrder?: () => void;
  onOptions?: () => void;
  avgRating?: number | null;
  onRatingPress?: () => void;
  filterBar?: React.ReactNode;
};

/** Sticky header — Discovery pins title+search; Classic fades in search only. */
export const MerchantStickyChrome = React.memo(function MerchantStickyChrome({
  topGutter = MERCHANT_HEADER_TOP_GUTTER,
  stickySearchStyle,
  stickySearchBgStyle,
  searchRow,
  pointerEvents,
  stickySearchActive,
  headerSearchExpanded,
  onBack,
  storeName,
  onOpenFilters,
  filtersActive = false,
  onGroupOrder,
  onOptions,
  avgRating,
  onRatingPress,
  filterBar,
}: MerchantStickyChromeProps) {
  const dark = useMerchantUiDark();
  const stickySearchPointerEvents =
    headerSearchExpanded || stickySearchActive ? "auto" : "box-none";
  const ratingValue =
    avgRating != null && Number.isFinite(Number(avgRating)) && Number(avgRating) > 0
      ? Number(avgRating).toFixed(1)
      : null;

  return (
    <View style={styles.root} pointerEvents={pointerEvents}>
      <Animated.View
        style={[
          styles.searchWrap,
          !dark && styles.searchWrapClassic,
          { paddingTop: topGutter },
          stickySearchStyle,
        ]}
        pointerEvents={stickySearchPointerEvents}
      >
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.searchBg, dark && styles.searchBgDark, stickySearchBgStyle]}
        />

        {dark ? (
          <View style={styles.titleRow} pointerEvents="box-none">
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.backBtn, styles.backBtnDark, pressed && styles.btnPressed]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={MerchantDarkPalette.text} />
            </Pressable>
            <AppText style={[styles.storeName, styles.storeNameDark]} numberOfLines={1}>
              {storeName?.trim() || "Menu"}
            </AppText>
            <View style={styles.titleActions}>
              {ratingValue ? (
                <Pressable
                  onPress={onRatingPress}
                  disabled={!onRatingPress}
                  style={({ pressed }) => [styles.ratingChip, pressed && styles.btnPressed]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${ratingValue} rating`}
                >
                  <View style={styles.ratingChipRow}>
                    <AppText style={styles.ratingChipText}>{ratingValue}</AppText>
                    <Ionicons name="star" size={11} color="#FFFFFF" />
                  </View>
                </Pressable>
              ) : null}
              {onGroupOrder ? (
                <Pressable
                  onPress={onGroupOrder}
                  style={({ pressed }) => [styles.groupBtn, styles.groupBtnDark, pressed && styles.btnPressed]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Group order"
                >
                  <Ionicons name="people-outline" size={18} color={MerchantDarkPalette.accent} />
                </Pressable>
              ) : null}
              {onOptions ? (
                <Pressable
                  onPress={onOptions}
                  style={({ pressed }) => [styles.optionsBtn, pressed && styles.btnPressed]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="More options"
                >
                  <Ionicons name="ellipsis-vertical" size={18} color="#FFFFFF" />
                </Pressable>
              ) : (
                <View style={styles.titleSpacer} />
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.searchRowInner} pointerEvents="box-none">
          {dark ? null : (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color={StoreTheme.textPrimary} />
            </Pressable>
          )}
          {searchRow}
          {dark && onOpenFilters ? (
            <Pressable
              onPress={onOpenFilters}
              style={({ pressed }) => [
                styles.filterBtn,
                styles.filterBtnDark,
                filtersActive && styles.filterBtnActive,
                pressed && styles.btnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Filters"
            >
              <Ionicons name="options-outline" size={18} color={MerchantDarkPalette.accent} />
            </Pressable>
          ) : null}
        </View>
        {dark ? filterBar : null}
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
    paddingHorizontal: 16,
    paddingBottom: STICKY_SEARCH_WRAP_PADDING_BOTTOM,
    minHeight:
      STICKY_TITLE_ROW_HEIGHT +
      STICKY_SEARCH_ROW_HEIGHT +
      STICKY_SEARCH_WRAP_PADDING_BOTTOM,
    ...Platform.select({
      android: { elevation: 4 },
      ios: GatiMitraColors.elevationShadow as object,
    }),
  },
  searchWrapClassic: {
    minHeight: STICKY_SEARCH_ROW_HEIGHT + STICKY_SEARCH_WRAP_PADDING_BOTTOM,
  },
  searchBg: {
    backgroundColor: "#fff",
  },
  searchBgDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  titleRow: {
    zIndex: 1,
    minHeight: STICKY_TITLE_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  storeName: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: StoreTheme.textPrimary,
    letterSpacing: -0.2,
  },
  storeNameDark: {
    color: MerchantDarkPalette.text,
  },
  titleActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    maxWidth: "46%",
  },
  ratingChip: {
    flexShrink: 0,
    backgroundColor: "#16A34A",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  ratingChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
    flexShrink: 0,
  },
  groupBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: FILTER_MINT,
    alignItems: "center",
    justifyContent: "center",
  },
  groupBtnDark: {
    backgroundColor: MerchantDarkPalette.elevated,
  },
  optionsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#134E3A",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  titleSpacer: {
    width: 36,
    height: 36,
  },
  searchRowInner: {
    zIndex: 1,
    minHeight: STICKY_SEARCH_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    width: "100%",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: StoreTheme.searchBg,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnDark: {
    backgroundColor: "transparent",
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: FILTER_MINT,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  filterBtnDark: {
    backgroundColor: MerchantDarkPalette.elevated,
  },
  filterBtnActive: {
    borderWidth: 1.5,
    borderColor: StoreTheme.cartAction,
  },
  btnPressed: {
    opacity: 0.82,
  },
});
