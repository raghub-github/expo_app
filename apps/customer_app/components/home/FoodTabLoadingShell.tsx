/**
 * Food tab Suspense / cold-chunk fallback.
 * Header chrome paints immediately; listing uses card skeletons (no full-screen spinner).
 */
import { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { FoodHomeGridFirstHeader } from "@/components/home/FoodHomeGridFirstHeader";
import { RestaurantListSkeleton, GMSkeleton } from "@/components/ShimmerSkeleton";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useLocationStore } from "@/store/locationStore";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";
import { isRawCoordinateText } from "@/lib/isRawCoordinateText";
import {
  MERCHANT_RAIL_CARD_W,
  MERCHANT_RAIL_GAP,
  merchantRailImageHeight,
} from "@/components/home/MerchantGridCard";

function DealRailSkeleton() {
  const imageH = merchantRailImageHeight(MERCHANT_RAIL_CARD_W);
  return (
    <View style={styles.dealSection}>
      <GMSkeleton style={styles.sectionTitle} />
      <View style={styles.dealRow}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.dealCard, { width: MERCHANT_RAIL_CARD_W }]}>
            <GMSkeleton style={{ width: MERCHANT_RAIL_CARD_W, height: imageH, borderRadius: 14 }} />
            <GMSkeleton style={styles.dealName} />
            <GMSkeleton style={styles.dealMeta} />
          </View>
        ))}
      </View>
    </View>
  );
}

function clip(value: string, max = 48): string {
  return value.length > max ? `${value.slice(0, max - 3)}…` : value;
}

export function FoodTabLoadingShell() {
  const insets = useAppSafeAreaInsets();
  const address = useLocationStore((s) => s.address);
  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);
  const setVegOnly = useDietaryPreferenceStore((s) => s.setVegOnly);
  const router = useRouter();
  // The search pill is visible while the food home module loads — keep it live.
  const onSearchPress = useCallback(() => {
    router.push({ pathname: "/search", params: { storeType: "FOOD" } });
  }, [router]);

  const labels = useMemo(() => {
    const primaryRaw = address?.primary?.trim() || "";
    const secondaryRaw =
      address?.secondary?.trim() ||
      address?.fullAddress?.trim() ||
      "";
    const primary =
      primaryRaw && !isRawCoordinateText(primaryRaw) ? primaryRaw : "HOME";
    const secondary =
      secondaryRaw && !isRawCoordinateText(secondaryRaw)
        ? clip(secondaryRaw)
        : "Detecting location…";
    return { primary, secondary };
  }, [address]);

  return (
    <View style={styles.root} accessibilityLabel="Loading food">
      <FoodHomeGridFirstHeader
        topInset={insets.top}
        locationPrimary={labels.primary}
        locationSecondary={labels.secondary}
        vegOnly={vegOnly}
        onSearchPress={onSearchPress}
        onVegChange={setVegOnly}
        showVegToggle
        heroReady={false}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
      >
        <DealRailSkeleton />
        <GMSkeleton style={styles.nearTitle} />
        <RestaurantListSkeleton count={2} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  dealSection: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionTitle: {
    marginLeft: 16,
    marginBottom: 12,
    height: 14,
    width: 168,
    borderRadius: 6,
  },
  dealRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: MERCHANT_RAIL_GAP,
  },
  dealCard: {
    gap: 8,
  },
  dealName: {
    height: 14,
    width: "88%",
    borderRadius: 6,
  },
  dealMeta: {
    height: 12,
    width: "55%",
    borderRadius: 6,
  },
  nearTitle: {
    marginLeft: 16,
    marginBottom: 10,
    marginTop: 4,
    height: 14,
    width: 160,
    borderRadius: 6,
  },
});
