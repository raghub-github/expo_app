import React, { useEffect, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { View, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RiderSystemChrome } from "@/src/components/RiderSystemChrome";
import { initI18n } from "../i18n";
import { useSessionStore } from "../stores/sessionStore";
import { usePermissionStore } from "../stores/permissionStore";
import { useDutyStore } from "../stores/dutyStore";
import { useRiderServiceFilterStore } from "../stores/riderServiceFilterStore";
import { useOnboardingStore } from "../stores/onboardingStore";
import { useLanguageStore } from "../stores/languageStore";
import { colors } from "../theme";
import { SessionRevokedGate } from "@/src/components/SessionRevokedGate";
import { AppAssetsPrefetch } from "@/src/components/AppAssetsPrefetch";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const i18n = useMemo(() => initI18n(), []);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
    [],
  );

  const hydrateSession = useSessionStore((s) => s.hydrate);
  const refreshSessionIfNeeded = useSessionStore((s) => s.refreshSessionIfNeeded);
  const session = useSessionStore((s) => s.session);
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const hydratePermissions = usePermissionStore((s) => s.hydrate);
  const hydrateDuty = useDutyStore((s) => s.hydrate);
  const hydrateServiceFilter = useRiderServiceFilterStore((s) => s.hydrate);
  const syncDutyFromServer = useDutyStore((s) => s.syncFromServer);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);

  useEffect(() => {
    void Promise.allSettled([
      hydrateSession(),
      hydratePermissions(),
      hydrateDuty(),
      hydrateServiceFilter(),
      hydrateOnboarding(),
      hydrateLanguage(),
    ]);
  }, [hydrateSession, hydratePermissions, hydrateDuty, hydrateServiceFilter, hydrateOnboarding, hydrateLanguage]);

  useEffect(() => {
    if (!sessionHydrated || !session) return;
    void refreshSessionIfNeeded();
    void syncDutyFromServer();
  }, [sessionHydrated, session, refreshSessionIfNeeded, syncDutyFromServer]);

  if (!i18n || !queryClient) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.light }}>
        <Text style={{ color: colors.error[500] }}>Provider Error</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <RiderSystemChrome />
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <AppAssetsPrefetch />
          <SessionRevokedGate />
          {children}
        </QueryClientProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
