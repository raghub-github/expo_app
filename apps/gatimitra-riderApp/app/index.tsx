import { router, type Href } from "expo-router";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useLanguageStore } from "@/src/stores/languageStore";
import { useOnboardingGate } from "@/src/hooks/useOnboardingGate";
import { View, ActivityIndicator, Text } from "react-native";
import { colors } from "@/src/theme";
import { useEffect, useRef } from "react";

export default function Index() {
  const hydrated = usePermissionStore((s) => s.hydrated);
  const hasRequestedPermissions = usePermissionStore((s) => s.hasRequestedPermissions);
  const session = useSessionStore((s) => s.session);
  const languageSelected = useLanguageStore((s) => s.languageSelected);
  const languageHydrated = useLanguageStore((s) => s.hydrated);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const { ready: onboardingGateReady, href: onboardingHref } = useOnboardingGate();
  const lastReplaceTargetRef = useRef<string | null>(null);

  useEffect(() => {
    hydrateLanguage().catch((err) => {
      console.warn("[Index] Language hydration failed:", err);
    });
  }, [hydrateLanguage]);

  useEffect(() => {
    console.log("[Index] State:", { hydrated, hasRequestedPermissions, hasSession: !!session });
  }, [hydrated, hasRequestedPermissions, session]);

  useEffect(() => {
    if (!hydrated || !languageHydrated || (session && !onboardingGateReady)) return;

    let target: Href;
    if (session && onboardingHref) {
      target = onboardingHref;
      console.log("[Index] Session found, redirecting by onboarding status:", target);
    } else if (!languageSelected) {
      target = "/(onboarding)/language";
      console.log("[Index] Language not selected, redirecting to language selection");
    } else if (!hasRequestedPermissions) {
      target = "/(permissions)/request";
      console.log("[Index] Permissions not requested, redirecting to permissions");
    } else {
      target = "/(auth)/login";
      console.log("[Index] Redirecting to login");
    }

    if (lastReplaceTargetRef.current === target) return;
    lastReplaceTargetRef.current = target;
    router.replace(target);
  }, [
    hydrated,
    languageHydrated,
    session,
    onboardingGateReady,
    onboardingHref,
    languageSelected,
    hasRequestedPermissions,
  ]);

  if (!hydrated || !languageHydrated || (session && !onboardingGateReady)) {
    console.log("[Index] Showing loading screen");
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={{ marginTop: 16, color: colors.text.primary.light }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }}>
      <ActivityIndicator size="large" color={colors.primary[500]} />
      <Text style={{ marginTop: 16, color: colors.text.primary.light }}>Loading...</Text>
    </View>
  );
}
