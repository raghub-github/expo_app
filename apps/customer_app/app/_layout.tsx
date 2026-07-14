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
import { View, LogBox, Alert, AppState, Platform, type AppStateStatus } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { useLanguageStore } from "@/store/languageStore";
import { useLocationStore, getDeviceLocationReadiness } from "@/store/locationStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useStoreStatusRealtime } from "@/hooks/useStoreStatusRealtime";
import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { useActiveOrdersHydration } from "@/hooks/useActiveOrdersHydration";
import { LocationPermissionModal } from "@/components/LocationPermissionModal";
import { GlobalFloatingCart } from "@/components/GlobalFloatingCart";
import { MerchantNavTransitionShutter } from "@/components/MerchantNavTransitionShutter";
import { CheckoutBottomSheetHost } from "@/components/checkout/CheckoutBottomSheetHost";
import { CustomerSystemChrome } from "@/components/CustomerSystemChrome";
import { GatiMitraBootstrapScreen } from "@/components/GatiMitraBootstrapScreen";
import { setOnSessionRevoked } from "@/services/api";
import { PushNotificationBootstrap } from "@/components/PushNotificationBootstrap";
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
import { DEFAULT_STATUS_BAR_HEIGHT, resolveBottomSafeInset, screenManagesBottomNav } from "@/constants/layout";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import "@/lib/i18n";
import { setAppLanguage } from "@/lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setRuntimeApiBaseUrl } from "@/config/env";
import { ensureMapboxSearchReady } from "@/services/location.service";
import { restoreAndPrefetchLocationWeather } from "@/hooks/useLocationWeather";
import { prefetchHomeScreenData } from "@/lib/prefetchHomeScreenData";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { resolveMapImageDataUri } from "@/lib/map-webview-image-uri";
import { resolveNearbyRiderMarkerImage } from "@/features/ride/rideOptionAssets";

/** Storage key used by the in-app "Configure API URL" sheet on the login screen. */
const API_URL_OVERRIDE_KEY = "dev.apiBaseUrl";

// Restore the API URL override BEFORE any module-level code makes a request.
// This runs at JS load time, not in a useEffect, so the override is in place
// before React starts rendering (and well before the first OTP send).
void (async () => {
  try {
    ensureMapboxSearchReady();
    const stored = await AsyncStorage.getItem(API_URL_OVERRIDE_KEY);
    if (stored && stored.trim().length > 0) {
      setRuntimeApiBaseUrl(stored);
      // eslint-disable-next-line no-console
      console.log("[env] using stored API base URL override:", stored);
    }
  } catch {
    /* AsyncStorage unavailable on first launch; ignore */
  }
})();

// Warm the order-tracking map's rider marker icon cache at startup — on a cold
// session this asset download + base64 encode is slow enough to lose the race
// against navigating straight to the tracking screen after placing the first
// order, which otherwise shows "Map unavailable" until the icon finally resolves.
void resolveMapImageDataUri(resolveNearbyRiderMarkerImage("bike"));

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

  const ready = fontsLoaded && hydrated && cartHydrated;
  // Never block first paint on home prefetch — cache-first screens paint instantly;
  // prefetchHomeScreenData / AppAssetsPrefetch continue in background.
  const appReady = ready;

  const handleSplashExitComplete = useCallback(() => {
    setSplashExited(true);
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    hydrateAuth();
    hydrateCart();
    hydrateLanguage();
    void hydrateLocation();
  }, [hydrateAuth, hydrateCart, hydrateLanguage, hydrateLocation]);

  useEffect(() => {
    if (!ready || !session) {
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
  }, [ready, session]);

  useEffect(() => {
    if (!ready || !session) {
      setStartupTimedOut(false);
      return;
    }
    const timeout = setTimeout(() => setStartupTimedOut(true), 7_000);
    return () => clearTimeout(timeout);
  }, [ready, session]);

  useEffect(() => {
    if (!ready || session) return;
    if (assetsLoaded || homeImagesPrefetched) return;
    const timeout = setTimeout(() => {
      useAppAssetsStore.getState().setHomeImagesPrefetched(true);
    }, 5_000);
    return () => clearTimeout(timeout);
  }, [ready, session, assetsLoaded, homeImagesPrefetched]);

  useEffect(() => {
    if (hydrated && useAuthStore.getState().session) {
      extendStartupApiGate(12_000);
    }
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !cartHydrated) return;
    void (async () => {
      await hydrateLocation();
      let { coords, address, locationSource } = useLocationStore.getState();
      if (coords) {
        await restoreAndPrefetchLocationWeather(queryClient, address, coords);
      }
      if (locationSource === "selected" && coords && address) {
        await promptLocationPermissionIfNeeded({ force: false });
        return;
      }
      await promptLocationPermissionIfNeeded({ force: true });
      ({ locationSource, coords, address } = useLocationStore.getState());
      const readiness = await getDeviceLocationReadiness();
      if (!readiness.isReady) return;
      if (locationSource === "selected" && coords && address) return;
      await requestPermissionAndFetch({ forceDevice: true });
    })();
  }, [hydrated, cartHydrated, hydrateLocation, promptLocationPermissionIfNeeded, requestPermissionAndFetch, queryClient]);

  const onLayoutRootView = useCallback(() => {
    if (ready && splashExited) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore keep-awake related failures when hiding splash
      });
    }
  }, [ready, splashExited]);

  return (
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
          {ready ? (
            <>
              <ReactQueryFocusSync />
              <StoreStatusRealtimeSync />
              <OrderRealtimeSync />
              <SessionRevokedHandler />
              <CustomerPermissionsRealtimeSync />
              <LocationPermissionResumeCheck />
              <LanguageSync />
              <CustomerSystemChrome />
              <RootStack onLayoutRootView={onLayoutRootView} splashActive={!splashExited} />
              <CheckoutBottomSheetHost />
              <GlobalFloatingCart />
              <LocationModalWrapper />
              <PushNotificationBootstrap />
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
              onExitComplete={handleSplashExitComplete}
            />
          ) : null}
        </View>
      </SafeAreaProvider>
    </QueryClientProvider>
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
  const lastSyncedRef = useRef<{
    location: boolean;
    sms: boolean;
    contacts: boolean;
  } | null>(null);

  const syncDevicePermissions = useCallback(async () => {
    if (!hydrated || !session) return;
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
  }, [hydrated, session]);

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

/** Re-check device location when app returns from background or GPS is toggled in quick settings. */
function LocationPermissionResumeCheck() {
  const promptLocationPermissionIfNeeded = useLocationStore((s) => s.promptLocationPermissionIfNeeded);
  const showPermissionModal = useLocationStore((s) => s.showPermissionModal);

  useEffect(() => {
    const sync = () => void promptLocationPermissionIfNeeded();

    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") void sync();
    });

    const interval = setInterval(() => {
      if (AppState.currentState !== "active") return;
      if (useLocationStore.getState().showPermissionModal) void sync();
    }, 2000);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [promptLocationPermissionIfNeeded]);

  useEffect(() => {
    if (!showPermissionModal) return;
    void promptLocationPermissionIfNeeded();
  }, [showPermissionModal, promptLocationPermissionIfNeeded]);

  return null;
}

function LocationModalWrapper() {
  const segments = useSegments() as string[];
  const showPermissionModal = useLocationStore((s) => s.showPermissionModal);
  const setShowPermissionModal = useLocationStore((s) => s.setShowPermissionModal);
  const isAuth = segments[0] === "(auth)";
  const isOnboardingProfilePage =
    segments[0] === "(onboarding)" && (segments[1] ?? "") !== "permissions";
  const canShowLocationModal = !isAuth && !isOnboardingProfilePage;
  return (
    <LocationPermissionModal
      visible={showPermissionModal && canShowLocationModal}
      onDismiss={() => setShowPermissionModal(false)}
    />
  );
}

const SPLASH_CHROME_COLOR = "#5eead4";

function StatusBarSystemUISync({ splashChromeActive }: { splashChromeActive: boolean }) {
  const statusBarBackground = useScreenChromeStore((s) => s.statusBarBackground);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (splashChromeActive) {
      void import("expo-system-ui")
        .then((SystemUI) => SystemUI.setBackgroundColorAsync(SPLASH_CHROME_COLOR))
        .catch(() => {});
      return;
    }
    if (statusBarBackground === "transparent") return;
    void import("expo-system-ui")
      .then((SystemUI) => SystemUI.setBackgroundColorAsync(statusBarBackground))
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
      : insets.top > 0
        ? insets.top
        : DEFAULT_STATUS_BAR_HEIGHT;
  const statusBarBackground = useScreenChromeStore((s) => s.statusBarBackground);
  const statusBarStyle = useScreenChromeStore((s) => s.statusBarStyle);
  const hideStatusBarSpacer = useScreenChromeStore((s) => s.hideStatusBarSpacer);
  const bootstrapActive = useScreenChromeStore((s) => s.bootstrapActive);
  const splashChromeActive = splashActive || bootstrapActive;
  const immersiveStatusBar = hideStatusBarSpacer || splashChromeActive;
  const effectiveStatusBarHeight =
    inProfileStack || inLegalStack || inCheckoutStack || inOrdersStack || hideStatusBarSpacer || splashChromeActive
      ? 0
      : statusBarHeight;
  const stackBottomInset = screenManagesBottomNav(segments)
    ? 0
    : resolveBottomSafeInset(insets.bottom);
  const resolvedStatusBarBackground = splashChromeActive
    ? SPLASH_CHROME_COLOR
    : statusBarBackground;
  const resolvedStatusBarStyle = splashChromeActive ? "light" : statusBarStyle;

  return (
    <>
      <StatusBarSystemUISync splashChromeActive={splashChromeActive} />
      <StatusBar
        style={resolvedStatusBarStyle}
        backgroundColor={
          immersiveStatusBar && statusBarBackground === "transparent"
            ? "transparent"
            : resolvedStatusBarBackground
        }
        translucent={immersiveStatusBar}
      />
      <View
        style={{
          height: effectiveStatusBarHeight,
          backgroundColor: resolvedStatusBarBackground,
          width: "100%",
        }}
      />
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: colors.background.light,
              paddingBottom: stackBottomInset,
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
