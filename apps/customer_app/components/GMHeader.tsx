/**
 * 2025 GatiMitra Header – IN-FLOW (no absolute/fixed).
 * Layout flow: header takes space at top, content renders below.
 * Full: Back | Search | Veg | Cart. Minimal (no-service): Back | Location only.
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP, HEADER_VERTICAL_PADDING } from "@/constants/layout";

export const GM_HEADER_HEIGHT = 56;
const PAD_H = 16;

export type GMHeaderProps = {
  /** Safe area top inset from useSafeAreaInsets().top */
  topInset: number;
  onBack: () => void;
  onSearchPress?: () => void;
  /** Show veg toggle (and optionally cart when showCart is true). */
  showActions?: boolean;
  vegOnly?: boolean;
  onVegChange?: (value: boolean) => void;
  /** Show cart in header (false on food, true on other services e.g. shop). */
  showCart?: boolean;
  cartCount?: number;
  onCartPress?: () => void;
  /** Custom center element (e.g. GMSearchBar) */
  searchElement?: React.ReactNode;
  /** Minimal header for no-service: only Back + location label. Hides search, veg, cart. */
  minimal?: boolean;
  /** Location line for minimal header (e.g. "Current location" or address.primary) */
  locationLabel?: string;
};

export function GMHeader({
  topInset,
  onBack,
  onSearchPress,
  showActions = true,
  vegOnly = false,
  onVegChange,
  showCart = false,
  cartCount = 0,
  onCartPress,
  searchElement,
  minimal = false,
  locationLabel = "Current location",
}: GMHeaderProps) {
  if (minimal) {
    return (
      <View style={[styles.wrap, styles.wrapInFlow, { paddingTop: topInset + HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING }]}>
        <View style={styles.innerMinimal}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimaryNew} />
          </TouchableOpacity>
          <Text style={styles.locationLabel} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, styles.wrapInFlow, { paddingTop: topInset + HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING }]}>
      <View style={[styles.inner, styles.innerSolid]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimaryNew} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.centerSlot}
          onPress={onSearchPress ?? (() => {})}
          activeOpacity={0.9}
        >
          {searchElement ?? (
            <>
              <Ionicons name="search" size={20} color={GatiMitraColors.textSecondary} />
              <Text style={styles.searchPlaceholder}>Search restaurants…</Text>
            </>
          )}
        </TouchableOpacity>

        {showActions && (
          <View style={styles.actions}>
            <View style={styles.vegWrap}>
              <Text style={styles.vegLabel}>Veg</Text>
              <TouchableOpacity
                style={[styles.vegToggle, vegOnly && styles.vegToggleOn]}
                onPress={() => onVegChange?.(!vegOnly)}
                activeOpacity={0.8}
              >
                <View style={[styles.vegThumb, vegOnly && styles.vegThumbOn]} />
              </TouchableOpacity>
            </View>
            {showCart && (
              <TouchableOpacity onPress={onCartPress ?? (() => {})} style={styles.cartBtn} hitSlop={8}>
                <Ionicons name="cart-outline" size={24} color={GatiMitraColors.textPrimaryNew} />
                {cartCount > 0 && (
                  <Animated.View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
                  </Animated.View>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAD_H,
    backgroundColor: "#ffffff",
    zIndex: 1000,
  },
  wrapInFlow: {},
  inner: {
    flexDirection: "row",
    alignItems: "center",
    height: GM_HEADER_HEIGHT,
    borderRadius: 20,
    paddingHorizontal: 16,
    gap: 10,
    minHeight: GM_HEADER_HEIGHT,
  },
  innerSolid: {
    backgroundColor: "#ffffff",
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 18,
    }),
    elevation: 2,
  },
  innerMinimal: {
    flexDirection: "row",
    alignItems: "center",
    height: GM_HEADER_HEIGHT,
    paddingHorizontal: 4,
  },
  locationLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
    marginLeft: 8,
  },
  backBtn: {
    padding: 6,
    flexShrink: 0,
  },
  centerSlot: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  searchPlaceholder: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  vegWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  vegLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
  },
  vegToggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  vegToggleOn: {
    backgroundColor: GatiMitraColors.primaryMint,
  },
  vegThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
    }),
    elevation: 2,
  },
  vegThumbOn: {
    alignSelf: "flex-end",
  },
  cartBtn: {
    padding: 6,
    position: "relative" as const,
    flexShrink: 0,
  },
  cartBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
});
