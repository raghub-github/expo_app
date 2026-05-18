import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { GatiMitraMerchant } from "@/constants/theme";
import { StoreStatusProvider } from "@/context/StoreStatusContext";
import { AuthProvider } from "@/context/AuthContext";
import { SelectedStoreProvider } from "@/context/SelectedStoreContext";
import { StoreSettingsProvider } from "@/context/StoreSettingsContext";
import { ProfileNavProvider } from "@/context/ProfileNavContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import FloatingOrdersManager from "../components/FloatingOrdersManager";
import IncomingOrderModal from "../components/IncomingOrderModal";
import { SessionRevokedGate } from "@/components/SessionRevokedGate";
import NotificationSetup from "../components/NotificationSetup";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 min
      retry: 1,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <SelectedStoreProvider>
              <StoreStatusProvider>
                <StoreSettingsProvider>
                  <ProfileNavProvider>
                    <NotificationProvider>
                      <SubscriptionProvider>
                        <StatusBar
                          style="dark"
                          backgroundColor={GatiMitraMerchant.background}
                          translucent={false}
                          hidden={false}
                        />
                        <NotificationSetup />
                        <FloatingOrdersManager />
                        <IncomingOrderModal />
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
                      </SubscriptionProvider>
                    </NotificationProvider>
                  </ProfileNavProvider>
                </StoreSettingsProvider>
              </StoreStatusProvider>
            </SelectedStoreProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
