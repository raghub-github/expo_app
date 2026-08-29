import { Platform, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, TAB_BAR_HEIGHT, TAB_BAR_FLOATING_GAP, FONT_LORA } from "@/constants/theme";
import { MerchantCustomHeader } from "@/components/MerchantHeader";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { FloatingPendingOrdersBar } from "@/components/FloatingPendingOrdersBar";
import { OfflineContentOverlay } from "@/components/OfflineContentOverlay";
import { usePrefetchLiveOrderSupportTopics } from "@/hooks/useLiveOrderSupportTopics";
import { usePrefetchMenuCatalog } from "@/hooks/useMenuQueries";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { MerchantBootstrapScreen } from "@/components/MerchantBootstrapScreen";

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

function MerchantTabsShell() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;
  const tabBarTotalHeight = TAB_BAR_HEIGHT + bottomInset + TAB_BAR_FLOATING_GAP + 6;
  usePrefetchLiveOrderSupportTopics();
  usePrefetchMenuCatalog();

  return (
      <View style={{ flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm }}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        /** Custom FloatingTabBar honors this — hides bar while typing so inputs stay above the keyboard. */
        tabBarHideOnKeyboard: true,
        /** Hidden hub screens stay lazy. Visible tabs opt into eager mount below. */
        lazy: true,
        freezeOnBlur: true,
        animation: "none",
        tabBarActiveTintColor: GatiMitraMerchant.tabActive,
        tabBarInactiveTintColor: GatiMitraMerchant.tabInactive,
        tabBarLabelStyle: {
          fontSize: LABEL_FONT_SIZE,
          fontFamily: FONT_LORA,
        },
        tabBarStyle: {
          height: tabBarTotalHeight,
          paddingBottom: 0,
          /** Fills native tab slot; FloatingTabBar paints the same — avoids grey default behind the floating pill (esp. Android / web). */
          backgroundColor: GatiMitraMerchant.surfaceWarm,
          borderTopWidth: 0,
          overflow: "visible",
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
          lazy: false,
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "home" : "home-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          lazy: false,
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "receipt" : "receipt-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Catalog",
          lazy: false,
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
        name="onboarding-benefits"
        options={{
          title: "Onboarding benefits",
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{
          title: "Feedback",
          href: null,
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="complaints"
        options={{
          title: "Complaints",
          /** Shown only via toggle inside Reviews/Complaints screen in Flow hub. */
          href: null,
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "warning" : "warning-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          lazy: false,
          tabBarIcon: ({ color, focused, size }) => (
            <TabIcon name={focused ? "person" : "person-outline"} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
      <OfflineContentOverlay />
      <FloatingPendingOrdersBar />
      </View>
  );
}

export default function TabsLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { selectedStore, isStoreReady } = useSelectedStore();

  if (authLoading || (isAuthenticated && !isStoreReady)) {
    return <MerchantBootstrapScreen />;
  }

  if (isAuthenticated && !selectedStore) {
    return <Redirect href="/(auth)/partner-home" />;
  }

  return <MerchantTabsShell />;
}
