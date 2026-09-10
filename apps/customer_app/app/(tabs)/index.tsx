/**
 * Home – GatiMitra reference UI: header, weather, promo, services, brand banner.
 * Content scrolls independently under a true floating bottom nav.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar as NativeStatusBar,
  Platform,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { GatiMitraColors } from "@/constants/gatimitra";
import { resolveCustomerBottomNavHeight } from "@/constants/layout";
import { HomeLocationHeader, HomeWeatherBanner } from "@/components/home/HomeScreenHeader";
import { HomeServicesRow } from "@/components/home/HomeServicesRow";
import { HomePromoCarousel } from "@/components/home/HomePromoCarousel";
import { HomeBrandBanner } from "@/components/home/HomeBrandBanner";
import { WeatherDetailsSheet } from "@/components/weather";
import { useHomeScreenLayout } from "@/hooks/useHomeScreenLayout";
import { useFeaturedOffersHome } from "@/hooks/useFeaturedOffersHome";
import { useCustomerGeoServiceAvailability } from "@/hooks/useCustomerGeoServiceAvailability";
import {
  useCustomerServiceBlocks,
  CUSTOMER_SERVICE_BLOCKS_QUERY_KEY,
} from "@/hooks/useCustomerServiceBlocks";
import { useCustomerServiceBlockSheetStore } from "@/store/customerServiceBlockSheetStore";
import { useLocationStore } from "@/store/locationStore";
import { useActiveLocationReconcileReady } from "@/hooks/useActiveLocationReconcileReady";
import { useLocationWeather } from "@/hooks/useLocationWeather";
import { resolveHomeLocationPrimary, resolveHomeWeatherQueryParams } from "@/lib/weather-location";
import { isRawCoordinateText } from "@/lib/isRawCoordinateText";
import { normalizeOfferLocationParams } from "@/lib/featuredOfferGeo";
import { reloadCustomerAppAssets } from "@/store/appAssetsStore";
import { useNearbyGroceryAvailability } from "@/hooks/useNearbyGroceryAvailability";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { prioritizeVisibleMerchantBanners } from "@/lib/prefetchMerchantBanners";
import { resetFoodHomeListScrollGuard } from "@/lib/foodHomeScrollGuard";
import { warmFoodHomeEntry } from "@/lib/navigateToFoodHome";

const PAGE_BG = GatiMitraColors.softBackground;
const STATUS_CHROME = GatiMitraColors.softBackground;
export default function HomeScreen() {
  const insets = useAppSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [weatherSheetVisible, setWeatherSheetVisible] = useState(false);
  /** Remount service grid after idle/resume — Android ScrollView+RefreshControl can eat taps. */
  const [servicesTouchEpoch, setServicesTouchEpoch] = useState(0);
  const openBlockSheet = useCustomerServiceBlockSheetStore((s) => s.open);
  // Throttle the on-focus service-blocks refetch: returning to Home (e.g. rapid tab
  // toggling) previously fired a network invalidation + re-render every single time.
  const lastBlocksRefetchRef = useRef(0);
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const locationSource = useLocationStore((s) => s.locationSource);
  const coords = useLocationStore((s) => s.coords);
  const refining = useLocationStore((s) => s.refining);
  const address = useLocationStore((s) => s.address);
  const requestPermissionAndFetch = useLocationStore((s) => s.requestPermissionAndFetch);
  const refetchLocation = useLocationStore((s) => s.refetchLocation);
  const reconcileReady = useActiveLocationReconcileReady();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["addresses"] }),
        queryClient.invalidateQueries({ queryKey: ["active-location"] }),
        queryClient.invalidateQueries({ queryKey: ["featured-offers-home"] }),
        queryClient.invalidateQueries({ queryKey: ["weather"] }),
        queryClient.invalidateQueries({ queryKey: ["geo", "services"] }),
        queryClient.invalidateQueries({ queryKey: ["merchants"] }),
        queryClient.invalidateQueries({ queryKey: CUSTOMER_SERVICE_BLOCKS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["wallet", "balance"] }),
        reloadCustomerAppAssets(),
      ]);
      if (locationSource !== "selected") {
        await refetchLocation();
      }
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, locationSource, refetchLocation]);

  useEffect(() => {
    if (!locationHydrated) return;
    if (!reconcileReady) return;
    if (locationSource === "selected" && coords) return;
    if (locationSource === "current" && coords) return;
    requestPermissionAndFetch();
  }, [locationHydrated, reconcileReady, locationSource, coords, requestPermissionAndFetch]);

  useEffect(() => {
    // Warm JS bundle early; merchant seed no-ops until coords exist.
    warmFoodHomeEntry();
  }, []);

  useEffect(() => {
    if (!locationHydrated) return;
    if (coords?.latitude == null || coords?.longitude == null) return;
    // Re-warm once location is known so prod paints store cards/banners from cache.
    warmFoodHomeEntry();
  }, [locationHydrated, coords?.latitude, coords?.longitude]);

  const isPincode = (value?: string | null) => !!value && /^\d{6}$/.test(value.trim());
  const fullParts = (address?.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !isRawCoordinateText(p));
  const stateCandidate =
    address?.state ??
    [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india");
  const { enabledServices } = useCustomerGeoServiceAvailability();
  const { groceryEnabled } = useNearbyGroceryAvailability();
  const homeEnabledServices = useMemo(
    () => ({ ...enabledServices, grocery: groceryEnabled }),
    [enabledServices, groceryEnabled]
  );
  const { accountBlocks } = useCustomerServiceBlocks();
  const weatherParams = useMemo(
    () => (coords ? resolveHomeWeatherQueryParams(address, coords) : { lat: undefined, lng: undefined }),
    [address, coords]
  );
  const locationPrimary = resolveHomeLocationPrimary(address);
  // Section 19: subtle "Updating location…" only while the first address is still resolving;
  // once we have a real address/state, show that instead of a spinner.
  // Never fall back to raw GPS text in the header secondary line.
  const locationSecondary =
    !address && refining
      ? "Updating location…"
      : stateCandidate && !isRawCoordinateText(stateCandidate)
        ? stateCandidate
        : refining
          ? "Updating location…"
          : "Turn on location for accurate address";
  const { data: weather, isFetching: weatherFetching } = useLocationWeather(weatherParams);

  const hasLiveWeather =
    weather != null && weather.temperatureC != null && Number.isFinite(weather.temperatureC);
  const showWeatherBlock = hasLiveWeather || (coords != null && weatherFetching && !hasLiveWeather);
  const { promoCardH, serviceCardH, brandH } = useHomeScreenLayout(showWeatherBlock);

  const offerLocationParams = useMemo(
    () =>
      normalizeOfferLocationParams({
        pincode: address?.pincode?.trim() || undefined,
        state: address?.state?.trim() || undefined,
        city: address?.city?.trim() || undefined,
        lat: coords?.latitude,
        lng: coords?.longitude,
      }),
    [
      address?.pincode,
      address?.state,
      address?.city,
      coords?.latitude,
      coords?.longitude,
    ]
  );

  // FeaturedOffersPrefetch already warms home offers; this hook only observes.
  const { data: featuredOffersData } = useFeaturedOffersHome(
    offerLocationParams,
    locationHydrated
  );

  // Home header always owns safe-top padding — keep root spacer off so first
  // paint never races splash/bootstrap (spacer 0 + header GAP-only = overlap).
  useFocusEffect(
    useCallback(() => {
      NativeStatusBar.setHidden(false, "none");
      if (Platform.OS === "android") {
        // Edge-to-edge: stay translucent so we only pad once via insets.top
        // (non-translucent + insets.top double-spaced the header under the clock).
        NativeStatusBar.setTranslucent(true);
        NativeStatusBar.setBackgroundColor("transparent", true);
        NativeStatusBar.setBarStyle("dark-content", true);
      }
      useScreenChromeStore.setState({
        statusBarBackground: STATUS_CHROME,
        statusBarStyle: "dark",
        hideStatusBarSpacer: true,
      });
      resetFoodHomeListScrollGuard();
      // Only remount tiles after idle resume via AppState — not every focus (avoids UI flash).
      prioritizeVisibleMerchantBanners(12);
      warmFoodHomeEntry();
      const now = Date.now();
      if (now - lastBlocksRefetchRef.current > 60_000) {
        lastBlocksRefetchRef.current = now;
        void queryClient.invalidateQueries({
          queryKey: CUSTOMER_SERVICE_BLOCKS_QUERY_KEY,
          refetchType: "active",
        });
      }
    }, [queryClient])
  );

  useEffect(() => {
    const onAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      resetFoodHomeListScrollGuard();
      setServicesTouchEpoch((n) => n + 1);
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.container}>
      {/* Location header only — plain sticky, no shadow. Weather scrolls with body. */}
      <View style={styles.stickyHeader} pointerEvents="box-none">
        <HomeLocationHeader
          locationPrimary={locationPrimary}
          locationSecondary={locationSecondary}
          onLocationPress={() => router.push("/location")}
          onNotificationPress={() => router.push("/notifications")}
        />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          // Clearance so last content can scroll above the floating capsule.
          { paddingBottom: resolveCustomerBottomNavHeight(insets.bottom) + 20 },
        ]}
        scrollEnabled
        bounces
        alwaysBounceVertical
        overScrollMode="always"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={GatiMitraColors.splashMint}
            colors={[GatiMitraColors.splashMint]}
          />
        }
      >
        <HomeWeatherBanner
          weather={weather}
          loading={coords != null && weatherFetching && !hasLiveWeather}
          onWeatherPress={() => setWeatherSheetVisible(true)}
        />

        <HomePromoCarousel
          offers={featuredOffersData?.offers}
          cardHeight={promoCardH}
          mode="home"
          showDefaultWhenEmpty
        />

        <HomeServicesRow
          key={`home-services-${servicesTouchEpoch}`}
          cardHeight={serviceCardH}
          enabledServices={homeEnabledServices}
          accountBlocks={accountBlocks}
          onAccountBlockedPress={(_id, reason, label, assetKey) =>
            openBlockSheet({ serviceLabel: label, reason, serviceAssetKey: assetKey })
          }
        />

        <View style={styles.brandSpacer} />
        <HomeBrandBanner bannerHeight={brandH} />
      </ScrollView>

      <WeatherDetailsSheet
        visible={weatherSheetVisible}
        weather={weather}
        onClose={() => setWeatherSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  stickyHeader: {
    zIndex: 30,
    backgroundColor: PAGE_BG,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingTop: 0,
    flexGrow: 1,
  },
  brandSpacer: {
    height: 16,
  },
});
