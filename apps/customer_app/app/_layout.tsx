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
import { QueryClient, QueryClientProvider, focusManager, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { useLanguageStore } from "@/store/languageStore";
import { useLocationStore, getDeviceLocationReadiness, coordsMovedSignificantly } from "@/store/locationStore";
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import { syncActiveLocationFromStore } from "@/lib/syncActiveLocationFromStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useStoreStatusRealtime } from "@/hooks/useStoreStatusRealtime";
import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { useActiveOrdersHydration } from "@/hooks/useActiveOrdersHydration";
import { LocationWatchSync } from "@/components/LocationWatchSync";
import { CustomerPermissionSheetsHost } from "@/components/CustomerPermissionSheetsHost";
import { useSmsPermissionStore } from "@/store/smsPermissionStore";
import { GlobalFloatingCart } from "@/components/GlobalFloatingCart";
import { MerchantNavTransitionShutter } from "@/components/MerchantNavTransitionShutter";
import { CheckoutBottomSheetHost } from "@/components/checkout/CheckoutBottomSheetHost";
import { CartCheckoutGateHost } from "@/components/cart/CartCheckoutGateHost";
import { CustomerSystemChrome } from "@/components/CustomerSystemChrome";
import { StatusBarRouteChromeGuard } from "@/components/StatusBarRouteChromeGuard";
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
import { extendStartupApiGate } from "@/lib/startup-api-gate";
import { isNetworkError } from "@/utils/networkError";
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

/** Storage key used by the in-app "Configure API URL" sheet on the login screen. */
const API_URL_OVERRIDE_KEY = "dev.apiBaseUrl";
const SPLASH_CHROME_COLOR = "#5eead4";

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
  NativeStatusBar.setTranslucent(true);
  NativeStatusBar.setBackgroundColor("transparent", true);
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
        // eslint-disable-next-line no-console
        console.log("[env] cleared stale API base URL override:", stored);
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
    NativeStatusBar.setTranslucent(true);
    NativeStatusBar.setBackgroundColor("transparent", true);
    NativeStatusBar.setBarStyle("light-content", true);
    const [SystemUI, NavigationBar] = await Promise.all([
      import("expo-system-ui"),
      import("expo-navigation-bar"),
    ]);
    await SystemUI.setBackgroundColorAsync(SPLASH_CHROME_COLOR);
    await NavigationBar.setVisibilityAsync("visible");
    try {
      await NavigationBar.setPositionAsync("relative");
    } catch {
      // Ignored on builds where nav position is fixed by the OS.
    }
    await NavigationBar.setBackgroundColorAsync(SPLASH_CHROME_COLOR);
    await NavigationBar.setButtonStyleAsync("light");
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (failureCount >= 3) return false;
        const status = (error as { status?: number })?.status;
        if (status === 503 || isNetworkError(error)) return true;
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(1500 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        const status = (error as { status?: number })?.status;
        return status === 503 || isNetworkError(error);
      },
      retryDelay: (attempt) => 2000 * (attempt + 1),
    },
  },
});

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

  const criticalReady = hydrated && cartHydrated;
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
    void resolveMapImageDataUri(resolveNearbyRiderMarkerImage("bike"));
  }, []);

  useEffect(() => {
    hydrateAuth();
    hydrateCart();
    hydrateLanguage();
    void hydrateLocation();
  }, [hydrateAuth, hydrateCart, hydrateLanguage, hydrateLocation]);

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
      await hydrateLocation();
      // SMS first on Android — never fire GPS / Location Accuracy over the SMS sheet.
      if (useSmsPermissionStore.getState().allowInFlight) return;
      const smsOk = await useSmsPermissionStore.getState().promptSmsPermissionIfNeeded();
      if (!smsOk && useSmsPermissionStore.getState().blocksLocation) {
        return;
      }
      // Always request fresh GPS on launch. Persisted selected pins are cleared in hydrate()
      // so a previous city cannot keep driving merchant discovery after travel.
      await promptLocationPermissionIfNeeded({ force: true });
      const readiness = await getDeviceLocationReadiness();
      if (!readiness.isReady) return;
      const before = useLocationStore.getState().coords;
      if (useLocationStore.getState().locationSource === "selected") {
        // Only if something set selected during bootstrap (explicit pick).
        return;
      }
      await requestPermissionAndFetch({ forceDevice: true });
      const { coords, address } = useLocationStore.getState();
      if (coords) {
        await restoreAndPrefetchLocationWeather(queryClient, address, coords);
      }
      await syncActiveLocationFromStore();
      if (coordsMovedSignificantly(before, coords)) {
        void invalidateFoodHomeLocationQueries(queryClient);
      }
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
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <View
            style={{
              flex: 1,
              backgroundColor: splashExited ? colors.background.light : SPLASH_CHROME_COLOR,
            }}
          >
            <AppAssetsPrefetch />
            <UserAppCategoriesPrefetch />
            {criticalReady ? (
              <>
                <ReactQueryFocusSync />
                <StoreStatusRealtimeSync />
                <OrderRealtimeSync />
                <SessionRevokedHandler />
                <CustomerPermissionsRealtimeSync />
                <LocationPermissionResumeCheck />
                <LocationWatchSync />
                <LanguageSync />
                <CustomerSystemChrome />
                <StatusBarRouteChromeGuard />
                <RootStack onLayoutRootView={onLayoutRootView} splashActive={!splashExited} />
                <CheckoutBottomSheetHost />
                <CartCheckoutGateHost />
                <GlobalFloatingCart />
                <CustomerPermissionSheetsHost />
                <PushNotificationBootstrap />
                <LiveOrderProgressNotification />
                <PlayInAppUpdateBootstrap />
                <LegalConsentGate />
                <AddressesPrefetch />
                <FeaturedOffersPrefetch />
                <WeatherPrefetch />
                <WeatherRealtimeSync />
                <PendingAddressShareResume />
                <FoodHomeLayoutPrefetch />
                <ProfilePrefetch />
                <WalletBalancePrefetch />
                <SubscriptionPlansPrefetch />
                {/* Absolute shutter over home — no Modal fade; drops when store page is ready */}
                <MerchantNavTransitionShutter />
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
    </GestureHandlerRootView>
  );
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

  useEffect(() => {
    void syncDevicePermissions();
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") void syncDevicePermissions();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void syncDevicePermissions();
    }, 15000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
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
      const { locationSource, coords: before } = useLocationStore.getState();
      await promptLocationPermissionIfNeeded();
      // Explicit session selection stays; otherwise refresh live GPS.
      if (locationSource === "selected") return;
      const readiness = await getDeviceLocationReadiness();
      if (!readiness.isReady) return;
      await requestPermissionAndFetch({ forceDevice: true });
      const after = useLocationStore.getState().coords;
      await syncActiveLocationFromStore();
      const baseline = lastResumeCoordsRef.current ?? before;
      if (coordsMovedSignificantly(baseline, after)) {
        void invalidateFoodHomeLocationQueries(queryClient);
      }
      if (after) lastResumeCoordsRef.current = after;
    };

    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") void syncOnForeground();
    });

    const interval = setInterval(() => {
      if (AppState.currentState !== "active") return;
      if (useSmsPermissionStore.getState().blocksLocation) return;
      if (useLocationStore.getState().showPermissionModal) {
        void promptLocationPermissionIfNeeded();
      }
    }, 2000);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [promptLocationPermissionIfNeeded, requestPermissionAndFetch, queryClient]);

  useEffect(() => {
    if (!showPermissionModal) return;
    if (useSmsPermissionStore.getState().blocksLocation) return;
    void promptLocationPermissionIfNeeded();
  }, [showPermissionModal, promptLocationPermissionIfNeeded]);

  return null;
}

function StatusBarSystemUISync({ splashChromeActive }: { splashChromeActive: boolean }) {
  const statusBarBackground = useScreenChromeStore((s) => s.statusBarBackground);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    // Keep the system StatusBar visible whenever chrome syncs (modals / nav can flip it).
    NativeStatusBar.setHidden(false, "none");
    if (splashChromeActive) {
      void import("expo-system-ui")
        .then((SystemUI) => SystemUI.setBackgroundColorAsync(SPLASH_CHROME_COLOR))
        .catch(() => {});
      return;
    }
    // Transparent immersive still needs a LIGHT window root so dark status icons stay visible.
    // Never leave a dark SystemUI root behind translucent status chrome.
    const rootColor =
      statusBarBackground === "transparent" ? "#FFFFFF" : statusBarBackground;
    void import("expo-system-ui")
      .then((SystemUI) => SystemUI.setBackgroundColorAsync(rootColor))
      .catch(() => {});
  }, [statusBarBackground, splashChromeActive]);

  return null;
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
  const resolvedStatusBarBackground = splashChromeActive
    ? SPLASH_CHROME_COLOR
    : immersiveStatusBar && statusBarBackground === "transparent"
      ? "transparent"
      : statusBarBackground === "transparent"
        ? "#FFFFFF"
        : statusBarBackground;
  // Derive the icon style from the ACTUAL bar background so icons can never be
  // invisible (e.g. a screen that leaves "light" icons on a white bar). Splash keeps
  // its light icons over the mint chrome.
  const barBgForContrast =
    resolvedStatusBarBackground === "transparent" ? "#FFFFFF" : resolvedStatusBarBackground;
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
              ? "#FFFFFF"
              : resolvedStatusBarBackground,
          width: "100%",
        }}
      />
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <Stack
          screenOptions={{
            headerShown: false,
            statusBarHidden: false,
            statusBarStyle: splashChromeActive ? "light" : "dark",
            statusBarBackgroundColor: splashChromeActive
              ? "transparent"
              : "#FFFFFF",
            statusBarTranslucent: splashChromeActive,
            contentStyle: {
              backgroundColor: splashChromeActive
                ? SPLASH_CHROME_COLOR
                : colors.background.light,
            },
            animation: "slide_from_right",
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
          <Stack.Screen name="notifications" />
          <Stack.Screen name="support" />
        </Stack>
      </View>
    </>
  );
}
