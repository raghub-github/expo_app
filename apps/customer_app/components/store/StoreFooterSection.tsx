import React, { useCallback, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, useWindowDimensions, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import type { MerchantSummary } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { BrandingFooter } from "@/components/BrandingFooter";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
import { resolveMerchantCarouselBannerUri } from "@/lib/merchantBanner";
import { warmMerchantHeroImage } from "@/lib/merchantHeroWarmCache";
import { navigateToMerchant } from "@/lib/navigateToMerchant";

export type StoreFooterSectionProps = {
  similarMerchants: MerchantSummary[];
  /** Extra bottom pad (FAB / cart clearance) — same gray as footer so no white strip shows. */
  bottomPadding?: number;
  /** FSSAI license — Zomato-style footer on store menu. */
  fssaiNumber?: string | null;
};

/** Split offer copy into up to 2 short lines for the image badge (e.g. "60% OFF" / "up to ₹120"). */
function splitOfferLines(offer: string): [string, string?] {
  const raw = offer.trim();
  if (!raw) return [""];
  const upper = raw.replace(/\s+/g, " ");
  const pipe = upper.split("|").map((s) => s.trim()).filter(Boolean);
  if (pipe.length >= 2) return [pipe[0]!.toUpperCase(), pipe[1]!.toUpperCase()];
  const upto = upper.match(/^(.+?)\s+(up\s*to\s*.+)$/i);
  if (upto) return [upto[1]!.toUpperCase(), upto[2]!.toUpperCase()];
  if (upper.length > 18) {
    const mid = Math.ceil(upper.length / 2);
    const space = upper.lastIndexOf(" ", mid);
    if (space > 4) {
      return [upper.slice(0, space).toUpperCase(), upper.slice(space + 1).toUpperCase()];
    }
  }
  return [upper.toUpperCase()];
}

function SimilarRestaurantCard({
  merchant,
  width,
  onPress,
}: {
  merchant: MerchantSummary;
  width: number;
  onPress: () => void;
}) {
  // Same banner resolver as list/store cards — never a different blank field.
  const uri = useMemo(() => resolveMerchantCarouselBannerUri(merchant), [merchant]);
  const offer = merchant.offerText?.trim();
  const [line1, line2] = offer ? splitOfferLines(offer) : [""];
  const eta =
    merchant.deliveryTime ??
    (merchant.etaMinMinutes && merchant.etaMaxMinutes
      ? `${merchant.etaMinMinutes}-${merchant.etaMaxMinutes} min`
      : "30-40 min");
  // Square thumb ~42% of card width (matches Swiggy similar-restaurant tiles).
  const imageSize = Math.round(Math.min(76, Math.max(64, width * 0.42)));

  return (
    <TouchableOpacity
      style={[styles.restCard, { width }]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={[styles.restImageWrap, { width: imageSize, height: imageSize }]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.restImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={`similar-${merchant.id}`}
            transition={0}
          />
        ) : (
          <View style={styles.restImagePlaceholder}>
            <MenuItemImagePlaceholder size="md" />
          </View>
        )}
        {line1 ? (
          <View style={styles.restOfferBadge} pointerEvents="none">
            <AppText style={styles.restOfferLine1} numberOfLines={1}>
              {line1}
            </AppText>
            {line2 ? (
              <AppText style={styles.restOfferLine2} numberOfLines={1}>
                {line2}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.restBody}>
        <View style={styles.restTextTop}>
          <AppText style={styles.restName} numberOfLines={2}>
            {merchant.name}
          </AppText>
          {merchant.cuisines?.length ? (
            <AppText style={styles.restCuisine} numberOfLines={1}>
              {merchant.cuisines.slice(0, 2).join(", ")}
            </AppText>
          ) : null}
        </View>
        <View style={styles.restEtaRow}>
          <Ionicons name="time-outline" size={11} color="#686B78" />
          <AppText style={styles.restEta}>{eta}</AppText>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function StoreFooterSection({
  similarMerchants,
  bottomPadding = 0,
  fssaiNumber,
}: StoreFooterSectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const dark = useMerchantUiDark();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(true);
  const cardW = (width - 16 * 2 - 10) / 2;
  const openingRef = useRef(false);

  const openSimilarMerchant = useCallback(
    (merchant: MerchantSummary) => {
      if (!merchant?.id || openingRef.current) return;
      openingRef.current = true;
      const banner = resolveMerchantCarouselBannerUri(merchant);
      warmMerchantHeroImage(merchant.id, banner);
      // replace — Back goes to food home, not the restaurant user came from.
      navigateToMerchant(router, queryClient, merchant.id, merchant, { replace: true });
      setTimeout(() => {
        openingRef.current = false;
      }, 900);
    },
    [router, queryClient]
  );

  return (
    <View style={[styles.wrap, dark && styles.wrapDark, bottomPadding > 0 ? { paddingBottom: bottomPadding } : null]}>
      {/* Soft white → gray fade so the item-list seam isn't a hard color cut. */}
      <LinearGradient
        colors={dark ? [MerchantDarkPalette.bg, MerchantDarkPalette.bg] : ["#FFFFFF", "#F5F5F5"]}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topBlend}
        pointerEvents="none"
      />

      <View style={styles.inner}>
        {!dark && similarMerchants.length > 0 ? (
          <View style={styles.block}>
            <TouchableOpacity
              style={styles.similarHeader}
              onPress={() => setExpanded((v) => !v)}
              activeOpacity={0.8}
            >
              <AppText style={[styles.similarTitle, dark && styles.similarTitleDark]}>Try these similar restaurants</AppText>
              <Ionicons
                name={expanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={dark ? MerchantDarkPalette.text : StoreTheme.textPrimary}
              />
            </TouchableOpacity>
            {expanded ? (
              <View style={styles.grid}>
                {similarMerchants.slice(0, 4).map((m) => (
                  <SimilarRestaurantCard
                    key={m.id}
                    merchant={m}
                    width={cardW}
                    onPress={() => openSimilarMerchant(m)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <LinearGradient
          colors={
            dark
              ? [MerchantDarkPalette.card, MerchantDarkPalette.elevated]
              : [StoreTheme.promoBannerStart, StoreTheme.promoBannerEnd]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.promoBanner, dark && styles.promoBannerDark]}
        >
          <View style={styles.promoTextBlock}>
            <AppText style={[styles.promoTitle, dark && styles.promoTitleDark]}>Serving smiles at your doorstep</AppText>
            <View style={[styles.promoArrow, dark && styles.promoArrowDark]}>
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
              <AppText style={[styles.bullet, dark && styles.disclaimerDark]}>•</AppText>
              <AppText style={[styles.disclaimerText, dark && styles.disclaimerDark]}>{d}</AppText>
            </View>
          ))}
        </View>

        {fssaiNumber?.trim() ? (
          <View style={styles.fssaiBlock}>
            <AppText style={[styles.fssaiBrand, dark && styles.fssaiBrandDark]}>fssai</AppText>
            <AppText style={[styles.fssaiLic, dark && styles.fssaiLicDark]} numberOfLines={2}>
              Lic. No. {fssaiNumber.trim()}
            </AppText>
          </View>
        ) : null}

        <BrandingFooter compact />
      </View>
    </View>
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
    backgroundColor: "#F5F5F5",
    paddingBottom: 4,
  },
  wrapDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  topBlend: {
    height: 56,
    width: "100%",
  },
  inner: {
    paddingHorizontal: 16,
    // Pull content slightly into the fade so the seam reads continuous.
    marginTop: -20,
    paddingTop: 8,
  },
  block: {
    marginBottom: 16,
  },
  similarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    marginBottom: 10,
  },
  similarTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#02060C",
    flex: 1,
    paddingRight: 8,
  },
  similarTitleDark: {
    color: MerchantDarkPalette.text,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  restCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 8,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  restImageWrap: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F0F0F5",
    position: "relative",
  },
  restImage: {
    width: "100%",
    height: "100%",
  },
  restImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  restOfferBadge: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(2, 6, 12, 0.78)",
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
  restOfferLine1: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.15,
  },
  restOfferLine2: {
    fontSize: 8,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    marginTop: 0.5,
  },
  restBody: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    justifyContent: "space-between",
    paddingVertical: 1,
  },
  restTextTop: {
    gap: 2,
  },
  restName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#02060C",
    lineHeight: 17,
  },
  restCuisine: {
    fontSize: 11,
    color: "#686B78",
    lineHeight: 14,
  },
  restEtaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  restEta: {
    fontSize: 11,
    fontWeight: "600",
    color: "#686B78",
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
  promoBannerDark: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MerchantDarkPalette.border,
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
  promoTitleDark: {
    color: MerchantDarkPalette.text,
  },
  promoArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: StoreTheme.reorderGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  promoArrowDark: {
    backgroundColor: MerchantDarkPalette.accent,
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
  disclaimerDark: {
    color: MerchantDarkPalette.textDim,
  },
  fssaiBlock: {
    alignItems: "flex-end",
    marginBottom: 20,
    marginTop: 4,
    gap: 6,
  },
  fssaiBrand: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1D4ED8",
    letterSpacing: -0.5,
    textTransform: "lowercase",
  },
  fssaiBrandDark: {
    color: "#60A5FA",
  },
  fssaiLic: {
    fontSize: 12,
    fontWeight: "600",
    color: StoreTheme.textSecondary,
    textAlign: "right",
    lineHeight: 17,
  },
  fssaiLicDark: {
    color: MerchantDarkPalette.textDim,
  },
});
