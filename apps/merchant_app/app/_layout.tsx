import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GatiMitraMerchant } from "@/constants/theme";
import { StoreStatusProvider } from "@/context/StoreStatusContext";
import { AuthProvider } from "@/context/AuthContext";
import { SelectedStoreProvider } from "@/context/SelectedStoreContext";

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
      <SafeAreaProvider>
        <AuthProvider>
          <SelectedStoreProvider>
            <StoreStatusProvider>
            <StatusBar style="dark" backgroundColor="#FFFFFF" />
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
            </Stack>
            </StoreStatusProvider>
          </SelectedStoreProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
