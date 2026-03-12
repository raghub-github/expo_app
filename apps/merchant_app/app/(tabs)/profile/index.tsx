/**
 * Profile / Settings — GatiMitra branding, light background.
 * Outlet card at top, Manage outlet (2x2), Settings (2x2 + row), Orders (row of 3).
 */

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_HEIGHT,
  SCROLL_BOTTOM_SAFE,
  CARD_RADIUS,
  CARD_GAP,
} from "@/constants/theme";
import { getActivePlanDisplayName } from "@/lib/activePlan";
import { fetchSubscription, type SubscriptionPlan } from "@/services/api";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { useProfileNav } from "@/context/ProfileNavContext";
import { getRushStatus } from "@/services/rushApi";
import { prefetchOutlet } from "@/services/outletApi";

const CONTENT_TOP = 12;
const { width } = Dimensions.get("window");
const GRID_GAP = 6;
const CARD_SIZE = (width - H_PADDING * 2 - GRID_GAP) / 2;
const CARD_SIZE_3 = (width - H_PADDING * 2 - GRID_GAP * 2) / 3;
const GRID_CARD_MIN_HEIGHT = 60;
const GRID_CARD_MIN_HEIGHT_3 = 56;

function GridCard({
  icon,
  label,
  onPress,
  badge,
  size,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: string;
  size?: number;
  active?: boolean;
}) {
  const cardSize = size ?? CARD_SIZE;
  const minH = size != null ? GRID_CARD_MIN_HEIGHT_3 : GRID_CARD_MIN_HEIGHT;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gridCard,
        { width: cardSize, minHeight: minH },
        active && styles.gridCardActive,
        pressed && styles.pressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <View style={styles.gridIconWrap}>
        <Ionicons name={icon} size={22} color={GatiMitraMerchant.primary} />
      </View>
      <Text style={styles.gridLabel} numberOfLines={2}>{label}</Text>
      {badge != null && (
        <View
          style={[
            styles.badgeWrap,
            badge === "ON" ? styles.badgeOn : styles.badgeOff,
          ]}
        >
          <Text
            style={badge === "ON" ? styles.badgeTextOn : styles.badgeTextOff}
          >
            {badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollBottomPadding = TAB_BAR_HEIGHT + SCROLL_BOTTOM_SAFE + insets.bottom;
  const { selectedStore } = useSelectedStore();
  const { signOut, token } = useAuth();
  const { lastProfileSlug, setLastProfileSlug } = useProfileNav();

  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
  const subscriptionActive = subscriptionPlan != null;
  const subscriptionInactive = !subscriptionActive;
  const [rushBadge, setRushBadge] = useState<"OFF" | "ON">("OFF");

  // Prefetch key profile routes so settings pages open instantly when tapped.
  useEffect(() => {
    const paths = [
      "/(tabs)/profile/edit-store",
      "/(tabs)/profile/hours",
      "/(tabs)/profile/business-details",
      "/(tabs)/profile/staff",
      "/(tabs)/profile/notifications",
      "/(tabs)/profile/communications",
      "/(tabs)/profile/address",
      "/(tabs)/profile/preparation-time",
      "/(tabs)/profile/vacation",
      "/(tabs)/profile/plans",
      "/(tabs)/profile/status",
      "/(tabs)/profile/bank",
      "/(tabs)/profile/contact",
      "/(tabs)/profile/help",
      "/(tabs)/profile/tickets",
    ] as const;
    for (const p of paths) {
      router.prefetch(p as any);
    }
  }, [router]);

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
      // When entering the Profile index, clear any previously active inner slug
      // so that no tile (e.g. "My tickets") appears active by default.
      setLastProfileSlug(null);

      let cancelled = false;
      const run = async () => {
        try {
          if (!selectedStore?.id || !token) {
            if (!cancelled) setRushBadge("OFF");
            return;
          }
          // Prefetch outlet info so Manage Outlet screens open instantly
          prefetchOutlet(selectedStore.id, token);
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: CONTENT_TOP, paddingBottom: scrollBottomPadding },
      ]}
      showsVerticalScrollIndicator={false}
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

      {/* Manage outlet — 2x2 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manage outlet</Text>
        <View style={styles.gridRow}>
          <GridCard icon="information-circle-outline" label="Outlet info" onPress={navigate("edit-store")} active={isActive("edit-store")} />
          <GridCard icon="time-outline" label="Outlet timings" onPress={navigate("hours")} active={isActive("hours")} />
        </View>
        <View style={styles.gridRow}>
          <GridCard icon="call-outline" label="Phone numbers" onPress={navigate("business-details")} active={isActive("business-details")} />
          <GridCard icon="people-outline" label="Manage staff" onPress={navigate("staff")} active={isActive("staff")} />
        </View>
      </View>

      {/* Settings — 2x2 + 1 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.gridRow}>
          <GridCard icon="settings-outline" label="Preferences" onPress={navigate("notifications")} active={isActive("notifications")} />
          <GridCard icon="notifications-outline" label="Manage communication" onPress={navigate("communications")} active={isActive("communications")} />
        </View>
        <View style={styles.gridRow}>
          <GridCard icon="storefront-outline" label="Delivery settings" onPress={navigate("address")} active={isActive("address")} />
          <GridCard icon="flash-outline" label="Rush hour" onPress={navigate("preparation-time")} badge={rushBadge} active={isActive("preparation-time")} />
        </View>
        <View style={styles.gridRow}>
          <GridCard icon="calendar-outline" label="Schedule off" onPress={navigate("vacation")} active={isActive("vacation")} />
        </View>
      </View>

      {/* Orders — row of 3 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Orders</Text>
        <View style={styles.ordersRow}>
          <GridCard
            icon="list-outline"
            label="Order history"
            onPress={() => router.push("/(tabs)/orders")}
            size={CARD_SIZE_3}
          />
          <GridCard
            icon="alert-circle-outline"
            label="Complaints"
            onPress={() => router.push("/(tabs)/profile/complaints")}
            size={CARD_SIZE_3}
          />
          <GridCard
            icon="chatbubble-outline"
            label="Reviews"
            onPress={() => router.push("/(tabs)/profile/reviews")}
            size={CARD_SIZE_3}
          />
        </View>
      </View>

      {/* Support — help & tickets */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.gridRow}>
          <GridCard
            icon="help-circle-outline"
            label="Help & support"
            onPress={navigate("contact")}
            active={isActive("contact")}
          />
          <GridCard
            icon="chatbubbles-outline"
            label="My tickets"
            onPress={navigate("tickets")}
            active={isActive("tickets")}
          />
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
        onPress={async () => {
          await signOut();
          router.replace("/(auth)/welcome");
        }}
        style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed, GatiMitraMerchant.cursorPointer]}
      >
        <Ionicons name="log-out-outline" size={22} color={GatiMitraMerchant.error} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>

      <Text style={styles.footer}>GatiMitra Partner • v1.0.0</Text>
    </ScrollView>
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

  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  gridRow: { flexDirection: "row", gap: GRID_GAP, marginBottom: GRID_GAP },
  gridCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  gridCardActive: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  gridIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  badgeWrap: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeOn: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  badgeOff: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  badgeTextOn: { fontSize: 11, fontWeight: "700", color: "#fff" },
  badgeTextOff: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },

  ordersRow: {
    flexDirection: "row",
    gap: GRID_GAP,
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
});
