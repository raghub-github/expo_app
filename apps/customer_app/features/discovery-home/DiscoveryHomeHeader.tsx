/**
 * Discovery food home header — back, Food Delivery + address, gold coin wallet,
 * dark search bar, VEG toggle.
 */

import { useEffect, useState } from "react";
import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { walletBalanceFallback } from "@/lib/walletBalanceCache";
import { markWalletEntrySource } from "@/store/walletChromeStore";
import { DiscoveryColors, DISCOVERY_PAGE_PAD } from "./discoveryTheme";

const PLACEHOLDERS = [
  "Search for delivery outlets near you...",
  "Search biryani…",
  "Search restaurants…",
];

function formatPillBalance(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 100000) {
    const lakhs = value / 100000;
    return `${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`;
  }
  if (value >= 10000) {
    const thousands = value / 1000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
  }
  return value % 1 === 0 ? String(Math.round(value)) : value.toFixed(0);
}

type Props = {
  locationLabel: string;
  onBack: () => void;
  onLocationPress: () => void;
  onSearchPress: () => void;
  vegOnly: boolean;
  onVegChange: (value: boolean) => void;
  topInset?: number;
};

export function DiscoveryHomeHeader({
  locationLabel,
  onBack,
  onLocationPress,
  onSearchPress,
  vegOnly,
  onVegChange,
  topInset = 0,
}: Props) {
  const router = useRouter();
  const balanceQ = useWalletBalance();
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const micScale = useSharedValue(1);

  const balance =
    balanceQ.data?.available_balance ??
    balanceQ.data?.balance ??
    walletBalanceFallback().available_balance;
  const displayAmount = formatPillBalance(balance);

  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    micScale.value = withRepeat(
      withSequence(withTiming(1.08, { duration: 800 }), withTiming(1, { duration: 800 })),
      -1,
      true
    );
  }, [micScale]);

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  return (
    <View style={[styles.wrap, topInset > 0 && { paddingTop: topInset }]} collapsable={false}>
      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={DiscoveryColors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.locationBlock}
          onPress={onLocationPress}
          activeOpacity={0.85}
        >
          <AppText style={styles.title} numberOfLines={1}>
            Food Delivery
          </AppText>
          <View style={styles.addressRow}>
            <AppText style={styles.address} numberOfLines={1}>
              {locationLabel || "Add delivery address"}
            </AppText>
            <Ionicons name="chevron-down" size={14} color={DiscoveryColors.textMuted} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.coinPill}
          activeOpacity={0.85}
          onPress={() => {
            markWalletEntrySource("food-home");
            router.push("/wallet");
          }}
          accessibilityRole="button"
          accessibilityLabel={`Wallet balance ${displayAmount}`}
        >
          <AppText style={styles.coinAmount} numberOfLines={1}>
            {displayAmount}
          </AppText>
          <LinearGradient
            colors={[DiscoveryColors.gold, DiscoveryColors.goldDeep]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.coin}
          >
            <AppText style={styles.coinMark}>₹</AppText>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TouchableOpacity style={styles.searchBar} activeOpacity={0.92} onPress={onSearchPress}>
          <Ionicons name="search" size={18} color={DiscoveryColors.textDim} />
          <AppText style={styles.searchPlaceholder} numberOfLines={1}>
            {PLACEHOLDERS[placeholderIndex]}
          </AppText>
          <Animated.View style={micStyle}>
            <Ionicons name="mic-outline" size={18} color={DiscoveryColors.textMuted} />
          </Animated.View>
        </TouchableOpacity>

        <View style={styles.vegCol}>
          <AppText style={styles.vegLabel}>VEG</AppText>
          <TouchableOpacity
            style={[styles.vegTrack, vegOnly && styles.vegTrackOn]}
            onPress={() => onVegChange(!vegOnly)}
            activeOpacity={0.85}
            accessibilityRole="switch"
            accessibilityState={{ checked: vegOnly }}
          >
            <View style={[styles.vegThumb, vegOnly && styles.vegThumbOn]} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 20,
    elevation: 20,
    paddingHorizontal: DISCOVERY_PAGE_PAD,
    paddingBottom: 12,
    backgroundColor: DiscoveryColors.bg,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  locationBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: DiscoveryColors.text,
    letterSpacing: -0.3,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 2,
  },
  address: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "500",
    color: DiscoveryColors.textMuted,
  },
  coinPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingLeft: 10,
    paddingRight: 4,
    borderRadius: 16,
    backgroundColor: DiscoveryColors.cardElevated,
    borderWidth: 1,
    borderColor: "#3A3A3A",
  },
  coinAmount: {
    fontSize: 13,
    fontWeight: "800",
    color: DiscoveryColors.text,
    letterSpacing: -0.2,
    maxWidth: 52,
  },
  coin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  coinMark: {
    fontSize: 10,
    fontWeight: "900",
    color: "#5B3A00",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBar: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: DiscoveryColors.search,
  },
  searchPlaceholder: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "500",
    color: "#8E8E8E",
  },
  vegCol: {
    width: 36,
    alignItems: "center",
    gap: 4,
  },
  vegLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: DiscoveryColors.text,
    letterSpacing: 0.6,
  },
  vegTrack: {
    width: 34,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#4B4B4B",
    padding: 2,
    justifyContent: "center",
  },
  vegTrackOn: {
    backgroundColor: DiscoveryColors.veg,
  },
  vegThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFFFFF",
    ...(Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.2,
          shadowRadius: 1,
        }
      : { elevation: 1 }),
  },
  vegThumbOn: {
    alignSelf: "flex-end",
  },
});
