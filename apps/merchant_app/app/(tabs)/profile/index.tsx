/**
 * Profile — Merchant account & subscription management center.
 * Subscription card, store profile, account, store management, financial, preferences, support.
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_HEIGHT,
  SCROLL_BOTTOM_SAFE,
  CARD_RADIUS,
  BUTTON_RADIUS,
} from "@/constants/theme";
import { getActivePlanDisplayName } from "@/lib/activePlan";
import { fetchSubscription, STORE_ID, type SubscriptionPlan } from "@/services/api";

const CONTENT_TOP = 18; // 16–20px below header to prevent overlap

function MenuRow({
  icon,
  label,
  value,
  onPress,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        !isLast && styles.menuRowBorder,
        pressed && styles.menuRowPressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon} size={22} color={GatiMitraMerchant.primary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      {value != null ? (
        <Text style={styles.menuValue}>{value}</Text>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={GatiMitraMerchant.textTertiary} />
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollBottomPadding = TAB_BAR_HEIGHT + SCROLL_BOTTOM_SAFE + insets.bottom;

  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
  const subscriptionActive = subscriptionPlan != null;
  const subscriptionInactive = !subscriptionActive;

  useEffect(() => {
    let cancelled = false;
    fetchSubscription(STORE_ID).then((r) => {
      if (cancelled) return;
      setSubscriptionPlan(r.plan);
    });
    return () => { cancelled = true; };
  }, []);

  const navigate = (slug: string) => () => router.push(`/(tabs)/profile/${slug}` as any);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: CONTENT_TOP, paddingBottom: scrollBottomPadding },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Subscription card — at top (synced with active plan) */}
      <View style={styles.subCard}>
        <View style={styles.subRow}>
          <Text style={styles.subLabel}>Current Plan</Text>
          <View style={[styles.badge, subscriptionInactive && styles.badgeInactive]}>
            <Text style={[styles.badgeText, subscriptionInactive && styles.badgeTextInactive]}>
              {subscriptionActive
                ? (subscriptionPlan?.plan_name ?? getActivePlanDisplayName(subscriptionPlan?.plan_code ?? "FREE"))
                : "Inactive"}
            </Text>
          </View>
        </View>
        <Text style={styles.subExpiry}>
          Expires: {subscriptionActive && subscriptionPlan?.expiry_date
            ? (() => {
                try {
                  const d = new Date(subscriptionPlan.expiry_date);
                  return isNaN(d.getTime()) ? subscriptionPlan.expiry_date : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                } catch {
                  return subscriptionPlan.expiry_date ?? "—";
                }
              })()
            : "—"}
        </Text>
        <Text style={styles.subTrial}>Trial: —</Text>
        <View style={styles.subActions}>
          <Pressable
            onPress={navigate("plans")}
            style={({ pressed }) => [
              styles.subBtnPrimary,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <Text style={styles.subBtnPrimaryText}>Upgrade Plan</Text>
          </Pressable>
          <Pressable
            onPress={navigate("plans")}
            style={({ pressed }) => [
              styles.subBtnSecondary,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <Text style={styles.subBtnSecondaryText}>View Plans</Text>
          </Pressable>
        </View>
      </View>

      {/* Inactive subscription warning — force offline, disable orders */}
      {subscriptionInactive && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={20} color={GatiMitraMerchant.warning} />
          <Text style={styles.warningText}>
            Subscription inactive. Store is forced offline and order receiving is disabled. Renew to continue.
          </Text>
        </View>
      )}

      {/* Store profile card — name, ID, logo, Edit Store */}
      <View style={styles.storeCard}>
        <View style={styles.storeRow}>
          <View style={styles.storeLogo}>
            <Ionicons name="storefront" size={36} color={GatiMitraMerchant.primary} />
          </View>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>My Store</Text>
            <Text style={styles.storeId}>Store ID: GMMC001</Text>
          </View>
          <Pressable
            onPress={navigate("edit-store")}
            style={({ pressed }) => [
              styles.editStoreBtn,
              pressed && styles.pressed,
              GatiMitraMerchant.cursorPointer,
            ]}
          >
            <Text style={styles.editStoreBtnText}>Edit Store</Text>
          </Pressable>
        </View>
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="person-outline" label="Business Details" onPress={navigate("business-details")} />
          <MenuRow icon="location-outline" label="Address & Delivery Area" onPress={navigate("address")} />
          <MenuRow icon="time-outline" label="Business Hours" onPress={navigate("hours")} />
          <MenuRow icon="card-outline" label="Bank Account" onPress={navigate("bank")} />
          <MenuRow icon="document-text-outline" label="GST Information" onPress={navigate("gst")} />
          <MenuRow icon="folder-open-outline" label="Documents & Verification" onPress={navigate("documents")} />
          <MenuRow icon="people-outline" label="Staff Management" onPress={navigate("staff")} isLast />
        </View>
      </View>

      {/* Store Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Store Management</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="pulse-outline" label="Store Status" onPress={navigate("status")} />
          <MenuRow icon="pause-circle-outline" label="Pause Store" onPress={navigate("pause-store")} />
          <MenuRow icon="calendar-outline" label="Vacation Mode" onPress={navigate("vacation")} />
          <MenuRow icon="time-outline" label="Preparation Time" onPress={navigate("preparation-time")} />
          <MenuRow icon="checkmark-circle-outline" label="Auto Accept Orders" onPress={navigate("auto-accept")} isLast />
        </View>
      </View>

      {/* Financial */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Financial</Text>
        <View style={styles.menuCard}>
          <MenuRow
            icon="wallet-outline"
            label="Earnings Summary"
            onPress={() => router.push("/(tabs)/earnings")}
          />
          <MenuRow icon="list-outline" label="Settlement History" onPress={navigate("settlements")} />
          <MenuRow icon="pie-chart-outline" label="Commission Details" onPress={navigate("commission")} />
          <MenuRow icon="document-attach-outline" label="Tax Reports" onPress={navigate("tax-reports")} isLast />
        </View>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="notifications-outline" label="Notifications" value="On" onPress={navigate("notifications")} />
          <MenuRow icon="language-outline" label="Language" value="English" onPress={navigate("language")} isLast />
        </View>
      </View>

      {/* Support */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="help-circle-outline" label="Help Centre" onPress={navigate("help")} />
          <MenuRow icon="chatbubble-outline" label="Contact us" onPress={navigate("contact")} isLast />
        </View>
      </View>

      <Pressable
        onPress={() => {}}
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
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  content: { paddingHorizontal: H_PADDING },
  pressed: { opacity: 0.85 },

  subCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  subRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  subLabel: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.statusCompletedBg,
  },
  badgeInactive: { backgroundColor: GatiMitraMerchant.statusPendingBg },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.statusCompleted,
  },
  badgeTextInactive: { color: GatiMitraMerchant.statusPending },
  subExpiry: { fontSize: 14, color: GatiMitraMerchant.textPrimary, marginBottom: 2 },
  subTrial: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginBottom: 14 },
  subActions: { flexDirection: "row", gap: 10 },
  subBtnPrimary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
  },
  subBtnPrimaryText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  subBtnSecondary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    alignItems: "center",
  },
  subBtnSecondaryText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.primary },

  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    marginBottom: 16,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  warningText: { flex: 1, fontSize: 13, fontWeight: "500", color: "#92400E" },

  storeCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 16,
    marginBottom: 20,
    ...GatiMitraMerchant.shadowSm,
  },
  storeRow: { flexDirection: "row", alignItems: "center" },
  storeLogo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  storeInfo: { flex: 1 },
  storeName: { fontSize: 17, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  storeId: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  editStoreBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  editStoreBtnText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 12,
    overflow: "hidden",
    ...GatiMitraMerchant.shadowSm,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: GatiMitraMerchant.border },
  menuRowPressed: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  menuValue: { fontSize: 14, color: GatiMitraMerchant.textSecondary },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
  },
  logoutText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.error },
  footer: {
    textAlign: "center",
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 24,
  },
});
