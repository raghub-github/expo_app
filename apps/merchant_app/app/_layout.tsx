import { useEffect, useState } from "react";
import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { Lora_700Bold } from "@expo-google-fonts/lora";
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
import { MerchantBootstrapScreen } from "@/components/MerchantBootstrapScreen";

void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lora_700Bold,
    Poppins_700Bold,
  });
  const [assetsReady, setAssetsReady] = useState(false);

  useEffect(() => {
    // Always refresh so Super Admin image changes appear after app reopen.
    void fetchMerchantAppAssets()
      .then((res) => setAppAssets(res.assets ?? {}))
      .catch(() => {
        if (!isAppAssetsLoaded()) setAppAssets({});
      })
      .finally(() => setAssetsReady(true));
  }, []);

  const ready = fontsLoaded && assetsReady;

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <MerchantBootstrapScreen />
      </SafeAreaProvider>
    );
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
