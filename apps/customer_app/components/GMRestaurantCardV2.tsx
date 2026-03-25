/**
 * 2025 Premium Discovery Card – edge-to-edge image (220px), bookmark, offer badge,
 * gradient overlay, rating capsule, cuisine • distance • time. Micro-interactions: scale 0.97 on tap.
 * Data: merchant_stores (banner_url / logo_url), real distance, rating from API only.
 */

import React, { useCallback, useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  ActivityIndicator,
  Platform,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { MerchantSummary } from "@/services/merchant.service";
import { setStoreBookmark } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useStoreStatusStore } from "@/store/storeStatusStore";

const { width } = Dimensions.get("window");
const PAGE_PAD = 16;
const CARD_WIDTH = width - PAGE_PAD * 2;
const IMAGE_HEIGHT = 220;
const CARD_RADIUS = 20;
const CARD_GAP = 18;

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function formatDistance(km?: number): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function formatReviewCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K+`;
  return `${n}+`;
}

const CLOSING_SOON_MIN = 15;

function toTimestamp(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function formatCountdown(msLeft: number): { hr: number; min: number; sec: number } {
  if (msLeft <= 0) return { hr: 0, min: 0, sec: 0 };
  const sec = Math.floor((msLeft / 1000) % 60);
  const min = Math.floor((msLeft / (1000 * 60)) % 60);
  const hr = Math.floor(msLeft / (1000 * 60 * 60));
  return { hr, min, sec };
}

function countdownString(msLeft: number, compact = false): string {
  if (msLeft <= 0) return compact ? "0 min" : "0 sec";
  const { hr, min, sec } = formatCountdown(msLeft);
  if (compact) {
    const totalMin = hr * 60 + min;
    if (totalMin < 1) return "< 1 min";
    if (totalMin <= 60) return `${totalMin} min`;
    return `${hr} Hr ${min} min`;
  }
  const parts: string[] = [];
  if (hr > 0) parts.push(`${hr} Hr`);
  parts.push(`${min} min`);
  parts.push(`${sec} sec`);
  return parts.join(" ");
}

/** Format timestamp as "10:00 AM" for "Opens at" on closed tag. */
function formatNextOpenTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isTomorrow =
    d.getDate() !== today.getDate() ||
    d.getMonth() !== today.getMonth() ||
    d.getFullYear() !== today.getFullYear();
  const timeStr = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return isTomorrow ? `Opens tomorrow ${timeStr}` : `Opens at ${timeStr}`;
}

export type GMRestaurantCardV2Props = {
  merchant: MerchantSummary;
  initialSaved?: boolean;
};

export function GMRestaurantCardV2({ merchant, initialSaved = false }: GMRestaurantCardV2Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [savedLoading, setSavedLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const scale = useSharedValue(1);
  const enterOpacity = useSharedValue(0);
  const enterTranslateY = useSharedValue(12);

  const liveStatusFromStore = useStoreStatusStore((s) => s.getStatus(merchant.id));
  const rawApi = (merchant.liveStatus ?? "").toString().trim().toUpperCase();
  const apiStatus: "OPEN" | "CLOSED" | null =
    rawApi === "OPEN" ? "OPEN" : rawApi === "CLOSED" ? "CLOSED" : null;
  const liveStatus = liveStatusFromStore ?? apiStatus ?? "CLOSED";
  const isOpen = liveStatus === "OPEN";
  const nextCloseTs = toTimestamp(merchant.nextCloseAt);
  const nextOpenTs = toTimestamp(merchant.nextOpenAt);
  useEffect(() => {
    if (apiStatus) {
      useStoreStatusStore.getState().setStatusFromApi(merchant.id, apiStatus === "OPEN", apiStatus);
    }
  }, [merchant.id, apiStatus]);

  useEffect(() => {
    if (nextCloseTs == null && nextOpenTs == null) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextCloseTs, nextOpenTs]);

  const openStatus = (() => {
    if (isOpen) {
      if (nextCloseTs != null) {
        const msLeft = nextCloseTs - now;
        const minLeft = msLeft / (60 * 1000);
        if (minLeft <= 0) {
          const sub = nextOpenTs != null ? formatNextOpenTime(nextOpenTs) : null;
          return { label: "Closed", isGreen: false, sub };
        }
        if (minLeft <= CLOSING_SOON_MIN) {
          const m = Math.ceil(minLeft);
          return {
            label: m <= 1 ? "Closes in next 15 min" : `Closes in ${m} min`,
            isGreen: false,
            sub: null,
          };
        }
        return {
          label: "Open",
          isGreen: true,
          sub: `Closes in ${countdownString(msLeft)}`,
        };
      }
      return { label: "Open", isGreen: true, sub: null };
    }
    if (nextOpenTs != null) {
      const msLeft = nextOpenTs - now;
      if (msLeft <= 0) {
        return { label: "Closed", isGreen: false, sub: formatNextOpenTime(nextOpenTs) };
      }
      return {
        label: "Opens in",
        isGreen: true,
        sub: countdownString(msLeft),
      };
    }
    return { label: "Closed", isGreen: false, sub: null };
  })();

  const heroUri = useMemo(
    () => toAbsoluteImageUrl(merchant.displayImage ?? merchant.banner_url ?? null),
    [merchant.displayImage, merchant.banner_url]
  );

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [heroUri]);

  useEffect(() => {
    enterOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    enterTranslateY.value = withSpring(0, { damping: 20, stiffness: 200 });
  }, [enterOpacity, enterTranslateY]);

  const toggleBookmark = useCallback(
    async (e: any) => {
      e?.stopPropagation?.();
      if (savedLoading) return;
      setSavedLoading(true);
      try {
        const res = await setStoreBookmark(merchant.id, !saved);
        setSaved(res.saved);
      } catch {
        // keep state
      } finally {
        setSavedLoading(false);
      }
    },
    [merchant.id, saved, savedLoading]
  );

  const openMerchant = useCallback(() => {
    router.push({ pathname: "/home/merchant/[id]", params: { id: merchant.id } });
  }, [merchant.id, router]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [
      { translateY: enterTranslateY.value },
      { scale: scale.value },
    ],
  }));

  const onPressIn = () => {
    scale.value = withSpring(0.97, { damping: 18, stiffness: 260 });
  };
  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 260 });
  };

  const hasImage = Boolean(heroUri && !imageError);
  const distanceStr = formatDistance(merchant.distanceKm);
  const hasRating = merchant.avgRating != null && merchant.avgRating >= 0;
  const ratingLabel =
    hasRating && merchant.totalReviews != null && merchant.totalReviews > 0
      ? `${Number(merchant.avgRating).toFixed(1)} (${formatReviewCount(merchant.totalReviews)})`
      : hasRating
        ? `${Number(merchant.avgRating).toFixed(1)}`
        : "New";
  const offerChips = merchant.offerText
    ? merchant.offerText.split(/\s*\|\s*/).filter(Boolean).slice(0, 3)
    : [];

  return (
    <AnimatedTouchable
      onPress={openMerchant}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
      style={[styles.card, animatedCardStyle]}
    >
      {/* Edge-to-edge image with gradient overlay */}
      <View style={styles.imageWrap}>
        {hasImage ? (
          <>
            <Image
              source={{ uri: heroUri! }}
              style={[
                styles.image,
                !imageLoaded && styles.imageOpaque,
                !isOpen && styles.imageClosed,
              ]}
              resizeMode="cover"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
            {!imageLoaded && (
              <View style={styles.imagePlaceholder}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </>
        ) : (
          <LinearGradient
            colors={["#374151", "#1f2937"]}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.5)", "transparent", "transparent"]}
          style={styles.gradientOverlay}
        />
        {/* Closed: dim overlay (20–30%) so card looks inactive; bookmark and tap still work */}
        {!isOpen && <View style={styles.closedOverlay} pointerEvents="none" />}
        {/* Bookmark floating */}
        <TouchableOpacity
          onPress={toggleBookmark}
          style={styles.bookmarkBtn}
          hitSlop={12}
          disabled={savedLoading}
        >
          {savedLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={24}
              color={saved ? GatiMitraColors.primaryMint : "#fff"}
            />
          )}
        </TouchableOpacity>
        {/* Live offer badge on image */}
        {offerChips.length > 0 && (
          <View style={styles.offerBadge}>
            <Text style={styles.offerBadgeText} numberOfLines={1}>
              🎁 {offerChips[0]}
            </Text>
          </View>
        )}
        {/* Cuisine tag bottom-left */}
        {merchant.cuisines && merchant.cuisines.length > 0 && (
          <View style={styles.cuisineTag}>
            <Text style={styles.cuisineTagText} numberOfLines={1}>
              {merchant.cuisines[0]}
            </Text>
          </View>
        )}
        {/* Open / Closed tag top-left on image — RED when closed (#FF4D4F, 12px radius, 600). */}
        <View style={[styles.openClosedTag, openStatus.isGreen ? styles.openClosedTagGreen : styles.openClosedTagRed]}>
          <Text style={[styles.openClosedTagText, !openStatus.isGreen && styles.openClosedTagTextRed]} numberOfLines={2}>
            {openStatus.sub
              ? openStatus.label === "Opens in"
                ? `${openStatus.label} ${openStatus.sub}`
                : `${openStatus.label} • ${openStatus.sub}`
              : openStatus.label}
          </Text>
        </View>
      </View>

      {/* Restaurant info */}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {merchant.name}
          </Text>
          <View style={[styles.ratingCapsule, !hasRating && styles.ratingCapsuleNew]}>
            {hasRating && <Ionicons name="star" size={12} color="#fff" />}
            <Text style={styles.ratingText}>{ratingLabel}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          {merchant.cuisines && merchant.cuisines.length > 0 && (
            <Text style={styles.metaText} numberOfLines={1}>{merchant.cuisines.slice(0, 2).join(" • ")}</Text>
          )}
          {distanceStr && (
            <Text style={styles.metaDot}> · </Text>
          )}
          {distanceStr && <Text style={styles.metaText}>{distanceStr}</Text>}
          {merchant.deliveryTime && (
            <>
              <Text style={styles.metaDot}> · </Text>
              <Text style={styles.metaText}>{merchant.deliveryTime}</Text>
            </>
          )}
        </View>
        {/* Offer badges row */}
        {offerChips.length > 0 && (
          <View style={styles.offersRow}>
            {offerChips.slice(0, 3).map((text, i) => (
              <View key={i} style={styles.offerPill}>
                <Text style={styles.offerPillText} numberOfLines={1}>
                  {i === 0 ? "🔥" : i === 1 ? "⚡" : "🎁"} {text}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    alignSelf: "center",
    marginBottom: CARD_GAP,
    backgroundColor: GatiMitraColors.cardSurface,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    ...GatiMitraColors.restaurantCardShadow,
    ...(Platform.OS === "ios" ? {} : { elevation: 6 }),
  },
  imageWrap: {
    width: "100%",
    height: IMAGE_HEIGHT,
    position: "relative" as const,
    overflow: "hidden",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  image: {
    width: "100%",
    height: "100%",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  imageOpaque: {
    opacity: 0.9,
  },
  imagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  bookmarkBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  offerBadge: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: "60%",
  },
  offerBadgeText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  cuisineTag: {
    position: "absolute",
    bottom: 12,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: "50%",
  },
  cuisineTagText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  openClosedTag: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: "75%",
  },
  openClosedTagGreen: {
    backgroundColor: "#16A34A",
  },
  openClosedTagRed: {
    backgroundColor: "#FF4D4F",
    borderRadius: 12,
  },
  openClosedTagTextRed: {
    fontWeight: "600",
  },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  imageClosed: {
    opacity: 0.88,
  },
  openClosedTagText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  name: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  ratingCapsule: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.primaryMint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  ratingCapsuleNew: {
    backgroundColor: GatiMitraColors.deepMintStart,
  },
  ratingText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
  },
  metaDot: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
  },
  offersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  offerPill: {
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: "100%",
  },
  offerPillText: {
    fontSize: 12,
    color: GatiMitraColors.textPrimaryNew,
    fontWeight: "600",
  },
});
