import React from "react";
import { router } from "expo-router";
import { RiderTabBar } from "@/src/components/navigation/RiderTabBar";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

const TAB_ROUTES = ["orders", "ledger", "offers", "earnings", "profile"] as const;

type TabRoute = (typeof TAB_ROUTES)[number];

type Props = {
  /** Which tab to highlight when this bar is shown on a stack screen (e.g. active ride). */
  activeTab?: TabRoute;
};

/** Tab bar for stack screens (navigation) so riders can switch tabs without leaving the app chrome. */
export function PersistentRiderTabBar({ activeTab = "orders" }: Props) {
  const activeIndex = Math.max(0, TAB_ROUTES.indexOf(activeTab));

  const navigation = {
    emit: () => ({ defaultPrevented: false }),
    navigate: (name: string) => {
      router.replace(`/(tabs)/${name}` as `/(tabs)/${TabRoute}`);
    },
  };

  const state = {
    index: activeIndex,
    routes: TAB_ROUTES.map((name, i) => ({
      key: `${name}-${i}`,
      name,
    })),
  };

  const descriptors = Object.fromEntries(
    TAB_ROUTES.map((name, i) => [
      `${name}-${i}`,
      {
        options: { title: name.charAt(0).toUpperCase() + name.slice(1) },
      },
    ])
  );

  const props = {
    state,
    descriptors,
    navigation,
  } as unknown as BottomTabBarProps;

  return <RiderTabBar {...props} />;
}
