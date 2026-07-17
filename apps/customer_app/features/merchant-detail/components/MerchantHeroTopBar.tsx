import React from "react";
import { AppText } from "@/components/AppText";

import { View, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

/** Opaque charcoal — must stay solid (not parent opacity) so buttons read on any banner. */
const BTN_BG = "#2D2D2D";
const BTN_SIZE = 40;

export type MerchantHeroTopBarActions = {
  onBack: () => void;
  onSearch: () => void;
  onGroupOrder: () => void;
  onOptions: () => void;
};

export type MerchantHeroTopBarProps = MerchantHeroTopBarActions & {
  visible: boolean;
};

function HeroCircleBtn({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <View style={styles.circleBtn}>{children}</View>
    </TouchableOpacity>
  );
}

/** Button row only — embed on hero banner or inside fixed overlay shell. */
export const MerchantHeroTopBarContent = React.memo(function MerchantHeroTopBarContent({
  onBack,
  onSearch,
  onGroupOrder,
  onOptions,
}: MerchantHeroTopBarActions) {
  return (
    <View style={styles.row} pointerEvents="box-none">
      <HeroCircleBtn onPress={onBack} label="Go back">
        <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
      </HeroCircleBtn>

      <View style={styles.right} pointerEvents="box-none">
        <TouchableOpacity
          onPress={onSearch}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Search menu"
          hitSlop={4}
        >
          <View style={styles.searchPill}>
            <Ionicons name="search" size={16} color="#FFFFFF" />
            <AppText style={styles.searchText}>Search</AppText>
          </View>
        </TouchableOpacity>

        <HeroCircleBtn onPress={onGroupOrder} label="Group order">
          <Ionicons name="people-outline" size={19} color="#FFFFFF" />
        </HeroCircleBtn>

        <HeroCircleBtn onPress={onOptions} label="More options">
          <Ionicons name="ellipsis-vertical" size={18} color="#FFFFFF" />
        </HeroCircleBtn>
      </View>
    </View>
  );
});

/** Fixed screen overlay — stays visible while hero is on screen (before sticky header). */
export const MerchantHeroTopBar = React.memo(function MerchantHeroTopBar({
  visible,
  onBack,
  onSearch,
  onGroupOrder,
  onOptions,
}: MerchantHeroTopBarProps) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <View
      style={[styles.root, { paddingTop: insets.top + 6 }]}
      pointerEvents="box-none"
      collapsable={false}
    >
      <MerchantHeroTopBarContent
        onBack={onBack}
        onSearch={onSearch}
        onGroupOrder={onGroupOrder}
        onOptions={onOptions}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 200,
    paddingHorizontal: 12,
    ...Platform.select({
      android: { elevation: 16 },
      ios: {},
    }),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: BTN_SIZE,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circleBtn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: BTN_BG,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
      },
    }),
  },
  searchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: BTN_BG,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BTN_SIZE / 2,
    minHeight: BTN_SIZE,
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 4,
      },
    }),
  },
  searchText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
