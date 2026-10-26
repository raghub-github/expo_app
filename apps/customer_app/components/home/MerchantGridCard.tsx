/**
 * Compact grid / rail tile — Swiggy Recommended-style.
 * Static banner only (no carousel). Rating pill overlays image bottom-left.
 */

import { memo, useLayoutEffect, useMemo, useState } from "react";
import { View, Pressable, StyleSheet, Dimensions, type GestureResponderEvent } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Animated from "react-native-reanimated";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MerchantSummary } from "@/services/merchant.service";
import { resolveMerchantBannerUri } from "@/lib/merchantBanner";
import { sizedImageUrl } from "@/lib/imageSizing";
import {
  warmMerchantHeroImage,
  getWarmMerchantHeroUri,
  prefetchMerchantHeroImageUri,
} from "@/lib/merchantHeroWarmCache";
import { isHeroMediaSessionReady, markHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { useScrollSafePress } from "@/hooks/useScrollSafePress";
import { useInstantPressScale } from "@/components/InstantPressable";
import { formatGridOfferBadge, gridDeliveryLabel } from "@/lib/merchantOfferBadge";
import {
  GridCardRatingCutout,
  GRID_RATING_PILL,
} from "@/components/home/GridCardRatingCutout";
import { AppText } from "@/components/AppText";
import { PureVegPill } from "@/components/home/PureVegStoreTag";
import { isMerchantPureVeg } from "@/lib/pureVegFilter";
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
  const bannerUri = useMemo(() => {
    const warm = getWarmMerchantHeroUri(merchant.id);
    const resolved = resolveMerchantBannerUri(merchant);
    const base = warm || resolved || merchant.displayImage?.trim() || merchant.banner_url?.trim() || null;
    return base;
  }, [merchant]);
  const paintUri = useMemo(
    () => (bannerUri ? sizedImageUrl(bannerUri, width) ?? bannerUri : null),
    [bannerUri, width]
  );
  const [imageUri, setImageUri] = useState(paintUri);
  // Prefetch can mark a URL ready before this card has drawn it. Keep the
  // skeleton up until this Image actually paints.
  const [imagePainted, setImagePainted] = useState(false);
  if (imageUri !== paintUri && paintUri && imageUri !== bannerUri) {
    setImageUri(paintUri);
    setImagePainted(false);
  }
  useLayoutEffect(() => {
    if (!bannerUri) return;
    prefetchMerchantHeroImageUri(bannerUri, width);
    warmMerchantHeroImage(merchant.id, bannerUri);
  }, [merchant.id, bannerUri, width]);

  const handlePress = () => {
    if (foodLocked) return;
    onPress();
  };
  // Shutter only on committed onPress (via navigateToMerchant) — not pressIn,
  // so cancelled scrolls never flash a full-screen Modal over the next tap.
  const cardPress = useScrollSafePress(handlePress, {
    onPressIn: foodLocked ? undefined : onPressIn,
  });
  const pressScale = useInstantPressScale(0.97);

  const offerBadge = formatGridOfferBadge(merchant.offerText);
  const { label: baseDeliveryLabel, isFast } = gridDeliveryLabel(merchant, weatherDelayMinutes);
  const showNearFast = isFast && weatherDelayMinutes <= 0;
  const deliveryLabel =
    weatherDelayMinutes > 0 ? `${baseDeliveryLabel} · Rain` : baseDeliveryLabel;
  const imageH = merchantRailImageHeight(width);

  return (
    <Animated.View style={pressScale.style} collapsable={false}>
    <Pressable
      style={[styles.card, { width }, foodLocked && styles.cardBlocked]}
      onPress={cardPress.onPress}
      onPressIn={(e) => {
        if (!foodLocked) pressScale.pressIn();
        cardPress.onPressIn(e);
      }}
      onPressOut={(e) => {
        pressScale.pressOut();
        cardPress.onPressOut(e);
      }}
      {...({ onTouchMove: cardPress.onTouchMove } as { onTouchMove?: (e: GestureResponderEvent) => void })}
      disabled={foodLocked}
    >
      <View style={[styles.imageStage, { width }]}>
        <View style={[styles.imageClip, { width, height: imageH }]}>
          <View style={styles.imageTap}>
            {!bannerUri ? (
              <View style={styles.bannerPlaceholder} pointerEvents="none">
                <Ionicons name="restaurant" size={28} color="rgba(100,116,139,0.28)" />
              </View>
            ) : null}
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={[
                  styles.banner,
                  foodLocked && styles.bannerDimmed,
                ]}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                priority="high"
                recyclingKey={`loved-${merchant.id}-${imageUri}`}
                onLoad={() => {
                  setImagePainted(true);
                  markHeroMediaSessionReady(imageUri);
                }}
                onDisplay={() => {
                  setImagePainted(true);
                  markHeroMediaSessionReady(imageUri);
                }}
                onError={() => {
                  if (bannerUri && imageUri !== bannerUri) {
                    setImageUri(bannerUri);
                    setImagePainted(isHeroMediaSessionReady(bannerUri));
                  }
                }}
              />
            ) : null}
            {imageUri && !imagePainted ? (
              <GMSkeleton
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width,
                  height: imageH,
                  borderRadius: 0,
                  zIndex: 2,
                }}
              />
            ) : null}
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
          </View>
        </View>

        {!foodLocked ? (
          <GridCardRatingCutout
            rating={merchant.avgRating}
            totalReviews={merchant.totalReviews}
          />
        ) : null}
      </View>

      <View style={styles.body}>
        <AppText style={styles.name} numberOfLines={1}>
          {merchant.name}
        </AppText>
        {isMerchantPureVeg(merchant) ? <PureVegPill /> : null}
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
      </View>
    </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
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
    backgroundColor: GatiMitraColors.softBackground,
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
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  bannerPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECEFF1",
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
