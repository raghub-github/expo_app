/**
 * Root layout - providers, theme, and stack navigation.
 * Hydrates auth and cart before showing main UI.
 */

import "../global.css";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useCallback } from "react";
import { View, ActivityIndicator, Text, Image, LogBox } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { useLanguageStore } from "@/store/languageStore";
import { useLocationStore } from "@/store/locationStore";
import { LocationPermissionModal } from "@/components/LocationPermissionModal";
import { setOnSessionRevoked } from "@/services/api";
import { colors } from "@/theme";
import { DEFAULT_STATUS_BAR_HEIGHT } from "@/constants/layout";
import "@/lib/i18n";
import { setAppLanguage } from "@/lib/i18n";

// Suppress benign "Unable to activate keep awake" console error (Expo/Android when device was locked during load)
LogBox.ignoreLogs(["Unable to activate keep awake", "Unable to deactivate keep awake"]);

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

  useEffect(() => {
    hydrateAuth();
    hydrateCart();
    hydrateLanguage();
  }, [hydrateAuth, hydrateCart, hydrateLanguage]);

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
        <SessionRevokedHandler />
        <LanguageSync />
        <RootStack onLayoutRootView={onLayoutRootView} />
        <LocationModalWrapper />
      </SafeAreaProvider>
    </QueryClientProvider>
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

function SessionRevokedHandler() {
  const router = useRouter();
  useEffect(() => {
    setOnSessionRevoked(() => {
      void useAuthStore.getState().logout().then(() => router.replace("/(auth)/login"));
    });
    return () => setOnSessionRevoked(null);
  }, [router]);
  return null;
}

function LocationModalWrapper() {
  const segments = useSegments();
  const showPermissionModal = useLocationStore((s) => s.showPermissionModal);
  const setShowPermissionModal = useLocationStore((s) => s.setShowPermissionModal);
  const isAuth = segments[0] === "(auth)";
  const isOnboardingProfilePage =
    segments[0] === "(onboarding)" && segments[1] !== "permissions";
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
          <Stack.Screen name="home" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="wallet" />
          <Stack.Screen name="notifications" />
        </Stack>
      </View>
    </>
  );
}
