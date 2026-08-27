import { useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { RideBookOffer } from "@/lib/ride-offers";

export type RideOffersSheetProps = {
  visible: boolean;
  onClose: () => void;
  offers: RideBookOffer[];
};

function RideOfferCard({ offer }: { offer: RideBookOffer }) {
  const [expanded, setExpanded] = useState(false);
  const code = offer.couponCode?.trim() || null;
  const autoApply = offer.autoApply ?? !code;

  const details = [
    autoApply
      ? "This offer will be applied automatically on the payment page when eligible."
      : code
        ? `Enter code ${code} on the payment page to redeem.`
        : "Redeem this offer on the payment page when eligible.",
    "Valid on ride bookings only.",
    "Cannot be combined with other offers unless stated.",
  ];

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
      >
        <View style={styles.tagIcon}>
          <Ionicons name="pricetag" size={16} color={GatiMitraColors.primaryMint} />
        </View>
        <View style={styles.cardTextCol}>
          <AppText style={styles.cardTitle}>{offer.label}</AppText>
          {offer.subLabel ? <AppText style={styles.cardSub}>{offer.subLabel}</AppText> : null}
          {offer.criteria ? <AppText style={styles.cardCriteria}>{offer.criteria}</AppText> : null}
          {code ? (
            <View style={styles.codeBox}>
              <AppText style={styles.codeText}>{code}</AppText>
            </View>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#6B7280"
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.cardBody}>
          <View style={styles.cardDivider} />
          {details.map((line) => (
            <View key={line} style={styles.detailRow}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <AppText style={styles.detailText}>{line}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function RideOffersSheet({ visible, onClose, offers }: RideOffersSheetProps) {
  const { height: winH } = useWindowDimensions();
  const scrollMaxH = Math.round(winH * 0.55);

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.78}>
      <View style={styles.handle} />
      <AppText style={styles.sheetTitle}>Ride offers</AppText>
      <AppText style={styles.sheetSub}>
        Coupons and discounts for your trip will show up here.
      </AppText>
      <View style={styles.paymentNotice}>
        <Ionicons name="information-circle-outline" size={18} color="#0369A1" />
        <AppText style={styles.paymentNoticeText}>
          Eligible offers are applied exclusively on the fare payment page.
        </AppText>
      </View>

      <ScrollView
        style={[styles.list, { maxHeight: scrollMaxH }]}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        bounces={offers.length > 0}
      >
        {offers.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="pricetag-outline" size={28} color="#9CA3AF" />
            </View>
            <AppText style={styles.emptyTitle}>No offers right now</AppText>
            <AppText style={styles.emptySub}>
              When we run ride promotions, you will see them here before you book.
            </AppText>
          </View>
        ) : (
          offers.map((offer) => <RideOfferCard key={offer.id} offer={offer} />)
        )}
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  sheetSub: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  paymentNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F0F9FF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#BAE6FD",
  },
  paymentNoticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#0369A1",
    lineHeight: 17,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 19,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    marginBottom: 10,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 10,
  },
  tagIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTextCol: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  cardSub: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
  },
  cardCriteria: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
    marginTop: 2,
  },
  codeBox: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderStyle: "dashed",
    backgroundColor: "#F9FAFB",
  },
  codeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 0.6,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  detailText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#4B5563",
    lineHeight: 17,
  },
});
