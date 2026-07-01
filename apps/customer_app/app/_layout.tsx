/**
 * Root layout - providers, theme, and stack navigation.
 * Hydrates auth and cart before showing main UI.
 */

import "react-native-gesture-handler";
import "../global.css";
import { Stack, useRouter, useSegments } from "expo-router";
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
  /**
   * Do not call `useFonts({})` with an empty map — on some Expo/RN builds `fontsLoaded`
   * never flips true, so the app stays on the bootstrap screen forever.
   * When you add real fonts, use `useFonts({ MyFont: require('...') })` and gate on that.
   */
  const fontsLoaded = true;
  const [splashExited, setSplashExited] = useState(false);

  const hydrated = useAuthStore((s) => s.hydrated);
  const cartHydrated = useCartStore((s) => s.hydrated);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateCart = useCartStore((s) => s.hydrate);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const requestPermissionAndFetch = useLocationStore((s) => s.requestPermissionAndFetch);
  const promptLocationPermissionIfNeeded = useLocationStore((s) => s.promptLocationPermissionIfNeeded);
  const hydrateLocation = useLocationStore((s) => s.hydrate);

  const ready = fontsLoaded && hydrated && cartHydrated;

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
            backgroundColor: splashExited ? colors.background.light : GatiMitraColors.splashMint,
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
              <RootStack onLayoutRootView={onLayoutRootView} />
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
            </>
          ) : null}
          {!splashExited ? (
            <GatiMitraBootstrapScreen
              variant="root"
              appReady={ready}
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

function StatusBarSystemUISync() {
  const statusBarBackground = useScreenChromeStore((s) => s.statusBarBackground);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void import("expo-system-ui")
      .then((SystemUI) => SystemUI.setBackgroundColorAsync(statusBarBackground))
      .catch(() => {});
  }, [statusBarBackground]);

  return null;
}

function RootStack({ onLayoutRootView }: { onLayoutRootView: () => void }) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const inProfileStack = segments[0] === "profile";
  const inLegalStack = segments[0] === "legal";
  const statusBarHeight =
    inProfileStack || inLegalStack ? 0 : insets.top > 0 ? insets.top : DEFAULT_STATUS_BAR_HEIGHT;
  const statusBarBackground = useScreenChromeStore((s) => s.statusBarBackground);
  const statusBarStyle = useScreenChromeStore((s) => s.statusBarStyle);
  const hideStatusBarSpacer = useScreenChromeStore((s) => s.hideStatusBarSpacer);
  const effectiveStatusBarHeight =
    inProfileStack || inLegalStack || hideStatusBarSpacer ? 0 : statusBarHeight;
  const stackBottomInset = screenManagesBottomNav(segments)
    ? 0
    : resolveBottomSafeInset(insets.bottom);

  return (
    <>
      <StatusBarSystemUISync />
      <StatusBar style={statusBarStyle} backgroundColor={statusBarBackground} />
      <View
        style={{
          height: effectiveStatusBarHeight,
          backgroundColor: statusBarBackground,
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
          <Stack.Screen name="checkout" />
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
