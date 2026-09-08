import React, { useEffect, useMemo } from "react";
import { AppState, View, Text } from "react-native";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
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
import { RiderLocationLifecycle } from "@/src/components/RiderLocationLifecycle";
import { PlayInAppUpdateBootstrap } from "@/src/components/PlayInAppUpdateBootstrap";
import { hydrateRiderSubscriptionCache } from "@/src/lib/rider-subscription-cache";
import { prefetchRiderSubscriptionStatus } from "@/src/hooks/useRiderSubscription";
import { hydrateLastActiveOrders } from "@/src/hooks/useOrders";
import {
  startRiderNetworkMonitor,
  subscribeRiderNetworkRestored,
  useRiderNetworkStore,
} from "@/src/stores/riderNetworkStore";
import { useRiderPendingActionStore } from "@/src/stores/riderPendingActionStore";
import { bindRiderActionRuntime, flushRiderPendingActions } from "@/src/lib/riderActionRuntime";

let reactQueryNativeWired = false;
function wireReactQueryNativeManagers() {
  if (reactQueryNativeWired) return;
  reactQueryNativeWired = true;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (state) => {
      handleFocus(state === "active");
    });
    return () => sub.remove();
  });
  startRiderNetworkMonitor();
  onlineManager.setEventListener((setOnline) => {
    setOnline(useRiderNetworkStore.getState().online);
    return useRiderNetworkStore.subscribe((state) => setOnline(state.online));
  });
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  wireReactQueryNativeManagers();
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
            retry: 0,
          },
        },
      }),
    [],
  );

  const hydrateSession = useSessionStore((s) => s.hydrate);
  const refreshSessionIfNeeded = useSessionStore((s) => s.refreshSessionIfNeeded);
  const sessionAccessToken = useSessionStore((s) => s.session?.accessToken);
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const hydratePermissions = usePermissionStore((s) => s.hydrate);
  const hydrateDuty = useDutyStore((s) => s.hydrate);
  const hydrateServiceFilter = useRiderServiceFilterStore((s) => s.hydrate);
  const syncDutyFromServer = useDutyStore((s) => s.syncFromServer);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const bindOnboardingOwner = useOnboardingStore((s) => s.bindOwner);
  const hydrateLanguage = useLanguageStore((s) => s.hydrate);
  const sessionRiderId = useSessionStore((s) => s.session?.riderId);
  const sessionUserId = useSessionStore((s) => s.session?.userId);

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

  // CRITICAL: partition onboarding + invalidate caches whenever the signed-in rider changes.
  useEffect(() => {
    if (!sessionHydrated) return;
    const owner = sessionRiderId?.trim() || sessionUserId?.trim() || null;
    void bindOnboardingOwner(owner);
    if (!owner) {
      queryClient.removeQueries({ queryKey: ["onboarding"] });
      queryClient.removeQueries({ queryKey: ["rider"] });
      return;
    }
    // Drop other riders' cached status / check-* results from this device runtime.
    queryClient.removeQueries({
      predicate: (q) => {
        const key = q.queryKey;
        if (!Array.isArray(key) || key.length === 0) return false;
        if (key[0] === "onboarding") return true;
        if (key[0] === "rider" && key[1] != null && String(key[1]) !== owner) return true;
        return false;
      },
    });
  }, [sessionHydrated, sessionRiderId, sessionUserId, bindOnboardingOwner, queryClient]);

  useEffect(() => {
    bindRiderActionRuntime(queryClient);
    startRiderNetworkMonitor();
    void hydrateLastActiveOrders(queryClient);
    void useRiderPendingActionStore.getState().hydrate().then(() => {
      void flushRiderPendingActions();
    });
    const unsub = subscribeRiderNetworkRestored(() => {
      void useSessionStore.getState().refreshSessionIfNeeded();
      void useDutyStore.getState().syncFromServer();
      void flushRiderPendingActions();
    });
    return () => unsub();
  }, [queryClient]);

  useEffect(() => {
    if (!sessionHydrated || !sessionAccessToken) return;
    const session = useSessionStore.getState().session;
    if (!session) return;
    void refreshSessionIfNeeded();
    void syncDutyFromServer();
    void hydrateRiderSubscriptionCache().then((cached) => {
      if (!cached) return;
      queryClient.setQueryData(["rider", "subscription", "status"], cached);
    });
    void prefetchRiderSubscriptionStatus(queryClient, session.accessToken);
  }, [sessionHydrated, sessionAccessToken, refreshSessionIfNeeded, syncDutyFromServer, queryClient]);

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
          <RiderLocationLifecycle />
          <SessionRevokedGate />
          <PlayInAppUpdateBootstrap />
          {children}
        </QueryClientProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
