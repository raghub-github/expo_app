// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useRef } from 'react';
import { Redirect, Tabs, router, useSegments } from 'expo-router';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/src/stores/sessionStore';
import { useOnboardingGate } from '@/src/hooks/useOnboardingGate';
import { prefetchEarningsSummary } from '@/src/hooks/useEarnings';
import { RIDER_DUTY_STATUS_QUERY_KEY } from '@/src/hooks/useDutyStatus';
import { riderApi } from '@/src/services/api/riderApi';
import { prefetchRiderBankPaymentMethod } from '@/src/hooks/useRiderBankAccount';
import { prefetchRiderSubscriptionStatus } from '@/src/hooks/useRiderSubscription';
import { GlobalTopBar } from '@/src/components/GlobalTopBar';
import { RiderBootstrapScreen } from '@/src/components/RiderBootstrapScreen';
import { RiderHomeLocationPrompt } from '@/src/components/home/RiderHomeLocationPrompt';
import { RiderSubscriptionPrompt } from '@/src/components/subscription/RiderSubscriptionPrompt';
import { RiderVehiclePrompt } from '@/src/components/vehicle/RiderVehiclePrompt';
import { RiderVehicleVerificationHost } from '@/src/components/vehicle/RiderVehicleVerificationHost';
import { RiderLogoutSheetHost } from '@/src/components/profile/RiderLogoutSheetHost';
import { EarningsBankSheetHost } from '@/src/components/earnings/EarningsBankSheetHost';
import { ActiveOrderTabOverlay } from '@/src/components/orders/ActiveOrderTabOverlay';
import { RiderTabBar } from '@/src/components/navigation/RiderTabBar';

export default function TabLayout() {
  const { t } = useTranslation();
  const segments = useSegments();
  const queryClient = useQueryClient();
  const hydrated = useSessionStore((s) => s.hydrated);
  const hasSession = useSessionStore((s) => Boolean(s.session));
  const accessToken = useSessionStore((s) => s.session?.accessToken);
  const { ready: onboardingGateReady, href: onboardingHref, canAccessTabs } = useOnboardingGate();
  const onboardingReplaceRef = useRef<string | null>(null);

  const onOrdersHome = segments[0] === '(tabs)' && segments[1] === 'orders';

  useEffect(() => {
    if (!hydrated || !onboardingGateReady || !hasSession || canAccessTabs || !onboardingHref) return;
    const target = onboardingHref as string;
    if (onboardingReplaceRef.current === target) return;
    onboardingReplaceRef.current = target;
    router.replace(onboardingHref);
  }, [hydrated, onboardingGateReady, hasSession, canAccessTabs, onboardingHref]);

  useEffect(() => {
    if (!accessToken || !canAccessTabs) return;
    void prefetchEarningsSummary(queryClient);
    void queryClient.prefetchQuery({
      queryKey: RIDER_DUTY_STATUS_QUERY_KEY,
      queryFn: () => riderApi.getDutyStatus(),
      staleTime: 30_000,
    });
    void prefetchRiderBankPaymentMethod(queryClient);
    void prefetchRiderSubscriptionStatus(queryClient, accessToken);
  }, [accessToken, canAccessTabs, queryClient]);

  if (!hydrated && !hasSession) {
    return <RiderBootstrapScreen />;
  }
  
  if (hydrated && !hasSession) {
    return <Redirect href="/(auth)/login" />;
  }

  if (hasSession && !canAccessTabs && onboardingHref && onboardingGateReady) {
    return <Redirect href={onboardingHref} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <RiderHomeLocationPrompt />
      <View
        pointerEvents={onOrdersHome ? "none" : "auto"}
        style={onOrdersHome ? { display: "none" } : undefined}
        collapsable={false}
      >
        <GlobalTopBar />
      </View>
        <Tabs
        tabBar={(props) => <RiderTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: false,
          freezeOnBlur: true,
        }}>
        <Tabs.Screen name="orders" options={{ title: t('tabs.orders', 'Orders') }} />
        <Tabs.Screen name="ledger" options={{ title: t('tabs.ledger', 'Ledger') }} />
        <Tabs.Screen name="offers" options={{ title: t('tabs.offers', 'Offers') }} />
        <Tabs.Screen name="earnings" options={{ title: t('tabs.earnings', 'Earnings') }} />
        <Tabs.Screen
          name="profile"
          options={{ title: t('tabs.profile', 'Profile') }}
        />
        <Tabs.Screen name="index" options={{ href: null }} />
      </Tabs>
      <RiderSubscriptionPrompt />
      <RiderVehiclePrompt />
      <RiderVehicleVerificationHost />
      <RiderLogoutSheetHost />
      <EarningsBankSheetHost />
      <View
        pointerEvents={onOrdersHome ? "none" : "auto"}
        style={onOrdersHome ? { display: "none" } : undefined}
        collapsable={false}
      >
        <ActiveOrderTabOverlay />
      </View>
    </View>
  );
}
