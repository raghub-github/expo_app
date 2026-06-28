import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { MerchantSummary } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { BrandingFooter } from "@/components/BrandingFooter";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

export type StoreFooterSectionProps = {
  similarMerchants: MerchantSummary[];
};

export function StoreFooterSection({ similarMerchants }: StoreFooterSectionProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardW = (width - 16 * 2 - 12) / 2;

  return (
    <View style={styles.wrap}>
      {similarMerchants.length > 0 ? (
        <View style={styles.block}>
          <SimilarRestaurantsHeader />
          <View style={styles.grid}>
            {similarMerchants.slice(0, 4).map((m) => {
              const img = m.displayImage ?? m.banner_url;
              const uri = img ? toAbsoluteImageUrl(img) : null;
              const offer = m.offerText?.trim();
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.restCard, { width: cardW }]}
                  onPress={() => router.push(`/home/merchant/${m.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={styles.restImageWrap}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.restImage} resizeMode="cover" />
                    ) : (
                      <MenuItemImagePlaceholder size="lg" />
                    )}
                    {offer ? (
                      <View style={styles.restOfferBadge}>
                        <Text style={styles.restOfferText} numberOfLines={1}>
                          {offer.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.restName} numberOfLines={1}>
                    {m.name}
                  </Text>
                  {m.cuisines?.length ? (
                    <Text style={styles.restCuisine} numberOfLines={1}>
                      {m.cuisines.slice(0, 2).join(", ")}
                    </Text>
                  ) : null}
                  <View style={styles.restEtaRow}>
                    <Ionicons name="time-outline" size={12} color={StoreTheme.textSecondary} />
                    <Text style={styles.restEta}>
                      {m.deliveryTime ?? (m.etaMinMinutes && m.etaMaxMinutes
                        ? `${m.etaMinMinutes}-${m.etaMaxMinutes} min`
                        : "30-40 min")}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      <LinearGradient
        colors={[StoreTheme.promoBannerStart, StoreTheme.promoBannerEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.promoBanner}
      >
        <View style={styles.promoTextBlock}>
          <Text style={styles.promoTitle}>Serving smiles at your doorstep</Text>
          <View style={styles.promoArrow}>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </View>
        </View>
        <View style={styles.promoImageClip}>
          <AppAssetImage
            assetKey={CX.store.footerPromo}
            style={styles.promoImage}
            contentFit="contain"
          />
        </View>
      </LinearGradient>

      <View style={styles.disclaimerBlock}>
        {DISCLAIMERS.map((d) => (
          <View key={d} style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.disclaimerText}>{d}</Text>
          </View>
        ))}
      </View>

      <BrandingFooter />
    </View>
  );
}

function SimilarRestaurantsHeader() {
  const [expanded, setExpanded] = useState(true);
  return (
    <TouchableOpacity
      style={styles.similarHeader}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.8}
    >
      <Text style={styles.similarTitle}>Try these similar restaurants</Text>
      <Ionicons
        name={expanded ? "chevron-up" : "chevron-down"}
        size={18}
        color={StoreTheme.textPrimary}
      />
    </TouchableOpacity>
  );
}

const DISCLAIMERS = [
  "Menu items, nutritional information and prices are set directly by the restaurant.",
  "Nutritional information values displayed are indicative, per serving and may vary depending on the ingredients, portion size and customizations.",
  "An average active adult requires 2,000 kcal energy per day, however, calorie needs may vary.",
  "Additional taxes & charges including platform fee, delivery and packaging charges may be applicable on cart.",
];

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: StoreTheme.background,
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 8,
  },
  block: {
    marginBottom: 16,
  },
  similarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: StoreTheme.border,
    marginBottom: 12,
  },
  similarTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  restCard: {
    marginBottom: 4,
  },
  restImageWrap: {
    width: "100%",
    aspectRatio: 1.1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F2F2F2",
    marginBottom: 8,
    position: "relative",
  },
  restImage: {
    width: "100%",
    height: "100%",
  },
  restOfferBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  restOfferText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  restName: {
    fontSize: 14,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    marginBottom: 2,
  },
  restCuisine: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    marginBottom: 4,
  },
  restEtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  restEta: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
  },
  promoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 0,
    marginBottom: 24,
    overflow: "hidden",
    minHeight: 88,
  },
  promoTextBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  promoTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: StoreTheme.promoText,
    lineHeight: 20,
  },
  promoArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: StoreTheme.reorderGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  promoImageClip: {
    width: 128,
    height: 88,
    justifyContent: "center",
    alignItems: "flex-end",
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  promoImage: {
    width: 128,
    height: 88,
    backgroundColor: "transparent",
  },
  disclaimerBlock: {
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  bullet: {
    fontSize: 13,
    color: StoreTheme.textSecondary,
    lineHeight: 18,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: StoreTheme.textSecondary,
    lineHeight: 18,
  },
});
