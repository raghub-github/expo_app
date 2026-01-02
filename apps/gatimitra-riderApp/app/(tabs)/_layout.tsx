import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Redirect, Tabs } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';

import { useTranslation } from 'react-i18next';
import { useSessionStore } from '@/src/stores/sessionStore';
import { GlobalTopBar } from '@/src/components/GlobalTopBar';
import { colors } from '@/src/theme';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { t } = useTranslation();
  const hydrated = useSessionStore((s) => s.hydrated);
  const session = useSessionStore((s) => s.session);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.light }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }
  
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <GlobalTopBar />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary[500],
          tabBarInactiveTintColor: colors.gray[500],
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: colors.gray[200],
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          headerShown: false,
        }}>
        <Tabs.Screen
          name="orders"
          options={{
            title: t('tabs.orders', 'Orders'),
            tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
          }}
        />
        <Tabs.Screen
          name="earnings"
          options={{
            title: t('tabs.earnings', 'Earnings'),
            tabBarIcon: ({ color }) => <TabBarIcon name="money" color={color} />,
          }}
        />
        <Tabs.Screen
          name="ledger"
          options={{
            title: t('tabs.ledger', 'Ledger'),
            tabBarIcon: ({ color }) => <TabBarIcon name="book" color={color} />,
          }}
        />
        <Tabs.Screen
          name="offers"
          options={{
            title: t('tabs.offers', 'Offers'),
            tabBarIcon: ({ color }) => <TabBarIcon name="bullseye" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile', 'Profile'),
            tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            href: null, // Hide from tab bar
          }}
        />
      </Tabs>
    </View>
  );
}
