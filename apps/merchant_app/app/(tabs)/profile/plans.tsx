/**
 * Plans & Subscription — horizontal swipeable CARD STACK (payment-card style).
 * One active card centered; next/prev partially visible. Snap, compact cards, pagination dots.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  FlatList,
  ScrollView,
  Switch,
  Modal,
  Animated,
  PanResponder,
  NativeSyntheticEvent,
  NativeScrollEvent,
  type ListRenderItemInfo,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
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
import { SubscriptionSuccessSheet } from "@/components/subscription/SubscriptionSuccessSheet";
import { SubscriptionHistoryList } from "@/components/subscription/SubscriptionHistoryList";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { Alert } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { billingCycleLabel, formatPlanPrice } from "@/lib/billingCycleLabel";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";
const POPPINS_BOLD = "Poppins_700Bold";

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

const CONTENT_TOP = 14;
const CARD_STACK_TOP = 20;
const PEEK = 36;
const CARD_WIDTH = SCREEN_WIDTH - PEEK * 2;
const CARD_HEIGHT = 360;
const CARD_RADIUS = 22;
const CARD_PADDING = 18;
const SIDE_SCALE = 0.92;
const SIDE_OPACITY = 0.9;

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
            {formatPlanPrice(plan.price, plan.billing_cycle)}
          </Text>
          {plan.price > 0 ? (
            <Text style={[styles.cycleChip, isPremium && styles.cycleChipPremium]} numberOfLines={1}>
              {billingCycleLabel(plan.billing_cycle)}
            </Text>
          ) : null}
          {plan.price > 0 && (
            <Text style={[styles.taxLine, isPremium && styles.textWhiteMuted]} numberOfLines={1}>
              Tax: {gstPercent.toFixed(2)}% · Total ₹{totalWithTax.toFixed(2)}
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
  const [plansError, setPlansError] = useState<string | null>(null);
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

  /**
   * Pricing is owned by the DB (`/v1/plans`). DEFAULT_PLANS is only a shape
   * placeholder for first paint — its prices WILL drift from the real catalogue.
   * This used to `.catch(() => {})`, so a failed fetch silently rendered those
   * stale numbers as if they were real (showing ₹149 while the catalogue and the
   * partner site both said ₹3). Surface the failure and let the merchant retry
   * instead of quoting a price we can't stand behind.
   */
  const loadPlans = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/plans?type=MERCHANT`, { method: "GET" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data?.plans) || data.plans.length === 0) {
        throw new Error("empty plan catalogue");
      }
      setPlans(data.plans);
      setPlansError(null);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.warn("[plans] catalogue fetch failed — showing placeholder pricing:", msg);
      setPlansError("Couldn't load current pricing. Pull to retry.");
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      void loadPlans();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [loadPlans]);

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
  const [successSheet, setSuccessSheet] = useState<{
    planName: string;
    mode: "purchased" | "already";
    via: "wallet" | "razorpay" | "skipped" | null;
    billingCycle: string | null;
  } | null>(null);

  /**
   * Subscription history sheet. Kept closed by default so the plan cards own the
   * screen; opens on demand and can be dismissed by swiping the grabber down,
   * tapping the backdrop, the ✕, or the Android back button.
   */
  const [historyOpen, setHistoryOpen] = useState(false);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  const openHistory = useCallback(() => {
    sheetTranslateY.setValue(0);
    setHistoryOpen(true);
  }, [sheetTranslateY]);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    sheetTranslateY.setValue(0);
  }, [sheetTranslateY]);

  const sheetPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_evt, g) => {
        // Only track downward drags — never let the sheet be pulled above its rest position.
        if (g.dy > 0) sheetTranslateY.setValue(g.dy);
      },
      onPanResponderRelease: (_evt, g) => {
        const dismissed = g.dy > 110 || g.vy > 0.8;
        if (dismissed) {
          Animated.timing(sheetTranslateY, {
            toValue: 600,
            duration: 160,
            useNativeDriver: true,
          }).start(() => {
            setHistoryOpen(false);
            sheetTranslateY.setValue(0);
          });
        } else {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 2,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 2,
        }).start();
      },
    })
  ).current;

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
        setSuccessSheet({
          planName: plan.plan_name,
          mode: "purchased",
          via: "skipped",
          billingCycle: plan.billing_cycle,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Please try again.";
        if (/already on this plan/i.test(msg)) {
          setSuccessSheet({
            planName: plan.plan_name,
            mode: "already",
            via: null,
            billingCycle: plan.billing_cycle,
          });
        } else {
          Alert.alert("Could not activate", msg);
        }
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

      {plansError ? (
        <View style={styles.plansErrorWrap}>
          <Ionicons name="warning-outline" size={16} color="#B45309" />
          <Text style={styles.plansErrorText}>{plansError}</Text>
          <Pressable onPress={() => void loadPlans()} hitSlop={8}>
            <Text style={styles.plansErrorRetry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* History lives behind a button, not inline: rendering the timeline here
          pushed the plan cards off-screen on small devices and this screen is a
          fixed View (no vertical scroll), so the list had nowhere to go. */}
      {selectedStore?.id && token ? (
        <View style={styles.historyCtaWrap}>
          <Pressable
            onPress={openHistory}
            style={({ pressed }) => [styles.historyCta, pressed && styles.historyCtaPressed]}
            accessibilityRole="button"
            accessibilityLabel="View subscription history"
          >
            <Ionicons name="time-outline" size={18} color={GatiMitraMerchant.textPrimary} />
            <Text style={styles.historyCtaText}>Subscription history</Text>
            <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* Bottom sheet: swipe the handle down or tap the backdrop / ✕ to close. */}
      {selectedStore?.id && token ? (
        <Modal
          visible={historyOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={closeHistory}
        >
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={closeHistory} />
            <Animated.View
              style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}
            >
              <View style={styles.sheetGrabArea} {...sheetPan.panHandlers}>
                <View style={styles.sheetGrabber} />
              </View>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Subscription history</Text>
                <Pressable
                  onPress={closeHistory}
                  hitSlop={10}
                  style={styles.sheetClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close subscription history"
                >
                  <Ionicons name="close" size={20} color={GatiMitraMerchant.textPrimary} />
                </Pressable>
              </View>
              <ScrollView
                style={styles.sheetBody}
                contentContainerStyle={styles.sheetBodyContent}
                showsVerticalScrollIndicator={false}
              >
                <SubscriptionHistoryList storeId={selectedStore.id} token={token} />
              </ScrollView>
            </Animated.View>
          </View>
        </Modal>
      ) : null}

      {checkoutPlan && token && selectedStore?.id ? (
        <SubscriptionCheckoutModal
          visible={!!checkoutPlan}
          storeId={selectedStore.id}
          planId={checkoutPlan.id}
          planName={checkoutPlan.plan_name}
          token={token}
          onSuccess={async ({ via, alreadyOnPlan }) => {
            const planSnapshot = checkoutPlan;
            // Close checkout first so the success sheet isn't stacked under it.
            setCheckoutPlan(null);
            await refreshSubscriptionState();
            // Next frame → success sheet opens cleanly after checkout Modal unmounts.
            requestAnimationFrame(() => {
              setSuccessSheet({
                planName: planSnapshot.plan_name,
                mode: alreadyOnPlan ? "already" : "purchased",
                via: alreadyOnPlan ? null : via,
                billingCycle: planSnapshot.billing_cycle,
              });
            });
          }}
          onClose={() => setCheckoutPlan(null)}
        />
      ) : null}

      <SubscriptionSuccessSheet
        visible={!!successSheet}
        planName={successSheet?.planName ?? ""}
        mode={successSheet?.mode ?? "purchased"}
        via={successSheet?.via ?? null}
        billingCycleLabel={
          successSheet?.billingCycle ? billingCycleLabel(successSheet.billingCycle) : null
        }
        onClose={() => setSuccessSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  plansErrorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: H_PADDING,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  plansErrorText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#92400E" },
  plansErrorRetry: { fontSize: 12, fontWeight: "800", color: "#B45309" },
  historyCtaWrap: { paddingHorizontal: H_PADDING, marginTop: 18 },
  historyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  historyCtaPressed: { opacity: 0.85 },
  historyCtaText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.5)" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "82%",
    paddingBottom: 8,
    overflow: "hidden",
  },
  sheetGrabArea: { paddingTop: 10, paddingBottom: 6, alignItems: "center" },
  sheetGrabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  sheetTitle: { fontSize: 17, fontWeight: "800", fontFamily: LORA_BOLD, color: GatiMitraMerchant.textPrimary },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  sheetBody: { flexGrow: 0 },
  sheetBodyContent: { paddingHorizontal: H_PADDING, paddingTop: 12, paddingBottom: 24 },

  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { paddingHorizontal: H_PADDING, marginBottom: 12 },
  title: {
    fontSize: 24,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: LORA,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 4,
    lineHeight: 18,
  },
  subheading: {
    fontSize: 12,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: PEEK,
    paddingBottom: 8,
  },
  cell: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT + 24,
    justifyContent: "center",
    alignItems: "center",
  },
  listWrap: { flex: 1, justifyContent: "center" },
  cardBase: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 6,
  },
  cardActiveOuterWrap: {
    borderWidth: 2.5,
    borderColor: GatiMitraMerchant.primary,
    borderRadius: CARD_RADIUS + 4,
    padding: 3,
    shadowColor: GatiMitraMerchant.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 10,
  },
  cardActiveDoubleBorder: {
    borderWidth: 0,
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
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 2,
  },
  textWhite: { color: "#fff" },
  textWhiteMuted: { color: "rgba(255,255,255,0.82)" },
  price: {
    fontSize: 28,
    fontFamily: POPPINS_BOLD,
    color: GatiMitraMerchant.primary,
    marginTop: 6,
    marginBottom: 2,
  },
  cycleChip: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(62, 180, 137, 0.12)",
    color: GatiMitraMerchant.primaryDark,
    fontSize: 11,
    fontFamily: LORA_BOLD,
  },
  cycleChipPremium: {
    backgroundColor: "rgba(255,255,255,0.22)",
    color: "#FFFFFF",
  },
  taxLine: {
    fontSize: 11,
    fontFamily: LORA,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
  },
  badgePremium: { backgroundColor: "rgba(255,255,255,0.28)" },
  badgeText: { fontSize: 10, fontFamily: LORA_BOLD, color: "#fff" },
  currentBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.statusCompletedBg,
  },
  currentBadgePremium: { backgroundColor: "rgba(255,255,255,0.2)" },
  currentBadgeText: {
    fontSize: 10,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.statusCompleted,
  },
  description: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 10,
    lineHeight: 17,
    fontFamily: LORA,
  },
  featuresWrap: { flex: 1, minHeight: 0, marginTop: 4 },
  featuresScroll: { flex: 1, minHeight: 0 },
  featuresTitle: {
    fontSize: 10,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  benefitLabel: {
    fontSize: 11,
    fontFamily: LORA,
    color: GatiMitraMerchant.textSecondary,
    flex: 1,
  },
  benefitValue: {
    fontSize: 11,
    fontFamily: LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
    minWidth: 44,
    textAlign: "right",
  },
  cta: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    marginTop: 12,
    shadowColor: GatiMitraMerchant.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaPremium: { backgroundColor: "rgba(255,255,255,0.28)" },
  ctaActive: { backgroundColor: GatiMitraMerchant.surfaceSubtle, shadowOpacity: 0 },
  ctaPressed: { opacity: 0.9 },
  ctaText: { fontSize: 14, fontFamily: LORA_BOLD, color: "#fff", letterSpacing: 0.3 },
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
