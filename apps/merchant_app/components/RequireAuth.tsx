import type { ReactNode } from "react";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { MerchantBootstrapScreen } from "@/components/MerchantBootstrapScreen";

/** Gate for the authenticated navigation tree. Does not render children until a session is confirmed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { authState } = useAuth();

  if (authState.status === "loading") {
    return <MerchantBootstrapScreen />;
  }

  if (authState.status !== "authenticated") {
    return <Redirect href="/(auth)/welcome" />;
  }

  return <>{children}</>;
}

/** Gate for welcome / login / signup. Does not render auth screens while a session is confirmed. */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { authState } = useAuth();

  if (authState.status === "loading") {
    return <MerchantBootstrapScreen />;
  }

  if (authState.status === "authenticated") {
    return <Redirect href="/" />;
  }

  return <>{children}</>;
}
