import { useEffect, useState } from "react";
import "react-native-gesture-handler";
import { LogBox } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { Lora_400Regular, Lora_700Bold } from "@expo-google-fonts/lora";
import { Poppins_700Bold } from "@expo-google-fonts/poppins";
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
import { OrdersProvider } from "@/context/OrdersContext";
import { ProfileNavProvider } from "@/context/ProfileNavContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import { LiveSupportTicketProvider } from "@/context/LiveSupportTicketContext";
import { FloatingLiveSupportTicket } from "@/components/FloatingLiveSupportTicket";
import LiveOrdersOngoingNotification from "../components/LiveOrdersOngoingNotification";
import IncomingOrderModal from "../components/IncomingOrderModal";
import IncomingOrderNotificationBridge from "../components/IncomingOrderNotificationBridge";
import AcceptanceTimeoutSync from "../components/AcceptanceTimeoutSync";
import { IncomingOrderSheetProvider } from "@/context/IncomingOrderSheetContext";
import { SessionRevokedGate } from "@/components/SessionRevokedGate";
import NotificationSetup from "../components/NotificationSetup";
import { fetchMerchantAppAssets } from "@/services/appAssets.service";
import { isAppAssetsLoaded, setAppAssets } from "@/store/appAssetsStore";
import OrderAlertPushHandler from "../components/OrderAlertPushHandler";
import WaitingForOrderNotifier from "../components/WaitingForOrderNotifier";
import StoreOnlineStatusNotifier from "../components/StoreOnlineStatusNotifier";

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

const ASSETS_FETCH_TIMEOUT_MS = 2500;
/** Don't hold splash forever if font download/cache stalls (common with --offline). */
const FONTS_READY_FALLBACK_MS = 1500;

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lora_400Regular,
    Lora_700Bold,
    Poppins_700Bold,
  });
  const [fontsTimedOut, setFontsTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFontsTimedOut(true), FONTS_READY_FALLBACK_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // CMS assets must never block first paint / auth redirect. Soft-fail fast.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ASSETS_FETCH_TIMEOUT_MS);
    void fetchMerchantAppAssets(controller.signal)
      .then((res) => setAppAssets(res.assets ?? {}))
      .catch(() => {
        if (!isAppAssetsLoaded()) setAppAssets({});
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  // Proceed as soon as fonts load — or after a short fallback so login isn't blocked.
  const ready = fontsLoaded || fontsTimedOut;

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Keep native Expo splash (mxappicon) until fonts are ready so the React
  // bootstrap can render title/subtitle in Lora immediately after.
  if (!ready) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <SelectedStoreProvider>
              <LiveSupportTicketProvider>
                <StoreStatusProvider>
                  <StoreSettingsProvider>
                    <OrdersProvider>
                      <ProfileNavProvider>
                        <NotificationProvider>
                          <SubscriptionProvider>
                            <StatusBar
                              style="dark"
                              backgroundColor={GatiMitraMerchant.background}
                              translucent={false}
                              hidden={false}
                            />
                            <IncomingOrderSheetProvider>
                              <NotificationSetup />
                              <OrderAlertPushHandler />
                              <WaitingForOrderNotifier />
                              <StoreOnlineStatusNotifier />
                              <LiveOrdersOngoingNotification />
                              <FloatingLiveSupportTicket />
                              <IncomingOrderModal />
                              <IncomingOrderNotificationBridge />
                              <AcceptanceTimeoutSync />
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
                                <Stack.Screen name="notifications" options={{ headerShown: false }} />
                              </Stack>
                            </IncomingOrderSheetProvider>
                          </SubscriptionProvider>
                        </NotificationProvider>
                      </ProfileNavProvider>
                    </OrdersProvider>
                  </StoreSettingsProvider>
                </StoreStatusProvider>
              </LiveSupportTicketProvider>
            </SelectedStoreProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
