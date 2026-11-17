/**
 * Zomato-style Home skeletons:
 * - Cold start: real header + real tab bar; main body = rotating slogans + spinner
 * - Section skeletons: still used for progressive Home content swap-in
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { GMSkeleton, HomeOfferBannerSkeleton } from "@/components/ShimmerSkeleton";
import { AppText } from "@/components/AppText";
import { HomeLocationHeader } from "@/components/home/HomeScreenHeader";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  HOME_HEADER_BELOW_STATUS_GAP,
  HOME_WEATHER_BANNER_H,
  resolveCustomerBottomNavHeight,
  resolveCustomerFloatingChromeBottom,
  resolveTopSafeInset,
} from "@/constants/layout";
import {
  homeSkeletonLog,
  type HomeSkeletonSection,
} from "@/lib/homeSkeletonTelemetry";
import { useLocationStore } from "@/store/locationStore";
import { resolveDeliveryLocationLabel } from "@/lib/resolveDeliveryLocationLabel";
import {
  resolveHomeLocationPrimary,
  resolveHomeLocationSecondary,
} from "@/lib/weather-location";
import { ensureIoniconsLoaded, useIoniconsReady } from "@/lib/ioniconsReady";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const GAP = 12;
const COLS = 2;
const CARD_W = Math.floor((SCREEN_W - PAD * 2 - GAP * (COLS - 1)) / COLS);
const PROMO_W = SCREEN_W - PAD * 2;
const PAGE_BG = GatiMitraColors.softBackground;
const TAB_ACTIVE = GatiMitraColors.primaryMint;
const TAB_INACTIVE = GatiMitraColors.textSecondary;
/** Short single-line slogans — never wrap on phone widths. */
const HOME_LOADING_SLOGANS = [
  "Give us a sec — lining up nearby.",
  "Almost there. Hang tight.",
  "Finding your neighbourhood…",
  "Nearby favourites incoming.",
  "Convenience is on the way.",
  "Warming up GatiMitra…",
] as const;

const SLOGAN_SWAP_MS = 1200;

/** Survives remounts so the next Home open doesn't repeat the last slogan. */
let lastHomeLoadingSloganIndex: number | null = null;

/** Random slogan index — never the same as `exclude` (no immediate duplicate). */
function pickNextHomeLoadingSloganIndex(exclude: number | null): number {
  const n = HOME_LOADING_SLOGANS.length;
  if (n <= 1) return 0;
  if (exclude == null || exclude < 0 || exclude >= n) {
    return Math.floor(Math.random() * n);
  }
  // Pick among the other n-1 slogans so consecutive opens / swaps never match.
  const offset = 1 + Math.floor(Math.random() * (n - 1));
  return (exclude + offset) % n;
}

function useSkeletonLifecycle(section: HomeSkeletonSection, reason: string) {
  const visibleLogged = useRef(false);
  useEffect(() => {
    homeSkeletonLog("SKELETON_MOUNTED", section, reason);
    return () => {
      homeSkeletonLog("SKELETON_REPLACED", section, "unmount");
    };
  }, [section, reason]);

  return {
    onLayout: () => {
      if (visibleLogged.current) return;
      visibleLogged.current = true;
      homeSkeletonLog("SKELETON_VISIBLE", section, reason, { layout: true });
    },
  };
}

/** Location pin + primary/secondary lines + wallet/bell slots. */
export function HomeLocationHeaderSkeleton({ reason = "location_pending" }: { reason?: string }) {
  const insets = useSafeAreaInsets();
  const topPad = resolveTopSafeInset(insets.top) + HOME_HEADER_BELOW_STATUS_GAP;
  const life = useSkeletonLifecycle("location", reason);

  return (
    <View
      style={[styles.headerBlock, { paddingTop: topPad }]}
      accessibilityLabel="Loading location"
      onLayout={life.onLayout}
    >
      <View style={styles.locationRow}>
        <GMSkeleton style={styles.pinCircle} />
        <View style={styles.locationTextCol}>
          <GMSkeleton style={styles.locationPrimaryLine} />
          <GMSkeleton style={styles.locationSecondaryLine} />
        </View>
        <GMSkeleton style={styles.walletPill} />
        <GMSkeleton style={styles.bellCircle} />
      </View>
    </View>
  );
}

/** Weather pill — reserved height matches live banner slot. */
export function HomeWeatherBannerSkeleton({ reason = "weather_pending" }: { reason?: string }) {
  const life = useSkeletonLifecycle("weather", reason);
  return (
    <View
      style={styles.weatherShell}
      accessibilityLabel="Loading weather"
      onLayout={life.onLayout}
    >
      <View style={styles.weatherWrap}>
        <GMSkeleton style={styles.weatherPill} />
      </View>
    </View>
  );
}

/** Hero promo card + dots. */
export function HomePromoBannerSkeleton({
  cardHeight,
  reason = "promo_pending",
}: {
  cardHeight: number;
  reason?: string;
}) {
  const life = useSkeletonLifecycle("promo", reason);
  return (
    <View style={styles.promoWrap} accessibilityLabel="Loading offers" onLayout={life.onLayout}>
      <HomeOfferBannerSkeleton width={PROMO_W} height={cardHeight} />
      <View style={styles.dotsRow}>
        <GMSkeleton style={styles.dot} />
        <GMSkeleton style={styles.dot} />
        <GMSkeleton style={styles.dot} />
      </View>
    </View>
  );
}

/** 2×3 service grid matching HomeServicesRow card size. */
export function HomeServicesGridSkeleton({
  cardHeight,
  reason = "services_pending",
}: {
  cardHeight: number;
  reason?: string;
}) {
  const life = useSkeletonLifecycle("services", reason);
  return (
    <View style={styles.grid} accessibilityLabel="Loading services" onLayout={life.onLayout}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[styles.cardShadow, { height: cardHeight, width: CARD_W }]}>
          <View style={[styles.card, { height: cardHeight }]}>
            <GMSkeleton style={styles.cardTitle} />
            <GMSkeleton style={styles.cardDesc} />
            <GMSkeleton style={styles.cardDescShort} />
            <GMSkeleton style={styles.cardPill} />
            <GMSkeleton style={styles.cardArt} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Brand footer banner footprint. */
export function HomeBrandBannerSkeleton({
  bannerHeight,
  reason = "brand_pending",
}: {
  bannerHeight: number;
  reason?: string;
}) {
  const life = useSkeletonLifecycle("brand", reason);
  return (
    <View
      style={styles.brandWrap}
      accessibilityLabel="Loading brand banner"
      onLayout={life.onLayout}
    >
      <GMSkeleton style={[styles.brandBanner, { height: bannerHeight }]} />
    </View>
  );
}

/** Soft pulse ring — Reanimated UI-thread (not blocked by JS bridge). */
function PulseRing({ delayMs, size }: { delayMs: number; size: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.out(Easing.cubic) }),
        -1,
        false
      )
    );
    return () => cancelAnimation(progress);
  }, [delayMs, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.28 * (1 - progress.value),
    transform: [{ scale: 0.55 + progress.value * 0.7 }],
  }));
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        styles.pulseRing,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    />
  );
}

function BounceDot({ delayMs }: { delayMs: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(-7, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: 420 })
        ),
        -1,
        false
      )
    );
    return () => cancelAnimation(y);
  }, [delayMs, y]);
  const style = useAnimatedStyle(() => {
    const lifted = y.value < 0 ? -y.value / 7 : 0;
    return {
      transform: [{ translateY: y.value }],
      opacity: 0.35 + Math.min(1, lifted) * 0.65,
    };
  });
  return <Reanimated.View style={[styles.bounceDot, style]} />;
}

/** Compact Zomato-like spinner — small OS indicator + light pulse. */
function ZomatoLoadSpinner() {
  return (
    <View style={styles.spinnerStage} accessibilityLabel="Loading">
      <PulseRing delayMs={0} size={40} />
      <PulseRing delayMs={500} size={40} />
      <ActivityIndicator size="small" color={GatiMitraColors.splashMint} />
    </View>
  );
}

function BounceDots() {
  return (
    <View style={styles.bounceDotsRow}>
      <BounceDot delayMs={0} />
      <BounceDot delayMs={140} />
      <BounceDot delayMs={280} />
    </View>
  );
}

/**
 * Slogan: no background chip. Fade + vertical slide via marginTop / color
 * (layout-safe on this cold-start shell).
 */
function AnimatedLoadingSlogan() {
  // Fresh random pick on every mount; never equal to the previous open's slogan.
  const [index, setIndex] = useState(() => {
    const next = pickNextHomeLoadingSloganIndex(lastHomeLoadingSloganIndex);
    lastHomeLoadingSloganIndex = next;
    return next;
  });
  const [tick, setTick] = useState(0);
  const lastSwapAt = useRef(Date.now());

  useEffect(() => {
    const motionId = setInterval(() => setTick((n) => n + 1), 50);
    const swapId = setInterval(() => {
      setIndex((i) => {
        const next = pickNextHomeLoadingSloganIndex(i);
        lastHomeLoadingSloganIndex = next;
        lastSwapAt.current = Date.now();
        return next;
      });
    }, SLOGAN_SWAP_MS);
    return () => {
      clearInterval(motionId);
      clearInterval(swapId);
    };
  }, []);

  const elapsed = tick * 50;
  const wave = Math.sin(elapsed / 320);
  const light = (Math.sin(elapsed / 450) + 1) / 2;
  const sinceSwap = Date.now() - lastSwapAt.current;
  // Slide in after each swap — keep opacity at 1 so text never looks washed out.
  const enter = Math.min(1, sinceSwap / 400);
  const enterEased = 1 - Math.pow(1 - enter, 3);
  const slideY = (1 - enterEased) * 16 + wave * 4;
  const line = HOME_LOADING_SLOGANS[index] ?? HOME_LOADING_SLOGANS[0]!;

  return (
    <View
      collapsable={false}
      style={[styles.sloganAnimWrap, { marginTop: slideY }]}
    >
      <Text
        style={[
          styles.sloganText,
          { color: light > 0.55 ? "#0F766E" : "#4B5563" },
        ]}
        numberOfLines={1}
      >
        {line}
      </Text>
    </View>
  );
}

/**
 * Cold-start Home shell (Zomato reference):
 * - Real header with live/cached location (updates as store hydrates)
 * - Real tab bar chrome (icons gated on Ionicons ready)
 * - Main body: animated slogan + pulse rings + spinner + bounce dots
 */
export function HomeColdStartSkeleton({ reason = "tabs_hold" }: { reason?: string }) {
  const insets = useSafeAreaInsets();
  const bottomInset = resolveCustomerFloatingChromeBottom(insets.bottom);
  const tabBarReserve = resolveCustomerBottomNavHeight(insets.bottom);
  const iconsReady = useIoniconsReady();

  useEffect(() => {
    void ensureIoniconsLoaded();
  }, []);

  const address = useLocationStore((s) => s.address);
  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const permissionStatus = useLocationStore((s) => s.permissionStatus);
  const locationLoading = useLocationStore((s) => s.loading);
  const locationError = useLocationStore((s) => s.error);
  const detectingTimedOut = useLocationStore((s) => s.detectingTimedOut);

  const locationPrimary = useMemo(() => {
    const resolved = resolveDeliveryLocationLabel({
      locationSource,
      address,
      addresses: [],
      coords,
      permissionStatus,
      locationLoading,
      locationError,
      detectingTimedOut,
    });
    if (
      resolved &&
      resolved.toLowerCase() !== "current location" &&
      !resolved.toLowerCase().startsWith("detecting")
    ) {
      return resolved.length > 42 ? `${resolved.slice(0, 41)}…` : resolved;
    }
    if (
      resolved.toLowerCase().startsWith("detecting") ||
      resolved.startsWith("Enable") ||
      resolved.startsWith("Turn") ||
      resolved.startsWith("Location") ||
      resolved.startsWith("Tap to set")
    ) {
      return resolved;
    }
    return resolveHomeLocationPrimary(address);
  }, [
    locationSource,
    address,
    coords,
    permissionStatus,
    locationLoading,
    locationError,
    detectingTimedOut,
  ]);

  const locationSecondary = resolveHomeLocationSecondary(
    address,
    locationPrimary,
    coords != null
  );

  useEffect(() => {
    homeSkeletonLog("SKELETON_MOUNTED", "promo", reason);
    homeSkeletonLog("SKELETON_MOUNTED", "services", reason);
    return () => {
      homeSkeletonLog("SKELETON_REPLACED", "promo", "unmount");
      homeSkeletonLog("SKELETON_REPLACED", "services", "unmount");
    };
  }, [reason]);

  return (
    <View style={styles.coldStart} collapsable={false} accessibilityLabel="Loading home">
      <HomeLocationHeader
        locationPrimary={locationPrimary}
        locationSecondary={locationSecondary}
        onLocationPress={() => {}}
        onNotificationPress={() => {}}
      />

      <View style={[styles.mainBody, { paddingBottom: tabBarReserve + 28 }]} collapsable={false}>
        <View style={styles.sloganCenter} accessibilityLabel="Loading content" collapsable={false}>
          <AnimatedLoadingSlogan />
          <ZomatoLoadSpinner />
        </View>
        {/* Dots sit just above the absolute tab bar. */}
        <View
          pointerEvents="none"
          style={[styles.dotsDock, { bottom: tabBarReserve + 10 }]}
        >
          <BounceDots />
        </View>
      </View>

      <View
        pointerEvents="none"
        style={[styles.tabSheet, { paddingBottom: bottomInset, height: 58 + bottomInset }]}
        accessibilityLabel="Home tabs"
      >
        <View style={styles.tabRow}>
          <View style={styles.tabItem}>
            {iconsReady ? (
              <Ionicons name="home" size={22} color={TAB_ACTIVE} />
            ) : (
              <View style={[styles.tabIconFallback, { backgroundColor: TAB_ACTIVE }]} />
            )}
            <AppText style={[styles.tabLabel, styles.tabLabelActive]}>Home</AppText>
          </View>
          <View style={styles.tabItem}>
            {iconsReady ? (
              <Ionicons name="restaurant-outline" size={22} color={TAB_INACTIVE} />
            ) : (
              <View style={styles.tabIconFallback} />
            )}
            <AppText style={styles.tabLabel}>Food</AppText>
          </View>
          <View style={styles.tabItem}>
            {iconsReady ? (
              <Ionicons name="receipt-outline" size={22} color={TAB_INACTIVE} />
            ) : (
              <View style={styles.tabIconFallback} />
            )}
            <AppText style={styles.tabLabel}>Orders</AppText>
          </View>
          <View style={styles.tabItem}>
            {iconsReady ? (
              <Ionicons name="person-outline" size={22} color={TAB_INACTIVE} />
            ) : (
              <View style={styles.tabIconFallback} />
            )}
            <AppText style={styles.tabLabel}>Profile</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coldStart: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  mainBody: {
    flex: 1,
    position: "relative",
  },
  sloganCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  sloganAnimWrap: {
    minHeight: 28,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    paddingHorizontal: 12,
    alignSelf: "center",
  },
  sloganText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    color: "#374151",
    fontFamily: "Lora_700Bold",
    width: "100%",
  },
  spinnerStage: {
    marginTop: 14,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: GatiMitraColors.splashMint,
  },
  dotsDock: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  bounceDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    height: 14,
  },
  bounceDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: GatiMitraColors.splashMint,
  },
  tabIconFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#D1D5DB",
  },
  headerBlock: {
    width: "100%",
    backgroundColor: PAGE_BG,
    paddingHorizontal: PAD,
    paddingBottom: 2,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
  },
  pinCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  locationTextCol: {
    flex: 1,
    marginLeft: 8,
    marginRight: 10,
    gap: 6,
    minWidth: 0,
  },
  locationPrimaryLine: {
    height: 16,
    width: "72%",
    borderRadius: 6,
  },
  locationSecondaryLine: {
    height: 11,
    width: "42%",
    borderRadius: 5,
  },
  walletPill: {
    width: 72,
    height: 32,
    borderRadius: 16,
    marginRight: 6,
  },
  bellCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  weatherShell: {
    width: "100%",
    minHeight: HOME_WEATHER_BANNER_H - 10,
    backgroundColor: PAGE_BG,
  },
  weatherWrap: {
    width: "100%",
    paddingHorizontal: PAD,
    paddingTop: 2,
    paddingBottom: 10,
  },
  weatherPill: {
    height: 34,
    width: Math.min(280, SCREEN_W - PAD * 2),
    borderRadius: 999,
  },
  promoWrap: {
    paddingHorizontal: PAD,
    marginTop: 8,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    height: 14,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAD,
    marginTop: 14,
    gap: GAP,
  },
  cardShadow: {
    borderRadius: 14,
  },
  card: {
    width: "100%",
    backgroundColor: "#EBEBED",
    borderRadius: 14,
    paddingTop: 12,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  cardTitle: {
    height: 14,
    width: "58%",
    borderRadius: 6,
    marginBottom: 8,
  },
  cardDesc: {
    height: 10,
    width: "78%",
    borderRadius: 5,
    marginBottom: 5,
  },
  cardDescShort: {
    height: 10,
    width: "55%",
    borderRadius: 5,
    marginBottom: 10,
  },
  cardPill: {
    position: "absolute",
    left: 10,
    bottom: 10,
    height: 22,
    width: 88,
    borderRadius: 11,
  },
  cardArt: {
    position: "absolute",
    right: 10,
    bottom: 12,
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  brandWrap: {
    paddingHorizontal: PAD,
    marginTop: 16,
    marginBottom: 4,
  },
  brandBanner: {
    width: SCREEN_W - PAD * 2,
    borderRadius: 16,
  },
  tabSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    justifyContent: "flex-start",
    paddingTop: 8,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    height: 52,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TAB_INACTIVE,
    marginTop: 2,
  },
  tabLabelActive: {
    color: TAB_ACTIVE,
  },
});
