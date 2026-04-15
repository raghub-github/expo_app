import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, TAB_BAR_HEIGHT, TAB_BAR_FLOATING_GAP } from "@/constants/theme";
import { MerchantCustomHeader } from "@/components/MerchantHeader";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { ActiveTabProvider } from "@/context/ActiveTabContext";

const LABEL_FONT_SIZE = 12;

function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      style={{ marginBottom: -2 }}
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  const tabBarTotalHeight = TAB_BAR_HEIGHT + bottomInset + TAB_BAR_FLOATING_GAP;

  return (
    <ActiveTabProvider>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        /** Custom FloatingTabBar honors this — hides bar while typing so inputs stay above the keyboard. */
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: GatiMitraMerchant.tabActive,
        tabBarInactiveTintColor: GatiMitraMerchant.tabInactive,
        tabBarLabelStyle: {
          fontSize: LABEL_FONT_SIZE,
          fontWeight: "500",
        },
        tabBarStyle: {
          height: tabBarTotalHeight,
          paddingBottom: 0,
          /** Fills native tab slot; FloatingTabBar paints the same — avoids grey default behind the floating pill (esp. Android / web). */
          backgroundColor: GatiMitraMerchant.surfaceWarm,
          borderTopWidth: 0,
          overflow: "hidden",
          ...Platform.select({
            ios: {
              shadowColor: "transparent",
              shadowOpacity: 0,
              shadowRadius: 0,
            },
            android: { elevation: 0 },
            default: {},
          }),
        },
        headerShown: true,
        header: () => <MerchantCustomHeader />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "home" : "home-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "receipt" : "receipt-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Catalog",
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "cube" : "cube-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: "Earnings",
          /** Shown only on Flow hub — see FloatingTabBar. */
          href: null,
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "wallet" : "wallet-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="growth"
        options={{
          title: "Growth",
          href: null,
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "trending-up" : "trending-up-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{
          title: "Review",
          href: null,
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "star" : "star-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          unmountOnBlur: true,
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "person" : "person-outline"} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
    </ActiveTabProvider>
  );
}
