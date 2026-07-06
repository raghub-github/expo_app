import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { MerchantLoadingTypewriterText } from "@/components/merchant/MerchantLoadingTypewriterText";
import { useMerchantLoadingMessage } from "@/hooks/useMerchantLoadingMessage";

const PAD = 16;
const CARD_W = 168;
const CARD_GAP = 12;

type Props = {
  startMessageIndex?: number;
  edgeToEdge?: boolean;
};

/** Meals-under-price page skeleton — hero, filters, store rows with horizontal cards. */
export function MealsUnderPriceLoadingSkeleton({
  startMessageIndex,
  edgeToEdge = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const message = useMerchantLoadingMessage("meals-under-price", startMessageIndex);

  return (
    <View
      style={[
        styles.root,
        edgeToEdge ? { paddingTop: insets.top, paddingBottom: insets.bottom } : { paddingBottom: insets.bottom },
      ]}
    >
      <GMSkeleton style={styles.hero} />
      <View style={styles.filterRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <GMSkeleton key={i} style={styles.filterChip} />
        ))}
      </View>

      {Array.from({ length: 2 }).map((_, sectionIdx) => (
        <View key={sectionIdx} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <GMSkeleton style={styles.storeTitle} />
              <GMSkeleton style={styles.storeMeta} />
            </View>
            <GMSkeleton style={styles.ratingPill} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardRow}
          >
            {Array.from({ length: 2 }).map((_, cardIdx) => (
              <View key={cardIdx} style={styles.card}>
                <GMSkeleton style={styles.cardImage} />
                <View style={styles.cardBody}>
                  <GMSkeleton style={styles.cardLineLg} />
                  <GMSkeleton style={styles.cardLineMd} />
                  <View style={styles.cardPriceRow}>
                    <GMSkeleton style={styles.cardPrice} />
                    <GMSkeleton style={styles.cardCta} />
                  </View>
                  <GMSkeleton style={styles.cardOffer} />
                </View>
              </View>
            ))}
          </ScrollView>
          <GMSkeleton style={styles.menuBtn} />
        </View>
      ))}

      <View style={styles.messageWrap} pointerEvents="none">
        <MerchantLoadingTypewriterText text={message} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  hero: {
    width: "100%",
    height: 200,
    borderRadius: 0,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: PAD,
    paddingVertical: 10,
  },
  filterChip: {
    width: 88,
    height: 34,
    borderRadius: 10,
  },
  section: {
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 8,
    borderBottomColor: "#F1F5F9",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    marginBottom: 14,
    gap: 10,
  },
  sectionHeaderLeft: {
    flex: 1,
    gap: 8,
  },
  storeTitle: {
    height: 16,
    width: "78%",
    borderRadius: 6,
  },
  storeMeta: {
    height: 12,
    width: "52%",
    borderRadius: 6,
  },
  ratingPill: {
    width: 52,
    height: 28,
    borderRadius: 8,
  },
  cardRow: {
    paddingHorizontal: PAD,
    gap: CARD_GAP,
  },
  card: {
    width: CARD_W,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  cardImage: {
    width: "100%",
    height: 128,
    borderRadius: 0,
  },
  cardBody: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  cardLineLg: {
    height: 12,
    width: "92%",
    borderRadius: 6,
  },
  cardLineMd: {
    height: 12,
    width: "68%",
    borderRadius: 6,
  },
  cardPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardPrice: {
    height: 14,
    width: 56,
    borderRadius: 6,
  },
  cardCta: {
    height: 28,
    width: 72,
    borderRadius: 8,
  },
  cardOffer: {
    height: 10,
    width: 96,
    borderRadius: 6,
  },
  menuBtn: {
    marginTop: 14,
    marginHorizontal: PAD,
    height: 42,
    borderRadius: 12,
  },
  messageWrap: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
});
