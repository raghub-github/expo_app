import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SearchingOrdersPillInline } from "@/src/components/home/SearchingOrdersPill";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { MIN_TOUCH_TARGET } from "@/src/theme/responsive";

type Props = {
  showStores?: boolean;
  storesActive?: boolean;
  onStoresPress?: () => void;
  showSearching?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Map top chrome: Stores + Searching share one flex row so they never overlap
 * across widths / font scales / display zoom.
 */
export function HomeMapTopChrome({
  showStores = false,
  storesActive = false,
  onStoresPress,
  showSearching = false,
  style,
}: Props) {
  const { t } = useTranslation();
  const { rs, rf, ri, isCompactWidth } = useResponsiveLayout();
  const [storesWidth, setStoresWidth] = useState(0);

  if (!showStores && !showSearching) return null;

  const padH = rs(12);
  const padV = rs(8);
  const gap = rs(8);
  const iconSize = ri(16);
  const labelSize = rf(13, { min: 11, max: 15 });
  const showStoresLabel = !isCompactWidth || !showSearching;

  const onStoresLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setStoresWidth((prev) => (prev === w ? prev : w));
  };

  return (
    <View
      style={[
        styles.host,
        {
          top: rs(10),
          paddingHorizontal: rs(12),
          gap,
        },
        style,
      ]}
      pointerEvents="box-none"
    >
      {showStores ? (
        <TouchableOpacity
          onLayout={onStoresLayout}
          style={[
            styles.storeToggle,
            {
              paddingHorizontal: padH,
              paddingVertical: Math.max(padV, (MIN_TOUCH_TARGET - iconSize) / 2 - 2),
              minHeight: MIN_TOUCH_TARGET,
              gap: rs(6),
            },
            storesActive && styles.storeToggleOn,
          ]}
          onPress={onStoresPress}
          accessibilityRole="button"
          accessibilityLabel={t("home.nearbyStores", "Nearby stores")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="storefront"
            size={iconSize}
            color={storesActive ? "#ffffff" : "#EA580C"}
          />
          {showStoresLabel ? (
            <Text
              style={[
                styles.storeToggleText,
                { fontSize: labelSize },
                storesActive && styles.storeToggleTextOn,
              ]}
              numberOfLines={1}
            >
              {t("home.stores", "Stores")}
            </Text>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {showSearching ? (
        <View style={styles.searchSlot} pointerEvents="none">
          <SearchingOrdersPillInline compact={isCompactWidth} />
        </View>
      ) : (
        <View style={styles.searchSlot} />
      )}

      {/* Mirror Stores width so the searching pill stays optically centered on screen. */}
      {showStores && showSearching ? (
        <View
          style={{ width: storesWidth > 0 ? storesWidth : showStoresLabel ? 88 : 44 }}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 45,
    elevation: 26,
    flexDirection: "row",
    alignItems: "center",
  },
  storeToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FED7AA",
    flexShrink: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  storeToggleOn: {
    backgroundColor: "#EA580C",
    borderColor: "#EA580C",
  },
  storeToggleText: {
    fontWeight: "700",
    color: "#EA580C",
    flexShrink: 1,
  },
  storeToggleTextOn: {
    color: "#ffffff",
  },
  searchSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
