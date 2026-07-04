/**
 * Profile / Settings — Quick settings style grid UI.
 * Outlet card at top, then grid sections: Manage outlet, Settings, Orders, Support.
 */

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  RefreshControl,
  Platform,
  Linking,
} from "react-native";
import { LogoutConfirmModal } from "@/components/LogoutConfirmModal";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_SCROLL_CONTENT_PADDING,
  CARD_RADIUS,
} from "@/constants/theme";
import { getActivePlanDisplayName } from "@/lib/activePlan";
import { fetchSubscription, type SubscriptionPlan } from "@/services/api";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { useProfileNav } from "@/context/ProfileNavContext";
import { getRushStatus } from "@/services/rushApi";
import { prefetchOperatingHours, prefetchOutlet } from "@/services/outletApi";
import { getPartnerLegalUrls } from "@/lib/partnerLegalUrls";

const CONTENT_TOP = 12;
const TILE_GAP = 10;
const NUM_COLS_SMALL = 3;
const NUM_COLS_LARGE = 4;
const BREAKPOINT = 400;

function GridCard({
  icon,
  label,
  onPress,
  badge,
  tileWidth,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: string;
  tileWidth: number;
  active?: boolean;
}) {
  const iconColor = active ? GatiMitraMerchant.primary : GatiMitraMerchant.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          width: tileWidth,
          minHeight: tileWidth * 0.78,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        active ? styles.tileActive : styles.tileInactive,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <View style={[styles.tileIconWrap, active && styles.tileIconWrapActive]}>
        <Ionicons name={icon} size={24} color={iconColor} />
      </View>
      <View style={[styles.tileLabelWrap, active && styles.tileLabelWrapActive]}>
        <Text
          style={[styles.tileLabel, active ? styles.tileLabelActive : styles.tileLabelInactive]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
      {badge != null && (
        <Text
          style={[styles.tileStatus, active ? styles.tileStatusActive : styles.tileStatusInactive]}
          numberOfLines={1}
        >
          {badge}
        </Text>
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollBottomPadding = TAB_BAR_SCROLL_CONTENT_PADDING;
  const { selectedStore } = useSelectedStore();
  const { signOut, token } = useAuth();
  const { lastProfileSlug, setLastProfileSlug } = useProfileNav();

  const numCols = width >= BREAKPOINT ? NUM_COLS_LARGE : NUM_COLS_SMALL;
  const tileWidth =
    (width - H_PADDING * 2 - TILE_GAP * (numCols - 1)) / numCols;

  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
  const subscriptionActive = subscriptionPlan != null;
  const subscriptionInactive = !subscriptionActive;
  const [rushBadge, setRushBadge] = useState<"OFF" | "ON">("OFF");
  const [refreshing, setRefreshing] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const legalUrls = getPartnerLegalUrls();

  // Do not prefetch nested profile routes here: router.prefetch() can dispatch PRELOAD
  // actions that are not always handled by the profile stack navigator.

  useEffect(() => {
    let cancelled = false;
    fetchSubscription(selectedStore?.id ?? null).then((r) => {
      if (cancelled) return;
      setSubscriptionPlan(r.plan);
    });
    return () => { cancelled = true; };
  }, [selectedStore?.id]);

  useFocusEffect(
    useCallback(() => {
      // Do not clear lastProfileSlug here: when user comes back via back button from
      // an inner page, we keep the last-clicked tile active. Slug is cleared only
      // when Profile tab is pressed (in FloatingTabBar).
      let cancelled = false;
      const run = async () => {
        try {
          if (!selectedStore?.id || !token) {
            if (!cancelled) setRushBadge("OFF");
            return;
          }
          // Prefetch outlet info so Manage Outlet screens open instantly
          prefetchOutlet(selectedStore.id, token);
          prefetchOperatingHours(selectedStore.id, token);
          const status = await getRushStatus(selectedStore.id, token);
          if (cancelled) return;
          setRushBadge(status.is_active && status.remaining_minutes > 0 ? "ON" : "OFF");
        } catch {
          if (!cancelled) setRushBadge("OFF");
        }
      };
      run();
      return () => {
        cancelled = true;
      };
    }, [selectedStore?.id, token, setLastProfileSlug])
  );

  const navigate = (slug: string) => () => router.push(`/(tabs)/profile/${slug}` as any);

  const isActive = (slug: string): boolean => lastProfileSlug === slug;

  const storeName = selectedStore?.store_name ?? "Select a store from Partner Home";
  const storeSubtitle = selectedStore?.full_address
    ? selectedStore.full_address.split(",").slice(0, 2).join(", ")
    : selectedStore
      ? `Store ID: ${selectedStore.store_id}`
      : "No store selected";

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      let cancelled = false;
      // Reload subscription
      fetchSubscription(selectedStore?.id ?? null).then((r) => {
        if (cancelled) return;
        setSubscriptionPlan(r.plan);
      });
      // Reload rush status + outlet prefetch
      if (selectedStore?.id && token) {
        prefetchOutlet(selectedStore.id, token);
        prefetchOperatingHours(selectedStore.id, token);
        try {
          const status = await getRushStatus(selectedStore.id, token);
          if (!cancelled) {
            setRushBadge(status.is_active && status.remaining_minutes > 0 ? "ON" : "OFF");
          }
        } catch {
          if (!cancelled) setRushBadge("OFF");
        }
      } else if (!cancelled) {
        setRushBadge("OFF");
      }
      return () => {
        cancelled = true;
      };
    } finally {
      setRefreshing(false);
    }
  }, [selectedStore?.id, token]);

  return (
    <>
    <LogoutConfirmModal
      visible={logoutModalVisible}
      token={token}
      onStay={() => setLogoutModalVisible(false)}
      onCompleteSignOut={async () => {
        setLogoutModalVisible(false);
        await signOut();
        router.replace("/(auth)/welcome");
      }}
    />
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: CONTENT_TOP, paddingBottom: scrollBottomPadding },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[GatiMitraMerchant.primary]}
          tintColor={GatiMitraMerchant.primary}
        />
      }
    >
      {/* Outlet / Store card at top */}
      <Pressable
        onPress={navigate("edit-store")}
        style={({ pressed }) => [
          styles.outletCard,
          pressed && styles.pressed,
          GatiMitraMerchant.cursorPointer,
        ]}
      >
        <View style={styles.outletIconWrap}>
          <Ionicons name="business-outline" size={24} color={GatiMitraMerchant.primary} />
        </View>
        <View style={styles.outletTextWrap}>
          <Text style={styles.outletName} numberOfLines={2}>{storeName}</Text>
          <Text style={styles.outletSubtitle} numberOfLines={1}>{storeSubtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={GatiMitraMerchant.textTertiary} />
      </Pressable>

      {subscriptionInactive && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={18} color={GatiMitraMerchant.warning} />
          <Text style={styles.warningText}>
            Renew to unlock the rest item to receive more orders.
          </Text>
        </View>
      )}

      {/* Manage outlet — quick settings grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manage outlet</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard icon="information-circle-outline" label="Outlet info" onPress={navigate("edit-store")} tileWidth={tileWidth} active={isActive("edit-store")} />
          <GridCard icon="time-outline" label="Outlet timings" onPress={navigate("hours")} tileWidth={tileWidth} active={isActive("hours")} />
          <GridCard icon="call-outline" label="Phone numbers" onPress={navigate("business-details")} tileWidth={tileWidth} active={isActive("business-details")} />
          <GridCard icon="people-outline" label="Manage staff" onPress={navigate("staff")} tileWidth={tileWidth} active={isActive("staff")} />
        </View>
      </View>

      {/* Settings — quick settings grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard icon="settings-outline" label="Preferences" onPress={navigate("notifications")} tileWidth={tileWidth} active={isActive("notifications")} />
          <GridCard icon="notifications-outline" label="Manage communication" onPress={navigate("communications")} tileWidth={tileWidth} active={isActive("communications")} />
          <GridCard icon="storefront-outline" label="Delivery settings" onPress={navigate("address")} tileWidth={tileWidth} active={isActive("address")} />
          <GridCard icon="flash-outline" label="Rush hour" onPress={navigate("preparation-time")} badge={rushBadge} tileWidth={tileWidth} active={isActive("preparation-time")} />
          <GridCard icon="calendar-outline" label="Schedule off" onPress={navigate("vacation")} tileWidth={tileWidth} active={isActive("vacation")} />
        </View>
      </View>

      {/* Marketing — offers & promotions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Marketing</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard icon="pricetag-outline" label="Offers & Promotions" onPress={navigate("offers")} tileWidth={tileWidth} active={isActive("offers")} />
          <GridCard icon="time-outline" label="Recent Activity" onPress={navigate("activity-feed")} tileWidth={tileWidth} active={isActive("activity-feed")} />
        </View>
      </View>

      {/* Orders — quick settings grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Orders</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard icon="list-outline" label="Order history" onPress={() => router.push("/order-history")} tileWidth={tileWidth} />
          <GridCard icon="alert-circle-outline" label="Complaints" onPress={() => router.push("/(tabs)/profile/complaints")} tileWidth={tileWidth} />
          <GridCard icon="chatbubble-outline" label="Reviews" onPress={() => router.push("/(tabs)/profile/reviews")} tileWidth={tileWidth} />
        </View>
      </View>

      {/* Support — quick settings grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard icon="help-circle-outline" label="Help & support" onPress={navigate("contact")} tileWidth={tileWidth} active={isActive("contact")} />
          <GridCard icon="chatbubbles-outline" label="My tickets" onPress={navigate("tickets")} tileWidth={tileWidth} active={isActive("tickets")} />
        </View>
      </View>

      {/* Subscription & Plan */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Plan</Text>
        <View style={styles.planCard}>
          <View style={styles.planRow}>
            <Text style={styles.planLabel}>Current Plan</Text>
            <View style={[styles.planBadge, subscriptionInactive && styles.planBadgeInactive]}>
              <Text style={[styles.planBadgeText, subscriptionInactive && styles.planBadgeTextInactive]}>
                {subscriptionActive
                  ? (subscriptionPlan?.plan_name ?? getActivePlanDisplayName(subscriptionPlan?.plan_code ?? "FREE"))
                  : "Inactive"}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={navigate("plans")}
            style={({ pressed }) => [
              styles.planBtn,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <Text style={styles.planBtnText}>View plans & upgrade</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Account & more — compact list */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account & support</Text>
        <View style={styles.menuCard}>
          <Pressable onPress={navigate("bank")} style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed, GatiMitraMerchant.cursorPointer]}>
            <Ionicons name="card-outline" size={20} color={GatiMitraMerchant.primary} />
            <Text style={styles.menuLabel}>Bank Account</Text>
            <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
          <Pressable onPress={navigate("status")} style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed, GatiMitraMerchant.cursorPointer]}>
            <Ionicons name="pulse-outline" size={20} color={GatiMitraMerchant.primary} />
            <Text style={styles.menuLabel}>Store Status</Text>
            <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/earnings")} style={({ pressed }) => [styles.menuRow, styles.menuRowLast, pressed && styles.menuRowPressed, GatiMitraMerchant.cursorPointer]}>
            <Ionicons name="wallet-outline" size={20} color={GatiMitraMerchant.primary} />
            <Text style={styles.menuLabel}>Earnings Summary</Text>
            <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => setLogoutModalVisible(true)}
        style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed, GatiMitraMerchant.cursorPointer]}
      >
        <Ionicons name="log-out-outline" size={22} color={GatiMitraMerchant.error} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>

      <Text style={styles.footer}>GatiMitra Partner • v1.0.0</Text>

      <View style={styles.legalLinks}>
        <Pressable
          onPress={() => Linking.openURL(legalUrls.terms).catch(() => {})}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Text style={styles.legalLink}>T & C</Text>
        </Pressable>
        <Text style={styles.legalSeparator}>|</Text>
        <Pressable
          onPress={() => Linking.openURL(legalUrls.privacyPolicy).catch(() => {})}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.legalSeparator}>|</Text>
        <Pressable
          onPress={() => Linking.openURL(legalUrls.codeOfConduct).catch(() => {})}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Text style={styles.legalLink}>Code of Conduct</Text>
        </Pressable>
      </View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  content: { paddingHorizontal: H_PADDING },
  pressed: { opacity: 0.85 },

  outletCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  outletIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  outletTextWrap: { flex: 1, minWidth: 0 },
  outletName: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  outletSubtitle: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },

  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    marginBottom: 14,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  warningText: { flex: 1, fontSize: 12, fontWeight: "500", color: "#92400E" },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tile: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "ios"
      ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 }
      : { elevation: 2 }),
  },
  tileActive: {
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  tileInactive: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  tileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  tileIconWrapActive: {
    backgroundColor: "#C8E6C9",
  },
  tileLabelWrap: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "rgba(0,0,0,0.03)",
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
  },
  tileLabelWrapActive: {
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  tileLabelActive: {
    color: GatiMitraMerchant.textPrimary,
  },
  tileLabelInactive: {
    color: GatiMitraMerchant.textSecondary,
  },
  tileStatus: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
  },
  tileStatusActive: {
    color: GatiMitraMerchant.primary,
  },
  tileStatusInactive: {
    color: GatiMitraMerchant.textTertiary,
  },

  planCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  planRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  planLabel: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  planBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.statusCompletedBg,
  },
  planBadgeInactive: { backgroundColor: GatiMitraMerchant.statusPendingBg },
  planBadgeText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.statusCompleted },
  planBadgeTextInactive: { color: GatiMitraMerchant.statusPending },
  planBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
  },
  planBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },

  menuCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuRowPressed: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: "500", color: GatiMitraMerchant.textPrimary },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 6,
  },
  logoutText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.error },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 18,
  },
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  legalLink: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  legalSeparator: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
});
