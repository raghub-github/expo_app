/**
 * Listing-body loading under the real Food header.
 * Card shimmer only — no full-screen ActivityIndicator.
 */
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { RestaurantListSkeleton, GMSkeleton } from "@/components/ShimmerSkeleton";
import {
  MERCHANT_RAIL_CARD_W,
  MERCHANT_RAIL_GAP,
  merchantRailImageHeight,
} from "@/components/home/MerchantGridCard";

type Props = {
  /** Optional fixed line (e.g. veg-only). */
  slogan?: string;
  dark?: boolean;
  /** Include Recommended-rail placeholders (ListEmpty under header). */
  showDealRail?: boolean;
};

export function FoodHomeListingSkeleton({
  slogan,
  dark = false,
  showDealRail = true,
}: Props) {
  const imageH = merchantRailImageHeight(MERCHANT_RAIL_CARD_W);

  return (
    <View
      style={styles.root}
      accessibilityLabel="Loading restaurants"
    >
      {slogan?.trim() ? (
        <AppText style={[styles.slogan, dark && styles.sloganDark]}>{slogan.trim()}</AppText>
      ) : null}
      {showDealRail ? (
        <View style={styles.dealSection}>
          <GMSkeleton dark={dark} style={styles.sectionTitle} />
          <View style={styles.dealRow}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.dealCard, { width: MERCHANT_RAIL_CARD_W }]}>
                <GMSkeleton
                  dark={dark}
                  style={{ width: MERCHANT_RAIL_CARD_W, height: imageH, borderRadius: 14 }}
                />
                <GMSkeleton dark={dark} style={styles.dealName} />
                <GMSkeleton dark={dark} style={styles.dealMeta} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <GMSkeleton dark={dark} style={styles.nearTitle} />
      <RestaurantListSkeleton count={2} dark={dark} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 8,
    paddingBottom: 24,
    minHeight: 420,
  },
  slogan: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: "#94A3B8",
    paddingHorizontal: 28,
    marginBottom: 14,
  },
  sloganDark: {
    color: "#94A3B8",
  },
  dealSection: {
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
    height: 14,
    width: 160,
    borderRadius: 6,
  },
});
