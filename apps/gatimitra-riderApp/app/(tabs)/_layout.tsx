// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useRef } from 'react';
import { Redirect, Tabs, router, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/src/stores/sessionStore';
import { useOnboardingGate } from '@/src/hooks/useOnboardingGate';
import { prefetchEarningsSummary } from '@/src/hooks/useEarnings';
import { RIDER_DUTY_STATUS_QUERY_KEY } from '@/src/hooks/useDutyStatus';
import { riderApi } from '@/src/services/api/riderApi';
import { prefetchRiderBankPaymentMethod } from '@/src/hooks/useRiderBankAccount';
import { prefetchRiderSubscriptionStatus } from '@/src/hooks/useRiderSubscription';
import { prefetchLedger } from '@/src/hooks/useLedger';
import { GlobalTopBar } from '@/src/components/GlobalTopBar';
import { RiderHomeLocationPrompt } from '@/src/components/home/RiderHomeLocationPrompt';
import { RiderSubscriptionPrompt } from '@/src/components/subscription/RiderSubscriptionPrompt';
import { RiderVehiclePrompt } from '@/src/components/vehicle/RiderVehiclePrompt';
import { RiderVehicleVerificationHost } from '@/src/components/vehicle/RiderVehicleVerificationHost';
import { RiderLogoutSheetHost } from '@/src/components/profile/RiderLogoutSheetHost';
import { EarningsBankSheetHost } from '@/src/components/earnings/EarningsBankSheetHost';
import { ActiveOrderTabOverlay } from '@/src/components/orders/ActiveOrderTabOverlay';
import { RiderTabBar } from '@/src/components/navigation/RiderTabBar';
import { colors } from '@/src/theme';

const TAB_BRAND = colors.primary[500];

export default function TabLayout() {
  const { t } = useTranslation();
  const segments = useSegments();
  const queryClient = useQueryClient();
  const hydrated = useSessionStore((s) => s.hydrated);
  const session = useSessionStore((s) => s.session);
  const { ready: onboardingGateReady, href: onboardingHref, canAccessTabs } = useOnboardingGate();
  const onboardingReplaceRef = useRef<string | null>(null);

  const onOrdersHome = segments[0] === '(tabs)' && segments[1] === 'orders';

  useEffect(() => {
    if (!hydrated || !onboardingGateReady || !session || canAccessTabs || !onboardingHref) return;
    const target = onboardingHref as string;
    if (onboardingReplaceRef.current === target) return;
    onboardingReplaceRef.current = target;
    router.replace(onboardingHref);
  }, [hydrated, onboardingGateReady, session, canAccessTabs, onboardingHref]);

  useEffect(() => {
    if (!session || !canAccessTabs) return;
    void prefetchEarningsSummary(queryClient);
    void queryClient.prefetchQuery({
      queryKey: RIDER_DUTY_STATUS_QUERY_KEY,
      queryFn: () => riderApi.getDutyStatus(),
      staleTime: 30_000,
    });
    void prefetchRiderBankPaymentMethod(queryClient);
    void prefetchRiderSubscriptionStatus(queryClient, session.accessToken);
    void prefetchLedger(queryClient);
  }, [session, canAccessTabs, queryClient]);

  if (!hydrated) {
    // Session still reading storage — show tabs shell only if we already have a token in memory.
    if (!session) {
      return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.light }}>
          <ActivityIndicator size="large" color={TAB_BRAND} />
        </View>
      );
    }
  }
  
  if (hydrated && !session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (session && !canAccessTabs && onboardingHref && onboardingGateReady) {
    return <Redirect href={onboardingHref} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <RiderHomeLocationPrompt />
      {!onOrdersHome ? <GlobalTopBar /> : null}
        <Tabs
        tabBar={(props) => <RiderTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: false,
          freezeOnBlur: false,
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
      {!onOrdersHome ? <ActiveOrderTabOverlay /> : null}
    </View>
  );
}
