/**
 * GatiMitra Merchant — Premium multi-layer header.
 * Layout: [Logo + Greeting] ---- [Radar] ---- [Notification]
 * Left = Identity, center-right = Live radar, far right = Alerts.
 */

import { useEffect, useRef } from "react";
import { View, Image, Pressable, Text, StyleSheet, Platform, LayoutAnimation } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, HEADER_RIGHT_EDGE } from "@/constants/theme";
import { OnlineOfflineToggle } from "@/components/OnlineOfflineToggle";
import { RadarLiveIndicator } from "@/components/RadarLiveIndicator";
import { useStoreStatus } from "@/context/StoreStatusContext";

const LOGO_SIZE = 32;
const LOGO_TO_GREETING_GAP = 8;
const RADAR_TO_BELL_GAP = 12;
const RADAR_LEFT_MARGIN = 12;
const BELL_SIZE = 23;
const CARD_RADIUS = 14;
const CARD_PADDING = 15;

const PAGE_TITLES: Record<string, string> = {
  index: "Dashboard",
  orders: "Orders",
  menu: "Catalog",
  earnings: "Earnings",
  profile: "Profile",
};

const PARTNER_LABEL = "Partner"; // GatiMitra Partner — from auth/profile when available

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

function MainHeader({ compact }: { compact?: boolean }) {
  const { isOnline } = useStoreStatus();
  const segments = useSegments();
  const tab = segments[segments.length - 1] ?? "index";
  const pageTitle = PAGE_TITLES[String(tab)] ?? "Dashboard";
  const greeting = getGreeting();

  useEffect(() => {
    if (Platform.OS !== "web") {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isOnline]);

  return (
    <View style={[styles.mainHeader, compact && styles.mainHeaderCompact]}>
      <View style={styles.mainHeaderInner}>
        {/* Left: Identity — logo + greeting (may truncate on small screens) */}
        <View style={styles.leftSection}>
          <Image
            source={require("../assets/onlylogo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="GatiMitra"
          />
          <View style={styles.greetingBlock}>
            <Text style={styles.greeting} numberOfLines={1}>
              {greeting}, {PARTNER_LABEL} 👋
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {pageTitle}
            </Text>
          </View>
        </View>
        {/* Right: Radar (when online) + Notification bell */}
        <View style={styles.rightSection}>
          {isOnline && (
            <View style={styles.radarWrap}>
              <RadarLiveIndicator />
            </View>
          )}
          <Pressable
            onPress={() => {}}
            style={({ pressed }) => [
              styles.bellWrap,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <Ionicons
              name="notifications-outline"
              size={BELL_SIZE}
              color={GatiMitraMerchant.textPrimary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StoreStatusCard() {
  const { isOnline, toggle } = useStoreStatus();
  useEffect(() => {
    if (Platform.OS !== "web") {
      const { LayoutAnimation } = require("react-native");
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
  }, [isOnline]);
  return (
    <View style={[styles.statusCard, isOnline ? styles.statusCardOnline : styles.statusCardOffline]}>
      <View style={styles.statusCardInner}>
        <View style={styles.statusCardLeft}>
          <Text style={styles.statusCardTitle}>Store Status</Text>
          <Text style={styles.statusCardSubtitle}>
            {isOnline ? "You are receiving orders" : "Store is closed"}
          </Text>
        </View>
        <View style={styles.statusCardRight}>
          <OnlineOfflineToggle isOnline={isOnline} onToggle={toggle} />
        </View>
      </View>
    </View>
  );
}

export function MerchantCustomHeader() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const segments = useSegments();
  const tab = segments[segments.length - 1] ?? "index";
  // Home = first tab: path "/" or "/(tabs)" or last segment "index" (segment can be "(tabs)" when only group is set)
  const isHomeScreen =
    pathname === "/" ||
    pathname === "/(tabs)" ||
    pathname === "/(tabs)/" ||
    tab === "index";
  // Use full top inset so the system status bar is always visible on all pages
  const topPadding = Math.max(insets.top, 8);

  return (
    <View style={[styles.wrapper, { paddingTop: topPadding }]}>
      <View style={[styles.mainSection, !isHomeScreen && styles.mainSectionNoCard]}>
        <MainHeader compact={!isHomeScreen} />
        {isHomeScreen && <StoreStatusCard />}
      </View>
    </View>
  );
}

export function MerchantHeaderLogo() {
  return (
    <Image
      source={require("../assets/onlylogo.png")}
      style={styles.logo}
      resizeMode="contain"
      accessibilityLabel="GatiMitra"
    />
  );
}

export function MerchantHeaderNotification({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bellWrap, pressed && styles.pressed, GatiMitraMerchant.cursorPointer]}
    >
      <Ionicons name="notifications-outline" size={BELL_SIZE} color={GatiMitraMerchant.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  mainSection: {
    paddingHorizontal: H_PADDING,
    paddingTop: 14,
    paddingBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  mainSectionNoCard: {
    paddingBottom: 10,
  },
  mainHeader: {
    marginBottom: 14,
  },
  mainHeaderCompact: {
    marginBottom: 0,
  },
  mainHeaderInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: HEADER_RIGHT_EDGE,
  },
  leftSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: LOGO_TO_GREETING_GAP,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: RADAR_TO_BELL_GAP,
    marginLeft: RADAR_LEFT_MARGIN,
  },
  radarWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
  greetingBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  greeting: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  bellWrap: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  statusCard: {
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  statusCardOnline: {
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraMerchant.storeOnline,
  },
  statusCardOffline: {
    borderLeftWidth: 4,
    borderLeftColor: GatiMitraMerchant.storeOffline,
  },
  statusCardInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusCardLeft: {
    flex: 1,
    minWidth: 0,
  },
  statusCardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  statusCardSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  statusCardRight: {
    marginLeft: 12,
  },
});
