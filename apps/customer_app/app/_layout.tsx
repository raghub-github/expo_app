/**
 * Root layout - providers, theme, and stack navigation.
 * Hydrates auth and cart before showing main UI.
 */

import "react-native-gesture-handler";
import "../global.css";
import { Stack, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import { Lora_400Regular, Lora_700Bold } from "@expo-google-fonts/lora";
import { Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as SplashScreen from "expo-splash-screen";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useLayoutEffect, useCallback, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  LogBox,
  Alert,
  AppState,
  Platform,
  Dimensions,
  StatusBar as NativeStatusBar,
  type AppStateStatus,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";
import { QueryClientProvider, focusManager, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { useRecentlyRemovedStore } from "@/store/recentlyRemovedStore";
import { useLanguageStore } from "@/store/languageStore";
import { useLocationStore, getDeviceLocationReadiness, coordsMovedSignificantly } from "@/store/locationStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { useFavoriteLocationsStore } from "@/store/favoriteLocationsStore";
import { pullSavedPlacesFromServer } from "@/lib/savedPlacesSync";
import { debouncedInvalidateFoodHomeListingQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import { reconcileActiveLocationFromGps } from "@/lib/reconcileActiveLocationFromGps";
import { runExclusiveActiveLocationReconcile } from "@/lib/activeLocationReconcileGate";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useStoreStatusRealtime } from "@/hooks/useStoreStatusRealtime";
import { usePreventServicesRealtime } from "@/hooks/usePreventServicesRealtime";
import { useRiderOnlineCheckRealtime } from "@/hooks/useRiderOnlineCheckRealtime";
import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { useActiveOrdersHydration } from "@/hooks/useActiveOrdersHydration";
import { LocationWatchSync } from "@/components/LocationWatchSync";
import { CustomerResumeReconcile } from "@/components/CustomerResumeReconcile";
import { CustomerPermissionSheetsHost } from "@/components/CustomerPermissionSheetsHost";
import { ServiceBlockedGateHost } from "@/components/ServiceBlockedGateHost";
import { CustomerAccountBlockedGateHost } from "@/components/CustomerAccountBlockedGateHost";
import { CustomerServiceBlockSheetHost } from "@/components/CustomerServiceBlockSheetHost";
import { CustomerServiceBlocksSync } from "@/components/CustomerServiceBlocksSync";
import { useSmsPermissionStore } from "@/store/smsPermissionStore";
import { GlobalFloatingCart } from "@/components/GlobalFloatingCart";
import { FlashSaleQtyLimitSheetHost } from "@/components/store/FlashSaleQtyLimitSheetHost";
import { ClassicFloatingSearchPill } from "@/components/home/ClassicFloatingSearchPill";
import { AppAlertModal } from "@/components/AppAlertModal";
import { AbandonedCartReminderBootstrap } from "@/components/AbandonedCartReminderBootstrap";
import { MerchantNavTransitionShutter } from "@/components/MerchantNavTransitionShutter";
import { CheckoutBottomSheetHost } from "@/components/checkout/CheckoutBottomSheetHost";
import { CheckoutPaymentFailureHost } from "@/components/checkout/CheckoutPaymentFailedSheet";
import { CartCheckoutGateHost } from "@/components/cart/CartCheckoutGateHost";
import { CartUpdatedModal } from "@/components/cart/CartUpdatedModal";
import { CustomerSystemChrome } from "@/components/CustomerSystemChrome";
import { AndroidSystemNavigationFill } from "@/components/AndroidSystemNavigationFill";
import { StatusBarRouteChromeGuard } from "@/components/StatusBarRouteChromeGuard";
import { AuthNavigationGate } from "@/components/AuthNavigationGate";
import { GatiMitraBootstrapScreen } from "@/components/GatiMitraBootstrapScreen";
import { setOnSessionRevoked } from "@/services/api";
import { PushNotificationBootstrap } from "@/components/PushNotificationBootstrap";
import { PlayInAppUpdateBootstrap } from "@/components/PlayInAppUpdateBootstrap";
import { LiveOrderProgressNotification } from "@/components/LiveOrderProgressNotification";
import { LegalConsentGate } from "@/components/LegalConsentGate";
import { AddressesPrefetch } from "@/components/AddressesPrefetch";
import { FeaturedOffersPrefetch } from "@/components/FeaturedOffersPrefetch";
import { WeatherPrefetch } from "@/components/WeatherPrefetch";
import { WeatherRealtimeSync } from "@/components/WeatherRealtimeSync";
import * as Linking from "expo-linking";
import { resumePendingAddressShare, storePendingAddressShareToken, peekPendingAddressShareToken } from "@/lib/pendingAddressShare";
import {
  canResumeConfirmingAfterColdStart,
  clearPendingCheckoutPayment,
  peekPendingCheckoutPayment,
} from "@/lib/pendingCheckoutPayment";
import { orderService } from "@/services/order.service";
import { extractAddressShareToken } from "@/lib/addressShareLink";
import { extractRestaurantShareSlug } from "@/lib/restaurantShareLink";
import {
  geoOpenToLocationMapPath,
  isGeoOrMapsOpenPath,
  parseGeoOpenLink,
} from "@/lib/geoOpenLink";
import {
  clearPendingReferral,
  peekPendingReferral,
} from "@/lib/pendingReferral";
import { capturePlayInstallReferrerOnce } from "@/lib/playInstallReferrer";
import { referralService } from "@/services/referral.service";
import { extendStartupApiGate } from "@/lib/startup-api-gate";
import { startupLaunchLog, startupMeasure } from "@/lib/startupPerf";
import { resetInitialShellReady, useInitialShellReady } from "@/lib/startupShellReady";
import {
  ensureSplashHardDeadlineArmed,
  isSplashExited,
  markSplashArmed,
  markSplashExited,
  SPLASH_SHELL_SOFT_MS,
  useSplashDeadlineHit,
} from "@/lib/splashLifecycle";
import { hasCompletedProfileSync, readCachedProfile } from "@/lib/profileCache";
import { hrefForRequestedPrimaryTab } from "@/lib/customerPrimaryTabNav";
import {
  bootstrapFreshDeviceLocation,
  bootstrapLastKnownLocation,
  kickEarlyFreshGpsIfReady,
} from "@/lib/sessionLocationBootstrap";
import { STORAGE_KEYS } from "@/constants";
import { hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
// Side-effect: sync-seed category metadata + last-good / local image maps before home mounts.
import "@/lib/categoryImageLastGood";
import "@/lib/categoryImageFileCache";
import "@/lib/userAppCategoryCache";
import { UserAppCategoriesPrefetch } from "@/components/UserAppCategoriesPrefetch";
import { ProfilePrefetch } from "@/components/ProfilePrefetch";
import { WalletBalancePrefetch } from "@/components/WalletBalancePrefetch";
import { SubscriptionPlansPrefetch } from "@/components/SubscriptionPlansPrefetch";
import { FoodHomeLayoutPrefetch } from "@/components/FoodHomeLayoutPrefetch";
import { AppAssetsPrefetch } from "@/components/AppAssetsPrefetch";
import { profileService } from "@/services/profile.service";
import {
  getContactsPermissionGranted,
  getSmsPermissionGranted,
} from "@/lib/device-permissions";
import { GatiMitraColors } from "@/constants/gatimitra";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";
import { useDiscoveryLayout } from "@/hooks/useDiscoveryLayout";
import { colors } from "@/theme";
import { resolveTopSafeInset, DEFAULT_STATUS_BAR_HEIGHT, DEFAULT_ANDROID_NAV_BOTTOM_INSET } from "@/constants/layout";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import "@/lib/i18n";
import { setAppLanguage } from "@/lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isStaleLanApiOverride, setRuntimeApiBaseUrl } from "@/config/env";
import { ensureMapboxSearchReady } from "@/services/location.service";
import { restoreAndPrefetchLocationWeather } from "@/hooks/useLocationWeather";
import { prefetchHomeScreenData } from "@/lib/prefetchHomeScreenData";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { resolveMapImageDataUri } from "@/lib/map-webview-image-uri";
import { resolveNearbyRiderMarkerImage } from "@/features/ride/rideOptionAssets";
import { AppErrorBoundary, AppErrorFallback } from "@/components/AppErrorBoundary";
import { installGlobalErrorHandlers, reportHandledError } from "@/lib/crashReporting";
import { installReleaseConsoleSilencer } from "@/lib/releaseConsole";
import { subscribeConfirmedAppState } from "@/lib/confirmedAppState";

// Installed at module scope so a throw in the very first render is already covered.
installGlobalErrorHandlers();
installReleaseConsoleSilencer();

/** Isolates cart dock crashes so overlay-hosts stay up; resets when cart changes. */
function FloatingCartErrorBoundary() {
  const resetKey = useCartStore((s) => `${s.merchantId ?? ""}:${s.items.length}:${s.lastUpdatedAt}`);
  return (
    <AppErrorBoundary source="floating-cart" resetKey={resetKey} fallback={() => null}>
      <GlobalFloatingCart />
    </AppErrorBoundary>
  );
}
/** Storage key used by the in-app "Configure API URL" sheet on the login screen. */
const API_URL_OVERRIDE_KEY = "dev.apiBaseUrl";

function getSafeAreaInitialMetrics() {
  if (initialWindowMetrics?.insets) return initialWindowMetrics;
  if (Platform.OS !== "android") return undefined;
  const { width, height } = Dimensions.get("window");
  return {
    frame: { x: 0, y: 0, width, height },
    insets: {
      top: NativeStatusBar.currentHeight ?? DEFAULT_STATUS_BAR_HEIGHT,
      left: 0,
      right: 0,
      bottom: DEFAULT_ANDROID_NAV_BOTTOM_INSET,
    },
  };
}
const SPLASH_CHROME_COLOR = "#14b8a6";
/** Process-lifetime guard so RootLayout remounts do not re-stack cold-start I/O. */
let coldStartBootstrapArmed = false;

/**
 * Perceived-luminance test so status-bar icons ALWAYS contrast with their
 * background (dark icons on light bars, light icons on dark bars) — the bar is
 * never invisible / blended into the page regardless of what a screen set.
 */
function isLightBarColor(color: string): boolean {
  const hex = (color || "").replace("#", "").trim();
  if (hex.length < 6) return true; // default/transparent → treat as light (white)
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return true;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

// App-wide invariant: the system status bar is never hidden, including startup.
NativeStatusBar.setHidden(false, "none");
if (Platform.OS === "android") {
  NativeStatusBar.setBarStyle("light-content", true);
}

// Restore the API URL override BEFORE any module-level code makes a request.
// This runs at JS load time, not in a useEffect, so the override is in place
// before React starts rendering (and well before the first OTP send).
void (async () => {
  try {
    ensureMapboxSearchReady();
    const stored = await AsyncStorage.getItem(API_URL_OVERRIDE_KEY);
    if (stored && stored.trim().length > 0) {
      // Drop stale Wi‑Fi IPs left from a previous network (e.g. 10.25.x → 10.205.x).
      if (isStaleLanApiOverride(stored)) {
        await AsyncStorage.removeItem(API_URL_OVERRIDE_KEY);
        return;
      }
      // Dev builds follow .env.local. A saved production URL was sending checkout
      // to api.gatimitra.com, so Super Admin inactive rules never applied.
      if (__DEV__ && /api\.gatimitra\.com/i.test(stored)) {
        await AsyncStorage.removeItem(API_URL_OVERRIDE_KEY);
        return;
      }
      setRuntimeApiBaseUrl(stored);
      // eslint-disable-next-line no-console
      console.log("[env] using stored API base URL override:", stored);
    }
  } catch {
    /* AsyncStorage unavailable on first launch; ignore */
  }
})();

// Prime Android launch chrome as early as JS can run.
// Splash may briefly use brand mint; CustomerSystemChrome switches to system theme after bootstrap.
void (async () => {
  if (Platform.OS !== "android") return;
  try {
    NativeStatusBar.setHidden(false, "none");
    NativeStatusBar.setBarStyle("light-content", true);
    const { applyAndroidNavigationChrome } = await import("@/lib/androidEdgeToEdgeChrome");
    await applyAndroidNavigationChrome();
  } catch {
    // Keep startup resilient; config-plugin defaults still apply natively.
  }
})();

// Suppress benign console warnings
LogBox.ignoreLogs([
  "Unable to activate keep awake",
  "Unable to deactivate keep awake",
  "SafeAreaView has been deprecated",
  "Require cycles are allowed",
  "[Worklets] Tried to modify key `current`",
  "VirtualizedList: You have a large list that is slow to update",
  "expo-notifications",
  "Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go",
]);

// Keep the native mint splash until the JS brand layer has laid out.
// Do NOT hide here — early hide caused mint → black/blank → mint flashes.
void SplashScreen.preventAutoHideAsync().catch(() => {});
ensureSplashHardDeadlineArmed();
startupLaunchLog("NATIVE_SPLASH_VISIBLE");

// Singleton lives in @/lib/queryClient so logout/customer-scope teardown can
// clear it from outside the React tree.

export default function RootLayout() {
  // Brand fonts first — icon font maps are large and must not delay splash exit.
  const [brandFontsLoaded] = useFonts({
    Lora_400Regular,
    Lora_700Bold,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [iconFontsLoaded] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });
  // Keep icon font load warm; brand fonts alone drive splash typography polish.
  void iconFontsLoaded;
  const hardDeadlineHit = useSplashDeadlineHit();
  const router = useRouter();
  const segments = useSegments() as string[];
  // Survive Fast Refresh — remounting with exited=false re-covered Home then
  // force-dismissed onto blank Index mint.
  const [splashExited, setSplashExited] = useState(() => isSplashExited());
  const [homeDataPrefetched, setHomeDataPrefetched] = useState(false);
  const rootSegment = segments[0] ?? "";
  const onRootIndexHold = !rootSegment || rootSegment === "index";

  // Only reset shell gate on a true cold construct — never after splash has left
  // (globalThis flag survives Fast Refresh; module `let` did not).
  const shellGateResetRef = useRef(false);
  if (!shellGateResetRef.current) {
    shellGateResetRef.current = true;
    if (!isSplashExited()) {
      resetInitialShellReady("root-layout-construct", { silent: true });
    }
  }
  const initialShellReady = useInitialShellReady();

  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);
  const assetsLoaded = useAppAssetsStore((s) => s.loaded);
  const homeImagesPrefetched = useAppAssetsStore((s) => s.homeImagesPrefetched);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateCart = useCartStore((s) => s.hydrate);
  const hydrateRecentlyRemoved = useRecentlyRemovedStore((s) => s.hydrate);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const hydrateRecentLocations = useRecentLocationStore((s) => s.hydrate);
  const hydrateFavoriteLocations = useFavoriteLocationsStore((s) => s.hydrate);

  // Auth session restore alone unblocks the navigator. Cart / GPS / weather /
  // fonts-of-icons / network must never gate Home.
  const criticalReady = hydrated;
  // Never dismiss onto root Index mint hold — wait until Home/Login/Onboarding.
  const destinationReady =
    criticalReady && initialShellReady && !onRootIndexHold;
  const appReady = destinationReady;
  /** Keep GatiMitra mint branding up until Home/Login is actually underneath. */
  const showBrandedCover = !destinationReady || !splashExited;

  const dismissBrandingSplash = useCallback((reason: string) => {
    const first = markSplashExited(reason);
    setSplashExited(true);
    if (!first) return;
    startupMeasure("branding_splash_exit", "process_start");
    // Branded-layer on-screen duration (excludes native-only time before JS brand).
    startupMeasure("splash_visible_duration", "branding_visible");
    startupMeasure("usable_home_ready", "process_start");
    startupLaunchLog("BRANDED_SPLASH_DISMISS", {
      reason,
      blocksHome: true,
    });
    void SplashScreen.hideAsync().catch(() => {});
    // Non-blocking map asset warm — must not sit on the dismiss path.
    void resolveMapImageDataUri(resolveNearbyRiderMarkerImage("bike")).catch(() => {});
  }, []);

  const handleSplashReady = useCallback(() => {
    startupMeasure("native_splash_hide", "process_start");
    startupLaunchLog("NATIVE_SPLASH_HIDE", {
      phase: "js_brand_laid_out",
      blocksHome: false,
    });
    // Native splash can hide once JS brand is up — JS mint cover still owns the frame.
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  /** Visual fade only — parent useLayoutEffect owns real dismiss (avoids 7s dual-path lag). */
  const handleSplashExitComplete = useCallback(() => {
    if (!splashExited) dismissBrandingSplash("bootstrap_exit_complete");
  }, [dismissBrandingSplash, splashExited]);

  useEffect(() => {
    startupLaunchLog("ROOT_LAYOUT_READY", { blocksHome: true });
  }, []);

  useEffect(() => {
    // Process-once — Fast Refresh / Strict Mode remounts were re-entering this
    // effect and stacking AsyncStorage work (duplicate AUTH_RESTORE / CART_HYDRATE).
    if (coldStartBootstrapArmed) return;
    coldStartBootstrapArmed = true;
    void (async () => {
      startupLaunchLog("AUTH_RESTORE_START", { blocksHome: true });
      const authT0 = Date.now();
      // Auth alone is the splash critical path. Profile / location / cart must not
      // inflate AUTH_RESTORE_DONE (Promise.all with profileWarm caused 15–32s).
      void hydrateFastKvFromAsyncStorage([
        STORAGE_KEYS.PROFILE_CACHE,
        STORAGE_KEYS.AUTH_SESSION,
      ]).catch(() => {});
      // Stage A last-known is sync-peek first — safe alongside auth (no weather await).
      void bootstrapLastKnownLocation().then(() => {
        const { coords, address } = useLocationStore.getState();
        if (coords) {
          void restoreAndPrefetchLocationWeather(queryClient, address, coords);
        }
        // Retry GPS right after cache paint — permission APIs are often ready by then.
        void kickEarlyFreshGpsIfReady();
      });
      // Fresh GPS in parallel with auth when permission already granted — do not wait
      // for splash, weather, cart, profile, banners, or reverse geocode.
      void kickEarlyFreshGpsIfReady();
      // Short retries — Expo Go permission/services probes can miss on the first tick.
      const gpsRetryTimers = [1200, 3000, 5500].map((ms) =>
        setTimeout(() => {
          void kickEarlyFreshGpsIfReady();
        }, ms)
      );
      await hydrateAuth();
      for (const t of gpsRetryTimers) clearTimeout(t);
      // durationMs = local session work only (hydrated already true). ageMs is process age.
      const authMs = Date.now() - authT0;
      startupLaunchLog("AUTH_RESTORE_DONE", {
        durationMs: authMs,
        localSessionMs: authMs,
        blocksHome: true,
      });
      if (authMs > 1500) {
        startupLaunchLog("STARTUP_BLOCKER", {
          stage: "auth_restore",
          durationMs: authMs,
          blocksHome: true,
        });
      }
      // Retry if the parallel kick skipped (permission not ready yet).
      void kickEarlyFreshGpsIfReady();
      // Everything below is fire-and-forget — never gates splash / Home.
      void Promise.all([hydrateCart(), hydrateRecentlyRemoved()]).then(() => {
        startupLaunchLog("CART_HYDRATE_DONE", { blocksHome: false });
      });
      hydrateLanguage();
      void hydrateRecentLocations();
      void hydrateFavoriteLocations();
    })();
  }, [
    hydrateAuth,
    hydrateCart,
    hydrateRecentlyRemoved,
    hydrateLanguage,
    hydrateRecentLocations,
    hydrateFavoriteLocations,
    queryClient,
  ]);

  useEffect(() => {
    if (!session?.userId) return;
    void pullSavedPlacesFromServer(session.userId);
  }, [session?.userId]);

  useEffect(() => {
    // Home data prefetch is non-essential — start only after splash has left.
    if (!splashExited || !session) {
      setHomeDataPrefetched(!session);
      return;
    }
    let cancelled = false;
    setHomeDataPrefetched(false);
    void prefetchHomeScreenData(queryClient).finally(() => {
      if (!cancelled) setHomeDataPrefetched(true);
    });
    return () => {
      cancelled = true;
    };
  }, [splashExited, session, queryClient]);

  useEffect(() => {
    if (!criticalReady) return;
    startupMeasure("critical_ready", "process_start");
  }, [criticalReady]);

  // Watchdog only — never strips the branded cover into blank mint.
  useEffect(() => {
    if (!criticalReady || initialShellReady || splashExited) return;
    const timeout = setTimeout(() => {
      startupMeasure("startup_shell_timeout", "process_start");
      startupLaunchLog("STARTUP_BLOCKER", {
        stage: "shell_ready_lag",
        durationMs: SPLASH_SHELL_SOFT_MS,
        note: "cover_held_until_shell",
      });
    }, SPLASH_SHELL_SOFT_MS);
    return () => clearTimeout(timeout);
  }, [criticalReady, initialShellReady, splashExited]);

  // Absolute budget: unblock auth + kick real destination under the branded cover.
  // Never force shell-ready here — that dismissed onto blank Index mint.
  useEffect(() => {
    if (!hardDeadlineHit || splashExited) return;
    if (!criticalReady) {
      useAuthStore.getState().forceSplashUnblock();
    }
    const auth = useAuthStore.getState();
    // Kick real destination under cover — never dismiss onto Index mint.
    if (auth.session?.accessToken && onRootIndexHold) {
      if (hasCompletedProfileSync()) {
        router.replace(hrefForRequestedPrimaryTab() as never);
      } else {
        void readCachedProfile().then((profile) => {
          if (isSplashExited()) return;
          if (useAuthStore.getState().session?.accessToken == null) return;
          if (profile?.profile_completed === true) {
            router.replace(hrefForRequestedPrimaryTab() as never);
          }
        });
      }
    } else if (!auth.session?.accessToken && !auth.sessionRestorePending && onRootIndexHold) {
      router.replace("/(auth)/login");
    }
    startupLaunchLog("SPLASH_HARD_DEADLINE", {
      phase: initialShellReady && !onRootIndexHold ? "destination_ready" : "kick_destination",
      note: "cover_held_until_real_shell",
      blocksHome: true,
    });
  }, [
    hardDeadlineHit,
    criticalReady,
    initialShellReady,
    splashExited,
    onRootIndexHold,
    router,
  ]);

  // useLayoutEffect: dismiss before paint once shell is under the cover — useEffect
  // previously ran after Home's heavy commit work and left branding up ~7s.
  useLayoutEffect(() => {
    if (!appReady) return;
    markSplashArmed();
    startupMeasure("splash_fade_armed", "process_start");
    if (splashExited) return;
    dismissBrandingSplash("shell_ready");
  }, [appReady, splashExited, dismissBrandingSplash]);

  useEffect(() => {
    if (!criticalReady || session) return;
    if (assetsLoaded || homeImagesPrefetched) return;
    const timeout = setTimeout(() => {
      useAppAssetsStore.getState().setHomeImagesPrefetched(true);
    }, 5_000);
    return () => clearTimeout(timeout);
  }, [criticalReady, session, assetsLoaded, homeImagesPrefetched]);

  useEffect(() => {
    if (hydrated && useAuthStore.getState().session) {
      extendStartupApiGate(12_000);
    }
  }, [hydrated]);

  // Stage B after splash: permission sheet UX + backend selected + reconcile.
  // Fresh GPS itself starts earlier via kickEarlyFreshGpsIfReady (joined here).
  useEffect(() => {
    if (!splashExited || !hydrated) return;
    void bootstrapFreshDeviceLocation(queryClient);
  }, [splashExited, hydrated, queryClient]);

  const onLayoutRootView = useCallback(() => {
    if (criticalReady && splashExited) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore keep-awake related failures when hiding splash
      });
    }
  }, [criticalReady, splashExited]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppErrorBoundary source="app-root">
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={getSafeAreaInitialMetrics()}>
          <View
            style={{
              flex: 1,
              // Mint until branded cover is gone — softBackground here was the white flash.
              backgroundColor: showBrandedCover
                ? SPLASH_CHROME_COLOR
                : GatiMitraColors.softBackground,
            }}
          >
            {/* Home illustrations must warm DURING splash — gating this on splashExited
                left service cards + brand banner blank on first Home paint. */}
            <AppAssetsPrefetch />
            <UserAppCategoriesPrefetch />
            {/* Saved addresses during splash — Select location must never spin for known list. */}
            <AddressesPrefetch />
            {/* Warm Home progressive sections during splash — never block dismiss. */}
            <AppErrorBoundary source="home-shell-prefetch" fallback={() => null}>
              <FeaturedOffersPrefetch />
              <WeatherPrefetch />
            </AppErrorBoundary>
            {criticalReady ? (
              <>
                {/* Essential while splash covers: auth gate + navigator + chrome.
                    Heavy realtime/overlays still wait until splash exits. */}
                <AuthNavigationGate />
                <AddressShareLinkCapture />
                <CustomerSystemChrome />
                <StatusBarRouteChromeGuard />
                <NavigatorWithRecovery>
                  <RootStack onLayoutRootView={onLayoutRootView} splashActive={!splashExited} />
                </NavigatorWithRecovery>
                <AndroidSystemNavigationFill />
                {splashExited ? (
                  <>
                    <AppErrorBoundary source="background-sync" fallback={() => null}>
                      <ReactQueryFocusSync />
                      <StoreStatusRealtimeSync />
                      <PreventServicesRealtimeSync />
                      <RiderOnlineCheckRealtimeSync />
                      <OrderRealtimeSync />
                      <SessionRevokedHandler />
                      <CustomerPermissionsRealtimeSync />
                      <LocationPermissionResumeCheck />
                      <LocationWatchSync />
                      <CustomerResumeReconcile />
                      <LanguageSync />
                    </AppErrorBoundary>
                    <AppErrorBoundary source="overlay-hosts" fallback={() => null}>
                      <View
                        pointerEvents="box-none"
                        style={[StyleSheet.absoluteFillObject, { zIndex: 40, elevation: 40 }]}
                      >
                        <CheckoutBottomSheetHost />
                        <CheckoutPaymentFailureHost />
                        <CartCheckoutGateHost />
                        <CartUpdatedModal />
                        <CustomerPermissionSheetsHost />
                        <ServiceBlockedGateHost />
                        <CustomerAccountBlockedGateHost />
                        <CustomerServiceBlockSheetHost />
                        <LiveOrderProgressNotification />
                        <LegalConsentGate />
                        <MerchantNavTransitionShutter />
                      </View>
                    </AppErrorBoundary>
                    <View
                      pointerEvents="box-none"
                      style={[StyleSheet.absoluteFillObject, { zIndex: 110 }]}
                    >
                      <ClassicFloatingSearchPill />
                    </View>
                    <View
                      pointerEvents="box-none"
                      style={[StyleSheet.absoluteFillObject, { zIndex: 120 }]}
                    >
                      <FloatingCartErrorBoundary />
                    </View>
                    <View
                      pointerEvents="box-none"
                      style={[StyleSheet.absoluteFillObject, { zIndex: 400, elevation: 400 }]}
                    >
                      <FlashSaleQtyLimitSheetHost />
                    </View>
                    <AppErrorBoundary source="prefetch" fallback={() => null}>
                      <PushNotificationBootstrap />
                      <AbandonedCartReminderBootstrap />
                      <PlayInAppUpdateBootstrap />
                      <WeatherRealtimeSync />
                      <PendingAddressShareResume />
                      <PendingCheckoutPaymentResume />
                      <PendingReferralResume />
                      <FoodHomeLayoutPrefetch />
                      <ProfilePrefetch />
                      <WalletBalancePrefetch />
                      <CustomerServiceBlocksSync />
                      <SubscriptionPlansPrefetch />
                    </AppErrorBoundary>
                  </>
                ) : null}
              </>
            ) : null}
            {showBrandedCover ? (
              <GatiMitraBootstrapScreen
                variant="root"
                appReady={appReady}
                fontsReady={brandFontsLoaded}
                onSplashReady={handleSplashReady}
                onExitComplete={handleSplashExitComplete}
              />
            ) : null}
          </View>
        </SafeAreaProvider>
      </QueryClientProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}

/**
 * Expo Router renders this for any route that throws under this layout — a
 * per-screen net beneath the explicit boundaries above, so one bad screen shows
 * a retry instead of taking the process down.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    reportHandledError("expo-router-route", error);
  }, [error]);
  return <AppErrorFallback error={error} retry={retry} />;
}

function OrderRealtimeSync() {
  useActiveOrdersHydration();
  useOrderRealtime();
  return null;
}

/** Lets React Query refetch on app foreground (required on React Native). */
function ReactQueryFocusSync() {
  useEffect(() => {
    const unsubscribe = subscribeConfirmedAppState({
      onSuspend: () => focusManager.setFocused(false),
      onResume: () => focusManager.setFocused(true),
    });
    return unsubscribe;
  }, []);
  return null;
}

/** Emergency service blocks (Geo & coverage → Prevent Services) land within ~1s. */
function PreventServicesRealtimeSync() {
  usePreventServicesRealtime();
  return null;
}

/** Super Admin rider-online checkout gate — applies without app reload. */
function RiderOnlineCheckRealtimeSync() {
  useRiderOnlineCheckRealtime();
  return null;
}

function StoreStatusRealtimeSync() {
  useStoreStatusRealtime();
  const [closedAlert, setClosedAlert] = useState<{
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    useStoreStatusStore.getState().setOnStoreClosedCallback((storeId: string) => {
      const cart = useCartStore.getState();
      const slots: Array<{ id: string; name: string }> = [];
      if (cart.merchantId) {
        slots.push({
          id: cart.merchantId,
          name: (cart.merchantName ?? "").trim() || "Restaurant",
        });
      }
      for (const [id, stash] of Object.entries(cart.stashedCarts ?? {})) {
        if (!id || id === cart.merchantId) continue;
        slots.push({
          id,
          name: (stash.merchantName ?? "").trim() || "Restaurant",
        });
      }
      const hit = slots.find((s) => s.id === storeId);
      if (!hit) return;

      // Include every cart kitchen that is currently CLOSED (multi-cart).
      const closedNames = slots
        .filter((s) => {
          if (s.id === storeId) return true;
          return useStoreStatusStore.getState().getStatus(s.id) === "CLOSED";
        })
        .map((s) => s.name);

      const uniqueNames = [...new Set(closedNames)];
      const message =
        uniqueNames.length > 1
          ? `${uniqueNames.join(", ")} just closed. Ordering from these kitchens is temporarily unavailable.`
          : `${uniqueNames[0] ?? "This kitchen"} just closed. Ordering is temporarily unavailable.`;

      setClosedAlert({
        title: uniqueNames.length > 1 ? "Kitchens closed" : "Kitchen closed",
        message,
      });
    });
    return () => {
      useStoreStatusStore.getState().setOnStoreClosedCallback(null);
    };
  }, []);

  return (
    <AppAlertModal
      visible={closedAlert != null}
      title={closedAlert?.title ?? "Kitchen closed"}
      message={closedAlert?.message ?? ""}
      confirmLabel="OK"
      variant="warning"
      onClose={() => setClosedAlert(null)}
    />
  );
}

function LanguageSync() {
  const language = useLanguageStore((s) => s.language);
  const langHydrated = useLanguageStore((s) => s.hydrated);
  useEffect(() => {
    if (langHydrated) setAppLanguage(language);
  }, [langHydrated, language]);
  return null;
}

function AddressShareLinkCapture() {
  const router = useRouter();
  const initialHandledRef = useRef(false);

  useEffect(() => {
    const apply = (url: string | null, isInitial: boolean) => {
      if (url && isGeoOrMapsOpenPath(url)) {
        const parsed = parseGeoOpenLink(url);
        if (parsed) {
          if (isInitial) {
            if (initialHandledRef.current) return;
            initialHandledRef.current = true;
          }
          router.replace(geoOpenToLocationMapPath(parsed) as any);
          return;
        }
      }
      const token = extractAddressShareToken(url);
      if (token) {
        if (isInitial) {
          if (initialHandledRef.current) return;
          initialHandledRef.current = true;
        }
        void storePendingAddressShareToken(token).then(() => {
          if (!useAuthStore.getState().hydrated) return;
          if (!useAuthStore.getState().session?.accessToken) {
            router.replace("/(auth)/login");
            return;
          }
          router.replace(`/address/save?id=${encodeURIComponent(token)}`);
        });
        return;
      }
      const restaurantSlug = extractRestaurantShareSlug(url);
      if (restaurantSlug) {
        if (isInitial) {
          if (initialHandledRef.current) return;
          initialHandledRef.current = true;
        }
        router.push(`/home/merchant/${encodeURIComponent(restaurantSlug)}`);
      }
    };

    void Linking.getInitialURL().then((url) => apply(url, true));
    const sub = Linking.addEventListener("url", (event) => apply(event.url, false));
    return () => sub.remove();
  }, [router]);

  return null;
}

function PendingAddressShareResume() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated || !session?.accessToken) return;
    void resumePendingAddressShare(router);
  }, [hydrated, router, session?.accessToken]);

  return null;
}

function PendingCheckoutPaymentResume() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!hydrated || !session?.accessToken) return;
    if (attemptedRef.current) return;
    void (async () => {
      const shareToken = await peekPendingAddressShareToken();
      if (shareToken) {
        attemptedRef.current = true;
        return;
      }
      const pending = await peekPendingCheckoutPayment();
      if (!pending) {
        attemptedRef.current = true;
        return;
      }
      attemptedRef.current = true;

      // Gate on genuine attempt + backend state. Opening Razorpay/QR flips
      // paymentState → pending_confirmation server-side, but that is NOT a
      // payment attempt — only resume Confirming when we recorded one, or when
      // money is already in flight (paid / captured_unfinalized / …).
      try {
        const status = await orderService.getPendingOrderStatus(pending.pendingId);
        if (status.finalized && status.orderId) {
          await clearPendingCheckoutPayment();
          router.replace({
            pathname: "/orders/payment-success",
            params: {
              orderId: status.orderId,
              ...(pending.merchantName ? { merchantName: pending.merchantName } : {}),
              ...(pending.deliveryEtaLabel ? { deliveryEtaLabel: pending.deliveryEtaLabel } : {}),
            },
          });
          return;
        }
        if (!canResumeConfirmingAfterColdStart(pending, status.paymentState)) {
          await clearPendingCheckoutPayment();
          return;
        }
      } catch {
        // 404 / network: stale local token without a live payment — drop it.
        await clearPendingCheckoutPayment();
        return;
      }

      router.replace({
        pathname: "/orders/payment-confirming",
        params: {
          pendingId: pending.pendingId,
          ...(pending.merchantName ? { merchantName: pending.merchantName } : {}),
          ...(pending.deliveryEtaLabel ? { deliveryEtaLabel: pending.deliveryEtaLabel } : {}),
          ...(pending.amount ? { amount: pending.amount } : {}),
          ...(pending.method ? { method: pending.method } : {}),
          message: "We're confirming your payment from before the app closed.",
        },
      });
    })();
  }, [hydrated, router, session?.accessToken]);

  return null;
}

function PendingReferralResume() {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const queryClient = useQueryClient();

  // First launch: read Play Install Referrer (Android) before / regardless of auth.
  useEffect(() => {
    if (!hydrated) return;
    void capturePlayInstallReferrerOnce().catch(() => undefined);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !session?.accessToken) return;
    void (async () => {
      const config = await queryClient
        .fetchQuery({
          queryKey: ["referral", "config", "customer"],
          queryFn: () => referralService.getConfig(),
          staleTime: 5 * 60_000,
        })
        .catch(() => null);
      if (config?.referralEnabled !== true) return;
      // Prefer freshly captured Play Install Referrer, then any pending deep-link code.
      const capture = await capturePlayInstallReferrerOnce().catch(() => null);
      if (capture?.code && !capture.alreadyConsumed) {
        try {
          const result = await referralService.apply({
            referralCode: capture.code,
            playReferrer: capture.raw ?? undefined,
            source: "play_install_referrer",
            deviceFingerprint: undefined,
          });
          if (result.ok || result.alreadyApplied) {
            await clearPendingReferral();
            return;
          }
        } catch {
          /* fall through to pending */
        }
      }

      const pending = await peekPendingReferral();
      if (!pending?.code) return;
      try {
        const result = await referralService.apply({
          referralCode: pending.code,
          clickToken: pending.clickToken ?? undefined,
          source: pending.source,
        });
        if (result.ok || result.alreadyApplied) {
          await clearPendingReferral();
        }
      } catch {
        /* retry on next launch */
      }
    })();
  }, [hydrated, session?.accessToken, queryClient]);

  return null;
}

function SessionRevokedHandler() {
  const router = useRouter();
  useEffect(() => {
    setOnSessionRevoked(() => {
      void useAuthStore.getState().logout().then(() => router.replace("/(auth)/login"));
    });
    return () => setOnSessionRevoked(() => {});
  }, [router]);
  return null;
}

function CustomerPermissionsRealtimeSync() {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const promptSmsPermissionIfNeeded = useSmsPermissionStore((s) => s.promptSmsPermissionIfNeeded);
  const lastSyncedRef = useRef<{
    location: boolean;
    sms: boolean;
    contacts: boolean;
  } | null>(null);

  const syncDevicePermissions = useCallback(async () => {
    if (!hydrated || !session?.accessToken) return;
    if (useSmsPermissionStore.getState().allowInFlight) return;
    try {
      const [{ status: locStatus }, smsGranted, contactsGranted] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        getSmsPermissionGranted(),
        getContactsPermissionGranted(),
      ]);
      const locationGranted = locStatus === "granted";
      const snapshot = {
        location: locationGranted,
        sms: smsGranted,
        contacts: contactsGranted,
      };

      if (smsGranted) {
        useSmsPermissionStore.setState({
          granted: true,
          showSheet: false,
          blocksLocation: false,
        });
      } else {
        // SMS-first: host hides location while this sheet is open.
        void promptSmsPermissionIfNeeded();
      }

      if (
        lastSyncedRef.current &&
        lastSyncedRef.current.location === snapshot.location &&
        lastSyncedRef.current.sms === snapshot.sms &&
        lastSyncedRef.current.contacts === snapshot.contacts
      ) {
        return;
      }

      const currentCoords = useLocationStore.getState().coords;
      await profileService.updateProfile({
        location_permission: snapshot.location,
        sms_permission: snapshot.sms,
        contacts_permission: snapshot.contacts,
        ...(snapshot.location && currentCoords
          ? { latitude: currentCoords.latitude, longitude: currentCoords.longitude }
          : {}),
      });

      lastSyncedRef.current = snapshot;
    } catch {
      // Keep silent; we'll retry on next app active tick.
    }
  }, [hydrated, session, promptSmsPermissionIfNeeded]);

  // Device permissions only change via the OS settings screen, which always
  // routes the app through background → active. The AppState listener therefore
  // catches every real transition; the 15s interval that used to sit alongside
  // it re-ran three native permission bridge calls forever for no added signal.
  useEffect(() => {
    void syncDevicePermissions();
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") void syncDevicePermissions();
    });
    return () => sub.remove();
  }, [syncDevicePermissions]);

  return null;
}

/** Re-check GPS when app returns from background; reload merchants if the user moved. */
function LocationPermissionResumeCheck() {
  const promptLocationPermissionIfNeeded = useLocationStore((s) => s.promptLocationPermissionIfNeeded);
  const requestPermissionAndFetch = useLocationStore((s) => s.requestPermissionAndFetch);
  const showPermissionModal = useLocationStore((s) => s.showPermissionModal);
  const queryClient = useQueryClient();
  const lastResumeCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    const syncOnForeground = async () => {
      if (useSmsPermissionStore.getState().blocksLocation) {
        return;
      }
      await runExclusiveActiveLocationReconcile(
        async () => {
          const { coords: before } = useLocationStore.getState();
          // Permission only — reconcile owns the pin when signed in.
          await promptLocationPermissionIfNeeded({ skipDeviceFetch: true });
          const readiness = await getDeviceLocationReadiness();
          if (readiness.isReady && useLocationStore.getState().locationSource !== "selected") {
            void requestPermissionAndFetch({ forceDevice: true });
          }
          if (!readiness.isReady) {
            if (useAuthStore.getState().session) {
              const { applyActiveLocationFromBackend } = await import(
                "@/lib/applyActiveLocationFromBackend"
              );
              await applyActiveLocationFromBackend(queryClient);
            }
            return "done";
          }
          let reconciled = null as Awaited<ReturnType<typeof reconcileActiveLocationFromGps>>;
          if (useAuthStore.getState().session) {
            // Multi-device SoT: pull server active pin first, then GPS retention reconcile.
            const { applyActiveLocationFromBackend } = await import(
              "@/lib/applyActiveLocationFromBackend"
            );
            const priorBound = useLocationStore.getState().sessionBoundAddressId;
            await applyActiveLocationFromBackend(queryClient);
            const afterBound = useLocationStore.getState().sessionBoundAddressId;
            if (__DEV__ && priorBound !== afterBound) {
              console.log("[active-location] multi_device_sync", {
                path: "LocationPermissionResumeCheck",
                priorBoundAddressId: priorBound,
                nextBoundAddressId: afterBound,
              });
            }
            reconciled = await reconcileActiveLocationFromGps(queryClient, {
              allowRemoteSessionPreserve: true,
            });
            if (__DEV__) {
              console.log("[active-location] resume_decision", {
                path: "LocationPermissionResumeCheck",
                addressId: reconciled?.addressId ?? null,
                source: reconciled?.source ?? null,
                reason: reconciled?.reason ?? null,
                distanceM: reconciled?.distanceM ?? null,
                retentionRadiusM: reconciled?.retentionRadiusM ?? null,
                sessionSelectionKind: useLocationStore.getState().sessionSelectionKind,
              });
            }
          } else {
            const { locationSource } = useLocationStore.getState();
            if (locationSource !== "selected") {
              await requestPermissionAndFetch({ forceDevice: true });
            }
          }
          const after = useLocationStore.getState().coords;
          const baseline = lastResumeCoordsRef.current ?? before;
          if (
            coordsMovedSignificantly(baseline, after) ||
            reconciled?.switchedToCurrent ||
            reconciled?.source === "selected"
          ) {
            debouncedInvalidateFoodHomeListingQueries(queryClient);
          }
          if (after) lastResumeCoordsRef.current = after;
          return "done";
        },
        { force: true }
      );
    };

    const unsubscribe = subscribeConfirmedAppState({
      onSuspend: () => {},
      onResume: () => {
        void syncOnForeground().catch((err) => {
          reportHandledError("location-resume", err);
        });
      },
    });

    return () => unsubscribe();
  }, [requestPermissionAndFetch, promptLocationPermissionIfNeeded, queryClient]);

  // Re-prompt loop, but only while the modal is actually up. This used to be an
  // unconditional 2s interval that ran for the entire app lifetime and did
  // nothing on the overwhelming majority of ticks — now it exists only for the
  // seconds the user is looking at the permission sheet.
  useEffect(() => {
    if (!showPermissionModal) return;
    if (useSmsPermissionStore.getState().blocksLocation) return;

    void promptLocationPermissionIfNeeded({ skipDeviceFetch: false });

    const interval = setInterval(() => {
      if (AppState.currentState !== "active") return;
      if (useSmsPermissionStore.getState().blocksLocation) return;
      if (!useLocationStore.getState().showPermissionModal) return;
      void promptLocationPermissionIfNeeded({ skipDeviceFetch: false });
    }, 1500);

    return () => clearInterval(interval);
  }, [showPermissionModal, promptLocationPermissionIfNeeded]);

  return null;
}

function StatusBarSystemUISync({ splashChromeActive }: { splashChromeActive: boolean }) {
  const statusBarBackground = useScreenChromeStore((s) => s.statusBarBackground);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    // Keep the system StatusBar visible whenever chrome syncs (modals / nav can flip it).
    NativeStatusBar.setHidden(false, "none");
  }, [statusBarBackground, splashChromeActive]);

  return null;
}

function NavigatorWithRecovery({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  return (
    <AppErrorBoundary source="navigator" resetKey={segments.join("/")}>
      {children}
    </AppErrorBoundary>
  );
}

function RootStack({
  onLayoutRootView,
  splashActive,
}: {
  onLayoutRootView: () => void;
  splashActive: boolean;
}) {
  const insets = useSafeAreaInsets();
  // Typed-routes infers a narrow tuple (e.g. [string]) for the current route, so indexing
  // segments[1] tripped TS2493; treat as a plain string[] for the depth checks below.
  const segments = useSegments() as string[];
  const discoveryLayout = useDiscoveryLayout();
  const inAuthStack = segments[0] === "(auth)";
  const inOnboardingStack = segments[0] === "(onboarding)";
  const inAuthOrOnboarding = inAuthStack || inOnboardingStack;
  const inProfileStack = segments[0] === "profile";
  const inLegalStack = segments[0] === "legal";
  const inCheckoutStack = segments[0] === "checkout";
  const inOrdersStack = segments[0] === "orders";
  const inTabsHome =
    segments[0] === "(tabs)" &&
    (segments[1] == null || segments[1] === "" || segments[1] === "index");
  /** All main tabs self-pad — root spacer must stay off or Home↔Orders/Profile jerks vertically. */
  const inTabs = segments[0] === "(tabs)";
  const inDiscoveryFood =
    discoveryLayout &&
    ((segments[0] === "(tabs)" && segments[1] === "food") ||
      (segments[0] === "home" && (segments[1] == null || segments[1] === "index")));
  const statusBarHeight =
    inProfileStack || inLegalStack || inCheckoutStack || inOrdersStack
      ? 0
      : resolveTopSafeInset(insets.top);
  const statusBarBackground = useScreenChromeStore((s) => s.statusBarBackground);
  const hideStatusBarSpacer = useScreenChromeStore((s) => s.hideStatusBarSpacer);
  const bootstrapActive = useScreenChromeStore((s) => s.bootstrapActive);
  const splashChromeActive = splashActive || bootstrapActive;
  // Tabs Home always self-pads — never stack root spacer + header inset (large white gap).
  // All (tabs) screens share the same immersive top chrome so tab switches don't reflow height.
  // Auth + onboarding self-pad with splash teal (no white root spacer).
  const immersiveStatusBar =
    hideStatusBarSpacer || splashChromeActive || inTabsHome || inTabs || inAuthOrOnboarding;
  const effectiveStatusBarHeight =
    inProfileStack ||
    inLegalStack ||
    inCheckoutStack ||
    inOrdersStack ||
    hideStatusBarSpacer ||
    splashChromeActive ||
    inTabsHome ||
    inTabs ||
    inAuthOrOnboarding
      ? 0
      : statusBarHeight;
  // Never pad the stack for Android/iOS system nav — that created a white gap row
  // above the nav bar on search and other non-home routes. Screens add insets themselves.
  /** Auth / onboarding screens use splash teal edge-to-edge. */
  const AUTH_CHROME = GatiMitraColors.splashMint;
  const resolvedStatusBarBackground = splashChromeActive
    ? SPLASH_CHROME_COLOR
    : inDiscoveryFood
      ? DiscoveryColors.bg
      : inOnboardingStack
        ? "transparent"
        : inAuthStack
          ? AUTH_CHROME
          : immersiveStatusBar && statusBarBackground === "transparent"
            ? "transparent"
            : statusBarBackground === "transparent"
              ? GatiMitraColors.softBackground
              : statusBarBackground;
  // Derive the icon style from the ACTUAL bar background so icons can never be
  // invisible (e.g. a screen that leaves "light" icons on a white bar). Splash keeps
  // its light icons over the mint chrome. Discovery Food always forces white icons.
  const barBgForContrast =
    resolvedStatusBarBackground === "transparent"
      ? GatiMitraColors.softBackground
      : resolvedStatusBarBackground;
  const resolvedStatusBarStyle = splashChromeActive
    ? "light"
    : inDiscoveryFood
      ? "light"
      : isLightBarColor(barBgForContrast)
        ? "dark"
        : "light";

  useEffect(() => {
    if (!splashChromeActive) return;
    // Never allow a white status strip over the splash gradient.
    NativeStatusBar.setHidden(false, "none");
    if (Platform.OS === "android") {
      NativeStatusBar.setTranslucent(true);
      NativeStatusBar.setBackgroundColor("transparent", true);
      NativeStatusBar.setBarStyle("light-content", true);
    }
  }, [splashChromeActive]);

  useEffect(() => {
    if (!inDiscoveryFood || splashChromeActive) return;
    NativeStatusBar.setHidden(false, "none");
    NativeStatusBar.setBarStyle("light-content", true);
    if (Platform.OS === "android") {
      NativeStatusBar.setTranslucent(true);
      NativeStatusBar.setBackgroundColor(DiscoveryColors.bg, true);
    }
  }, [inDiscoveryFood, splashChromeActive]);

  return (
    <>
      <StatusBarSystemUISync splashChromeActive={splashChromeActive} />
      <StatusBar
        hidden={false}
        style={resolvedStatusBarStyle}
        backgroundColor={
          splashChromeActive ? "transparent" : resolvedStatusBarBackground
        }
        translucent={immersiveStatusBar || resolvedStatusBarBackground === "transparent"}
      />
      <View
        style={{
          height: effectiveStatusBarHeight,
          backgroundColor: splashChromeActive
            ? SPLASH_CHROME_COLOR
            : resolvedStatusBarBackground === "transparent"
              ? immersiveStatusBar
                ? "transparent"
                : GatiMitraColors.softBackground
              : resolvedStatusBarBackground,
          width: "100%",
        }}
      />
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <Stack
          screenOptions={{
            headerShown: false,
            statusBarHidden: false,
            statusBarStyle: resolvedStatusBarStyle,
            statusBarBackgroundColor: splashChromeActive
              ? "transparent"
              : resolvedStatusBarBackground === "transparent"
                ? GatiMitraColors.softBackground
                : resolvedStatusBarBackground,
            statusBarTranslucent:
              splashChromeActive ||
              immersiveStatusBar ||
              resolvedStatusBarBackground === "transparent",
            contentStyle: {
              backgroundColor: splashChromeActive
                ? SPLASH_CHROME_COLOR
                : inAuthOrOnboarding
                  ? GatiMitraColors.splashMint
                  : GatiMitraColors.softBackground,
            },
            animation: "slide_from_right",
            /**
             * Screens below the top of the stack stop re-rendering while blurred.
             * Without this, navigating Home → Restaurant → Cart → Checkout left
             * every earlier screen mounted AND re-rendering on every Zustand /
             * React Query update — with Home's per-card image carousels and
             * ticker animations still running underneath Checkout. Effects and
             * subscriptions are unaffected, so live data is still current when a
             * screen is popped back to; only the wasted render work stops.
             * (`app/home/_layout.tsx` already did this — same pattern, applied
             * to the root stack.)
             */
            freezeOnBlur: true,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="search"
            options={{
              // Opaque card — transparentModal + setOptions(slide_from_top) crashed on Android.
              presentation: "card",
              animation: "slide_from_bottom",
              contentStyle: { backgroundColor: "#FFFFFF" },
            }}
          />
          <Stack.Screen name="location" />
          <Stack.Screen name="location-map" />
          <Stack.Screen name="location-address" />
          <Stack.Screen
            name="home"
            options={{
              animation: "none",
              animationDuration: 0,
            }}
          />
          <Stack.Screen
            name="checkout"
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen name="group" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="legal" />
          <Stack.Screen name="wallet" />
          <Stack.Screen name="support" />
        </Stack>
      </View>
    </>
  );
}
