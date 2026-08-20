import React from "react";
import { AppText } from "@/components/AppText";
import { View, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const BTN_SIZE = 40;
const MINT_BTN = "#D1FAE5";
const DARK_BTN = "#134E3A";

export type MerchantHeroTopBarActions = {
  onBack: () => void;
  onSearch: () => void;
  onGroupOrder: () => void;
  onOptions: () => void;
  storeName?: string;
};

export type MerchantHeroTopBarProps = MerchantHeroTopBarActions & {
  visible: boolean;
};

function HeroSquareBtn({
  onPress,
  label,
  backgroundColor,
  children,
}: {
  onPress: () => void;
  label: string;
  backgroundColor: string;
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
      <View style={[styles.squareBtn, { backgroundColor }]}>{children}</View>
    </TouchableOpacity>
  );
}

/** Button row only — embed on hero banner or inside fixed overlay shell. */
export const MerchantHeroTopBarContent = React.memo(function MerchantHeroTopBarContent({
  onBack,
  onSearch,
  onGroupOrder,
  onOptions,
  storeName,
}: MerchantHeroTopBarActions) {
  return (
    <View style={styles.row} pointerEvents="box-none">
      <HeroSquareBtn onPress={onBack} label="Go back" backgroundColor="rgba(0,0,0,0.55)">
        <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
      </HeroSquareBtn>

      <AppText style={styles.storeName} numberOfLines={1}>
        {storeName?.trim() || "Menu"}
      </AppText>

      <View style={styles.right} pointerEvents="box-none">
        <HeroSquareBtn onPress={onSearch} label="Search menu" backgroundColor={MINT_BTN}>
          <Ionicons name="search" size={18} color={DARK_BTN} />
        </HeroSquareBtn>
        <HeroSquareBtn onPress={onGroupOrder} label="Group order" backgroundColor={MINT_BTN}>
          <Ionicons name="people-outline" size={18} color={DARK_BTN} />
        </HeroSquareBtn>
        <HeroSquareBtn onPress={onOptions} label="More options" backgroundColor={DARK_BTN}>
          <Ionicons name="ellipsis-vertical" size={18} color="#FFFFFF" />
        </HeroSquareBtn>
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
  storeName,
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
        storeName={storeName}
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
    paddingHorizontal: 16,
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
    gap: 10,
  },
  storeName: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  squareBtn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 4,
      },
    }),
  },
});
