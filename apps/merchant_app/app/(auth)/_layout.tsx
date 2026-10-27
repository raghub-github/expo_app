import { Stack } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { MerchantBootstrapScreen } from "@/components/MerchantBootstrapScreen";

/**
 * Unauthenticated: welcome / login / signup only — partner-home must not mount.
 * Authenticated: partner-home only — login tree must not mount.
 */
export default function AuthLayout() {
  const { authState } = useAuth();

  if (authState.status === "loading" || authState.status === "logging_out") {
    return <MerchantBootstrapScreen />;
  }

  const signedIn = authState.status === "authenticated";

  // Declare every screen statically — conditional Stack.Screen children trigger
  // "Layout children must be of type Screen" under Expo Router.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        statusBarHidden: false,
        statusBarStyle: "dark",
        statusBarTranslucent: false,
        statusBarBackgroundColor: "#F8FAFC",
      }}
    >
      <Stack.Screen name="welcome" redirect={signedIn} />
      <Stack.Screen name="login" redirect={signedIn} />
      <Stack.Screen name="signup-webview" redirect={signedIn} />
      <Stack.Screen name="partner-home" redirect={!signedIn} />
    </Stack>
  );
}
