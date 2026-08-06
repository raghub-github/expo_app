/**
 * Compact grid / rail tile — Swiggy Recommended-style.
 * Static banner only (no carousel). Rating pill overlays image bottom-left.
 */

import { memo } from "react";
import { View, TouchableOpacity, StyleSheet, Dimensions, type GestureResponderEvent } from "react-native";
import { useEffect, useMemo } from "react";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MerchantSummary } from "@/services/merchant.service";
import { resolveMerchantBannerUri } from "@/lib/merchantBanner";
import { warmMerchantHeroImage } from "@/lib/merchantHeroWarmCache";
import { useScrollSafePress } from "@/hooks/useScrollSafePress";
import { formatGridOfferBadge, gridDeliveryLabel } from "@/lib/merchantOfferBadge";
import {
  GridCardRatingCutout,
  GRID_RATING_PILL,
} from "@/components/home/GridCardRatingCutout";
import { AppText } from "@/components/AppText";
import { usePreventServicesAtPin } from "@/hooks/usePreventServicesAtPin";

const { width: SCREEN_W } = Dimensions.get("window");
const GRID_PAD = 16;
const GRID_GAP = 10;
export const LOVED_GRID_COLS = 3;

/** 3-column wrap width (legacy grid). */
export const MERCHANT_GRID_CARD_W = Math.floor(
  (SCREEN_W - GRID_PAD * 2 - GRID_GAP * (LOVED_GRID_COLS - 1)) / LOVED_GRID_COLS
);

/**
 * Horizontal rail: 2 full cards + ~38% of a 3rd peeking on the right.
 * leftPad + 2*w + gap + 0.38*w ≈ screen
 */
export const MERCHANT_RAIL_CARD_W = Math.floor((SCREEN_W - GRID_PAD - GRID_GAP) / 2.38);
export const MERCHANT_RAIL_GAP = GRID_GAP;
/** Banner height vs width — Swiggy recommended tiles are shorter than square. */
export const MERCHANT_RAIL_IMAGE_RATIO = 0.78;
export function merchantRailImageHeight(cardWidth = MERCHANT_RAIL_CARD_W): number {
  return Math.round(cardWidth * MERCHANT_RAIL_IMAGE_RATIO);
}

const CARD_RADIUS = 14;

type MerchantGridCardProps = {
  merchant: MerchantSummary;
  onPress: () => void;
  onPressIn?: () => void;
  weatherDelayMinutes?: number;
  /** Override default tile width (e.g. horizontal rail). */
  width?: number;
};

function MerchantGridCardInner({
  merchant,
  onPress,
  onPressIn,
  weatherDelayMinutes = 0,
  width = MERCHANT_RAIL_CARD_W,
}: MerchantGridCardProps) {
  const { foodLocked } = usePreventServicesAtPin();
  const bannerUri = useMemo(() => resolveMerchantBannerUri(merchant), [merchant]);
  const handlePress = () => {
    if (foodLocked) return;
    onPress();
  };
  // Shutter only on committed onPress (via navigateToMerchant) — not pressIn,
  // so cancelled scrolls never flash a full-screen Modal over the next tap.
  const cardPress = useScrollSafePress(handlePress, {
    onPressIn: foodLocked ? undefined : onPressIn,
  });

  useEffect(() => {
    warmMerchantHeroImage(merchant.id, bannerUri);
  }, [merchant.id, bannerUri]);

  const offerBadge = formatGridOfferBadge(merchant.offerText);
  const { label: baseDeliveryLabel, isFast } = gridDeliveryLabel(merchant, weatherDelayMinutes);
  const showNearFast = isFast && weatherDelayMinutes <= 0;
  const deliveryLabel =
    weatherDelayMinutes > 0 ? `${baseDeliveryLabel} · Rain` : baseDeliveryLabel;
  const imageH = merchantRailImageHeight(width);

  return (
    <View style={[styles.card, { width }, foodLocked && styles.cardBlocked]}>
      <View style={[styles.imageStage, { width }]}>
        <View style={[styles.imageClip, { width, height: imageH }]}>
          <TouchableOpacity
            onPress={cardPress.onPress}
            onPressIn={cardPress.onPressIn}
            onPressOut={cardPress.onPressOut}
            {...({ onTouchMove: cardPress.onTouchMove } as { onTouchMove?: (e: GestureResponderEvent) => void })}
            activeOpacity={0.92}
            style={styles.imageTap}
            disabled={foodLocked}
          >
            {bannerUri ? (
              <Image
                source={{ uri: bannerUri }}
                style={[styles.banner, foodLocked && styles.bannerDimmed]}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
              />
            ) : (
              <View style={styles.bannerPlaceholder}>
                <LinearGradient
                  colors={["#FFF4E8", "#FFE8D1", "#F5D5B8"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="restaurant" size={28} color="rgba(180,120,60,0.35)" />
              </View>
            )}
            {foodLocked ? (
              <View style={styles.preventOverlay} pointerEvents="none">
                <View style={styles.preventBadge}>
                  <Ionicons name="lock-closed" size={12} color="#fff" />
                  <AppText style={styles.preventBadgeText}>Blocked</AppText>
                </View>
              </View>
            ) : offerBadge ? (
              <View style={styles.offerImageTag}>
                <AppText style={styles.offerImageTagText} numberOfLines={2}>
                  {offerBadge}
                </AppText>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {!foodLocked ? (
          <GridCardRatingCutout
            rating={merchant.avgRating}
            totalReviews={merchant.totalReviews}
          />
        ) : null}
      </View>

      <TouchableOpacity
        onPress={cardPress.onPress}
        onPressIn={cardPress.onPressIn}
        onPressOut={cardPress.onPressOut}
        {...({ onTouchMove: cardPress.onTouchMove } as { onTouchMove?: (e: GestureResponderEvent) => void })}
        activeOpacity={0.7}
        style={styles.body}
        disabled={foodLocked}
      >
        <AppText style={styles.name} numberOfLines={1}>
          {merchant.name}
        </AppText>
        <View style={styles.metaRow}>
          {foodLocked ? (
            <AppText style={[styles.metaText, styles.metaBlocked]} numberOfLines={1}>
              Unavailable in this area
            </AppText>
          ) : showNearFast ? (
            <>
              <Ionicons name="flash" size={11} color="#22C55E" />
              <AppText style={[styles.metaText, styles.metaFast]} numberOfLines={1}>
                Near & Fast
              </AppText>
            </>
          ) : (
            <>
              <Ionicons
                name={weatherDelayMinutes > 0 ? "rainy-outline" : "time-outline"}
                size={11}
                color="#9CA3AF"
              />
              <AppText style={styles.metaText} numberOfLines={1}>
                {deliveryLabel}
              </AppText>
            </>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
  },
  cardBlocked: {
    opacity: 0.78,
  },
  imageStage: {
    position: "relative",
    overflow: "visible",
    zIndex: 1,
  },
  imageClip: {
    borderRadius: CARD_RADIUS,
    borderBottomLeftRadius: 0,
    overflow: "hidden",
    backgroundColor: "#FFF4E8",
  },
  bannerDimmed: {
    opacity: 0.55,
  },
  preventOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  preventBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DC2626",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  preventBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metaBlocked: {
    color: "#DC2626",
    fontWeight: "600",
  },
  imageTap: {
    flex: 1,
  },
  banner: {
    width: "100%",
    height: "100%",
  },
  bannerPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF4E8",
    overflow: "hidden",
  },
  offerImageTag: {
    position: "absolute",
    top: 8,
    left: 0,
    maxWidth: "90%",
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 7,
    paddingVertical: 4,
    // Left edge flush with image; only right side rounded (Swiggy-style).
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    zIndex: 3,
  },
  offerImageTagText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 11,
    letterSpacing: 0.1,
  },
  body: {
    paddingTop: GRID_RATING_PILL.overhang + 8,
    paddingHorizontal: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.1,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  metaText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    flex: 1,
  },
  metaFast: {
    color: "#22C55E",
    fontWeight: "600",
  },
});

/**
 * Rendered once per list item. Memoised so a parent re-render (a filter
 * toggle, a store-status tick, a bill recalculation) does not walk every
 * mounted instance.
 */
export const MerchantGridCard = memo(MerchantGridCardInner);
