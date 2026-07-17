/**
 * Plans & Subscription — horizontal swipeable CARD STACK (payment-card style).
 * One active card centered; next/prev partially visible. Snap, compact cards, pagination dots.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  FlatList,
  ScrollView,
  Switch,
  NativeSyntheticEvent,
  NativeScrollEvent,
  type ListRenderItemInfo,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL } from "@/services/api";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_SCROLL_CONTENT_PADDING,
  BUTTON_RADIUS,
} from "@/constants/theme";
import { ACTIVE_PLAN_CODE as FALLBACK_ACTIVE_PLAN_CODE } from "@/lib/activePlan";
import { fetchSubscription } from "@/services/api";
import {
  activateFreeSubscription,
  fetchMerchantSubscriptionDetails,
  updateSubscriptionAutoRenew,
} from "@/services/subscriptionPaymentApi";
import { SubscriptionCheckoutModal } from "@/components/subscription/SubscriptionCheckoutModal";
import { SubscriptionHistoryList } from "@/components/subscription/SubscriptionHistoryList";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { Alert } from 'react-native';
import { useAuth } from "@/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type MerchantPlan = {
  id: number;
  plan_name: string;
  plan_code: string;
  description: string | null;
  price: number;
  gst_percent?: number;
  commission_percent_override?: number | null;
  commission_benefit_active?: boolean;
  billing_cycle: string;
  max_menu_items: number | null;
  max_cuisines: number | null;
  max_menu_categories: number | null;
  image_upload_allowed: boolean;
  max_image_uploads: number | null;
  analytics_access: boolean;
  advanced_analytics: boolean;
  priority_support: boolean;
  marketing_automation: boolean;
  custom_api_integrations: boolean;
  dedicated_account_manager: boolean;
  display_order: number | null;
  is_popular: boolean;
};

const CONTENT_TOP = 18;
const CARD_STACK_TOP = 36;
const PEEK = 40;
const CARD_WIDTH = SCREEN_WIDTH - PEEK * 2;
const CARD_HEIGHT = 320;
const CARD_RADIUS = 19;
const CARD_PADDING = 16;
const SIDE_SCALE = 0.93;
const SIDE_OPACITY = 0.88;

const DEFAULT_PLANS: MerchantPlan[] = [
  {
    id: 1,
    plan_name: "Free Plan",
    plan_code: "FREE",
    description: "Perfect for getting started",
    price: 0,
    billing_cycle: "MONTHLY",
    max_menu_items: 15,
    max_cuisines: 10,
    max_menu_categories: 10,
    image_upload_allowed: false,
    max_image_uploads: 0,
    analytics_access: true,
    advanced_analytics: false,
    priority_support: false,
    marketing_automation: false,
    custom_api_integrations: false,
    dedicated_account_manager: false,
    display_order: 0,
    is_popular: false,
  },
  {
    id: 2,
    plan_name: "Premium Plan",
    plan_code: "PREMIUM",
    description: "Best for growing stores",
    price: 149,
    billing_cycle: "MONTHLY",
    max_menu_items: 40,
    max_cuisines: 25,
    max_menu_categories: 15,
    image_upload_allowed: true,
    max_image_uploads: 30,
    analytics_access: true,
    advanced_analytics: true,
    priority_support: true,
    marketing_automation: false,
    custom_api_integrations: false,
    dedicated_account_manager: false,
    display_order: 1,
    is_popular: true,
  },
  {
    id: 3,
    plan_name: "Pro Plan",
    plan_code: "ENTERPRISE",
    description: "For established businesses",
    price: 299,
    billing_cycle: "MONTHLY",
    max_menu_items: 70,
    max_cuisines: 35,
    max_menu_categories: 25,
    image_upload_allowed: true,
    max_image_uploads: 60,
    analytics_access: true,
    advanced_analytics: true,
    priority_support: true,
    marketing_automation: true,
    custom_api_integrations: true,
    dedicated_account_manager: true,
    display_order: 2,
    is_popular: false,
  },
];

function isPremiumPlan(plan: MerchantPlan): boolean {
  const code = (plan.plan_code || "").toUpperCase();
  return code === "PREMIUM" || (plan.is_popular && plan.price > 0 && plan.price < 300);
}

function formatPrice(price: number, billingCycle: string): string {
  const cycle = (billingCycle || "MONTHLY").toLowerCase();
  if (price === 0) return "Free";
  return `₹${price}/${cycle === "monthly" ? "mo" : cycle === "yearly" ? "yr" : "qtr"}`;
}

function normalizeGstPercent(pct: unknown): number {
  const n = Number(pct ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 0;
  return n;
}

function computeTotalWithGst(price: number, gstPercent: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.round((price + (price * gstPercent) / 100) * 100) / 100;
}

/** All plan features — nothing missing on card. */
function getAllPlanFeatures(plan: MerchantPlan): { label: string; value: string }[] {
  const commissionLabel =
    plan.commission_benefit_active && plan.commission_percent_override != null
      ? `${plan.commission_percent_override}% (reduced)`
      : "Platform default";
  return [
    { label: "Platform commission", value: commissionLabel },
    { label: "Menu items", value: plan.max_menu_items != null ? `${plan.max_menu_items} max` : "—" },
    { label: "Cuisines", value: plan.max_cuisines != null ? `${plan.max_cuisines} max` : "—" },
    { label: "Menu categories", value: plan.max_menu_categories != null ? `${plan.max_menu_categories} max` : "—" },
    {
      label: "Image uploads",
      value: plan.image_upload_allowed && plan.max_image_uploads != null
        ? `${plan.max_image_uploads} images`
        : plan.image_upload_allowed ? "Yes" : "No",
    },
    { label: "Analytics", value: plan.analytics_access ? "Yes" : "No" },
    { label: "Advanced analytics", value: plan.advanced_analytics ? "Yes" : "No" },
    { label: "Priority support", value: plan.priority_support ? "Yes" : "No" },
    { label: "Marketing automation", value: plan.marketing_automation ? "Yes" : "No" },
    { label: "Custom API", value: plan.custom_api_integrations ? "Yes" : "No" },
    { label: "Dedicated manager", value: plan.dedicated_account_manager ? "Yes" : "No" },
  ];
}

const ACTIVE_SHADOW = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  android: { elevation: 10 },
});

const SIDE_SHADOW = Platform.select({
  ios: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  android: { elevation: 3 },
});

function StackCard({
  plan,
  index,
  currentIndex,
  total,
  isCurrentPlan,
  onSelect,
  autoRenew,
  onAutoRenewChange,
  autoRenewLoading,
}: {
  plan: MerchantPlan;
  index: number;
  currentIndex: number;
  total: number;
  isCurrentPlan: boolean;
  onSelect: () => void;
  autoRenew?: boolean;
  onAutoRenewChange?: (value: boolean) => void;
  autoRenewLoading?: boolean;
}) {
  const distance = index - currentIndex;
  const isCenter = distance === 0;
  const scale = isCenter ? 1 : SIDE_SCALE;
  const opacity = isCenter ? 1 : SIDE_OPACITY;
  const rotationDeg = isCenter ? 0 : Math.max(-4, Math.min(4, distance * 3));
  const allFeatures = getAllPlanFeatures(plan);
  const isPremium = isPremiumPlan(plan) && plan.price > 0;
  const gstPercent = normalizeGstPercent(plan.gst_percent);
  const totalWithTax = computeTotalWithGst(plan.price, gstPercent);

  const cardStyle = [
    styles.cardBase,
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      borderRadius: CARD_RADIUS,
      padding: CARD_PADDING,
      transform: [{ scale }, { rotate: `${rotationDeg}deg` }],
      opacity,
      ...(isCenter ? ACTIVE_SHADOW : SIDE_SHADOW),
    },
    isCenter && isCurrentPlan && styles.cardActiveDoubleBorder,
    isCenter && isPremium && styles.cardPremiumGradient,
  ];

  const content = (
    <>
      <View style={styles.cardTop}>
        <View>
          <Text style={[styles.planName, isPremium && styles.textWhite]} numberOfLines={1}>
            {plan.plan_name}
          </Text>
          <Text style={[styles.price, isPremium && styles.textWhite]} numberOfLines={1}>
            {formatPrice(plan.price, plan.billing_cycle)}
          </Text>
          {plan.price > 0 && (
            <Text style={[styles.taxLine, isPremium && styles.textWhite]} numberOfLines={1}>
              Tax: {gstPercent.toFixed(2)}% • Total ₹{totalWithTax.toFixed(2)}
            </Text>
          )}
        </View>
        {isCenter && (plan.is_popular || isPremium) && (
          <View style={[styles.badge, isPremium && styles.badgePremium]}>
            <Text style={styles.badgeText}>{isPremium ? "Premium" : "Recommended"}</Text>
          </View>
        )}
        {isCenter && isCurrentPlan && (
          <View style={[styles.currentBadge, isPremium && styles.currentBadgePremium]}>
            <Text style={[styles.currentBadgeText, isPremium && styles.textWhite]}>Current Plan</Text>
          </View>
        )}
      </View>
      {plan.description ? (
        <Text style={[styles.description, isPremium && styles.textWhite]} numberOfLines={2}>
          {plan.description}
        </Text>
      ) : null}
      <View style={styles.featuresWrap}>
        <Text style={[styles.featuresTitle, isPremium && styles.textWhite]}>Includes</Text>
        <ScrollView
          style={styles.featuresScroll}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {allFeatures.map((f, i) => (
            <View key={i} style={styles.benefitRow}>
              <Ionicons
                name={f.value !== "No" && f.value !== "—" ? "checkmark-circle" : "ellipse-outline"}
                size={12}
                color={f.value !== "No" && f.value !== "—" ? (isPremium ? "rgba(255,255,255,0.9)" : GatiMitraMerchant.primary) : (isPremium ? "rgba(255,255,255,0.5)" : GatiMitraMerchant.textTertiary)}
              />
              <Text style={[styles.benefitLabel, isPremium && styles.textWhite]} numberOfLines={1}>{f.label}</Text>
              <Text style={[styles.benefitValue, isPremium && styles.textWhite]} numberOfLines={1}>{f.value}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
      {isCurrentPlan && plan.price > 0 && onAutoRenewChange && (
        <View style={[styles.autoRenewRow, isPremium && styles.autoRenewRowPremium]}>
          <View style={styles.autoRenewTextWrap}>
            <Text style={[styles.autoRenewTitle, isPremium && styles.textWhite]}>Auto Renew</Text>
            <Text style={[styles.autoRenewSubtitle, isPremium && styles.textWhite]}>
              Deduct from wallet on renewal
            </Text>
          </View>
          <Switch
            value={autoRenew === true}
            onValueChange={onAutoRenewChange}
            disabled={autoRenewLoading}
            trackColor={{ false: "#CBD5E1", true: isPremium ? "rgba(255,255,255,0.45)" : GatiMitraMerchant.primary }}
            thumbColor={autoRenew ? "#FFFFFF" : "#F8FAFC"}
          />
        </View>
      )}
      {plan.price > 0 && (
        <Pressable
          onPress={onSelect}
          disabled={isCurrentPlan}
          style={({ pressed }) => [
            styles.cta,
            isPremium && styles.ctaPremium,
            isCurrentPlan && styles.ctaActive,
            pressed && !isCurrentPlan && styles.ctaPressed,
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              isPremium && styles.ctaTextPremium,
              isCurrentPlan && styles.ctaTextActive,
            ]}
          >
            {isCurrentPlan ? "Active Plan" : "Upgrade"}
          </Text>
        </Pressable>
      )}
      {plan.price === 0 && (
        <View
          style={[
            styles.cta,
            styles.ctaActive,
          ]}
        >
          <Text style={[styles.ctaText, styles.ctaTextActive]}>
            {isCurrentPlan ? "Your Current Plan" : "Free Plan"}
          </Text>
        </View>
      )}
    </>
  );

  if (isPremium) {
    return (
      <View style={[isCenter && isCurrentPlan && styles.cardActiveOuterWrap]}>
        <View style={[cardStyle, isCenter && isCurrentPlan && styles.cardActiveInnerBorderLight]}>
          <LinearGradient
          colors={[GatiMitraMerchant.primary, GatiMitraMerchant.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
          <View style={styles.cardInner}>{content}</View>
        </View>
      </View>
    );
  }

  return (
    <View style={[isCenter && isCurrentPlan && styles.cardActiveOuterWrap]}>
      <View style={cardStyle}>
        <View style={styles.cardInner}>{content}</View>
      </View>
    </View>
  );
}

/** Return plans as-is without circular wrapping */
function buildNonCircularData(plans: MerchantPlan[]): MerchantPlan[] {
  return plans;
}

export default function PlansScreen() {
  const listRef = useRef<FlatList>(null);
  const [plans, setPlans] = useState<MerchantPlan[]>(DEFAULT_PLANS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activePlanCode, setActivePlanCode] = useState(FALLBACK_ACTIVE_PLAN_CODE);
  const [autoRenew, setAutoRenew] = useState(false);
  const [autoRenewLoading, setAutoRenewLoading] = useState(false);

  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();

  // Sort plans to show active plan first
  const sortedPlans = [...plans].sort((a, b) => {
    if (a.plan_code === activePlanCode) return -1;
    if (b.plan_code === activePlanCode) return 1;
    return a.price - b.price; // Sort by price for non-active plans
  });

  const displayData = buildNonCircularData(sortedPlans);
  const realCount = sortedPlans.length;

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      fetch(`${API_BASE_URL}/v1/plans?type=MERCHANT`, { method: "GET" })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data) => {
          if (cancelled) return;
          if (Array.isArray(data?.plans) && data.plans.length > 0) setPlans(data.plans);
        })
        .catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSubscription(selectedStore?.id ?? null).then((r) => {
      if (cancelled) return;
      const code = r.plan?.plan_code?.trim();
      setActivePlanCode(code ? code.toUpperCase() : FALLBACK_ACTIVE_PLAN_CODE);
    });
    return () => { cancelled = true; };
  }, [selectedStore?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!token || !selectedStore?.id) {
      setAutoRenew(false);
      return () => { cancelled = true; };
    }
    fetchMerchantSubscriptionDetails(selectedStore.id, token)
      .then((data) => {
        if (cancelled) return;
        setAutoRenew(data.subscription?.autoRenew === true);
      })
      .catch(() => {
        if (!cancelled) setAutoRenew(false);
      });
    return () => { cancelled = true; };
  }, [selectedStore?.id, token]);

  const handleAutoRenewChange = useCallback(
    async (value: boolean) => {
      if (!token || !selectedStore?.id) return;
      if (value && !autoRenew) {
        Alert.alert(
          "Enable Auto Renew?",
          "Your wallet will be debited automatically when the subscription ends.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Enable",
              onPress: async () => {
                setAutoRenewLoading(true);
                try {
                  await updateSubscriptionAutoRenew(selectedStore.id, token, true);
                  setAutoRenew(true);
                } catch (e) {
                  Alert.alert("Error", e instanceof Error ? e.message : "Could not update auto-renew");
                } finally {
                  setAutoRenewLoading(false);
                }
              },
            },
          ]
        );
        return;
      }
      setAutoRenewLoading(true);
      try {
        await updateSubscriptionAutoRenew(selectedStore.id, token, value);
        setAutoRenew(value);
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Could not update auto-renew");
      } finally {
        setAutoRenewLoading(false);
      }
    },
    [autoRenew, selectedStore?.id, token]
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const rawIndex = Math.round(x / CARD_WIDTH);
    setCurrentIndex(Math.max(0, Math.min(rawIndex, realCount - 1)));
  }, [realCount]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const rawIndex = Math.round(x / CARD_WIDTH);
      setCurrentIndex(Math.max(0, Math.min(rawIndex, realCount - 1)));
    },
    [realCount]
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: CARD_WIDTH,
      offset: CARD_WIDTH * index,
      index,
    }),
    []
  );

  const snapToOffsets = displayData.map((_, i) => i * CARD_WIDTH);

  const scrollBottomPadding = TAB_BAR_SCROLL_CONTENT_PADDING;

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MerchantPlan>) => {
      return (
        <View style={styles.cell}>
          <StackCard
            plan={item}
            index={index}
            currentIndex={currentIndex}
            total={realCount}
            isCurrentPlan={(item.plan_code || "").toUpperCase() === activePlanCode.toUpperCase()}
            onSelect={() => handleUpgrade(item)}
            autoRenew={autoRenew}
            onAutoRenewChange={handleAutoRenewChange}
            autoRenewLoading={autoRenewLoading}
          />
        </View>
      );
    },
    [currentIndex, activePlanCode, realCount, autoRenew, autoRenewLoading, handleAutoRenewChange]
  );

  const [checkoutPlan, setCheckoutPlan] = useState<MerchantPlan | null>(null);

  const refreshSubscriptionState = useCallback(async () => {
    if (!token || !selectedStore?.id) return;
    try {
      const detail = await fetchMerchantSubscriptionDetails(selectedStore.id, token);
      setAutoRenew(detail.subscription?.autoRenew === true);
      const code = detail.plan?.planCode;
      if (code) setActivePlanCode(String(code).toUpperCase());
    } catch {
      /* non-fatal — UI stays on last-known state until next natural refresh */
    }
  }, [selectedStore?.id, token]);

  const handleUpgrade = async (plan: MerchantPlan) => {
    if (!token || !selectedStore?.id) {
      Alert.alert("Not ready", "Please sign in and select a store before subscribing.");
      return;
    }
    // Free plan → straight to activate-free (no checkout modal, no wallet debit).
    if (Number(plan.price) === 0) {
      try {
        await activateFreeSubscription(selectedStore.id, token, plan.id);
        await refreshSubscriptionState();
        Alert.alert("Activated", `${plan.plan_name} is now active.`);
      } catch (e) {
        Alert.alert("Could not activate", e instanceof Error ? e.message : "Please try again.");
      }
      return;
    }
    // Paid plan → open checkout modal (Razorpay default + wallet option).
    setCheckoutPlan(plan);
  };

  return (
    <View style={[styles.container, { paddingBottom: scrollBottomPadding }]}>
      <View style={[styles.header, { paddingTop: CONTENT_TOP }]}>
        <Text style={styles.title}>Plans & Subscription</Text>
        <Text style={styles.subtitle}>Choose a plan that works best for your restaurant</Text>
      </View>

      <View style={[styles.listWrap, { marginTop: CARD_STACK_TOP }]}>
        <FlatList
          ref={listRef}
          data={displayData}
          keyExtractor={(item, i) => `${item.plan_code}-${i}`}
          renderItem={renderItem}
          horizontal
          pagingEnabled={false}
          snapToInterval={CARD_WIDTH}
          snapToAlignment="center"
          snapToOffsets={snapToOffsets}
          decelerationRate="normal"
          contentContainerStyle={styles.listContent}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={8}
          getItemLayout={getItemLayout}
          initialScrollIndex={0}
          scrollEnabled={sortedPlans.length > 1}
        />
      </View>

      <View style={styles.dots}>
        {sortedPlans.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Combined subscription history — purchases + refunds in one merchant-
          view timeline. Backend endpoint strips agent identity server-side
          so this list can never accidentally leak actor_* fields. */}
      {selectedStore?.id && token ? (
        <View style={{ paddingHorizontal: H_PADDING, marginTop: 20 }}>
          <SubscriptionHistoryList storeId={selectedStore.id} token={token} />
        </View>
      ) : null}

      {checkoutPlan && token && selectedStore?.id ? (
        <SubscriptionCheckoutModal
          visible={!!checkoutPlan}
          storeId={selectedStore.id}
          planId={checkoutPlan.id}
          planName={checkoutPlan.plan_name}
          token={token}
          onSuccess={async ({ via }) => {
            setCheckoutPlan(null);
            await refreshSubscriptionState();
            Alert.alert(
              "Subscription active",
              via === "wallet"
                ? "Paid from your wallet balance."
                : via === "razorpay"
                ? "Payment successful."
                : "Plan activated."
            );
          }}
          onClose={() => setCheckoutPlan(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  header: { paddingHorizontal: H_PADDING, marginBottom: 20 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 4,
  },
  subheading: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: PEEK,
    paddingBottom: 8,
  },
  cell: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT + 20,
    justifyContent: "center",
    alignItems: "center",
  },
  listWrap: { flex: 1, justifyContent: "center" },
  cardBase: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1.5,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardActiveOuterWrap: {
    borderWidth: 3,
    borderColor: GatiMitraMerchant.primary,
    borderRadius: CARD_RADIUS + 3,
    padding: 3,
    shadowColor: GatiMitraMerchant.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  cardActiveDoubleBorder: {
    borderWidth: 2,
    borderColor: GatiMitraMerchant.navy,
  },
  cardActiveInnerBorderLight: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  cardPremiumGradient: {
    borderWidth: 0,
  },
  cardInner: { flex: 1, justifyContent: "space-between" },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 2,
  },
  textWhite: { color: "#fff" },
  price: {
    fontSize: 24,
    fontWeight: "900",
    color: GatiMitraMerchant.primary,
    marginTop: 4,
    marginBottom: 2,
  },
  taxLine: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
  },
  badgePremium: { backgroundColor: "rgba(255,255,255,0.28)" },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  currentBadge: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: GatiMitraMerchant.statusCompletedBg,
  },
  currentBadgePremium: { backgroundColor: "rgba(255,255,255,0.2)" },
  currentBadgeText: { fontSize: 10, fontWeight: "600", color: GatiMitraMerchant.statusCompleted },
  description: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginBottom: 10, lineHeight: 16, fontWeight: "500" },
  featuresWrap: { flex: 1, minHeight: 0, marginTop: 4 },
  featuresScroll: { flex: 1, minHeight: 0 },
  featuresTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  benefitLabel: { fontSize: 11, color: GatiMitraMerchant.textSecondary, flex: 1 },
  benefitValue: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textPrimary, minWidth: 44, textAlign: "right" },
  cta: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    marginTop: 12,
    shadowColor: GatiMitraMerchant.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaPremium: { backgroundColor: "rgba(255,255,255,0.28)" },
  ctaActive: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  ctaPressed: { opacity: 0.9 },
  ctaText: { fontSize: 14, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },
  ctaTextPremium: { color: "#fff" },
  ctaTextActive: { color: GatiMitraMerchant.textSecondary },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
    backgroundColor: "rgba(0,0,0,0.02)",
    marginHorizontal: -H_PADDING,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: GatiMitraMerchant.border,
    opacity: 0.5,
  },
  dotActive: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: GatiMitraMerchant.primary,
    opacity: 1,
  },
  autoRenewRow: {
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  autoRenewRowPremium: {
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  autoRenewTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  autoRenewTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  autoRenewSubtitle: {
    fontSize: 10,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 2,
  },
});
