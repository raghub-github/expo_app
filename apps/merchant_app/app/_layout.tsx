import { useCallback, useEffect, useState } from "react";
import "react-native-gesture-handler";
import { LogBox, Platform, StatusBar as RNStatusBar, View } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { Lora_400Regular, Lora_700Bold } from "@expo-google-fonts/lora";
import { Poppins_600SemiBold, Poppins_700Bold } from "@expo-google-fonts/poppins";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { GatiMitraMerchant } from "@/constants/theme";
import { StoreStatusProvider } from "@/context/StoreStatusContext";
import { AuthProvider } from "@/context/AuthContext";
import { SelectedStoreProvider } from "@/context/SelectedStoreContext";
import { StoreSettingsProvider } from "@/context/StoreSettingsContext";
import { ActiveTabProvider } from "@/context/ActiveTabContext";
import { OrdersProvider } from "@/context/OrdersContext";
import { ProfileNavProvider } from "@/context/ProfileNavContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { NotificationPermissionGateProvider } from "@/context/NotificationPermissionGateContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import { LiveSupportTicketProvider } from "@/context/LiveSupportTicketContext";
import { FloatingLiveSupportTicket } from "@/components/FloatingLiveSupportTicket";
import LiveOrdersOngoingNotification from "../components/LiveOrdersOngoingNotification";
import LiveOrdersStickyPushRefresh from "../components/LiveOrdersStickyPushRefresh";
import IncomingOrderModal from "../components/IncomingOrderModal";
import IncomingOrderNotificationBridge from "../components/IncomingOrderNotificationBridge";
import AcceptanceTimeoutSync from "../components/AcceptanceTimeoutSync";
import PreventServicesRealtime from "../components/PreventServicesRealtime";
import ServiceRestrictedNotice from "../components/ServiceRestrictedNotice";
import { IncomingOrderSheetProvider } from "@/context/IncomingOrderSheetContext";
import { SessionRevokedGate } from "@/components/SessionRevokedGate";
import NotificationSetup from "../components/NotificationSetup";
import BackgroundOrderPermissionsGate from "../components/BackgroundOrderPermissionsGate";
import NewOrderAutoOpenHandler from "../components/NewOrderAutoOpenHandler";
import { fetchMerchantAppAssets } from "@/services/appAssets.service";
import { setAppAssets } from "@/store/appAssetsStore";
import { AppAssetsPrefetch } from "@/components/AppAssetsPrefetch";
import OrderAlertPushHandler from "../components/OrderAlertPushHandler";
import WaitingForOrderNotifier from "../components/WaitingForOrderNotifier";
import StoreOnlineStatusNotifier from "../components/StoreOnlineStatusNotifier";
import { NetworkStatusProvider } from "@/context/NetworkStatusContext";
import { OfflineNetworkChrome } from "@/components/OfflineNetworkChrome";
import { PlayInAppUpdateBootstrap } from "@/components/PlayInAppUpdateBootstrap";
import {
  MerchantBootstrapScreen,
  MERCHANT_SPLASH_BG,
} from "@/components/MerchantBootstrapScreen";

void SplashScreen.preventAutoHideAsync().catch(() => {});

// Expo Go (SDK 53+) cannot do remote push — suppress the package's console.error
// if anything still touches expo-notifications during local development.
LogBox.ignoreLogs([
  "expo-notifications",
  "Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go",
  "[expo-av]",
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

const ASSETS_FETCH_TIMEOUT_MS = 8000;
/** Don't hold splash forever if font download/cache stalls (common with --offline). */
const FONTS_READY_FALLBACK_MS = 8000;
/** Keep the branded splash on screen long enough to actually be read. */
const MIN_SPLASH_VISIBLE_MS = 1200;

function AndroidStatusBarSync({ color }: { color: string }) {
  useEffect(() => {
    RNStatusBar.setTranslucent(false);
    RNStatusBar.setBackgroundColor(color);
    RNStatusBar.setBarStyle("dark-content");
  }, [color]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Lora_400Regular,
    Lora_700Bold,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [fontsTimedOut, setFontsTimedOut] = useState(false);
  const [splashExited, setSplashExited] = useState(false);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const typographyReady = fontsLoaded || fontsTimedOut;

  useEffect(() => {
    const t = setTimeout(() => setFontsTimedOut(true), FONTS_READY_FALLBACK_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Keep the native image splash visible until Lora has been registered.
    // Rendering branded copy before this point makes React Native permanently
    // measure its first frame with the system fallback font.
    if (!typographyReady) return;
    const t = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [typographyReady]);

  useEffect(() => {
    if (fontsError && __DEV__) {
      console.warn("[typography] useFonts error:", fontsError);
    }
  }, [fontsError]);

  useEffect(() => {
    if (fontsTimedOut && !fontsLoaded && __DEV__) {
      console.warn(
        "[typography] Fonts not ready after timeout — Lora/Poppins may look like system font"
      );
    }
  }, [fontsTimedOut, fontsLoaded]);

  useEffect(() => {
    // CMS assets must never block first paint / auth redirect. Soft-fail fast.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ASSETS_FETCH_TIMEOUT_MS);
    void fetchMerchantAppAssets(controller.signal)
      .then((res) => setAppAssets(res.assets ?? {}))
      .catch(() => {
        /* Do not mark loaded — AppAssetsPrefetch / screen focus will retry. */
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  // Prefer real font registration; only soft-timeout so login is never blocked forever.
  const ready = typographyReady;
  const appReady = ready && minSplashElapsed;

  /** Native splash must drop as soon as the branded JS splash has painted. */
  const handleSplashReady = useCallback(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleSplashExitComplete = useCallback(() => {
    setSplashExited(true);
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View
            style={{
              flex: 1,
              backgroundColor: splashExited
                ? GatiMitraMerchant.background
                : MERCHANT_SPLASH_BG,
            }}
          >
          {ready ? (
          <NetworkStatusProvider>
          <AuthProvider>
            <SelectedStoreProvider>
              <LiveSupportTicketProvider>
                <StoreStatusProvider>
                  <StoreSettingsProvider>
                    <ActiveTabProvider>
                    <OrdersProvider>
                      <ProfileNavProvider>
                        <NotificationProvider>
                          <NotificationPermissionGateProvider>
                          <SubscriptionProvider>
                            <StatusBar
                              style="dark"
                              backgroundColor={GatiMitraMerchant.surfaceWarm}
                              translucent={false}
                              hidden={false}
                            />
                            {Platform.OS === "android" ? (
                              <AndroidStatusBarSync color={GatiMitraMerchant.surfaceWarm} />
                            ) : null}
                            <IncomingOrderSheetProvider>
                              <NotificationSetup />
                              <AppAssetsPrefetch />
                              <BackgroundOrderPermissionsGate />
                              <NewOrderAutoOpenHandler />
                              <OrderAlertPushHandler />
                              <LiveOrdersStickyPushRefresh />
                              <WaitingForOrderNotifier />
                              <StoreOnlineStatusNotifier />
                              <LiveOrdersOngoingNotification />
                              <FloatingLiveSupportTicket />
                              <IncomingOrderModal />
                              <IncomingOrderNotificationBridge />
                              <AcceptanceTimeoutSync />
                              <PreventServicesRealtime />
                              <ServiceRestrictedNotice />
                              <SessionRevokedGate />
                              <Stack
                                screenOptions={{
                                  headerShown: false,
                                  contentStyle: { backgroundColor: GatiMitraMerchant.background },
                                  animation: "slide_from_right",
                                }}
                              >
                                <Stack.Screen name="index" />
                                <Stack.Screen name="(auth)" />
                                <Stack.Screen name="(tabs)" />
                                <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
                                <Stack.Screen name="order-history" options={{ headerShown: false }} />
                                <Stack.Screen name="restaurant-status" options={{ headerShown: false }} />
                              </Stack>
                              <OfflineNetworkChrome />
                              <PlayInAppUpdateBootstrap />
                            </IncomingOrderSheetProvider>
                          </SubscriptionProvider>
                          </NotificationPermissionGateProvider>
                        </NotificationProvider>
                      </ProfileNavProvider>
                    </OrdersProvider>
                    </ActiveTabProvider>
                  </StoreSettingsProvider>
                </StoreStatusProvider>
              </LiveSupportTicketProvider>
            </SelectedStoreProvider>
          </AuthProvider>
          </NetworkStatusProvider>
          ) : null}
          {!splashExited && typographyReady ? (
            <MerchantBootstrapScreen
              variant="root"
              appReady={appReady}
              statusMessage={
                fontsTimedOut && !fontsLoaded ? "Starting GatiMitra Partner..." : null
              }
              onSplashReady={handleSplashReady}
              onExitComplete={handleSplashExitComplete}
            />
          ) : null}
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
