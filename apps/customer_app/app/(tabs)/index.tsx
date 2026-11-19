/**
 * Home – GatiMitra reference UI: header, weather, promo, services, brand banner.
 * Content scrolls independently under a true floating bottom nav.
 */

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar as NativeStatusBar,
  Platform,
  AppState,
  InteractionManager,
  type AppStateStatus,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { StatusBar } from "expo-status-bar";
import { GatiMitraColors } from "@/constants/gatimitra";
import { resolveCustomerBottomNavHeight } from "@/constants/layout";
import { HOME_DARK } from "@/constants/homeDarkTheme";
import { NATURAL_VERTICAL_SCROLL_PROPS } from "@/lib/naturalScrollProps";
import { HomeLocationHeader, HomeWeatherBanner } from "@/components/home/HomeScreenHeader";
import { HomeLocationHeaderSkeleton } from "@/components/home/HomeTabSkeletons";
import { HomeServicesRow } from "@/components/home/HomeServicesRow";
import { HomePromoCarousel } from "@/components/home/HomePromoCarousel";
import { HomeBrandBanner } from "@/components/home/HomeBrandBanner";
import { HomeAdsStrip } from "@/components/HomeAdsStrip";
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
import { useLocationWeather } from "@/hooks/useLocationWeather";
import {
  resolveHomeLocationPrimary,
  resolveHomeLocationSecondary,
  resolveHomeWeatherQueryParams,
} from "@/lib/weather-location";
import { resolveDeliveryLocationLabel } from "@/lib/resolveDeliveryLocationLabel";
import { useAddresses } from "@/hooks/useAddresses";
import { normalizeOfferLocationParams } from "@/lib/featuredOfferGeo";
import { reloadCustomerAppAssets, useAppAssetsStore } from "@/store/appAssetsStore";
import { useNearbyGroceryAvailability } from "@/hooks/useNearbyGroceryAvailability";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { prioritizeVisibleMerchantBanners } from "@/lib/prefetchMerchantBanners";
import { resetFoodHomeListScrollGuard } from "@/lib/foodHomeScrollGuard";
import { warmFoodHomeEntry } from "@/lib/navigateToFoodHome";
import { useTabScreenDebug } from "@/lib/tabNavDebug";
import { markInitialShellReady } from "@/lib/startupShellReady";
import { isSessionGpsBootstrapActive } from "@/lib/sessionLocationBootstrap";
import { startupLaunchLog, startupProcessAgeMs } from "@/lib/startupPerf";
import {
  collectCriticalHomeAssetUris,
  prefetchBrandBannerImageSync,
} from "@/lib/homeCriticalAssets";
import { enqueueImagePrefetchFront } from "@/lib/prefetchQueue";
import { useHomeSkeletonFlags } from "@/hooks/useHomeSkeletonFlags";
import { homeSkeletonLog } from "@/lib/homeSkeletonTelemetry";

/** Tabs Home — softer dark shell (not pure black). */
const PAGE_BG = HOME_DARK.page;
const STATUS_CHROME = HOME_DARK.page;
export default function HomeScreen() {
  useTabScreenDebug("index");
  const insets = useAppSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const shellMarkedRef = useRef(false);

  const markHomeShellReady = useCallback((reason: string) => {
    if (shellMarkedRef.current) return;
    shellMarkedRef.current = true;
    markInitialShellReady(reason);
  }, []);

  // Commit-time signal — don't wait for onLayout when Home is already mounted under splash.
  useLayoutEffect(() => {
    markHomeShellReady("home-layout-effect");
  }, [markHomeShellReady]);

  const onHomeShellLayout = useCallback(() => {
    markHomeShellReady("home");
  }, [markHomeShellReady]);
  const [refreshing, setRefreshing] = useState(false);
  const [weatherSheetVisible, setWeatherSheetVisible] = useState(false);
  /** Remount service grid after idle/resume — Android ScrollView+RefreshControl can eat taps. */
  const [servicesTouchEpoch, setServicesTouchEpoch] = useState(0);
  const assets = useAppAssetsStore((s) => s.assets);
  const assetsLoaded = useAppAssetsStore((s) => s.loaded);
  const openBlockSheet = useCustomerServiceBlockSheetStore((s) => s.open);
  // Throttle the on-focus service-blocks refetch: returning to Home (e.g. rapid tab
  // toggling) previously fired a network invalidation + re-render every single time.
  const lastBlocksRefetchRef = useRef(0);
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const locationSource = useLocationStore((s) => s.locationSource);
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);
  const permissionStatus = useLocationStore((s) => s.permissionStatus);
  const locationLoading = useLocationStore((s) => s.loading);
  const locationError = useLocationStore((s) => s.error);
  const detectingTimedOut = useLocationStore((s) => s.detectingTimedOut);
  const requestPermissionAndFetch = useLocationStore((s) => s.requestPermissionAndFetch);
  const refetchLocation = useLocationStore((s) => s.refetchLocation);

  useEffect(() => {
    const renderT0 = Date.now();
    startupLaunchLog("HOME_MOUNT", { blocksHome: false });
    startupLaunchLog("HOME_FIRST_RENDER", { blocksHome: false });
    // Prefer InteractionManager — double-rAF was starved 30s+ when Metro/GPS
    // flooded the JS queue, falsely reporting a late usable frame.
    const task = InteractionManager.runAfterInteractions(() => {
      const sinceFirstRenderMs = Date.now() - renderT0;
      startupLaunchLog("HOME_FIRST_USABLE_FRAME", {
        sinceFirstRenderMs,
        ageMs: startupProcessAgeMs(),
        blocksHome: false,
      });
      if (sinceFirstRenderMs > 3000) {
        startupLaunchLog("STARTUP_BLOCKER", {
          stage: "home_first_usable_late",
          durationMs: sinceFirstRenderMs,
          budgetMs: 3000,
          blocksHome: false,
        });
      }
    });
    return () => task.cancel();
  }, []);

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

  const gpsKickRef = useRef(false);
  useEffect(() => {
    if (!locationHydrated) return;
    // Explicit delivery pin — never force GPS over it (Stage B / reconcile own policy).
    if (locationSource === "selected" && coords) return;
    if (gpsKickRef.current && coords) return;
    // Early kick / Stage B already owns the process GPS session — don't storm readiness.
    if (isSessionGpsBootstrapActive()) {
      gpsKickRef.current = true;
      return;
    }
    // Prefer a short timeout over InteractionManager — continuous Reanimated + GPS
    // can starve runAfterInteractions for a long time on release builds.
    const timer = setTimeout(() => {
      const loc = useLocationStore.getState();
      if (loc.locationSource === "selected" && loc.coords) return;
      if (gpsKickRef.current && loc.coords) return;
      if (isSessionGpsBootstrapActive()) {
        gpsKickRef.current = true;
        return;
      }
      gpsKickRef.current = true;
      // Never forceDevice here — selected delivery pins are owned by Stage B / reconcile.
      void requestPermissionAndFetch({ forceDevice: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [locationHydrated, locationSource, coords, requestPermissionAndFetch]);

  // Food JS chunk ASAP — do not wait for InteractionManager (that was the Suspense blank).
  useEffect(() => {
    void import("@/lib/foodHomeScreenModule")
      .then((m) => m.preloadFoodHomeScreen())
      .catch(() => {});
    // Merchants/imagery after paint so Home stays responsive.
    const task = InteractionManager.runAfterInteractions(() => {
      warmFoodHomeEntry();
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    if (!locationHydrated) return;
    if (coords?.latitude == null || coords?.longitude == null) return;
    const task = InteractionManager.runAfterInteractions(() => {
      warmFoodHomeEntry();
    });
    return () => task.cancel();
  }, [locationHydrated, coords?.latitude, coords?.longitude]);

  const { data: addresses = [] } = useAddresses();
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
  const locationPrimary = useMemo(() => {
    const resolved = resolveDeliveryLocationLabel({
      locationSource,
      address,
      addresses,
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
    addresses,
    coords,
    permissionStatus,
    locationLoading,
    locationError,
    detectingTimedOut,
  ]);

  useEffect(() => {
    if (!locationPrimary) return;
    if (locationPrimary.toLowerCase().startsWith("detecting")) return;
    startupLaunchLog("HOME_LOCATION_UPDATED", { label: locationPrimary.slice(0, 48) });
  }, [locationPrimary]);

  const locationSecondary = resolveHomeLocationSecondary(
    address,
    locationPrimary,
    coords != null
  );
  const { data: weather, isPending: weatherPending } = useLocationWeather(weatherParams);
  // Layout always reserves weather height — header never uses skeleton chrome.
  const { promoCardH, serviceCardH, brandH } = useHomeScreenLayout(true);

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
  const {
    data: featuredOffersData,
    isFetched: offersFetched,
    isPending: offersPending,
  } = useFeaturedOffersHome(offerLocationParams, locationHydrated);

  const hasWeatherCoords =
    weatherParams.lat != null &&
    weatherParams.lng != null &&
    Number.isFinite(weatherParams.lat) &&
    Number.isFinite(weatherParams.lng);
  // Skeleton until location is known, then until weather paints (or no coords to fetch).
  const weatherReady =
    locationHydrated &&
    (!hasWeatherCoords || weather != null || (!weatherPending && weather === undefined));
  // Skeleton until location enables the query, then until cache/network delivers offers.
  // Do NOT treat "not hydrated yet" as resolved — that skipped promo skeletons.
  const offersResolved =
    locationHydrated && (featuredOffersData != null || offersFetched || !offersPending);

  const {
    forceSkeletons,
    showLocationSkeleton,
    showWeatherSkeleton,
    showPromoSkeleton,
    showServicesSkeleton,
    splashExited,
  } = useHomeSkeletonFlags({
    offersResolved,
    assetsReady: assetsLoaded,
    locationReady: locationHydrated,
    weatherReady,
  });

  useEffect(() => {
    if (!splashExited) return;
    homeSkeletonLog("CONTENT_RENDERED", "location", "home_shell_after_splash", {
      forceSkeletons,
      showPromoSkeleton,
      showServicesSkeleton,
      showWeatherSkeleton,
    });
  }, [
    splashExited,
    forceSkeletons,
    showPromoSkeleton,
    showServicesSkeleton,
    showWeatherSkeleton,
  ]);

  // Home header always owns safe-top padding — keep root spacer off so first
  // paint never races splash/bootstrap (spacer 0 + header GAP-only = overlap).
  useFocusEffect(
    useCallback(() => {
      const applyHomeStatusBar = () => {
        NativeStatusBar.setHidden(false, "none");
        NativeStatusBar.setBarStyle("light-content", true);
        if (Platform.OS === "android") {
          // Match Home page chrome — white icons on dark shell.
          NativeStatusBar.setTranslucent(true);
          NativeStatusBar.setBackgroundColor(STATUS_CHROME, true);
        }
        useScreenChromeStore.setState({
          statusBarBackground: STATUS_CHROME,
          statusBarStyle: "light",
          hideStatusBarSpacer: true,
        });
      };
      // Apply now, then again after sibling tab cleanups / root chrome settle
      // (Profile/Orders used to leave dark-content and win the race).
      applyHomeStatusBar();
      const t0 = setTimeout(applyHomeStatusBar, 0);
      const t1 = setTimeout(applyHomeStatusBar, 64);
      const task = InteractionManager.runAfterInteractions(applyHomeStatusBar);

      resetFoodHomeListScrollGuard();
      // Only remount tiles after idle resume via AppState — not every focus (avoids UI flash).
      prioritizeVisibleMerchantBanners(12);
      warmFoodHomeEntry();
      const now = Date.now();
      if (now - lastBlocksRefetchRef.current > 180_000) {
        lastBlocksRefetchRef.current = now;
        void queryClient.invalidateQueries({
          queryKey: CUSTOMER_SERVICE_BLOCKS_QUERY_KEY,
          refetchType: "active",
        });
      }

      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
        task.cancel?.();
      };
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

  // Decode footer brand scooter first, then the rest of critical Home art.
  useLayoutEffect(() => {
    prefetchBrandBannerImageSync(assets);
    const critical = collectCriticalHomeAssetUris(assets);
    if (critical.length > 0) enqueueImagePrefetchFront(critical, critical.length);
  }, [assets]);

  return (
    <View style={styles.container} onLayout={onHomeShellLayout}>
      {/* Only while focused — Profile's mounted StatusBar(dark) was winning the race. */}
      {isFocused ? (
        <StatusBar style="light" backgroundColor={STATUS_CHROME} translucent />
      ) : null}
      {/* Location header only — plain sticky, no shadow. Weather scrolls with body. */}
      <View style={styles.stickyHeader} pointerEvents="box-none">
        {showLocationSkeleton ? (
          <HomeLocationHeaderSkeleton reason="awaiting_location_hydrate" />
        ) : (
          <HomeLocationHeader
            locationPrimary={locationPrimary}
            locationSecondary={locationSecondary}
            onLocationPress={() => {
              const loc = useLocationStore.getState();
              // Permission / GPS off → show enable popup; otherwise open location picker.
              if (
                loc.permissionStatus !== "granted" ||
                loc.showPermissionModal ||
                (!loc.coords && loc.detectingTimedOut)
              ) {
                // Explicit header tap — always allow the sheet even after dismiss.
                void loc.promptLocationPermissionIfNeeded({
                  forceFromUser: true,
                  skipDeviceFetch: true,
                });
                loc.setShowPermissionModal(true);
                return;
              }
              router.push("/location");
            }}
            onNotificationPress={() => router.push("/notifications")}
          />
        )}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          // Clear the floating tab sheet — brand card keeps magicpin height (no tab pad inside).
          { paddingBottom: resolveCustomerBottomNavHeight(insets.bottom) + 10 },
        ]}
        {...NATURAL_VERTICAL_SCROLL_PROPS}
        scrollEnabled
        bounces
        alwaysBounceVertical
        // Always allow overscroll so a short page still accepts vertical finger drags.
        overScrollMode="always"
        // Do not use removeClippedSubviews — it breaks vertical scroll + RefreshControl
        // on Android when nested horizontal carousels are present.
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={GatiMitraColors.splashMint}
            colors={[GatiMitraColors.splashMint]}
          />
        }
      >
        {/* Weather / promo / services paint progressively over skeletons. */}
        <HomeWeatherBanner
          weather={weather}
          loading={showWeatherSkeleton}
          onWeatherPress={() => setWeatherSheetVisible(true)}
        />

        <HomeAdsStrip placement="home" />

        <HomePromoCarousel
          offers={featuredOffersData?.offers}
          cardHeight={promoCardH}
          mode="home"
          showDefaultWhenEmpty
          skeletonWhileLoading={showPromoSkeleton}
        />

        <HomeServicesRow
          key={`home-services-${servicesTouchEpoch}`}
          cardHeight={serviceCardH}
          enabledServices={homeEnabledServices}
          accountBlocks={accountBlocks}
          skeleton={showServicesSkeleton}
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
    // Avoid flexGrow:1 — on Android it can collapse scroll range when content
    // is fitted to one screen, so vertical finger gestures feel dead.
    flexGrow: 0,
  },
  brandSpacer: {
    height: 8,
  },
});
