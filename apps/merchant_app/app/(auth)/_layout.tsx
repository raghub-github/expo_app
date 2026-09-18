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
      {signedIn ? (
        <Stack.Screen name="partner-home" />
      ) : (
        <>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup-webview" />
        </>
      )}
    </Stack>
  );
}
