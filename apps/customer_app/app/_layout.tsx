/**
 * Root layout - providers, theme, and stack navigation.
 * Hydrates auth and cart before showing main UI.
 */

import "react-native-gesture-handler";
import "../global.css";
import { Stack, useRouter, useSegments } from "expo-router";
import { loadAsync as loadFontAsync, useFonts } from "expo-font";
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
import {
  useLocationStore,
  getDeviceLocationReadiness,
  invalidateDeviceLocationReadiness,
  coordsMovedSignificantly,
} from "@/store/locationStore";
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
import { HomeColdStartSkeleton } from "@/components/home/HomeTabSkeletons";
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
import { endStartupApiGate, extendStartupApiGate } from "@/lib/startup-api-gate";
import { startupLaunchLog, startupMeasure } from "@/lib/startupPerf";
import { resetInitialShellReady, useInitialShellReady } from "@/lib/startupShellReady";
import {
  ensureSplashHardDeadlineArmed,
  isSplashExited,
  markSplashArmed,
  markSplashExited,
  useSplashDeadlineHit,
  useSplashExitedFlag,
} from "@/lib/splashLifecycle";
import {
  hasCompletedProfileSync,
  readCachedProfile,
  readSyncCachedProfile,
} from "@/lib/profileCache";
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
import { authService } from "@/services/auth.service";
import {
  getContactsPermissionGranted,
  getSmsPermissionGranted,
} from "@/lib/device-permissions";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HOME_DARK } from "@/constants/homeDarkTheme";
import { applyHomeStatusBarChrome } from "@/lib/applyHomeStatusBar";
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
import { ensureIoniconsLoaded } from "@/lib/ioniconsReady";
// Warm Ionicons before Home cold-start skeleton paints (avoids empty pin/bell/tabs).
void ensureIoniconsLoaded();
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
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[env] using stored API base URL override:", stored);
      }
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

// Android: native `withBrandedNativeSplash` already shows splash-brand as
// windowBackground and releases the mint A12 icon splash in MainActivity.
// Keep preventAutoHide as a safety net, but never hold a blank mint frame —
// hide immediately so the branded windowBackground stays visible while JS boots.
// iOS still holds until the JS brand cover is ready.
try {
  SplashScreen.setOptions({ duration: 0, fade: false });
} catch {
  /* Expo Go / older clients */
}
void SplashScreen.preventAutoHideAsync().catch(() => {});
if (Platform.OS === "android") {
  void SplashScreen.hideAsync().catch(() => {});
}
ensureSplashHardDeadlineArmed();
startupLaunchLog("NATIVE_SPLASH_VISIBLE");

/**
 * Returning-user fast path (Zomato): any sync session skips the long JS mint
 * cover and puts the user on Home skeletons immediately. Profile completeness is
 * enforced by tabs/onboarding — never by holding splash.
 */
function peekSyncReturningUser(): boolean {
  try {
    return Boolean(authService.peekStoredSessionSync()?.accessToken);
  } catch {
    return false;
  }
}

// Singleton lives in @/lib/queryClient so logout/customer-scope teardown can
// clear it from outside the React tree.

export default function RootLayout() {
  // Brand + header icon fonts together so wallet / notification never paint blank.
  // MaterialCommunityIcons is deferred until after splash (large glyph map).
  // App-wide Lora/Poppins for UI — splash wordmark is a bundled PNG and must NOT
  // gate on this (async load previously caused thin system-sans flashes).
  const [brandFontsLoaded] = useFonts({
    Lora_400Regular,
    Lora_700Bold,
    Poppins_600SemiBold,
    Poppins_700Bold,
    ...Ionicons.font,
  });
  void brandFontsLoaded;
  const hardDeadlineHit = useSplashDeadlineHit();
  const router = useRouter();
  const segments = useSegments() as string[];
  // Global flag is source of truth — shell-ready dismisses splash synchronously
  // via markSplashExited; local useState alone lagged behind Home's JS work.
  const splashExited = useSplashExitedFlag();
  /** 0=pre-splash, 1=overlays, 2=location/realtime, 3=push/secondary prefetch */
  const [postSplashPhase, setPostSplashPhase] = useState(0);
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
  const sessionRestorePending = useAuthStore((s) => s.sessionRestorePending);
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
  const rootIsTabs = rootSegment === "(tabs)";
  // Sync peek is instant — do not wait for hydrate() async for returning users.
  const syncReturningRef = useRef(peekSyncReturningUser());
  const syncReturning = syncReturningRef.current;
  /**
   * Single splash only: native branded windowBackground (Android) / expo splash (iOS).
   * Do NOT remount splash-brand.png in JS — that was the visible "duplicate splash".
   * Keep the React root transparent until we leave Index so the native brand stays up,
   * then hand off straight to Home (no second logo animation).
   */
  const destinationCommitted =
    (criticalReady || syncReturning) && !onRootIndexHold;
  const destinationReady = destinationCommitted && initialShellReady;
  const showNativeBrandHold = !destinationCommitted;
  // Soft home skeletons fill a brief gap only while Tabs JS warms — never brand art.
  const showHomeShellPlaceholder =
    destinationCommitted && !initialShellReady && rootIsTabs;

  const dismissBrandingSplash = useCallback((reason: string) => {
    const first = markSplashExited(reason);
    if (!first) return;
    startupMeasure("branding_splash_exit", "process_start");
    startupMeasure("splash_visible_duration", "process_start");
    startupMeasure("usable_home_ready", "process_start");
    startupLaunchLog("BRANDED_SPLASH_DISMISS", {
      reason,
      blocksHome: true,
      note: "native_only_no_js_brand_overlay",
    });
    // Clear splash chrome so Home can paint light status icons on dark header.
    // Force light icons immediately — do not wait for Home focus / route guard.
    // Edge-to-edge often ignores statusBarColor; bar style must flip off splash dark-content.
    applyHomeStatusBarChrome("dismissBrandingSplash");
    void SplashScreen.hideAsync().catch(() => {});
    endStartupApiGate();
    // Non-blocking map asset warm — must not sit on the dismiss path.
    void resolveMapImageDataUri(resolveNearbyRiderMarkerImage("bike")).catch(() => {});
  }, []);

  useEffect(() => {
    startupLaunchLog("ROOT_LAYOUT_READY", { blocksHome: true });
    startupMeasure("branding_visible", "process_start");
  }, []);

  // Sync-returning: seed auth immediately so destination kick can leave Index.
  // Do NOT dismiss branded splash here — that left blank mint before skeletons.
  const syncHandoffDoneRef = useRef(false);
  useLayoutEffect(() => {
    if (!syncReturning || syncHandoffDoneRef.current) return;
    syncHandoffDoneRef.current = true;
    const sync = authService.peekStoredSessionSync();
    if (sync?.accessToken) {
      useAuthStore.setState({
        session: sync,
        hydrated: true,
        sessionRestorePending: false,
      });
    }
    startupLaunchLog("SPLASH_SYNC_RETURNING_HANDOFF", {
      blocksHome: false,
      note: "seed_auth_keep_brand_until_tabs",
    });
  }, [syncReturning]);

  useEffect(() => {
    if (!syncReturning || !onRootIndexHold) return;
    // Prefer tabs when profile unknown/complete. Only onboarding when sync
    // positively says incomplete — missing FastKV must not bounce returning users.
    const syncProfile = readSyncCachedProfile();
    const target =
      syncProfile != null && syncProfile.profile_completed !== true
        ? "/(onboarding)"
        : hrefForRequestedPrimaryTab();
    let cancelled = false;
    const kick = () => {
      if (cancelled) return;
      try {
        router.replace(target as never);
      } catch (err) {
        reportHandledError("sync-returning-tabs-kick", err);
        setTimeout(() => {
          if (cancelled) return;
          try {
            router.replace(target as never);
          } catch (retryErr) {
            reportHandledError("sync-returning-tabs-kick-retry", retryErr);
          }
        }, 50);
      }
    };
    // Defer past Root Stack first commit — same-turn replace is unsafe.
    const t = setTimeout(kick, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [syncReturning, onRootIndexHold, router]);

  useEffect(() => {
    // Process-once — Fast Refresh / Strict Mode remounts were re-entering this
    // effect and stacking AsyncStorage work (duplicate AUTH_RESTORE / CART_HYDRATE).
    if (coldStartBootstrapArmed) return;
    coldStartBootstrapArmed = true;
    void (async () => {
      startupLaunchLog("AUTH_RESTORE_START", { blocksHome: true });
      const authT0 = Date.now();
      // Hold Login only when we do not already have a sync session. Never treat
      // "not restored yet" as logged out — and never block splash on FastKV.
      const syncSession = authService.peekStoredSessionSync();
      if (!syncSession?.accessToken) {
        useAuthStore.setState({ sessionRestorePending: true });
      }
      // Warm profile + session into FastKV in parallel with hydrate (do not await
      // before sync peek). Profile warm unblocks Index layout-redirect to Home.
      const fastKvWarm = hydrateFastKvFromAsyncStorage([
        STORAGE_KEYS.PROFILE_CACHE,
        STORAGE_KEYS.AUTH_SESSION,
      ]).catch(() => undefined);
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
      // Keep off the splash critical path (fire-and-forget only).
      const gpsRetryTimers = [800, 2000, 4000].map((ms) =>
        setTimeout(() => {
          void kickEarlyFreshGpsIfReady();
        }, ms)
      );
      // Local auth restore first — sync peek is ~0–2ms; AS read only on cold miss.
      await hydrateAuth();
      // If hydrate raced ahead of FastKV warm on a cold miss, retry once warm lands.
      void fastKvWarm.then(() => {
        const state = useAuthStore.getState();
        if (!state.session?.accessToken && state.sessionRestorePending) {
          void state.hydrate();
        }
      });
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
    // Start as soon as session exists — do not wait for splash exit (that serialized
    // offers/wallet/weather behind the 30s+ branded hold).
    if (!session) {
      setHomeDataPrefetched(true);
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
  }, [session, queryClient]);

  useEffect(() => {
    if (!criticalReady) return;
    startupMeasure("critical_ready", "process_start");
  }, [criticalReady]);

  // Watchdog only — never strip the branded cover into blank mint.
  useEffect(() => {
    if (!criticalReady || initialShellReady || destinationReady) return;
    const timeout = setTimeout(() => {
      startupMeasure("startup_shell_timeout", "process_start");
      startupLaunchLog("STARTUP_BLOCKER", {
        stage: "shell_ready_lag",
        durationMs: 250,
        note: "cover_held_until_shell",
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [criticalReady, initialShellReady, destinationReady]);

  // Absolute deadline: unblock wedged auth only — do not dismiss branding early.
  useEffect(() => {
    if (!hardDeadlineHit || splashExited || initialShellReady) return;
    if (!criticalReady) {
      useAuthStore.getState().forceSplashUnblock();
    }
  }, [hardDeadlineHit, criticalReady, splashExited, initialShellReady]);

  // Kick real destination as soon as local auth is known.
  // Never gate this on splashExited — that blocked navigation after early shell marks.
  useEffect(() => {
    if (!criticalReady) {
      if (hardDeadlineHit) {
        useAuthStore.getState().forceSplashUnblock();
      }
      return;
    }
    if (!onRootIndexHold) return;

    let cancelled = false;
    const safeReplace = (href: string) => {
      if (cancelled) return;
      try {
        router.replace(href as never);
      } catch (err) {
        // Expo Router not ready yet (HMR / first paint) — retry once shortly.
        reportHandledError("splash-destination-kick", err);
        setTimeout(() => {
          if (cancelled) return;
          try {
            router.replace(href as never);
          } catch (retryErr) {
            reportHandledError("splash-destination-kick-retry", retryErr);
          }
        }, 50);
      }
    };

    // Kick after RootStack has committed — never same-frame as first hydrate.
    const kickTimer = setTimeout(() => {
      if (cancelled) return;
      const latest = useAuthStore.getState();
      let kicked = false;
      if (latest.session?.accessToken) {
        if (hasCompletedProfileSync()) {
          safeReplace(hrefForRequestedPrimaryTab());
          kicked = true;
        } else {
          void (async () => {
            const profile = await Promise.race([
              readCachedProfile(),
              new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 100)),
            ]);
            if (cancelled) return;
            if (useAuthStore.getState().session?.accessToken == null) return;
            if (profile?.profile_completed === true || hasCompletedProfileSync()) {
              safeReplace(hrefForRequestedPrimaryTab());
            } else {
              safeReplace("/(onboarding)");
            }
            startupLaunchLog("SPLASH_DESTINATION_KICK", {
              phase: "kick_destination_async",
              note: "splash_dismisses_on_off_index",
              blocksHome: true,
            });
          })();
          return;
        }
      } else if (latest.sessionRestorePending) {
        // Disk restore still running. After hard deadline, re-peek sync FastKV —
        // never sit on Index for tens of seconds if a session already landed.
        if (hardDeadlineHit) {
          const lateSync = authService.peekStoredSessionSync();
          if (lateSync?.accessToken) {
            useAuthStore.setState({
              session: lateSync,
              hydrated: true,
              sessionRestorePending: false,
            });
            if (hasCompletedProfileSync()) {
              safeReplace(hrefForRequestedPrimaryTab());
            } else {
              const syncProfile = readSyncCachedProfile();
              safeReplace(
                syncProfile != null && syncProfile.profile_completed !== true
                  ? "/(onboarding)"
                  : hrefForRequestedPrimaryTab()
              );
            }
            kicked = true;
          } else {
            startupLaunchLog("SPLASH_DESTINATION_KICK", {
              phase: "await_session_restore_past_deadline",
              note: "still_pending_no_sync_session",
              blocksHome: true,
            });
            return;
          }
        } else {
          startupLaunchLog("SPLASH_DESTINATION_KICK", {
            phase: "await_session_restore",
            note: "cover_held_until_auth_restore",
            blocksHome: true,
          });
          return;
        }
      } else if (hardDeadlineHit) {
        // Only send to Login after restore finished with no session.
        safeReplace("/(auth)/login");
        kicked = true;
      } else {
        return;
      }
      if (kicked) {
        startupLaunchLog("SPLASH_DESTINATION_KICK", {
          phase: "kick_destination",
          note: "splash_dismisses_on_off_index",
          blocksHome: true,
        });
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(kickTimer);
    };
  }, [
    hardDeadlineHit,
    criticalReady,
    onRootIndexHold,
    session?.accessToken,
    sessionRestorePending,
    router,
  ]);

  // Dismiss branding the moment we leave Index — skeleton placeholder covers Metro lag.
  useLayoutEffect(() => {
    if (!destinationCommitted) return;
    markSplashArmed();
    startupMeasure("splash_fade_armed", "process_start");
    if (!isSplashExited()) {
      dismissBrandingSplash("destination_committed");
    }
  }, [destinationCommitted, dismissBrandingSplash]);

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
      // Tiny burst only — long extensions re-serialized home APIs after login.
      extendStartupApiGate(1_500);
    }
  }, [hydrated]);

  // Stagger post-splash hosts so release/Hermes doesn't pay one giant first-frame bill.
  useEffect(() => {
    if (!splashExited) {
      setPostSplashPhase(0);
      return;
    }
    setPostSplashPhase(1);
    endStartupApiGate();
    const t2 = setTimeout(() => setPostSplashPhase(2), 180);
    const t3 = setTimeout(() => setPostSplashPhase(3), 500);
    return () => {
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [splashExited]);

  // Defer MaterialCommunityIcons until after splash — not needed for Home header.
  useEffect(() => {
    if (!splashExited) return;
    const t = setTimeout(() => {
      void loadFontAsync(MaterialCommunityIcons.font).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [splashExited]);

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
              // Soft home bg once destination is ready. While native brand holds,
              // stay transparent so Android windowBackground splash-brand shows
              // through — never remount a second JS logo splash.
              backgroundColor: showNativeBrandHold
                ? "transparent"
                : rootIsTabs
                  ? HOME_DARK.page
                  : GatiMitraColors.softBackground,
            }}
          >
            {/* Home illustrations + category chip images must warm DURING splash —
                gating categories on splashExited left Food rail circles blank. */}
            <AppAssetsPrefetch />
            <UserAppCategoriesPrefetch />
            {/* Saved addresses: sync-seed only during splash; full network after exit. */}
            <AddressesPrefetch />
            {/* Parallel non-blocking warm — fills Home skeletons after splash exits. */}
            <AppErrorBoundary source="home-shell-prefetch" fallback={() => null}>
              <FeaturedOffersPrefetch />
              <WeatherPrefetch />
            </AppErrorBoundary>
            {/* Always mount Stack on first paint — gating it behind criticalReady
                caused "Attempted to navigate before mounting the Root Layout"
                when splash deadline / forceSplashUnblock kicked router.replace. */}
            <NavigatorWithRecovery>
              <RootStack onLayoutRootView={onLayoutRootView} splashActive={!splashExited} />
            </NavigatorWithRecovery>
            <AndroidSystemNavigationFill />
            {criticalReady ? (
              <>
                {/* Essential while splash covers: auth gate + chrome.
                    Heavy realtime/overlays still wait until splash exits. */}
                <AuthNavigationGate />
                <AddressShareLinkCapture />
                <CustomerSystemChrome />
                <StatusBarRouteChromeGuard />
                {/* Same as merchant: Play Core update host is not gated on splash.
                    Official flexible Play bottom sheet (not a custom modal). */}
                <PlayInAppUpdateBootstrap />
                {postSplashPhase >= 1 ? (
                  <>
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
                  </>
                ) : null}
                {postSplashPhase >= 2 ? (
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
                ) : null}
                {postSplashPhase >= 3 ? (
                  <AppErrorBoundary source="prefetch" fallback={() => null}>
                    <PushNotificationBootstrap />
                    <AbandonedCartReminderBootstrap />
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
                ) : null}
              </>
            ) : null}
            {showHomeShellPlaceholder ? (
              <View
                pointerEvents="none"
                // No elevation — Android hardware layers with high elevation were
                // freezing the first painted frame (slogan/motion looked blocked).
                collapsable={false}
                style={[
                  StyleSheet.absoluteFillObject,
                  { zIndex: 9000, backgroundColor: HOME_DARK.page },
                ]}
                accessibilityLabel="Loading home"
              >
                <HomeColdStartSkeleton reason="post_splash_shell_placeholder" />
              </View>
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

/** Marketing RemoteViews chip PendingIntents use gatimitra:// + app path. */
function pathFromGatimitraMarketingUrl(url: string | null): string | null {
  if (!url || !/^gatimitra:/i.test(url)) return null;
  try {
    const withoutScheme = url.replace(/^gatimitra:\/\//i, "").replace(/^gatimitra:/i, "");
    const path = withoutScheme.startsWith("/") ? withoutScheme : `/${withoutScheme}`;
    if (
      path.startsWith("/home") ||
      path.startsWith("/offers") ||
      path.startsWith("/orders") ||
      path.startsWith("/profile") ||
      path.startsWith("/notifications")
    ) {
      return path;
    }
  } catch {
    /* ignore */
  }
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
      const marketingPath = pathFromGatimitraMarketingUrl(url);
      if (marketingPath) {
        if (isInitial) {
          if (initialHandledRef.current) return;
          initialHandledRef.current = true;
        }
        router.push(marketingPath as any);
        return;
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
          invalidateDeviceLocationReadiness();
          const readiness = await getDeviceLocationReadiness({ force: true });
          // Backend pin first — then prompt (services-off / dismissed never auto-open).
          if (!readiness.isReady) {
            if (useAuthStore.getState().session) {
              const { applyActiveLocationFromBackend } = await import(
                "@/lib/applyActiveLocationFromBackend"
              );
              await applyActiveLocationFromBackend(queryClient);
            }
            await promptLocationPermissionIfNeeded({ skipDeviceFetch: true });
            return "done";
          }
          await promptLocationPermissionIfNeeded({ skipDeviceFetch: true });
          if (useLocationStore.getState().locationSource !== "selected") {
            void requestPermissionAndFetch({ forceDevice: true });
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

  // While the sheet is up, re-check OS readiness only (no GPS fetch). Prefer
  // AppState return-from-Settings; keep a slow poll as fallback (≥5s).
  useEffect(() => {
    if (!showPermissionModal) return;
    if (useSmsPermissionStore.getState().blocksLocation) return;

    const recheck = () => {
      if (AppState.currentState !== "active") return;
      if (useSmsPermissionStore.getState().blocksLocation) return;
      if (!useLocationStore.getState().showPermissionModal) return;
      invalidateDeviceLocationReadiness();
      void promptLocationPermissionIfNeeded({ skipDeviceFetch: true });
    };

    recheck();
    const interval = setInterval(recheck, 5_000);
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") recheck();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [showPermissionModal, promptLocationPermissionIfNeeded]);

  return null;
}

function StatusBarSystemUISync({
  splashChromeActive,
  inTabsHome,
}: {
  splashChromeActive: boolean;
  inTabsHome: boolean;
}) {
  const statusBarBackground = useScreenChromeStore((s) => s.statusBarBackground);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    NativeStatusBar.setHidden(false, "none");
    // Do not re-apply Home chrome here — store updates were flipping the bar
    // white/black against RootStack + Home focus.
    void inTabsHome;
    void splashChromeActive;
  }, [statusBarBackground, splashChromeActive, inTabsHome]);

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
    : inTabsHome
      ? HOME_DARK.page
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
    : inDiscoveryFood || inTabsHome
      ? "light"
      : isLightBarColor(barBgForContrast)
        ? "dark"
        : "light";

  useEffect(() => {
    // Tabs Home always wins — even while splashActive/bootstrap flags lag.
    // Skipping this while splashChromeActive left dark-content from mint splash
    // sitting on #2C2C30 (invisible time/wifi/battery in the screenshot).
    if (inTabsHome) {
      applyHomeStatusBarChrome("RootStack.tabsHome");
      return;
    }
    if (splashChromeActive) {
      NativeStatusBar.setHidden(false, "none");
      if (Platform.OS === "android") {
        NativeStatusBar.setTranslucent(true);
        NativeStatusBar.setBackgroundColor("transparent", true);
        NativeStatusBar.setBarStyle("light-content", false);
      }
      return;
    }
    if (!inDiscoveryFood) return;
    NativeStatusBar.setHidden(false, "none");
    NativeStatusBar.setBarStyle("light-content", false);
    if (Platform.OS === "android") {
      NativeStatusBar.setTranslucent(true);
      NativeStatusBar.setBackgroundColor(DiscoveryColors.bg, false);
    }
  }, [inDiscoveryFood, inTabsHome, splashChromeActive]);

  return (
    <>
      <StatusBarSystemUISync
        splashChromeActive={splashChromeActive}
        inTabsHome={inTabsHome}
      />
      <StatusBar
        hidden={false}
        style={inTabsHome ? "light" : resolvedStatusBarStyle}
        backgroundColor={
          inTabsHome
            ? HOME_DARK.page
            : splashChromeActive
              ? "transparent"
              : resolvedStatusBarBackground
        }
        translucent={immersiveStatusBar || resolvedStatusBarBackground === "transparent"}
      />
      <View
        style={{
          height: effectiveStatusBarHeight,
          backgroundColor: inTabsHome
            ? HOME_DARK.page
            : splashChromeActive
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
            statusBarStyle: inTabsHome ? "light" : resolvedStatusBarStyle,
            statusBarBackgroundColor: inTabsHome
              ? HOME_DARK.page
              : splashChromeActive
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
                : inTabsHome || inTabs
                  ? HOME_DARK.page
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
