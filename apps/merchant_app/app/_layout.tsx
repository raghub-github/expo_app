import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GatiMitraMerchant } from "@/constants/theme";
import { StoreStatusProvider } from "@/context/StoreStatusContext";
import { AuthProvider } from "@/context/AuthContext";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
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
      </AuthProvider>
    </SafeAreaProvider>
  );
}
