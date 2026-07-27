import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OfferType } from "@/services/offersApi";
import { countOffersForTrackFilter } from "@/lib/offers/offer-lifecycle";
import type { Offer } from "@/services/offersApi";
import { OFFER_PROMO_CHOICES, type OfferCreatePath } from "@/lib/offers/offer-form-constants";
import { OFFERS_UI, offersSharedStyles } from "./offers-theme";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";

type Props = {
  offers: Offer[];
  storeName: string | null;
  onCreate: (presetType?: OfferType, createPath?: OfferCreatePath) => void;
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
            <Text style={styles.outlineBtnText}>Create offer</Text>
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

      <Text style={[offersSharedStyles.sectionTitle, { marginTop: 8 }]}>Choose promo type</Text>
      <View style={{ gap: 10 }}>
        {OFFER_PROMO_CHOICES.map((choice) => {
          const path: OfferCreatePath =
            choice.id === "precision" ? "precision" : choice.id === "bogo" ? "bogo" : "boost";
          return (
            <Pressable
              key={choice.id}
              onPress={() => onCreate(choice.offerType, path)}
              style={({ pressed }) => [styles.promoCard, pressed && { opacity: 0.9 }]}
            >
              <View
                style={[
                  styles.promoIcon,
                  choice.id === "precision"
                    ? styles.promoIconPrecision
                    : choice.id === "bogo"
                      ? styles.promoIconBogo
                      : styles.promoIconPct,
                ]}
              >
                <Text style={styles.promoIconText}>
                  {choice.id === "precision"
                    ? "PRECI\nSION"
                    : choice.id === "bogo"
                      ? "BUY 1\nGET 1"
                      : "30%\nOff"}
                </Text>
              </View>
              <View style={styles.promoText}>
                <Text style={styles.promoTitle}>{choice.title}</Text>
                <Text style={styles.promoDesc}>{choice.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={OFFERS_UI.textFaint} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.tipBanner}>
        <Ionicons name="bulb-outline" size={18} color={GatiMitraMerchant.navy} />
        <Text style={styles.tipText}>
          Same flow as Partner Site — pick Precision, BOGO, or Percentage (Boost). Precision skips
          item selection; Percentage is Boost-only.
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
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: H_PADDING,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    backgroundColor: "#fff",
  },
  promoIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  promoIconBogo: { backgroundColor: "#6D28D9" },
  promoIconPct: { backgroundColor: "#F59E0B" },
  promoIconPrecision: { backgroundColor: "#4338CA" },
  promoIconText: {
    color: "#FEF08A",
    fontSize: 8,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 11,
  },
  promoText: { flex: 1, minWidth: 0 },
  promoTitle: { fontSize: 14, fontWeight: "800", color: OFFERS_UI.text },
  promoDesc: { fontSize: 12, color: OFFERS_UI.textMuted, marginTop: 3, lineHeight: 17 },
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
