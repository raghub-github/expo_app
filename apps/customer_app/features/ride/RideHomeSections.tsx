/**
 * Ride home UI sections — promo banner, value props, safety banner (single module for Metro/OneDrive).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, NativeSyntheticEvent, NativeScrollEvent, Dimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import type { HomeBannerOffer } from "@/services/offers.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { formatRideOfferSubline, filterRideBookFeaturedOffers } from "@/lib/ride-offers";
import { AppAssetImage } from "@/components/AppAssetImage";
import { getAppAssetUrl, useAppAssetsStore } from "@/store/appAssetsStore";
import { CX } from "@/lib/appAssetKeys";
import { filledRideHomeBannerKeys, rideHomeBannerKeyForIndex } from "@/lib/rideHomeBannerSlots";
import { prefetchFoodHomeImageUri } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchCriticalRideAssetImagesSync } from "@/lib/rideCriticalAssets";
import type { RideJourney } from "@/store/recentLocationStore";

const { width: SCREEN_W } = Dimensions.get("window");
const CARD_W = SCREEN_W - 36;
const SLIDE_GAP = 12;
const SLIDE_STRIDE = CARD_W + SLIDE_GAP;
const CARD_H = 140;
const OFFER_DWELL_MS = 5000;
const LAST_RIDE_DWELL_MS = 30_000;
const LOOP_ANIM_MS = 360;
const LOOP_SETTLE_PX = 16;

type Slide = {
  id: string;
  title: string;
  titleAccent: string;
  sub: string;
  assetKey: string;
  accentDark?: boolean;
  cta?: string;
  kind?: "offer" | "last-ride";
  pickupLine?: string;
  dropLine?: string;
  chipIcon?: keyof typeof Ionicons.glyphMap;
  chipLabel?: string;
};

const RIDER_SLIDE_LABEL = "#FFFFFF";
const CTA_GRADIENT = [...GatiMitraColors.deepMintGradient] as const;

function offerChip(offer: HomeBannerOffer): Pick<Slide, "chipIcon" | "chipLabel"> {
  const pct = offer.discount_percentage;
  if (pct != null && Number.isFinite(pct) && pct > 0) {
    return { chipIcon: "pricetag", chipLabel: `${Math.round(pct)}% off` };
  }
  const amt = offer.discount_value ?? offer.max_discount_amount;
  if (amt != null && Number.isFinite(amt) && amt > 0) {
    return { chipIcon: "pricetag", chipLabel: `Save ₹${Math.round(amt)}` };
  }
  if (offer.coupon_code?.trim()) {
    return { chipIcon: "ticket-outline", chipLabel: offer.coupon_code.trim() };
  }
  return { chipIcon: "sparkles-outline", chipLabel: "Limited time" };
}

function addressLine(place?: { primary?: string; fullAddress?: string } | null): string {
  const full = String(place?.fullAddress ?? "").replace(/\s+/g, " ").trim();
  const primary = String(place?.primary ?? "").replace(/\s+/g, " ").trim();
  if (full && primary && full.toLowerCase() !== primary.toLowerCase()) {
    if (full.toLowerCase().startsWith(primary.toLowerCase())) return full;
    return `${primary}, ${full}`;
  }
  return full || primary;
}

function lastRideHeadline(cta: string): { title: string; titleAccent: string } {
  if (/return/i.test(cta)) {
    return { title: "Back to ", titleAccent: "where it began" };
  }
  return { title: "Go where ", titleAccent: "you've been" };
}

function lastRideToSlide(journey: RideJourney, assetKey: string, cta: string): Slide {
  const headline = lastRideHeadline(cta);
  return {
    id: `last-ride-${journey.savedAt || `${journey.pickup.primary}-${journey.drop.primary}`}`,
    title: headline.title,
    titleAccent: headline.titleAccent,
    sub: "",
    assetKey,
    cta,
    kind: "last-ride",
    pickupLine: addressLine(journey.pickup),
    dropLine: addressLine(journey.drop),
  };
}

const DEFAULT_SLIDES: Slide[] = [
  {
    id: "default-1",
    title: "Go More, ",
    titleAccent: "Save More!",
    sub: "Get exciting offers on every ride.",
    assetKey: CX.ride.banner,
    chipIcon: "flash-outline",
    chipLabel: "Hot deals today",
  },
  {
    id: "default-2",
    title: "Ride safe, ",
    titleAccent: "ride smart",
    sub: "Trusted captains and insured trips.",
    assetKey: CX.ride.banner,
    chipIcon: "shield-checkmark-outline",
    chipLabel: "Safety first",
  },
  {
    id: "default-3",
    title: "Book in ",
    titleAccent: "seconds",
    sub: "Auto, bike, or cab — your choice.",
    assetKey: CX.ride.banner,
    chipIcon: "time-outline",
    chipLabel: "Pickup in minutes",
  },
];

function offerToSlide(offer: HomeBannerOffer, assetKey: string): Slide {
  const title = offer.title?.trim() || "Ride offer";
  const chip = offerChip(offer);
  const sub = formatRideOfferSubline(offer.sub, {
    minFare: offer.min_order_amount,
    maxDiscount: offer.max_discount_amount,
    discountValue: offer.discount_value,
    discountPercentage: offer.discount_percentage,
    promoType: offer.promo_type,
    maxKm: offer.max_km,
    firstNCompleted: offer.first_n_completed,
  });
  if (/✨/.test(title) || /^free ride\b/i.test(title)) {
    return {
      id: offer.id,
      title: "",
      titleAccent: title,
      accentDark: true,
      sub,
      assetKey,
      ...chip,
    };
  }
  const parts = title.split(/\s+/);
  const accent = parts.length > 2 ? parts.slice(-2).join(" ") : parts[parts.length - 1] ?? title;
  const lead = parts.length > 2 ? `${parts.slice(0, -2).join(" ")} ` : "";
  return {
    id: offer.id,
    title: lead,
    titleAccent: accent,
    sub,
    assetKey,
    ...chip,
  };
}

type PromoProps = {
  offers?: HomeBannerOffer[];
  lastRide?: RideJourney | null;
  lastRideCta?: string;
  onBookNow?: () => void;
  onLastRideBook?: () => void;
};

function PromoSlideCard({
  slide,
  onPress,
}: {
  slide: Slide;
  onPress?: () => void;
}) {
  useAppAssetsStore((s) => s.assets);
  const bgUrl = getAppAssetUrl(slide.assetKey);
  const isLastRide = slide.kind === "last-ride";
  const ctaLabel = slide.cta ?? "Book Now";

  const cta = (
    <TouchableOpacity
      activeOpacity={0.88}
      delayPressIn={80}
      onPress={onPress}
      style={promoStyles.ctaHit}
      accessibilityRole="button"
      accessibilityLabel={ctaLabel}
    >
      <LinearGradient
        colors={[...CTA_GRADIENT]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={promoStyles.lastRideCta}
      >
        <AppText style={promoStyles.lastRideCtaText} numberOfLines={1}>
          {ctaLabel}
        </AppText>
      </LinearGradient>
    </TouchableOpacity>
  );

  const bottomRow = (
    <View style={promoStyles.bottomRow}>
      {!isLastRide && slide.chipLabel ? (
        <View style={promoStyles.chip}>
          <Ionicons name={slide.chipIcon ?? "sparkles-outline"} size={13} color="#059669" />
          <AppText style={promoStyles.chipText} numberOfLines={1}>
            {slide.chipLabel}
          </AppText>
        </View>
      ) : (
        <View style={promoStyles.chipSpacer} />
      )}
      {cta}
    </View>
  );

  const title = (
    <AppText style={promoStyles.cardTitle} numberOfLines={2}>
      {slide.title}
      <AppText style={[promoStyles.titleAccent, slide.accentDark && promoStyles.titleAccentDark]}>
        {slide.titleAccent}
      </AppText>
    </AppText>
  );

  const content = isLastRide ? (
    <>
      <LinearGradient
        colors={["rgba(255,255,255,0.38)", "rgba(236,253,245,0.52)", "rgba(255,255,255,0.18)"]}
        locations={[0, 0.48, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, promoStyles.roundedFill]}
        pointerEvents="none"
      />
      <View style={promoStyles.glassFrost} pointerEvents="none" />
      <View style={promoStyles.glassSheen} pointerEvents="none" />
      <View style={promoStyles.glassInnerBorder} pointerEvents="none" />
      <View style={promoStyles.cardBody}>
        <View style={promoStyles.cardTop}>
          {title}
          {slide.pickupLine ? (
            <View style={promoStyles.addrRow}>
              <View style={promoStyles.addrRail}>
                <View style={promoStyles.addrDotPickup} />
                <View style={promoStyles.addrConnector} />
                <View style={promoStyles.addrDotDrop} />
              </View>
              <View style={promoStyles.addrLines}>
                <AppText style={promoStyles.addrText} numberOfLines={2}>
                  {slide.pickupLine}
                </AppText>
                {slide.dropLine ? (
                  <AppText style={promoStyles.addrText} numberOfLines={2}>
                    {slide.dropLine}
                  </AppText>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
        {bottomRow}
      </View>
    </>
  ) : (
    <>
      <LinearGradient
        colors={["rgba(255,255,255,0.94)", "rgba(255,255,255,0.72)", "rgba(255,255,255,0.08)"]}
        locations={[0, 0.42, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, promoStyles.roundedFill]}
        pointerEvents="none"
      />
      <View style={promoStyles.cardBody}>
        <View style={promoStyles.cardTop}>
          {title}
          {slide.sub ? (
            <AppText style={promoStyles.sub} numberOfLines={2}>
              {slide.sub}
            </AppText>
          ) : null}
        </View>
        {bottomRow}
      </View>
    </>
  );

  return (
    <View style={promoStyles.cardOuter} collapsable={false}>
      <View
        style={[
          promoStyles.card,
          { height: CARD_H },
          !bgUrl && promoStyles.cardFallback,
          isLastRide && promoStyles.lastRideCard,
        ]}
        collapsable={false}
      >
        {bgUrl ? (
          <Image
            source={{ uri: bgUrl }}
            style={[StyleSheet.absoluteFillObject, promoStyles.roundedFill]}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            transition={0}
            recyclingKey={slide.assetKey}
          />
        ) : null}
        {content}
      </View>
    </View>
  );
}

export function RideHomePromoBanner({
  offers = [],
  lastRide = null,
  lastRideCta = "Book again",
  onBookNow,
  onLastRideBook,
}: PromoProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false);
  const loopingRef = useRef(false);
  const scheduleAdvanceRef = useRef<() => void>(() => {});
  const assets = useAppAssetsStore((s) => s.assets);
  const isScreenFocused = useIsFocused();

  const slides = useMemo(() => {
    const bannerKeys = filledRideHomeBannerKeys();
    const platform = filterRideBookFeaturedOffers(offers).filter((o) => o.source_offer_id > 0);
    const offerSlides =
      platform.length > 0
        ? platform.slice(0, 10).map((offer, index) =>
            offerToSlide(offer, rideHomeBannerKeyForIndex(index, bannerKeys))
          )
        : DEFAULT_SLIDES.map((slide, index) => ({
            ...slide,
            assetKey: rideHomeBannerKeyForIndex(index, bannerKeys),
          }));
    if (!lastRide?.pickup || !lastRide?.drop) return offerSlides;
    return [lastRideToSlide(lastRide, rideHomeBannerKeyForIndex(0, bannerKeys), lastRideCta), ...offerSlides];
  }, [offers, assets, lastRide, lastRideCta]);

  const loopSlides = useMemo(() => {
    if (slides.length <= 1) return slides;
    const first = slides[0];
    return [...slides, { ...first, id: `${first.id}-loop-clone` }];
  }, [slides]);

  useLayoutEffect(() => {
    prefetchCriticalRideAssetImagesSync(assets);
    for (const slide of slides) {
      const uri = getAppAssetUrl(slide.assetKey);
      if (uri) prefetchFoodHomeImageUri(uri);
    }
  }, [assets, slides]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (loopResetTimerRef.current) clearTimeout(loopResetTimerRef.current);
    };
  }, []);

  const jumpToRealFirst = useCallback(() => {
    loopingRef.current = true;
    if (loopResetTimerRef.current) {
      clearTimeout(loopResetTimerRef.current);
      loopResetTimerRef.current = null;
    }
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    activeIndexRef.current = 0;
    setActiveIndex(0);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      loopingRef.current = false;
      scheduleAdvanceRef.current();
    });
  }, []);

  const maybeConsumeLoopClone = useCallback(
    (offsetX: number) => {
      if (slides.length < 2 || loopingRef.current) return false;
      const cloneX = slides.length * SLIDE_STRIDE;
      if (offsetX + LOOP_SETTLE_PX < cloneX) return false;
      jumpToRealFirst();
      return true;
    },
    [jumpToRealFirst, slides.length]
  );

  const dwellMsForIndex = useCallback(
    (index: number) => {
      const slide = slides[index] ?? slides[0];
      return slide?.kind === "last-ride" ? LAST_RIDE_DWELL_MS : OFFER_DWELL_MS;
    },
    [slides]
  );

  const advanceOnce = useCallback(() => {
    if (slides.length < 2 || loopingRef.current || draggingRef.current) return;
    const current = activeIndexRef.current >= slides.length ? 0 : activeIndexRef.current;
    const next = current + 1;
    const wrapping = next >= slides.length;
    if (wrapping) loopingRef.current = true;
    scrollRef.current?.scrollTo({
      x: next * SLIDE_STRIDE,
      animated: true,
    });
    activeIndexRef.current = wrapping ? 0 : next;
    setActiveIndex(wrapping ? 0 : next);
    if (!wrapping) return;
    if (loopResetTimerRef.current) clearTimeout(loopResetTimerRef.current);
    loopResetTimerRef.current = setTimeout(() => {
      loopResetTimerRef.current = null;
      scrollRef.current?.scrollTo({ x: 0, animated: false });
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: 0, animated: false });
        loopingRef.current = false;
        scheduleAdvanceRef.current();
      });
    }, LOOP_ANIM_MS);
  }, [slides.length]);

  const scheduleAdvance = useCallback(() => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (!isScreenFocused || slides.length < 2 || draggingRef.current || loopingRef.current) return;
    if (activeIndexRef.current >= slides.length) return;
    const idx = activeIndexRef.current;
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      advanceOnce();
    }, dwellMsForIndex(idx));
  }, [advanceOnce, dwellMsForIndex, isScreenFocused, slides.length]);
  scheduleAdvanceRef.current = scheduleAdvance;

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [slides.length]);

  useEffect(() => {
    scheduleAdvance();
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, [scheduleAdvance, activeIndex]);

  const onScrollBeginDrag = useCallback(() => {
    draggingRef.current = true;
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (loopingRef.current) return;
      draggingRef.current = false;
      const x = e?.nativeEvent?.contentOffset?.x;
      if (typeof x !== "number" || !Number.isFinite(x) || SLIDE_STRIDE <= 0) return;
      if (maybeConsumeLoopClone(x)) return;
      const idx = Math.round(x / SLIDE_STRIDE);
      const logical = idx >= slides.length ? 0 : Math.max(0, idx);
      const changed = activeIndexRef.current !== logical;
      activeIndexRef.current = logical;
      if (changed) {
        setActiveIndex(logical);
      } else {
        scheduleAdvance();
      }
    },
    [maybeConsumeLoopClone, slides.length, scheduleAdvance]
  );

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocity = e?.nativeEvent?.velocity?.x ?? 0;
      if (Math.abs(velocity) > 0.08) return;
      onMomentumScrollEnd(e);
    },
    [onMomentumScrollEnd]
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (draggingRef.current || loopingRef.current) return;
      const x = e?.nativeEvent?.contentOffset?.x;
      if (typeof x !== "number" || !Number.isFinite(x)) return;
      maybeConsumeLoopClone(x);
    },
    [maybeConsumeLoopClone]
  );

  const dotIndex = activeIndex >= slides.length ? 0 : activeIndex;

  return (
    <View style={promoStyles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        scrollEnabled={slides.length > 1}
        nestedScrollEnabled
        directionalLockEnabled
        disableIntervalMomentum
        bounces={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={SLIDE_STRIDE}
        snapToAlignment="start"
        decelerationRate="fast"
        delaysContentTouches={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={onScrollBeginDrag}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onScrollEndDrag}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={promoStyles.scrollContent}
      >
        {loopSlides.map((slide) => (
          <View key={slide.id} style={[promoStyles.slideWrap, { width: CARD_W, marginRight: SLIDE_GAP }]}>
            <PromoSlideCard
              slide={slide}
              onPress={slide.kind === "last-ride" ? onLastRideBook : onBookNow}
            />
          </View>
        ))}
      </ScrollView>

      <View style={promoStyles.dotsRow}>
        {slides.map((s, i) => (
          <View
            key={s.id}
            style={[promoStyles.dot, i === dotIndex ? promoStyles.dotActive : promoStyles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const promoStyles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  scrollContent: { paddingTop: 4, paddingBottom: 2 },
  slideWrap: {
    borderRadius: 20,
  },
  cardOuter: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#ECFDF5",
  },
  card: {
    borderRadius: 20,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.8)",
    overflow: "hidden",
    backgroundColor: "#ECFDF5",
  },
  roundedFill: {
    borderRadius: 20,
  },
  lastRideCard: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.82)",
    backgroundColor: "#ECFDF5",
  },
  cardFallback: {
    backgroundColor: "#ECFDF5",
  },
  glassFrost: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  glassSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 36,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: "rgba(255,255,255,0.38)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.7)",
  },
  glassInnerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  cardBody: {
    flex: 1,
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 16,
    justifyContent: "space-between",
    zIndex: 2,
  },
  cardTop: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "72%",
    paddingRight: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.4,
    lineHeight: 25,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
    maxWidth: "54%",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.28)",
    marginBottom: 6,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
    letterSpacing: 0.1,
  },
  chipSpacer: {
    flex: 1,
  },
  ctaHit: {
    flexShrink: 0,
    alignSelf: "flex-end",
  },
  addrRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginTop: 10,
  },
  addrRail: {
    width: 10,
    alignItems: "center",
    paddingTop: 3,
    paddingBottom: 3,
  },
  addrConnector: {
    width: 2,
    flex: 1,
    minHeight: 10,
    backgroundColor: "rgba(16, 185, 129, 0.45)",
    marginVertical: 2,
    borderRadius: 1,
  },
  addrLines: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  addrDotPickup: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },
  addrDotDrop: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  addrText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1F2937",
    lineHeight: 16,
  },
  lastRideCta: {
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    minWidth: 120,
    minHeight: 38,
    maxWidth: "72%",
    alignItems: "center",
    justifyContent: "center",
  },
  lastRideCtaText: {
    fontSize: 13,
    fontWeight: "800",
    color: RIDER_SLIDE_LABEL,
  },
  titleAccent: { color: GatiMitraColors.deepMintStart, fontSize: 20, fontWeight: "800", lineHeight: 25 },
  titleAccentDark: { color: "#064E3B", fontSize: 20, fontWeight: "800", lineHeight: 25 },
  sub: { marginTop: 8, fontSize: 12, fontWeight: "500", color: "#6B7280", lineHeight: 16 },
  dotsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, minHeight: 8 },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 18, backgroundColor: GatiMitraColors.primaryMint },
  dotInactive: { width: 6, backgroundColor: "#D1D5DB" },
});

export function RideSafetyBanner() {
  const cardW = SCREEN_W - 36;

  return (
    <View style={safetyStyles.wrap}>
      <View style={[safetyStyles.card, { width: cardW }]}>
        <View style={safetyStyles.shieldWrap}>
          <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
        </View>

        <View style={safetyStyles.textCol}>
          <AppText style={safetyStyles.title}>Your Safety. Our Priority.</AppText>
          <AppText style={safetyStyles.sub}>
            All rides are insured. Share trip details with your loved ones.
          </AppText>
        </View>

        <View style={safetyStyles.rightArt}>
          <AppAssetImage
            assetKey={CX.ride.bottomBanner}
            style={safetyStyles.rightArtImg}
            contentFit="cover"
          />
        </View>
      </View>
    </View>
  );
}

const safetyStyles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 6,
    borderWidth: 1,
    borderColor: "rgba(187, 247, 208, 0.65)",
    overflow: "hidden",
    minHeight: 78,
  },
  shieldWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.deepMintStart,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 6,
    paddingRight: 2,
  },
  title: { fontSize: 14, fontWeight: "800", color: "#111827", lineHeight: 18 },
  sub: { marginTop: 3, fontSize: 11, fontWeight: "500", color: "#4B5563", lineHeight: 15 },
  rightArt: {
    width: 54,
    height: 58,
    overflow: "hidden",
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  rightArtImg: {
    width: 160,
    height: 58,
    position: "absolute",
    right: -6,
  },
});
