/**
 * Root layout - providers, theme, and stack navigation.
 * Hydrates auth and cart before showing main UI.
 */

import "../global.css";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useCallback, useRef } from "react";
import { View, ActivityIndicator, Text, Image, LogBox, Alert, AppState, type AppStateStatus } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { useLanguageStore } from "@/store/languageStore";
import { useLocationStore } from "@/store/locationStore";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useStoreStatusRealtime } from "@/hooks/useStoreStatusRealtime";
import { useOrderRealtime } from "@/hooks/useOrderRealtime";
import { LocationPermissionModal } from "@/components/LocationPermissionModal";
import { GlobalFloatingCart } from "@/components/GlobalFloatingCart";
import { setOnSessionRevoked } from "@/services/api";
import { profileService } from "@/services/profile.service";
import { colors } from "@/theme";
import { DEFAULT_STATUS_BAR_HEIGHT } from "@/constants/layout";
import "@/lib/i18n";
import { setAppLanguage } from "@/lib/i18n";

// Suppress benign console warnings
LogBox.ignoreLogs([
  "Unable to activate keep awake",
  "Unable to deactivate keep awake",
  "SafeAreaView has been deprecated",
]);

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore keep-awake related failures so app still loads
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60 * 1000 },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // Add custom fonts if needed; SpaceMono optional
  });

  const hydrated = useAuthStore((s) => s.hydrated);
  const cartHydrated = useCartStore((s) => s.hydrated);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateCart = useCartStore((s) => s.hydrate);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const requestPermissionAndFetch = useLocationStore((s) => s.requestPermissionAndFetch);
  const hydrateLocation = useLocationStore((s) => s.hydrate);

  useEffect(() => {
    hydrateAuth();
    hydrateCart();
    hydrateLanguage();
  }, [hydrateAuth, hydrateCart, hydrateLanguage]);

  useEffect(() => {
    if (!hydrated || !cartHydrated) return;
    // First restore last user-selected location (fast header paint), then fallback to GPS only when nothing exists.
    void (async () => {
      await hydrateLocation();
      const { locationSource, coords, address } = useLocationStore.getState();
      if (locationSource === "selected" && coords && address) return;
      await requestPermissionAndFetch({ forceDevice: true });
    })();
  }, [hydrated, cartHydrated, hydrateLocation, requestPermissionAndFetch]);

  const onLayoutRootView = useCallback(() => {
    if (fontsLoaded && hydrated && cartHydrated) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore keep-awake related failures when hiding splash
      });
    }
  }, [fontsLoaded, hydrated, cartHydrated]);

  if (!fontsLoaded || !hydrated || !cartHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.primary[500] }}>
        <Image
          source={require("../public/img/fav.png")}
          style={{ width: 120, height: 120, marginBottom: 24 }}
          resizeMode="contain"
          accessibilityLabel="GatiMitra"
        />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ marginTop: 16, color: "#fff", fontSize: 16 }}>GatiMitra</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StoreStatusRealtimeSync />
        <SessionRevokedHandler />
        <LocationPermissionRealtimeSync />
        <LanguageSync />
        <RootStack onLayoutRootView={onLayoutRootView} />
        <GlobalFloatingCart />
        <LocationModalWrapper />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

function OrderRealtimeSync() {
  useOrderRealtime();
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

function LocationPermissionRealtimeSync() {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const lastSyncedRef = useRef<boolean | null>(null);

  const syncLocationPermission = useCallback(async () => {
    if (!hydrated || !session) return;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const granted = status === "granted";
      if (lastSyncedRef.current === granted) return;

      const currentCoords = useLocationStore.getState().coords;
      await profileService.updateProfile({
        location_permission: granted,
        ...(granted && currentCoords
          ? { latitude: currentCoords.latitude, longitude: currentCoords.longitude }
          : {}),
      });

      lastSyncedRef.current = granted;
    } catch {
      // Keep silent; we'll retry on next app active tick.
    }
  }, [hydrated, session]);

  useEffect(() => {
    void syncLocationPermission();
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") void syncLocationPermission();
    });
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void syncLocationPermission();
    }, 15000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [syncLocationPermission]);

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

const STATUS_BAR_BG = "#FFFFFF";

function RootStack({ onLayoutRootView }: { onLayoutRootView: () => void }) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const inProfileStack = segments[0] === "profile";
  const statusBarHeight = inProfileStack ? 0 : (insets.top > 0 ? insets.top : DEFAULT_STATUS_BAR_HEIGHT);

  return (
    <>
      <StatusBar style="dark" backgroundColor={STATUS_BAR_BG} />
      <View style={{ height: statusBarHeight, backgroundColor: STATUS_BAR_BG, width: "100%" }} />
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background.light },
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
          <Stack.Screen name="wallet" />
          <Stack.Screen name="notifications" />
        </Stack>
      </View>
    </>
  );
}
