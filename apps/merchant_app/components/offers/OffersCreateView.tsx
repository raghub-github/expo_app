import type { ComponentProps } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OfferType } from "@/services/offersApi";
import { countOffersForTrackFilter } from "@/lib/offers/offer-lifecycle";
import type { Offer } from "@/services/offersApi";
import { OFFERS_UI, offersSharedStyles } from "./offers-theme";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";

export type OfferCreateCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  presetType?: OfferType;
  enabled: boolean;
};

const CREATE_CATEGORIES: OfferCreateCategory[] = [
  {
    id: "delight",
    title: "Delight your customers",
    subtitle: "Freebies, BOGO, and more to boost menu to cart conversions",
    icon: "gift-outline",
    presetType: "BOGO",
    enabled: true,
  },
  {
    id: "grow",
    title: "Grow your customer base",
    subtitle: "Offers to increase your customers and orders",
    icon: "people-outline",
    presetType: "CART_PERCENTAGE",
    enabled: true,
  },
  {
    id: "value",
    title: "Increase your order value",
    subtitle: "Encourage high-value orders and party orders",
    icon: "cash-outline",
    presetType: "CART_FLAT",
    enabled: true,
  },
  {
    id: "mealtime",
    title: "Get more mealtime orders",
    subtitle: "Boost orders during breakfast, lunch, or dinner",
    icon: "restaurant-outline",
    presetType: "PERCENTAGE",
    enabled: true,
  },
  {
    id: "delivery",
    title: "Free delivery & cart deals",
    subtitle: "Free delivery, coupons, and cart-level discounts",
    icon: "bicycle-outline",
    presetType: "FREE_DELIVERY",
    enabled: true,
  },
];

type Props = {
  offers: Offer[];
  storeName: string | null;
  onCreate: (presetType?: OfferType) => void;
  onGoToTrack: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function OffersCreateView({
  offers,
  storeName,
  onCreate,
  onGoToTrack,
  onRefresh,
  refreshing = false,
}: Props) {
  const activeCount = countOffersForTrackFilter(offers, "active");
  const hasActive = activeCount > 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[offersSharedStyles.scrollContent, { paddingBottom: 32 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={GatiMitraMerchant.primary}
          />
        ) : undefined
      }
    >
      <View style={[offersSharedStyles.card, styles.featuredCard]}>
        <View style={styles.featuredTop}>
          <View style={styles.featuredIcon}>
            <Ionicons name="sparkles" size={22} color={GatiMitraMerchant.primary} />
          </View>
          <View style={styles.featuredTitles}>
            <View style={styles.titleRow}>
              <Text style={styles.featuredTitle}>GatiMitra Promos</Text>
              <Pressable hitSlop={8}>
                <Ionicons name="information-circle-outline" size={16} color={OFFERS_UI.textFaint} />
              </Pressable>
            </View>
          </View>
          {hasActive ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.featuredBody}>
          {hasActive
            ? `Great! ${activeCount} offer${activeCount === 1 ? "" : "s"} running at ${storeName ?? "your store"}.`
            : `Start a promo for ${storeName ?? "your store"} to attract more orders.`}
        </Text>
        <View style={styles.featuredActions}>
          <Pressable
            onPress={() => onCreate()}
            style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.outlineBtnText}>Create more</Text>
          </Pressable>
          <Pressable
            onPress={onGoToTrack}
            style={({ pressed }) => [styles.filledBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.filledBtnText}>Track</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Text style={[offersSharedStyles.sectionTitle, { marginTop: 8 }]}>More discounts</Text>
      <View style={[offersSharedStyles.card, styles.categoryCard]}>
        {CREATE_CATEGORIES.map((cat, index) => (
          <View key={cat.id}>
            {index > 0 ? <View style={styles.categoryDivider} /> : null}
            <Pressable
              onPress={() => onCreate(cat.presetType)}
              style={({ pressed }) => [styles.categoryRow, pressed && { opacity: 0.75 }]}
            >
              <View style={styles.categoryIcon}>
                <Ionicons name={cat.icon} size={20} color={GatiMitraMerchant.primary} />
              </View>
              <View style={styles.categoryText}>
                <Text style={styles.categoryTitle}>{cat.title}</Text>
                <Text style={styles.categorySub}>{cat.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={OFFERS_UI.textFaint} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.tipBanner}>
        <Ionicons name="bulb-outline" size={18} color={GatiMitraMerchant.navy} />
        <Text style={styles.tipText}>
          All offer types from your menu — percentage, flat, BOGO, coupons, and more — are available
          when you create an offer.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  featuredCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#FAFFFE",
  },
  featuredTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  featuredIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: OFFERS_UI.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  featuredTitles: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  featuredTitle: { fontSize: 16, fontWeight: "800", color: OFFERS_UI.text },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: OFFERS_UI.liveGreen },
  liveText: { fontSize: 11, fontWeight: "700", color: "#166534" },
  featuredBody: { fontSize: 13, color: OFFERS_UI.textMuted, marginTop: 12, lineHeight: 20 },
  featuredActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  outlineBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  outlineBtnText: { fontSize: 14, fontWeight: "700", color: OFFERS_UI.text },
  filledBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.primary,
  },
  filledBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  categoryCard: { paddingVertical: 4 },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: OFFERS_UI.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryText: { flex: 1, minWidth: 0 },
  categoryTitle: { fontSize: 14, fontWeight: "700", color: OFFERS_UI.text },
  categorySub: { fontSize: 12, color: OFFERS_UI.textMuted, marginTop: 3, lineHeight: 17 },
  categoryDivider: {
    marginHorizontal: 14,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: OFFERS_UI.metricDivider,
  },
  tipBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: H_PADDING,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: OFFERS_UI.accentSoft,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  tipText: { flex: 1, fontSize: 12, color: GatiMitraMerchant.navy, lineHeight: 18 },
});
