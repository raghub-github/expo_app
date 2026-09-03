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
import * as SplashScreen from "expo-splash-screen";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useCallback, useRef, useState } from "react";
import {
  View,
  LogBox,
  Alert,
  AppState,
  Platform,
  StatusBar as NativeStatusBar,
  type AppStateStatus,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { QueryClientProvider, focusManager, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { useLanguageStore } from "@/store/languageStore";
import { useLocationStore, getDeviceLocationReadiness, coordsMovedSignificantly } from "@/store/locationStore";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { useFavoriteLocationsStore } from "@/store/favoriteLocationsStore";
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
import { CustomerPermissionSheetsHost } from "@/components/CustomerPermissionSheetsHost";
import { ServiceBlockedGateHost } from "@/components/ServiceBlockedGateHost";
import { CustomerAccountBlockedGateHost } from "@/components/CustomerAccountBlockedGateHost";
import { CustomerServiceBlockSheetHost } from "@/components/CustomerServiceBlockSheetHost";
import { CustomerServiceBlocksSync } from "@/components/CustomerServiceBlocksSync";
import { useSmsPermissionStore } from "@/store/smsPermissionStore";
import { GlobalFloatingCart } from "@/components/GlobalFloatingCart";
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
import { resumePendingAddressShare } from "@/lib/pendingAddressShare";
import {
  clearPendingReferral,
  peekPendingReferral,
} from "@/lib/pendingReferral";
import { capturePlayInstallReferrerOnce } from "@/lib/playInstallReferrer";
import { referralService } from "@/services/referral.service";
import { extendStartupApiGate } from "@/lib/startup-api-gate";
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
import { colors } from "@/theme";
import { resolveTopSafeInset } from "@/constants/layout";
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

// Installed at module scope so a throw in the very first render is already covered.
installGlobalErrorHandlers();
installReleaseConsoleSilencer();

/** Storage key used by the in-app "Configure API URL" sheet on the login screen. */
const API_URL_OVERRIDE_KEY = "dev.apiBaseUrl";
const SPLASH_CHROME_COLOR = "#14b8a6";

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
      setRuntimeApiBaseUrl(stored);
      // eslint-disable-next-line no-console
      console.log("[env] using stored API base URL override:", stored);
    }
  } catch {
    /* AsyncStorage unavailable on first launch; ignore */
  }
})();

// Prime Android launch chrome as early as JS can run so slow startup / offline
// sessions never fall back to the platform's default white nav background.
void (async () => {
  if (Platform.OS !== "android") return;
  try {
    NativeStatusBar.setHidden(false, "none");
    NativeStatusBar.setBarStyle("light-content", true);
    const { applyAndroidNavigationChrome } = await import("@/lib/androidEdgeToEdgeChrome");
    await applyAndroidNavigationChrome({
      buttonStyle: "dark",
      backgroundColor: SPLASH_CHROME_COLOR,
    });
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

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore keep-awake related failures so app still loads
});

// Singleton lives in @/lib/queryClient so logout/customer-scope teardown can
// clear it from outside the React tree.


export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lora_400Regular,
    Lora_700Bold,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [splashExited, setSplashExited] = useState(false);
  const [homeDataPrefetched, setHomeDataPrefetched] = useState(false);
  const [startupTimedOut, setStartupTimedOut] = useState(false);

  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);
  const cartHydrated = useCartStore((s) => s.hydrated);
  const assetsLoaded = useAppAssetsStore((s) => s.loaded);
  const homeImagesPrefetched = useAppAssetsStore((s) => s.homeImagesPrefetched);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateCart = useCartStore((s) => s.hydrate);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const requestPermissionAndFetch = useLocationStore((s) => s.requestPermissionAndFetch);
  const promptLocationPermissionIfNeeded = useLocationStore((s) => s.promptLocationPermissionIfNeeded);
  const hydrateLocation = useLocationStore((s) => s.hydrate);
  const hydrateRecentLocations = useRecentLocationStore((s) => s.hydrate);
  const hydrateFavoriteLocations = useFavoriteLocationsStore((s) => s.hydrate);

  // Wait for fonts too — otherwise Login/AppText flash system → Lora/Poppins.
  const criticalReady = hydrated && cartHydrated && fontsLoaded;
  // Auth + cart are local; exit splash as soon as both hydrate — no network gate.
  const appReady = criticalReady;

  const handleSplashReady = useCallback(() => {
    // Reveal the JS splash immediately; don't wait for hydration or door exit.
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashExitComplete = useCallback(() => {
    setSplashExited(true);
    void SplashScreen.hideAsync().catch(() => {});
    // Non-critical: warm ride-map marker after the first frame is interactive.
    void resolveMapImageDataUri(resolveNearbyRiderMarkerImage("bike")).catch(() => {});
  }, []);

  useEffect(() => {
    hydrateAuth();
    hydrateCart();
    hydrateLanguage();
    void hydrateLocation();
    void hydrateRecentLocations();
    void hydrateFavoriteLocations();
  }, [hydrateAuth, hydrateCart, hydrateLanguage, hydrateLocation, hydrateRecentLocations, hydrateFavoriteLocations]);

  useEffect(() => {
    if (!criticalReady || !session) {
      setHomeDataPrefetched(!session);
      return;
    }
    let cancelled = false;
    setHomeDataPrefetched(false);
    // Prefetch after splash is free to exit — never block startup on home data.
    void prefetchHomeScreenData(queryClient).finally(() => {
      if (!cancelled) setHomeDataPrefetched(true);
    });
    return () => {
      cancelled = true;
    };
  }, [criticalReady, session]);

  useEffect(() => {
    if (!criticalReady || !session) {
      setStartupTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setStartupTimedOut(true), 7_000);
    return () => clearTimeout(timeout);
  }, [criticalReady, session]);

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

  useEffect(() => {
    if (!hydrated || !cartHydrated) return;
    void (async () => {
      await runExclusiveActiveLocationReconcile(async () => {
        await hydrateLocation();
        // SMS first on Android — never fire GPS / Location Accuracy over the SMS sheet.
        if (useSmsPermissionStore.getState().allowInFlight) return "deferred";
        if (useAuthStore.getState().session?.accessToken) {
          const smsOk = await useSmsPermissionStore.getState().promptSmsPermissionIfNeeded();
          if (!smsOk && useSmsPermissionStore.getState().blocksLocation) {
            return "deferred";
          }
        }
        // Permission only — do not push GPS as Current Location before reconcile.
        await promptLocationPermissionIfNeeded({ force: true, skipDeviceFetch: true });
        const readiness = await getDeviceLocationReadiness();
        if (!readiness.isReady) {
          if (useAuthStore.getState().session) {
            const { applyActiveLocationFromBackend } = await import(
              "@/lib/applyActiveLocationFromBackend"
            );
            await applyActiveLocationFromBackend(queryClient);
          }
          return "done";
        }
        const before = useLocationStore.getState().coords;
        let reconciled = null as Awaited<ReturnType<typeof reconcileActiveLocationFromGps>>;
        if (useAuthStore.getState().session) {
          // Backend is SoT: keep saved address within retention, else Current Location.
          reconciled = await reconcileActiveLocationFromGps(queryClient);
          if (__DEV__) {
            console.log("[active-location] cold_start_decision", {
              path: "RootLayout.bootstrap",
              addressId: reconciled?.addressId ?? null,
              source: reconciled?.source ?? null,
              reason: reconciled?.reason ?? null,
              distanceM: reconciled?.distanceM ?? null,
              retentionRadiusM: reconciled?.retentionRadiusM ?? null,
            });
          }
        } else {
          await requestPermissionAndFetch({ forceDevice: true });
        }
        const { coords, address } = useLocationStore.getState();
        if (coords) {
          await restoreAndPrefetchLocationWeather(queryClient, address, coords);
        }
        if (
          coordsMovedSignificantly(before, coords) ||
          reconciled?.switchedToCurrent ||
          reconciled?.source === "selected"
        ) {
          debouncedInvalidateFoodHomeListingQueries(queryClient);
        }
        return "done";
      });
    })();
  }, [hydrated, cartHydrated, hydrateLocation, promptLocationPermissionIfNeeded, requestPermissionAndFetch, queryClient]);

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
        <SafeAreaProvider>
          <View
            style={{
              flex: 1,
              backgroundColor: splashExited
                  ? GatiMitraColors.softBackground
                  : SPLASH_CHROME_COLOR,
            }}
          >
            <AppAssetsPrefetch />
            <UserAppCategoriesPrefetch />
            {criticalReady ? (
              <>
                {/* Headless syncs render null — if one throws, the navigator must
                    survive it, so they get their own boundary with no fallback UI. */}
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
                  <LanguageSync />
                </AppErrorBoundary>
                <AuthNavigationGate />
                <CustomerSystemChrome />
                <AndroidSystemNavigationFill />
                <StatusBarRouteChromeGuard />
                <NavigatorWithRecovery>
                  <RootStack onLayoutRootView={onLayoutRootView} splashActive={!splashExited} />
                </NavigatorWithRecovery>
                {/* Overlay hosts: a throw here must not blank the navigator behind them. */}
                <AppErrorBoundary source="overlay-hosts" fallback={() => null}>
                  <CheckoutBottomSheetHost />
                  <CheckoutPaymentFailureHost />
                  <CartCheckoutGateHost />
                  <CartUpdatedModal />
                  <GlobalFloatingCart />
                  <CustomerPermissionSheetsHost />
                  <ServiceBlockedGateHost />
                  <CustomerAccountBlockedGateHost />
                  <CustomerServiceBlockSheetHost />
                  <LiveOrderProgressNotification />
                  <LegalConsentGate />
                  {/* Absolute shutter over home — no Modal fade; drops when store page is ready */}
                  <MerchantNavTransitionShutter />
                </AppErrorBoundary>
                {/* Fire-and-forget prefetch/bootstrap — never user-visible. */}
                <AppErrorBoundary source="prefetch" fallback={() => null}>
                  <PushNotificationBootstrap />
                  <PlayInAppUpdateBootstrap />
                  <AddressesPrefetch />
                  <FeaturedOffersPrefetch />
                  <WeatherPrefetch />
                  <WeatherRealtimeSync />
                  <PendingAddressShareResume />
                  <PendingReferralResume />
                  <FoodHomeLayoutPrefetch />
                  <ProfilePrefetch />
                  <WalletBalancePrefetch />
                  <CustomerServiceBlocksSync />
                  <SubscriptionPlansPrefetch />
                </AppErrorBoundary>
              </>
            ) : null}
            {!splashExited ? (
              <GatiMitraBootstrapScreen
                variant="root"
                appReady={appReady}
                statusMessage={startupTimedOut ? "Initializing GatiMitra..." : null}
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
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
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
  useEffect(() => {
    useStoreStatusStore.getState().setOnStoreClosedCallback((storeId: string) => {
      const cartMerchantId = useCartStore.getState().merchantId;
      if (cartMerchantId === storeId) {
        Alert.alert(
          "Kitchen closed",
          "This kitchen just closed. Ordering is temporarily unavailable.",
          [{ text: "OK" }]
        );
      }
    });
    return () => {
      useStoreStatusStore.getState().setOnStoreClosedCallback(null);
    };
  }, []);
  return null;
}

function LanguageSync() {
  const language = useLanguageStore((s) => s.language);
  const langHydrated = useLanguageStore((s) => s.hydrated);
  useEffect(() => {
    if (langHydrated) setAppLanguage(language);
  }, [langHydrated, language]);
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

function PendingReferralResume() {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  // First launch: read Play Install Referrer (Android) before / regardless of auth.
  useEffect(() => {
    if (!hydrated) return;
    void capturePlayInstallReferrerOnce().catch(() => undefined);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !session?.accessToken) return;
    void (async () => {
      const config = await referralService.getConfig().catch(() => null);
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
  }, [hydrated, session?.accessToken]);

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

    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") void syncOnForeground();
    });

    return () => sub.remove();
  }, [requestPermissionAndFetch, promptLocationPermissionIfNeeded, queryClient]);

  // Re-prompt loop, but only while the modal is actually up. This used to be an
  // unconditional 2s interval that ran for the entire app lifetime and did
  // nothing on the overwhelming majority of ticks — now it exists only for the
  // seconds the user is looking at the permission sheet.
  useEffect(() => {
    if (!showPermissionModal) return;
    if (useSmsPermissionStore.getState().blocksLocation) return;

    void promptLocationPermissionIfNeeded({ skipDeviceFetch: true });

    const interval = setInterval(() => {
      if (AppState.currentState !== "active") return;
      if (useSmsPermissionStore.getState().blocksLocation) return;
      if (!useLocationStore.getState().showPermissionModal) return;
      void promptLocationPermissionIfNeeded({ skipDeviceFetch: true });
    }, 2000);

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
  const segments = useSegments();
  const inAuthStack = segments[0] === "(auth)";
  const inProfileStack = segments[0] === "profile";
  const inLegalStack = segments[0] === "legal";
  const inCheckoutStack = segments[0] === "checkout";
  const inOrdersStack = segments[0] === "orders";
  const statusBarHeight =
    inProfileStack || inLegalStack || inCheckoutStack || inOrdersStack
      ? 0
      : resolveTopSafeInset(insets.top);
  const statusBarBackground = useScreenChromeStore((s) => s.statusBarBackground);
  const hideStatusBarSpacer = useScreenChromeStore((s) => s.hideStatusBarSpacer);
  const bootstrapActive = useScreenChromeStore((s) => s.bootstrapActive);
  const splashChromeActive = splashActive || bootstrapActive;
  const immersiveStatusBar = hideStatusBarSpacer || splashChromeActive;
  const effectiveStatusBarHeight =
    inProfileStack || inLegalStack || inCheckoutStack || inOrdersStack || hideStatusBarSpacer || splashChromeActive
      ? 0
      : statusBarHeight;
  // Never pad the stack for Android/iOS system nav — that created a white gap row
  // above the nav bar on search and other non-home routes. Screens add insets themselves.
  const AUTH_CHROME = "#F0F4F3";
  const resolvedStatusBarBackground = splashChromeActive
    ? SPLASH_CHROME_COLOR
    : inAuthStack
      ? AUTH_CHROME
      : immersiveStatusBar && statusBarBackground === "transparent"
      ? "transparent"
      : statusBarBackground === "transparent"
        ? GatiMitraColors.softBackground
        : statusBarBackground;
  // Derive the icon style from the ACTUAL bar background so icons can never be
  // invisible (e.g. a screen that leaves "light" icons on a white bar). Splash keeps
  // its light icons over the mint chrome.
  const barBgForContrast =
    resolvedStatusBarBackground === "transparent"
      ? GatiMitraColors.softBackground
      : resolvedStatusBarBackground;
  const resolvedStatusBarStyle = splashChromeActive
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
                : inAuthStack
                  ? "#F0F4F3"
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
          <Stack.Screen name="search" />
          <Stack.Screen name="location" />
          <Stack.Screen name="location-map" />
          <Stack.Screen name="location-address" />
          <Stack.Screen name="home" />
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
