import { Tabs } from "expo-router";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { CustomerTabBar } from "@/components/CustomerTabBar";
import { GatiMitraColors } from "@/constants/gatimitra";

export default function TabsLayout() {
  return (
    <>
      <AndroidBackHandler />
      <Tabs
        tabBar={(props) => <CustomerTabBar {...props} />}
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: GatiMitraColors.softBackground },
          headerShadowVisible: false,
          // Inactive tabs stay mounted (so their data stays warm) but stop
          // re-rendering — otherwise Home's card animations and Orders' polling
          // re-renders kept running while the user was on another tab.
          freezeOnBlur: true,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="food"
          options={{
            title: "Food",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: "Orders",
            headerShown: false,
          }}
        />
        <Tabs.Screen
          name="offers"
          options={{
            title: "Offers",
            headerShown: false,
            href: null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            headerShown: false,
          }}
        />
      </Tabs>
    </>
  );
}
