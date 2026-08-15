import { useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AppAssetImage } from "@/components/AppAssetImage";
import { MX } from "@/lib/appAssetKeys";
import type { OfferType } from "@/services/offersApi";
import { countOffersForTrackFilter } from "@/lib/offers/offer-lifecycle";
import type { Offer } from "@/services/offersApi";
import { OFFER_PROMO_CHOICES, type OfferCreatePath } from "@/lib/offers/offer-form-constants";
import { OFFERS_UI, offersSharedStyles } from "./offers-theme";
import { PromosLearnMoreSheet } from "./PromosLearnMoreSheet";
import { GatiMitraMerchant, H_PADDING, TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE } from "@/constants/theme";

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
  const [learnMoreVisible, setLearnMoreVisible] = useState(false);

  return (
    <>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        offersSharedStyles.scrollContent,
        { paddingBottom: TAB_BAR_SCROLL_CONTENT_PADDING_LOOSE },
      ]}
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
      <View style={styles.featuredCard}>
        <View style={styles.featuredHeroWrap}>
          <LinearGradient
            colors={["#2563EB", "#38BDF8", "#7DD3FC"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredHero}
          >
            <View style={styles.heroBadgeLeft}>
              <Text style={styles.heroPct}>%</Text>
            </View>
            <View style={styles.heroBadgeRight}>
              <Text style={styles.heroPct}>%</Text>
            </View>
            <View style={styles.heroTag}>
              <Text style={styles.heroTagText}>GATIMITRA{"\n"}PROMOS</Text>
            </View>
          </LinearGradient>
          <AppAssetImage
            assetKey={MX.offers.promoBanner}
            style={styles.featuredHeroImage}
            resizeMode="cover"
            accessibilityLabel="GatiMitra Promos banner"
          />
        </View>

        <View style={styles.featuredBodyBlock}>
          <View style={styles.featuredTitleRow}>
            <Text style={styles.featuredTitle}>Earn more with GatiMitra Promos</Text>
            {hasActive ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.featuredSub}>
            {hasActive
              ? `${activeCount} offer${activeCount === 1 ? "" : "s"} running at ${storeName ?? "your store"}.`
              : "Get up to 15-20% more sales with same budget"}
          </Text>
          <View style={styles.featuredActions}>
            <Pressable
              onPress={() => setLearnMoreVisible(true)}
              style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.outlineBtnText}>Learn more</Text>
            </Pressable>
            <Pressable
              onPress={() => onCreate()}
              style={({ pressed }) => [styles.filledBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.filledBtnText}>Create now</Text>
            </Pressable>
          </View>
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
    </ScrollView>

    <PromosLearnMoreSheet
      visible={learnMoreVisible}
      onClose={() => setLearnMoreVisible(false)}
      onCreateNow={() => onCreate()}
    />
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  featuredCard: {
    marginHorizontal: H_PADDING,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: OFFERS_UI.cardBorder,
    backgroundColor: "#fff",
  },
  featuredHeroWrap: {
    height: 132,
    overflow: "hidden",
  },
  featuredHero: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  featuredHeroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBadgeLeft: {
    position: "absolute",
    left: 18,
    top: 28,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(250, 204, 21, 0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadgeRight: {
    position: "absolute",
    right: 18,
    top: 22,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(250, 204, 21, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroPct: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1E3A8A",
  },
  heroTag: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  heroTagText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 1,
    lineHeight: 26,
  },
  featuredBodyBlock: {
    padding: 16,
    backgroundColor: "#fff",
  },
  featuredTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  featuredTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: OFFERS_UI.text,
  },
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
  featuredSub: {
    fontSize: 13,
    color: OFFERS_UI.textMuted,
    marginTop: 8,
    lineHeight: 20,
  },
  featuredActions: { flexDirection: "row", gap: 10, marginTop: 14 },
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
});
