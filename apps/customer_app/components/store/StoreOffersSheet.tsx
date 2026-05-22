import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MerchantOfferItem, PlatformOfferItem } from "@/services/offers.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreBottomSheetShell } from "./StoreBottomSheetShell";

type StoreOffer = MerchantOfferItem | PlatformOfferItem;

export type StoreOffersSheetProps = {
  visible: boolean;
  onClose: () => void;
  storeName: string;
  offers: StoreOffer[];
};

function isMerchantOffer(o: StoreOffer): o is MerchantOfferItem {
  return "coupon_code" in o || "offer_type" in o;
}

function OfferCard({ offer }: { offer: StoreOffer }) {
  const [expanded, setExpanded] = useState(false);
  const merchant = isMerchantOffer(offer);
  const code = merchant ? offer.coupon_code : null;
  const autoApply = merchant ? offer.auto_apply : true;

  const details = [
    autoApply
      ? "Offer will be applied automatically. No promo code required."
      : code
        ? `Use code ${code} at checkout.`
        : "Apply this offer at checkout when eligible.",
    "Applicable only on selected items",
    "Offer may not be combined with other offers.",
  ];

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
      >
        <View style={styles.tagIcon}>
          <Ionicons name="pricetag" size={16} color={StoreTheme.offerBlue} />
        </View>
        <View style={styles.cardTextCol}>
          <Text style={styles.cardTitle}>{offer.label}</Text>
          {offer.sub_label ? (
            <Text style={styles.cardSub}>{offer.sub_label}</Text>
          ) : null}
          {code ? (
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{code}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={StoreTheme.textSecondary}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.cardBody}>
          <View style={styles.cardDivider} />
          {details.map((line) => (
            <View key={line} style={styles.detailRow}>
              <Ionicons name="checkmark-circle" size={16} color={StoreTheme.reorderGreen} />
              <Text style={styles.detailText}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function StoreOffersSheet({ visible, onClose, storeName, offers }: StoreOffersSheetProps) {
  const { height: winH } = useWindowDimensions();
  const scrollMaxH = Math.round(winH * 0.62);

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.9}>
      <View style={styles.handle} />
      <Text style={styles.sheetTitle}>Offers at {storeName}</Text>
      <Text style={styles.sectionLabel}>Restaurant coupons</Text>

      <ScrollView
        style={[styles.list, { maxHeight: scrollMaxH }]}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator
        bounces
      >
        {offers.length === 0 ? (
          <Text style={styles.empty}>No offers available for this store right now.</Text>
        ) : (
          offers.map((offer) => (
            <OfferCard key={`${offer.id}-${offer.label}`} offer={offer} />
          ))
        )}
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  empty: {
    fontSize: 14,
    color: StoreTheme.textSecondary,
    textAlign: "center",
    paddingVertical: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: StoreTheme.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
  },
  tagIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    lineHeight: 19,
  },
  cardSub: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    lineHeight: 16,
  },
  codeBox: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: StoreTheme.border,
    borderStyle: "dashed",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  codeText: {
    fontSize: 12,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    letterSpacing: 0.5,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  cardDivider: {
    borderBottomWidth: 1,
    borderStyle: "dotted",
    borderColor: StoreTheme.borderDotted,
    marginBottom: 12,
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
    color: StoreTheme.textSecondary,
    lineHeight: 17,
  },
});
