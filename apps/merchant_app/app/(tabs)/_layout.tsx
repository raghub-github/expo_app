import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, TAB_BAR_HEIGHT } from "@/constants/theme";
import { MerchantCustomHeader } from "@/components/MerchantHeader";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { ActiveTabProvider } from "@/context/ActiveTabContext";

const LABEL_FONT_SIZE = 12;

function TabIcon({
  name,
  focused,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
}) {
  return (
    <Ionicons
      name={name}
      size={24}
      color={color}
      style={{ marginBottom: -2 }}
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  const tabBarTotalHeight = TAB_BAR_HEIGHT + bottomInset;

  return (
    <ActiveTabProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: GatiMitraMerchant.tabActive,
        tabBarInactiveTintColor: GatiMitraMerchant.tabInactive,
        tabBarLabelStyle: {
          fontSize: LABEL_FONT_SIZE,
          fontWeight: "500",
        },
        tabBarStyle: {
          height: tabBarTotalHeight,
          paddingBottom: bottomInset,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerShown: true,
        header: () => <MerchantCustomHeader />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "home" : "home-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "receipt" : "receipt-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Catalog",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "cube" : "cube-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "wallet" : "wallet-outline"} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          unmountOnBlur: true,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? "person" : "person-outline"} focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
    </ActiveTabProvider>
  );
}
