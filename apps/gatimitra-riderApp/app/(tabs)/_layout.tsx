import React from 'react';
import { Redirect, Tabs, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/src/stores/sessionStore';
import { useOnboardingGate } from '@/src/hooks/useOnboardingGate';
import { GlobalTopBar } from '@/src/components/GlobalTopBar';
import { RiderHomeLocationPrompt } from '@/src/components/home/RiderHomeLocationPrompt';
import { RiderSubscriptionPrompt } from '@/src/components/subscription/RiderSubscriptionPrompt';
import { RiderVehiclePrompt } from '@/src/components/vehicle/RiderVehiclePrompt';
import { RiderVehicleVerificationHost } from '@/src/components/vehicle/RiderVehicleVerificationHost';
import { RiderLogoutSheetHost } from '@/src/components/profile/RiderLogoutSheetHost';
import { ActiveOrderTabOverlay } from '@/src/components/orders/ActiveOrderTabOverlay';
import { RiderTabBar } from '@/src/components/navigation/RiderTabBar';
import { colors } from '@/src/theme';

const TAB_BRAND = colors.primary[500];

export default function TabLayout() {
  const { t } = useTranslation();
  const segments = useSegments();
  const hydrated = useSessionStore((s) => s.hydrated);
  const session = useSessionStore((s) => s.session);
  const { ready: onboardingGateReady, href: onboardingHref, canAccessTabs } = useOnboardingGate();

  const onOrdersHome = segments[0] === '(tabs)' && segments[1] === 'orders';

  if (!hydrated || (session && !onboardingGateReady)) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.light }}>
        <ActivityIndicator size="large" color={TAB_BRAND} />
      </View>
    );
  }
  
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!canAccessTabs && onboardingHref) {
    return <Redirect href={onboardingHref} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" backgroundColor="#ffffff" />
      <RiderHomeLocationPrompt />
      {!onOrdersHome ? <GlobalTopBar /> : null}
      <Tabs
        tabBar={(props) => <RiderTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}>
        <Tabs.Screen name="orders" options={{ title: t('tabs.orders', 'Orders') }} />
        <Tabs.Screen name="ledger" options={{ title: t('tabs.ledger', 'Ledger') }} />
        <Tabs.Screen name="offers" options={{ title: t('tabs.offers', 'Offers') }} />
        <Tabs.Screen name="earnings" options={{ title: t('tabs.earnings', 'Earnings') }} />
        <Tabs.Screen
          name="profile"
          options={{ title: t('tabs.profile', 'Profile'), lazy: false }}
        />
        <Tabs.Screen name="index" options={{ href: null }} />
      </Tabs>
      <RiderSubscriptionPrompt />
      <RiderVehiclePrompt />
      <RiderVehicleVerificationHost />
      <RiderLogoutSheetHost />
      {!onOrdersHome ? <ActiveOrderTabOverlay /> : null}
    </View>
  );
}
