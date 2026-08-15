/**
 * Profile / Settings — light-mode section grid (icon tiles + label below).
 * Outlet card at top, then grid sections: Manage outlet, Settings, Orders, Support.
 * Navigation / handlers unchanged — UI shell only.
 */

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  RefreshControl,
  Platform,
  Linking,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { AuthProxyImage } from "@/components/AuthProxyImage";
import { profileSectionTitle } from "@/constants/profileTypography";
import { resolveImageUrl } from "@/services/outletApi";
import { LogoutConfirmModal } from "@/components/LogoutConfirmModal";
import { useRouter, useFocusEffect } from "expo-router";
import { useMerchantNavigate } from "@/lib/merchantNavigation";
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
import { getRushStatus } from "@/services/rushApi";
import { prefetchOperatingHours, prefetchOutlet } from "@/services/outletApi";
import { getPartnerLegalUrls } from "@/lib/partnerLegalUrls";
import { openPartnerRegisterStoreHandoff } from "@/lib/partnerRegisterStoreHandoff";
import { OffersPercentBadgeIcon } from "@/components/OffersPercentBadgeIcon";
import { LearningCentreIcon } from "@/components/LearningCentreIcon";
import { isMerchantAuthError } from "@/services/auth.service";
import { fetchMerchantReferralConfig } from "@/services/referral.service";

const CONTENT_TOP = 12;
const TILE_GAP = 12;
/** Profile grid icon tiles — perfect circles (50% radius). */
const TILE_ICON_SIZE = 56;
/**
 * 4-up grid on phones (reference layout). Tablets get one extra column so
 * tiles do not stretch too wide.
 */
const TABLET_WIDTH = 600;
const GRID_COLS_PHONE = 4;

/** Reference-style section separator — visible band, full-bleed, equal vertical gap. */
const SECTION_DIVIDER_HEIGHT = 8;
const SECTION_DIVIDER_GAP = 16;

function SectionDivider() {
  return (
    <View
      style={[
        styles.sectionDivider,
        {
          height: SECTION_DIVIDER_HEIGHT,
          marginVertical: SECTION_DIVIDER_GAP,
        },
      ]}
    />
  );
}

function GridCard({
  icon,
  customIcon,
  label,
  onPress,
  badge,
  tileWidth,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  customIcon?: ReactNode;
  label: string;
  onPress: () => void;
  badge?: string;
  tileWidth: number;
}) {
  const boxSize = Math.min(TILE_ICON_SIZE, Math.max(52, tileWidth - 4));
  const badgeOn = badge != null && String(badge).toUpperCase() === "ON";

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: "transparent" }}
      style={({ pressed }) => [
        styles.tile,
        { width: tileWidth, opacity: pressed ? 0.85 : 1 },
        GatiMitraMerchant.cursorPointer,
      ]}
      accessibilityRole="button"
      accessibilityLabel={badge != null ? `${label}, ${badge}` : label}
    >
      <View
        style={[
          styles.tileIconBox,
          {
            width: boxSize,
            height: boxSize,
            borderRadius: boxSize / 2,
          },
        ]}
      >
        {customIcon ?? (
          <Ionicons name={icon!} size={26} color={GatiMitraMerchant.textPrimary} />
        )}
        {badge != null && (
          <View style={[styles.tileBadge, badgeOn ? styles.tileBadgeOn : styles.tileBadgeOff]}>
            <Text style={styles.tileBadgeText} numberOfLines={1}>
              {badge}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { push: navPush } = useMerchantNavigate();
  const { width } = useWindowDimensions();
  const scrollBottomPadding = TAB_BAR_SCROLL_CONTENT_PADDING;
  const { selectedStore } = useSelectedStore();
  const { signOut, token, partner, isAuthenticated, supabaseUserId } = useAuth();

  const isTablet = width >= TABLET_WIDTH;
  const gridCols = GRID_COLS_PHONE + (isTablet ? 1 : 0);
  const tileWidth =
    (width - H_PADDING * 2 - TILE_GAP * (gridCols - 1)) / gridCols;
  const settingsTileWidth = tileWidth;
  const ordersTileWidth = tileWidth;

  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);
  const subscriptionActive = subscriptionPlan != null;
  const subscriptionInactive = !subscriptionActive;
  const [rushBadge, setRushBadge] = useState<"OFF" | "ON">("OFF");
  const [refreshing, setRefreshing] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [showReferralUi, setShowReferralUi] = useState(false);
  const navLockRef = useRef(false);
  const navUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const legalUrls = getPartnerLegalUrls();
  const showAddAnotherChild = (partner?.childStores?.length ?? 0) === 1;

  useEffect(() => {
    return () => {
      if (navUnlockTimerRef.current) clearTimeout(navUnlockTimerRef.current);
    };
  }, []);

  // Do not prefetch nested profile routes here: router.prefetch() can dispatch PRELOAD
  // actions that are not always handled by the profile stack navigator.

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchMerchantReferralConfig().then((config) => {
        if (!cancelled) setShowReferralUi(config?.referralEnabled === true);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

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
    }, [selectedStore?.id, token])
  );

  const armNavLock = () => {
    navLockRef.current = true;
    if (navUnlockTimerRef.current) clearTimeout(navUnlockTimerRef.current);
    navUnlockTimerRef.current = setTimeout(() => {
      navLockRef.current = false;
    }, 700);
  };

  const navigate = (slug: string) => () => {
    if (navLockRef.current) return;
    armNavLock();
    router.push(`/(tabs)/profile/${slug}` as any);
  };

  const guardedNavPush = (href: string) => {
    if (navLockRef.current) return;
    armNavLock();
    navPush(href);
  };

  const handleAddAnotherChild = async () => {
    if (!isAuthenticated || !token || !partner?.parent?.id) {
      Alert.alert("Login required", "Please log in to add another store.");
      return;
    }
    if (addingChild) return;
    setAddingChild(true);
    try {
      await openPartnerRegisterStoreHandoff({
        accessToken: token,
        parentId: partner.parent.id,
        supabaseUserId,
      });
    } catch (e) {
      const message = isMerchantAuthError(e)
        ? e.message
        : e instanceof Error
          ? e.message
          : "Could not open partner portal.";
      if (isMerchantAuthError(e) && (e.code === "session_revoked" || e.code === "invalid_token")) {
        Alert.alert("Login required", message, [
          { text: "OK", onPress: () => router.replace("/(auth)/welcome") },
        ]);
      } else {
        Alert.alert("Could not open", message);
      }
    } finally {
      setAddingChild(false);
    }
  };

  const storeName = selectedStore?.store_name ?? "Select a store from Partner Home";
  const storeSubtitle = selectedStore?.full_address
    ? selectedStore.full_address.split(",").slice(0, 2).join(", ")
    : selectedStore
      ? `Store ID: ${selectedStore.store_id}`
      : "No store selected";
  const storeLogoUrl = resolveImageUrl(
    selectedStore?.parent_logo_url ?? partner?.parent?.store_logo ?? null
  );

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
        {storeLogoUrl ? (
          <View style={styles.outletIconWrap}>
            {token ? (
              <AuthProxyImage
                uri={storeLogoUrl}
                token={token}
                style={styles.outletLogoImage}
                resizeMode="cover"
                accessibilityLabel="Store logo"
              />
            ) : (
              <Image
                source={{ uri: storeLogoUrl }}
                style={styles.outletLogoImage}
                resizeMode="cover"
                accessibilityLabel="Store logo"
              />
            )}
          </View>
        ) : null}
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

      <SectionDivider />

      {/* Manage outlet — quick settings grid */}
      <View style={styles.section}>
        <Text variant="brand" style={[styles.sectionTitle, profileSectionTitle]}>Manage outlet</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard icon="information-circle-outline" label="Outlet info" onPress={navigate("edit-store")} tileWidth={settingsTileWidth} />
          <GridCard icon="time-outline" label="Outlet timings" onPress={navigate("hours")} tileWidth={settingsTileWidth} />
          <GridCard icon="call-outline" label="Phone numbers" onPress={navigate("business-details")} tileWidth={settingsTileWidth} />
          <GridCard icon="people-outline" label="Manage staff" onPress={navigate("staff")} tileWidth={settingsTileWidth} />
        </View>
      </View>

      <SectionDivider />

      {/* Settings — quick settings grid */}
      <View style={styles.section}>
        <Text variant="brand" style={[styles.sectionTitle, profileSectionTitle]}>Settings</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard icon="settings-outline" label="Preferences" onPress={navigate("preferences")} tileWidth={settingsTileWidth} />
          <GridCard icon="notifications-outline" label="Manage communication" onPress={navigate("communications")} tileWidth={settingsTileWidth} />
          <GridCard icon="storefront-outline" label="Delivery settings" onPress={navigate("address")} tileWidth={settingsTileWidth} />
          <GridCard icon="flash-outline" label="Rush hour" onPress={navigate("preparation-time")} badge={rushBadge} tileWidth={settingsTileWidth} />
          <GridCard icon="print-outline" label="Thermal printer" onPress={navigate("printer-settings")} tileWidth={settingsTileWidth} />
          <GridCard icon="calendar-outline" label="Schedule off" onPress={navigate("vacation")} tileWidth={settingsTileWidth} />
        </View>
      </View>

      <SectionDivider />

      {/* Marketing — offers & promotions */}
      <View style={styles.section}>
        <Text variant="brand" style={[styles.sectionTitle, profileSectionTitle]}>Marketing</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard
            customIcon={<OffersPercentBadgeIcon size={26} color={GatiMitraMerchant.textPrimary} />}
            label="Offers & Promotions"
            onPress={navigate("offers")}
            tileWidth={settingsTileWidth}
          />
          <GridCard icon="time-outline" label="Recent Activity" onPress={navigate("activity-feed")} tileWidth={settingsTileWidth} />
          {showReferralUi ? (
            <GridCard
              icon="gift-outline"
              label="Refer & Earn"
              onPress={navigate("referrals")}
              tileWidth={settingsTileWidth}
            />
          ) : null}
        </View>
      </View>

      <SectionDivider />

      {/* Orders — quick settings grid */}
      <View style={styles.section}>
        <Text variant="brand" style={[styles.sectionTitle, profileSectionTitle]}>Orders</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard icon="list-outline" label="Order history" onPress={() => guardedNavPush("/order-history")} tileWidth={ordersTileWidth} />
          <GridCard icon="alert-circle-outline" label="Complaints" onPress={() => router.push("/(tabs)/profile/complaints")} tileWidth={ordersTileWidth} />
          <GridCard icon="chatbubble-outline" label="Reviews" onPress={() => router.push("/(tabs)/profile/reviews")} tileWidth={ordersTileWidth} />
        </View>
      </View>

      <SectionDivider />

      {/* Support — quick settings grid */}
      <View style={styles.section}>
        <Text variant="brand" style={[styles.sectionTitle, profileSectionTitle]}>Support</Text>
        <View style={[styles.tileGrid, { gap: TILE_GAP }]}>
          <GridCard icon="help-circle-outline" label="Help & support" onPress={navigate("contact")} tileWidth={settingsTileWidth} />
          <GridCard icon="chatbubbles-outline" label="My tickets" onPress={navigate("tickets")} tileWidth={settingsTileWidth} />
          <GridCard
            customIcon={<LearningCentreIcon size={26} color={GatiMitraMerchant.textPrimary} />}
            label="Learning centre"
            onPress={navigate("learning")}
            tileWidth={settingsTileWidth}
          />
        </View>
      </View>

      <SectionDivider />

      {/* Subscription & Plan */}
      <View style={styles.section}>
        <Text variant="brand" style={[styles.sectionTitle, profileSectionTitle]}>Plan</Text>
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

      <SectionDivider />

      {/* Account & more — compact list */}
      <View style={styles.section}>
        <Text variant="brand" style={[styles.sectionTitle, profileSectionTitle]}>Account & support</Text>
        <View style={styles.menuCard}>
          {([
            {
              key: "bank",
              icon: "card-outline" as const,
              label: "Bank Account",
              onPress: navigate("bank"),
            },
            {
              key: "status",
              icon: "pulse-outline" as const,
              label: "Store Status",
              onPress: navigate("status"),
            },
            ...(showReferralUi
              ? [
                  {
                    key: "referral",
                    icon: "gift-outline" as const,
                    label: "Refer & Earn",
                    onPress: navigate("referrals"),
                  },
                ]
              : []),
            {
              key: "reward",
              icon: "wallet-outline" as const,
              label: "Reward",
              onPress: () => guardedNavPush("/(tabs)/earnings"),
            },
          ]).map((item, index, list) => (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={({ pressed }) => [
                styles.menuRow,
                index === list.length - 1 && styles.menuRowLast,
                pressed && styles.menuRowPressed,
                GatiMitraMerchant.cursorPointer,
              ]}
            >
              <Ionicons name={item.icon} size={20} color={GatiMitraMerchant.primary} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
            </Pressable>
          ))}
        </View>
      </View>

      {showAddAnotherChild ? (
        <Pressable
          onPress={handleAddAnotherChild}
          disabled={addingChild}
          style={({ pressed }) => [
            styles.addChildBtn,
            pressed && styles.pressed,
            addingChild && styles.addChildBtnDisabled,
            GatiMitraMerchant.cursorPointer,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add Another child"
        >
          {addingChild ? (
            <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
          ) : (
            <Ionicons name="add-circle-outline" size={22} color={GatiMitraMerchant.primary} />
          )}
          <Text style={styles.addChildBtnText}>
            {addingChild ? "Opening…" : "Add Another child"}
          </Text>
        </Pressable>
      ) : null}

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
    overflow: "hidden",
  },
  outletLogoImage: { width: 40, height: 40 },
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

  sectionDivider: {
    marginHorizontal: -H_PADDING,
    backgroundColor: "#E5E7EB",
    alignSelf: "stretch",
  },

  section: { marginBottom: 0 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  /** Icon box + label below (reference grid). */
  tile: {
    alignItems: "center",
    marginBottom: 4,
  },
  tileIconBox: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
    overflow: "visible",
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 14,
    paddingHorizontal: 2,
    minHeight: 28,
  },
  tileBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 28,
    alignItems: "center",
  },
  tileBadgeOff: {
    backgroundColor: "#EF4444",
  },
  tileBadgeOn: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  tileBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.2,
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

  addChildBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    ...GatiMitraMerchant.shadowSm,
  },
  addChildBtnDisabled: { opacity: 0.7 },
  addChildBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 16,
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
