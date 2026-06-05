import { Redirect } from "expo-router";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useLanguageStore } from "@/src/stores/languageStore";
import { useOnboardingGate } from "@/src/hooks/useOnboardingGate";
import { View, ActivityIndicator, Text } from "react-native";
import { colors } from "@/src/theme";
import { useEffect } from "react";

export default function Index() {
  const hydrated = usePermissionStore((s) => s.hydrated);
  const hasRequestedPermissions = usePermissionStore((s) => s.hasRequestedPermissions);
  const session = useSessionStore((s) => s.session);
  const languageSelected = useLanguageStore((s) => s.languageSelected);
  const languageHydrated = useLanguageStore((s) => s.hydrated);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const { ready: onboardingGateReady, href: onboardingHref } = useOnboardingGate();

  useEffect(() => {
    hydrateLanguage().catch((err) => {
      console.warn("[Index] Language hydration failed:", err);
    });
  }, [hydrateLanguage]);

  useEffect(() => {
    console.log("[Index] State:", { hydrated, hasRequestedPermissions, hasSession: !!session });
  }, [hydrated, hasRequestedPermissions, session]);

  if (!hydrated || !languageHydrated || (session && !onboardingGateReady)) {
    console.log("[Index] Showing loading screen");
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={{ marginTop: 16, color: colors.text.primary.light }}>Loading...</Text>
      </View>
    );
  }

  if (session && onboardingHref) {
    console.log("[Index] Session found, redirecting by onboarding status:", onboardingHref);
    return <Redirect href={onboardingHref} />;
  }

  if (!languageSelected) {
    console.log("[Index] Language not selected, redirecting to language selection");
    return <Redirect href="/(onboarding)/language" />;
  }

  if (!hasRequestedPermissions) {
    console.log("[Index] Permissions not requested, redirecting to permissions");
    return <Redirect href="/(permissions)/request" />;
  }

  console.log("[Index] Redirecting to login");
  return <Redirect href="/(auth)/login" />;
}
