import React from "react";
import { AppText } from "@/components/AppText";

import { View, Modal, Pressable, TouchableOpacity, ScrollView, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

export type MenuSheetScrollTarget =
  | { kind: "past-orders" }
  | { kind: "starting-at" }
  | { kind: "section-title"; title: string }
  | { kind: "category"; categoryId?: number | null; categoryName?: string }
  | { kind: "menu-item"; itemId: string; menuItemId?: number };

export type StoreMenuSheetSection = {
  id: string;
  title: string;
  count: number;
  /** Pink + suffix after title (category sections). */
  showPlus?: boolean;
  scrollTarget: MenuSheetScrollTarget;
};

export type StoreMenuSheetOfferRow = {
  id: string;
  title: string;
  subtitle?: string | null;
  /** Item count mapped to this offer (0 = whole menu / sheet offer). */
  count: number;
  scrollTarget: MenuSheetScrollTarget;
  highlightItemId?: string | null;
};

export type StoreMenuSheetProps = {
  visible: boolean;
  onClose: () => void;
  sections: StoreMenuSheetSection[];
  onSelectSection: (section: StoreMenuSheetSection) => void;
  /** Active offers — shown above categories when present. */
  offerRows?: StoreMenuSheetOfferRow[];
  onSelectOffer?: (offer: StoreMenuSheetOfferRow) => void;
  /** Currently selected offer while browsing (highlights row if sheet reopened). */
  selectedOfferId?: string | null;
  largeOrderSection?: StoreMenuSheetSection | null;
  fssaiLabel?: string | null;
};

function MenuRow({
  section,
  onPress,
}: {
  section: StoreMenuSheetSection;
  onPress: () => void;
}) {
  const dark = useMerchantUiDark();
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.rowLeft}>
        <AppText style={[styles.rowTitle, dark && styles.rowTitleDark]} numberOfLines={2}>
          {section.title}
        </AppText>
        {section.showPlus ? <AppText style={styles.plusSuffix}> +</AppText> : null}
      </View>
      <AppText style={[styles.rowCount, dark && styles.rowTitleDark]}>{section.count}</AppText>
    </TouchableOpacity>
  );
}

function OfferRow({
  offer,
  selected,
  onPress,
}: {
  offer: StoreMenuSheetOfferRow;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.offerRow, selected && styles.offerRowSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.offerIcon, selected && styles.offerIconSelected]}>
        <AppText style={[styles.offerIconPct, selected && styles.offerIconPctSelected]}>%</AppText>
      </View>
      <View style={styles.offerTextCol}>
        <AppText style={[styles.offerTitle, selected && styles.offerTitleSelected]} numberOfLines={1}>
          {offer.title}
        </AppText>
        {offer.subtitle ? (
          <AppText style={styles.offerSub} numberOfLines={1}>
            {offer.subtitle}
          </AppText>
        ) : null}
      </View>
      {offer.count > 0 ? (
        <AppText style={[styles.rowCount, selected && styles.offerCountSelected]}>{offer.count}</AppText>
      ) : (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={selected ? StoreTheme.accentMintDark : StoreTheme.textMuted}
        />
      )}
    </TouchableOpacity>
  );
}

export function StoreMenuSheet({
  visible,
  onClose,
  sections,
  onSelectSection,
  offerRows = [],
  onSelectOffer,
  selectedOfferId = null,
  largeOrderSection,
  fssaiLabel,
}: StoreMenuSheetProps) {
  const insets = useSafeAreaInsets();
  const dark = useMerchantUiDark();
  const { width: winW, height: winH } = useWindowDimensions();
  const cardWidth = Math.min(Math.round(winW * 0.88), 400);
  const cardMaxH = Math.round(winH * 0.58);
  const hasOffers = offerRows.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

        <View style={[styles.cardWrap, dark && styles.cardWrapDark, { width: cardWidth, maxHeight: cardMaxH }]}>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {hasOffers ? (
              <>
                <AppText style={[styles.sectionLabel, dark && styles.sectionLabelDark]}>ACTIVE OFFERS</AppText>
                {offerRows.map((offer) => (
                  <OfferRow
                    key={offer.id}
                    offer={offer}
                    selected={selectedOfferId === offer.id}
                    onPress={() => onSelectOffer?.(offer)}
                  />
                ))}
                <View style={[styles.divider, dark && styles.dividerDark]} />
                <AppText style={[styles.sectionLabel, dark && styles.sectionLabelDark]}>CATEGORIES</AppText>
              </>
            ) : null}

            {sections.map((section) => (
              <MenuRow
                key={section.id}
                section={section}
                onPress={() => onSelectSection(section)}
              />
            ))}

            {largeOrderSection ? (
              <>
                <View style={[styles.divider, dark && styles.dividerDark]} />
                <TouchableOpacity
                  style={styles.largeOrderRow}
                  onPress={() => onSelectSection(largeOrderSection)}
                  activeOpacity={0.75}
                >
                  <AppText style={[styles.largeOrderText, dark && styles.rowTitleDark]}>LARGE ORDER MENU</AppText>
                  <Ionicons name="chevron-down" size={16} color={dark ? MerchantDarkPalette.text : StoreTheme.textPrimary} />
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>

        {fssaiLabel ? (
          <AppText style={[styles.fssai, { bottom: Math.max(insets.bottom, 12) + 8 }]} numberOfLines={1}>
            {fssaiLabel}
          </AppText>
        ) : null}

        <TouchableOpacity
          style={[
            styles.closePill,
            {
              // Same slot as Menu FAB — no layout jump when sheet opens.
              bottom:
                Math.max(insets.bottom, 12) +
                (Platform.OS === "android" ? 8 : 0),
              right: 16,
            },
          ]}
          onPress={onClose}
          activeOpacity={0.88}
          hitSlop={10}
        >
          <Ionicons name="close" size={16} color="#fff" />
          <AppText style={styles.closeText}>Close</AppText>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  cardWrap: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  cardWrapDark: {
    backgroundColor: MerchantDarkPalette.surface,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: StoreTheme.textMuted,
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 2,
  },
  sectionLabelDark: {
    color: MerchantDarkPalette.textDim,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: StoreTheme.textPrimary,
    lineHeight: 20,
  },
  rowTitleDark: {
    color: MerchantDarkPalette.text,
  },
  plusSuffix: {
    fontSize: 15,
    fontWeight: "600",
    color: StoreTheme.accentRed,
  },
  rowCount: {
    fontSize: 15,
    fontWeight: "500",
    color: StoreTheme.textPrimary,
    minWidth: 24,
    textAlign: "right",
  },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 12,
  },
  offerRowSelected: {
    backgroundColor: StoreTheme.accentMintSoft,
  },
  offerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  offerIconSelected: {
    backgroundColor: StoreTheme.accentMint,
  },
  offerIconPct: {
    fontSize: 12,
    fontWeight: "800",
    color: StoreTheme.offerBlue,
  },
  offerIconPctSelected: {
    color: "#fff",
  },
  offerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  offerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
  },
  offerTitleSelected: {
    color: StoreTheme.accentMintDark,
  },
  offerSub: {
    fontSize: 11,
    color: StoreTheme.textSecondary,
    marginTop: 1,
  },
  offerCountSelected: {
    color: StoreTheme.accentMintDark,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: StoreTheme.border,
    marginVertical: 6,
  },
  dividerDark: {
    backgroundColor: MerchantDarkPalette.border,
  },
  largeOrderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  largeOrderText: {
    fontSize: 14,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    letterSpacing: 0.3,
  },
  fssai: {
    position: "absolute",
    left: 16,
    fontSize: 10,
    color: StoreTheme.textMuted,
    maxWidth: "58%",
  },
  closePill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2D2D32",
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 24,
    zIndex: 3,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  closeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
