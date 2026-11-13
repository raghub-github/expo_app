/**
 * Zomato-style Home section skeletons — same footprints as live Home chrome.
 * Shimmer only while content is not paint-ready; real content replaces in place.
 */
import { useEffect, useRef } from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GMSkeleton, HomeOfferBannerSkeleton } from "@/components/ShimmerSkeleton";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HOME_HEADER_BELOW_STATUS_GAP, HOME_WEATHER_BANNER_H, resolveTopSafeInset } from "@/constants/layout";
import {
  homeSkeletonLog,
  type HomeSkeletonSection,
} from "@/lib/homeSkeletonTelemetry";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const GAP = 12;
const COLS = 2;
const CARD_W = Math.floor((SCREEN_W - PAD * 2 - GAP * (COLS - 1)) / COLS);
const PROMO_W = SCREEN_W - PAD * 2;
const PAGE_BG = GatiMitraColors.softBackground;

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

const styles = StyleSheet.create({
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
    marginTop: 4,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
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
    marginTop: 10,
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
});
