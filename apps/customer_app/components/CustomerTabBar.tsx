import React, { useEffect } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT,
  resolveCustomerBottomNavHeight,
  resolveTabBarBottomInset,
} from "@/constants/layout";
import { useCustomerGeoServiceAvailability } from "@/hooks/useCustomerGeoServiceAvailability";
import { useCustomerServiceBlocks } from "@/hooks/useCustomerServiceBlocks";
import { CUSTOMER_HOME_SERVICE_META } from "@/lib/customerHomeServiceMeta";
import { useCustomerServiceBlockSheetStore } from "@/store/customerServiceBlockSheetStore";
import { AppText } from "@/components/AppText";

const TAB_ACTIVE = GatiMitraColors.splashMint;
const TAB_INACTIVE = "#94A3B8";
const TAB_DISABLED = "#CBD5E1";
const ICON_SIZE = 23;

/** @deprecated Use `CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT` from `@/constants/layout`. */
export const CUSTOMER_TAB_BAR_CONTENT_HEIGHT = CUSTOMER_BOTTOM_NAV_CONTENT_HEIGHT;

export function customerTabBarOffset(insetsBottom: number): number {
  return resolveCustomerBottomNavHeight(insetsBottom);
}

type IconFamily = "ionicons" | "material";

type TabConfig = {
  routeName: string;
  label: string;
  family: IconFamily;
  icon: string;
  iconFocused: string;
};

/** Icons aligned with reference mockup (cloche, receipt, tag-%, profile). */
const TABS: TabConfig[] = [
  {
    routeName: "index",
    label: "Home",
    family: "ionicons",
    icon: "home-outline",
    iconFocused: "home",
  },
  {
    routeName: "food",
    label: "Food",
    family: "material",
    icon: "room-service-outline",
    iconFocused: "room-service",
  },
  {
    routeName: "orders",
    label: "Orders",
    family: "material",
    icon: "clipboard-text-outline",
    iconFocused: "clipboard-text",
  },
  {
    routeName: "profile",
    label: "Profile",
    family: "material",
    icon: "account-outline",
    iconFocused: "account",
  },
];

function getTabConfig(routeName: string): TabConfig {
  return TABS.find((t) => t.routeName === routeName) ?? TABS[0];
}

function TabIcon({ tab, focused, disabled }: { tab: TabConfig; focused: boolean; disabled?: boolean }) {
  const name = focused ? tab.iconFocused : tab.icon;
  const color = disabled ? TAB_DISABLED : focused ? TAB_ACTIVE : TAB_INACTIVE;

  if (tab.family === "material") {
    return (
      <MaterialCommunityIcons
        name={name as keyof typeof MaterialCommunityIcons.glyphMap}
        size={ICON_SIZE}
        color={color}
      />
    );
  }

  return (
    <Ionicons
      name={name as keyof typeof Ionicons.glyphMap}
      size={ICON_SIZE}
      color={color}
    />
  );
}

export function CustomerTabBar({ state, navigation }: BottomTabBarProps) {
  const { bottom: rawBottom } = useSafeAreaInsets();
  const router = useRouter();
  const { enabledServices } = useCustomerGeoServiceAvailability();
  const { accountBlocks } = useCustomerServiceBlocks();
  const openBlockSheet = useCustomerServiceBlockSheetStore((s) => s.open);
  const foodEnabled = enabledServices.food;
  const foodBlocked = Boolean(accountBlocks.food);
  const bottomPad = resolveTabBarBottomInset(rawBottom);

  const visibleRoutes = state.routes.filter(
    (route) => route.name !== "offers" && (route.name !== "food" || foodEnabled)
  );

  useEffect(() => {
    if ((!foodEnabled || foodBlocked) && state.routes[state.index]?.name === "food") {
      navigation.navigate("index");
    }
  }, [foodEnabled, foodBlocked, state.index, state.routes, navigation]);

  return (
    <View style={[styles.wrapper, bottomPad > 0 ? { paddingBottom: bottomPad } : null]}>
      <View style={styles.bar}>
        {visibleRoutes.map((route) => {
          const focused = state.routes[state.index]?.name === route.name;
          const tab = getTabConfig(route.name);
          const onPress = () => {
            if (route.name === "food") {
              if (foodBlocked) {
                openBlockSheet({
                  serviceLabel: CUSTOMER_HOME_SERVICE_META.food.label,
                  reason: accountBlocks.food!,
                  serviceAssetKey: CUSTOMER_HOME_SERVICE_META.food.assetKey,
                });
                return;
              }
              router.push("/home" as never);
              return;
            }
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          const foodTabDisabled = route.name === "food" && foodBlocked;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={tab.label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[styles.tab, foodTabDisabled && styles.tabDisabled]}
            >
              <TabIcon tab={tab} focused={focused} disabled={foodTabDisabled} />
              <AppText
                style={[
                  styles.label,
                  focused && !foodTabDisabled && styles.labelActive,
                  foodTabDisabled && styles.labelDisabled,
                ]}
              >
                {tab.label}
              </AppText>
              {focused ? <View style={styles.activeUnderline} /> : <View style={styles.underlineSpacer} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 2,
    gap: 3,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: TAB_INACTIVE,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: TAB_ACTIVE,
    fontWeight: "700",
  },
  labelDisabled: {
    color: TAB_DISABLED,
  },
  tabDisabled: {
    opacity: 0.72,
  },
  activeUnderline: {
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: TAB_ACTIVE,
    marginTop: 1,
  },
  underlineSpacer: {
    height: 4,
  },
});
