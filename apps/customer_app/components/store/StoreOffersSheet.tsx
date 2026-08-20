import React, { useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MerchantOfferItem, PlatformOfferItem } from "@/services/offers.service";
import { formatListCardOfferFromMerchantOffer } from "@/lib/merchantOfferBadge";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreBottomSheetShell } from "./StoreBottomSheetShell";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

type StoreOffer = MerchantOfferItem | PlatformOfferItem;

const GENERIC_CAMPAIGN_TITLE =
  /^(precision|percentage\s*discount|boost|percentage|buy one get one)$/i;

export type StoreOffersSheetProps = {
  visible: boolean;
  onClose: () => void;
  storeName: string;
  offers: StoreOffer[];
};

function isMerchantOffer(o: StoreOffer): o is MerchantOfferItem {
  return "offer_type" in o;
}

function isPlatformOffer(o: StoreOffer): o is PlatformOfferItem {
  return "offer_kind" in o && !("offer_type" in o);
}

function isItemSurfaceOffer(o: StoreOffer): boolean {
  if (!isMerchantOffer(o)) return false;
  // Precision never belongs on menu item rows — only in this sheet / checkout sheet.
  if (o.conditions_mode === "precision") return false;
  if (o.display_surface === "sheet") return false;
  return o.display_surface === "item";
}

function platformOfferTitle(offer: PlatformOfferItem): string {
  const name = offer.name?.trim();
  if (name) return name;
  return offer.label;
}

function platformOfferSub(offer: PlatformOfferItem): string | null {
  const parts: string[] = [];
  if (offer.sub_label?.trim()) parts.push(offer.sub_label.trim());
  else if (offer.min_order_amount != null && offer.min_order_amount > 0) {
    parts.push(`on orders above ₹${Math.round(offer.min_order_amount)}`);
  }
  if (offer.max_discount_amount != null && offer.max_discount_amount > 0) {
    const maxLine = `up to ₹${Math.round(offer.max_discount_amount)}`;
    if (!parts.some((p) => p.includes(`₹${Math.round(offer.max_discount_amount!)}`))) {
      parts.push(maxLine);
    }
  }
  if (parts.length === 0) return "Applied automatically at checkout when eligible";
  return parts.join(" · ");
}

function OfferCard({
  offer,
  itemScoped,
  platform,
}: {
  offer: StoreOffer;
  itemScoped?: boolean;
  platform?: boolean;
}) {
  const dark = useMerchantUiDark();
  const [expanded, setExpanded] = useState(false);
  const merchant = isMerchantOffer(offer);
  const code = merchant
    ? offer.coupon_code
    : isPlatformOffer(offer)
      ? offer.coupon_code?.trim() || null
      : null;
  const autoApply = merchant ? offer.auto_apply : true;
  const title =
    platform && isPlatformOffer(offer)
      ? platformOfferTitle(offer)
      : merchant
        ? formatListCardOfferFromMerchantOffer(offer) ||
          (GENERIC_CAMPAIGN_TITLE.test(offer.label) ? "Special offer" : offer.label)
        : offer.label;
  const sub =
    platform && isPlatformOffer(offer) ? platformOfferSub(offer) : offer.sub_label || null;

  const details = [
    platform
      ? code
        ? `Use code ${code} at checkout, or tap Apply when the offer is eligible.`
        : "Offer will be applied automatically at checkout when eligible."
      : autoApply
        ? "Offer will be applied automatically. No promo code required."
        : code
          ? `Use code ${code} at checkout.`
          : "Apply this offer at checkout when eligible.",
    itemScoped
      ? "Shown on eligible menu items · auto-applied in the bill when those items are in your cart."
      : "Check eligibility on the offer details above.",
    "Offer may not be combined with other offers.",
  ];

  return (
    <View style={[styles.card, dark && styles.cardDark, platform && styles.cardPlatform, platform && dark && styles.cardPlatformDark]}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
      >
        <View
          style={[
            styles.tagIcon,
            itemScoped && styles.tagIconItem,
            platform && styles.tagIconPlatform,
          ]}
        >
          <Ionicons
            name={platform ? "sparkles" : "pricetag"}
            size={16}
            color={platform ? "#0F766E" : itemScoped ? "#15803D" : StoreTheme.offerBlue}
          />
        </View>
        <View style={styles.cardTextCol}>
          <AppText style={[styles.cardTitle, dark && styles.cardTitleDark]}>{title}</AppText>
          {sub ? <AppText style={[styles.cardSub, dark && styles.cardSubDark]}>{sub}</AppText> : null}
          {code ? (
            <View style={[styles.codeBox, dark && styles.codeBoxDark]}>
              <AppText style={[styles.codeText, dark && styles.cardTitleDark]}>{code}</AppText>
            </View>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={dark ? MerchantDarkPalette.textMuted : StoreTheme.textSecondary}
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.cardBody}>
          <View style={styles.cardDivider} />
          {details.map((line) => (
            <View key={line} style={styles.detailRow}>
              <Ionicons name="checkmark-circle" size={16} color={StoreTheme.reorderGreen} />
              <AppText style={styles.detailText}>{line}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function StoreOffersSheet({ visible, onClose, storeName, offers }: StoreOffersSheetProps) {
  const { height: winH } = useWindowDimensions();
  const dark = useMerchantUiDark();
  const scrollMaxH = Math.round(winH * 0.62);

  const { itemOffers, storeOffers, platformOffers } = useMemo(() => {
    const item: StoreOffer[] = [];
    const store: StoreOffer[] = [];
    const platform: PlatformOfferItem[] = [];
    for (const o of offers) {
      if (isPlatformOffer(o)) {
        platform.push(o);
        continue;
      }
      if (isItemSurfaceOffer(o)) item.push(o);
      else store.push(o);
    }
    return { itemOffers: item, storeOffers: store, platformOffers: platform };
  }, [offers]);

  const empty = offers.length === 0;

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.9}>
      <View style={styles.handle} />
      <AppText style={[styles.sheetTitle, dark && styles.sheetTitleDark]}>Offers at {storeName}</AppText>

      <ScrollView
        style={[styles.list, { maxHeight: scrollMaxH }]}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator
        bounces
      >
        {empty ? (
          <AppText style={[styles.empty, dark && styles.cardSubDark]}>No offers available for this store right now.</AppText>
        ) : (
          <>
            {platformOffers.length > 0 ? (
              <View style={styles.sectionBlock}>
                <AppText style={[styles.sectionLabel, dark && styles.sheetTitleDark]}>SPECIAL OFFERS</AppText>
                <AppText style={[styles.sectionHint, dark && styles.cardSubDark]}>Applied automatically at checkout</AppText>
                {platformOffers.map((offer) => (
                  <OfferCard
                    key={`platform-${offer.id}-${offer.label}`}
                    offer={offer}
                    platform
                  />
                ))}
              </View>
            ) : null}

            {storeOffers.length > 0 ? (
              <View style={styles.sectionBlock}>
                <AppText style={[styles.sectionLabel, dark && styles.sheetTitleDark]}>MORE OFFERS</AppText>
                <AppText style={[styles.sectionHint, dark && styles.cardSubDark]}>Bill discounts · applied at checkout</AppText>
                {storeOffers.map((offer) => (
                  <OfferCard key={`store-${offer.id}-${offer.label}`} offer={offer} />
                ))}
              </View>
            ) : null}

            {itemOffers.length > 0 ? (
              <View style={styles.sectionBlock}>
                <AppText style={[styles.sectionLabel, dark && styles.sheetTitleDark]}>ITEM DEALS</AppText>
                <AppText style={[styles.sectionHint, dark && styles.cardSubDark]}>
                  Look for badges on eligible dishes
                </AppText>
                {itemOffers.map((offer) => (
                  <OfferCard
                    key={`item-${offer.id}-${offer.label}`}
                    offer={offer}
                    itemScoped
                  />
                ))}
              </View>
            ) : null}
          </>
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
  sheetTitleDark: {
    color: MerchantDarkPalette.text,
  },
  sectionBlock: {
    gap: 12,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
  },
  sectionHint: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    marginTop: -6,
    marginBottom: 2,
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
  cardDark: {
    backgroundColor: MerchantDarkPalette.elevated,
    borderColor: MerchantDarkPalette.border,
  },
  cardPlatform: {
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
  },
  cardPlatformDark: {
    borderColor: MerchantDarkPalette.accent,
    backgroundColor: MerchantDarkPalette.accentSoft,
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
  tagIconItem: {
    backgroundColor: "#ECFDF5",
  },
  tagIconPlatform: {
    backgroundColor: "#CCFBF1",
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
  cardTitleDark: {
    color: MerchantDarkPalette.text,
  },
  cardSub: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    lineHeight: 16,
  },
  cardSubDark: {
    color: MerchantDarkPalette.textMuted,
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
  codeBoxDark: {
    borderColor: MerchantDarkPalette.border,
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
