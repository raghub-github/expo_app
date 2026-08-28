import React, { useMemo } from "react";
import { AppText } from "@/components/AppText";

import { Pressable, StyleSheet, Platform, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import { StoreTheme } from "@/constants/storeTheme";
import { resolveStoreContinueBarHeight } from "@/components/store/MerchantMenuCartSheet";
import { useCartStore } from "@/store/cartStore";
import { merchantCartMatchesRoute } from "@/lib/merchantRouteId";

export type MerchantFloatingFabProps = {
  bottom: number;
  onPress: () => void;
  animatedStyle: object;
  /** Defaults to "Menu". Grocery stores use "Catalog". */
  label?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
};

export const MerchantFloatingFab = React.memo(function MerchantFloatingFab({
  bottom,
  onPress,
  animatedStyle,
  label = "Menu",
  iconName = "restaurant-outline",
}: MerchantFloatingFabProps) {
  return (
    <Animated.View style={[styles.wrap, { bottom }, animatedStyle]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.fabPressed]}
        // Tight hit area — do not steal taps from nearby ADD buttons.
        hitSlop={4}
        android_ripple={{ color: "rgba(255,255,255,0.2)" }}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label.toLowerCase()}`}
      >
        {/* Inner shell keeps bg/border stable on Android Pressable + ripple. */}
        <View style={styles.fab} pointerEvents="none">
          <Ionicons name={iconName} size={18} color="#FFFFFF" />
          <AppText style={styles.text}>{label}</AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
});

/** Keeps cart subscription local so the merchant screen does not re-render on qty changes. */
export const MerchantFloatingFabWithCartOffset = React.memo(function MerchantFloatingFabWithCartOffset({
  merchantId,
  cartDockBottomInset,
  reserveOfferStrip = true,
  ...fabProps
}: Omit<MerchantFloatingFabProps, "bottom"> & {
  merchantId: string;
  cartDockBottomInset: number;
  reserveOfferStrip?: boolean;
}) {
  const hasMerchantCartItems = useCartStore(
    (s) =>
      merchantCartMatchesRoute(s.merchantId, merchantId) &&
      s.items.some((cartItem) => cartItem.quantity > 0)
  );
  const bottom = useMemo(
    () =>
      hasMerchantCartItems
        ? resolveStoreContinueBarHeight(reserveOfferStrip, cartDockBottomInset) + 14
        : cartDockBottomInset + 14,
    [cartDockBottomInset, hasMerchantCartItems, reserveOfferStrip]
  );
  return <MerchantFloatingFab {...fabProps} bottom={bottom} />;
});

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 16,
    /** Below cart dock (200) so Continue stays tappable; above list content. */
    zIndex: 180,
    elevation: 24,
  },
  pressable: {
    borderRadius: 8,
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: StoreTheme.fabBg,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  fabPressed: {
    opacity: Platform.OS === "ios" ? 0.88 : 1,
    transform: [{ scale: 0.98 }],
  },
  text: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
