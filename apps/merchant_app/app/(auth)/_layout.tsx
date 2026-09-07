import { Stack } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { MerchantBootstrapScreen } from "@/components/MerchantBootstrapScreen";

/**
 * Unauthenticated: welcome / login / signup only — partner-home must not mount.
 * Authenticated: partner-home only — login tree must not mount.
 */
export default function AuthLayout() {
  const { authState } = useAuth();

  if (authState.status === "loading") {
    return <MerchantBootstrapScreen />;
  }

  const signedIn = authState.status === "authenticated";

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
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
