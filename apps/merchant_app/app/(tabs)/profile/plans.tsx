/**
 * Plans & Subscription — horizontal swipeable CARD STACK (payment-card style).
 * One active card centered; next/prev partially visible. Snap, compact cards, pagination dots.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { PlanCompareSheet } from "@/components/subscription/PlanCompareSheet";
import { PlanBenefitsSheet } from "@/components/subscription/PlanBenefitsSheet";
import { SubscriptionSuccessSheet } from "@/components/subscription/SubscriptionSuccessSheet";
import { SubscriptionHistoryList } from "@/components/subscription/SubscriptionHistoryList";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { Alert } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { billingCycleLabel, formatPlanPrice } from "@/lib/billingCycleLabel";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";

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
const PEEK = 28;
const CARD_WIDTH = SCREEN_WIDTH - PEEK * 2;
const CARD_RADIUS = 12;
const CARD_PADDING = 16;
const SIDE_SCALE = 0.96;
const SIDE_OPACITY = 0.92;

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

/** First five rows shown on card — full list opens in bottom sheet. */
function getPlanPreviewFeatures(plan: MerchantPlan): { label: string; value: string }[] {
  const all = getAllPlanFeatures(plan);
  const imageIdx = all.findIndex((f) => f.label === "Image uploads");
  if (imageIdx >= 0) return all.slice(0, imageIdx + 1);
  return all.slice(0, 5);
}

function getPlanVisual(plan: MerchantPlan): {
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
} {
  const code = (plan.plan_code || "").toUpperCase();
  if (code === "FREE" || plan.price === 0) {
    return { icon: "leaf-outline", accent: "#64748b" };
  }
  if (code === "ENTERPRISE" || code === "PRO" || plan.price >= 250) {
    return { icon: "rocket-outline", accent: "#7c3aed" };
  }
  if (plan.is_popular || code === "PREMIUM" || code === "GROWTH") {
    return { icon: "trending-up-outline", accent: GatiMitraMerchant.primary };
  }
  return { icon: "diamond-outline", accent: GatiMitraMerchant.navy };
}

function PlanCardGraphic({ plan }: { plan: MerchantPlan }) {
  const { icon, accent } = getPlanVisual(plan);
  return (
    <View style={styles.cardGraphicWrap}>
      <View style={[styles.cardGraphicArrow, { backgroundColor: accent + "22" }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
    </View>
  );
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
  isCurrentPlan,
  activePlanPrice,
  onSelect,
  onCompare,
  onSeeMore,
  autoRenew,
  onAutoRenewChange,
  autoRenewLoading,
}: {
  plan: MerchantPlan;
  index: number;
  currentIndex: number;
  total: number;
  isCurrentPlan: boolean;
  activePlanPrice: number;
  onSelect: () => void;
  onCompare: () => void;
  onSeeMore: () => void;
  autoRenew?: boolean;
  onAutoRenewChange?: (value: boolean) => void;
  autoRenewLoading?: boolean;
}) {
  const distance = index - currentIndex;
  const isCenter = distance === 0;
  const scale = isCenter ? 1 : SIDE_SCALE;
  const opacity = isCenter ? 1 : SIDE_OPACITY;
  const previewFeatures = getPlanPreviewFeatures(plan);
  const allFeatures = getAllPlanFeatures(plan);
  const hasMoreBenefits = allFeatures.length > previewFeatures.length;
  const gstPercent = normalizeGstPercent(plan.gst_percent);
  const totalWithTax = computeTotalWithGst(plan.price, gstPercent);
  const canUpgrade = !isCurrentPlan && plan.price > activePlanPrice;

  const primaryLabel = isCurrentPlan
    ? plan.price === 0
      ? "Your Current Plan"
      : "Active Plan"
    : canUpgrade
      ? plan.price === 0
        ? "Switch to Free"
        : "Upgrade"
      : "Included";

  return (
    <View
      style={[
        isCenter && isCurrentPlan && styles.cardActiveOuterWrap,
        { transform: [{ scale }], opacity },
      ]}
    >
      <View
        style={[
          styles.cardBase,
          { width: CARD_WIDTH, borderRadius: CARD_RADIUS },
          isCenter ? ACTIVE_SHADOW : SIDE_SHADOW,
        ]}
      >
        <View style={styles.cardTopSection}>
          <View style={styles.cardTopLeft}>
            {isCurrentPlan ? (
              <View style={styles.statusBadgeActive}>
                <Text style={styles.statusBadgeActiveText}>ACTIVE</Text>
              </View>
            ) : plan.is_popular ? (
              <View style={styles.statusBadgePopular}>
                <Text style={styles.statusBadgePopularText}>POPULAR</Text>
              </View>
            ) : null}
            <Text style={styles.planName} numberOfLines={2}>
              {plan.plan_name}
            </Text>
            <Text style={styles.metaLine}>
              Billing · {billingCycleLabel(plan.billing_cycle)}
            </Text>
            <Text style={styles.metaLine}>
              Price · {formatPlanPrice(plan.price, plan.billing_cycle)}
            </Text>
            {plan.price > 0 ? (
              <Text style={styles.metaLine}>
                Total · ₹{totalWithTax.toFixed(2)} incl. {gstPercent.toFixed(0)}% tax
              </Text>
            ) : null}
            {plan.description ? (
              <Text style={styles.metaLineMuted} numberOfLines={2}>
                {plan.description}
              </Text>
            ) : null}
          </View>
          <PlanCardGraphic plan={plan} />
        </View>

        <View style={styles.cardDivider} />

        <Text style={styles.includesTitle}>What you get</Text>
        <View style={styles.statsSection}>
          {previewFeatures.map((row) => (
            <View key={row.label} style={styles.statRow}>
              <Text style={styles.statLabel} numberOfLines={2}>
                {row.label}
              </Text>
              <Text style={styles.statValue} numberOfLines={2}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        {hasMoreBenefits ? (
          <Pressable
            onPress={onSeeMore}
            style={({ pressed }) => [styles.seeMoreBtn, pressed && styles.btnPressed]}
          >
            <Text style={styles.seeMoreText}>See More</Text>
            <Ionicons name="arrow-forward" size={14} color={GatiMitraMerchant.primary} />
          </Pressable>
        ) : null}

        {isCurrentPlan && plan.price > 0 && onAutoRenewChange ? (
          <>
            <View style={styles.cardDivider} />
            <View style={styles.autoRenewRow}>
              <View style={styles.autoRenewTextWrap}>
                <Text style={styles.autoRenewTitle}>Auto Renew</Text>
                <Text style={styles.autoRenewSubtitle}>Deduct from wallet on renewal</Text>
              </View>
              <Switch
                value={autoRenew === true}
                onValueChange={onAutoRenewChange}
                disabled={autoRenewLoading}
                trackColor={{ false: "#E5E7EB", true: GatiMitraMerchant.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </>
        ) : null}

        <View style={styles.cardDivider} />

        <View style={styles.buttonRow}>
          <Pressable
            onPress={onCompare}
            style={({ pressed }) => [styles.btnOutline, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnOutlineText}>Compare</Text>
            <Ionicons name="arrow-forward" size={14} color={GatiMitraMerchant.textPrimary} />
          </Pressable>

          <Pressable
            onPress={onSelect}
            disabled={isCurrentPlan || !canUpgrade}
            style={({ pressed }) => [
              styles.btnSolid,
              (isCurrentPlan || !canUpgrade) && styles.btnSolidMuted,
              pressed && canUpgrade && styles.btnPressed,
            ]}
          >
            <Text
              style={[
                styles.btnSolidText,
                (isCurrentPlan || !canUpgrade) && styles.btnSolidTextMuted,
              ]}
            >
              {primaryLabel}
            </Text>
            {canUpgrade ? (
              <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
            ) : null}
          </Pressable>
        </View>
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
  const [compareOpen, setCompareOpen] = useState(false);
  const [benefitsPlan, setBenefitsPlan] = useState<MerchantPlan | null>(null);

  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();

  const activePlanPrice = useMemo(() => {
    const active = plans.find(
      (p) => (p.plan_code || "").toUpperCase() === activePlanCode.toUpperCase()
    );
    return Number(active?.price) || 0;
  }, [plans, activePlanCode]);

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
            activePlanPrice={activePlanPrice}
            onSelect={() => handleUpgrade(item)}
            onCompare={() => setCompareOpen(true)}
            onSeeMore={() => setBenefitsPlan(item)}
            autoRenew={autoRenew}
            onAutoRenewChange={handleAutoRenewChange}
            autoRenewLoading={autoRenewLoading}
          />
        </View>
      );
    },
    [
      currentIndex,
      activePlanCode,
      activePlanPrice,
      realCount,
      autoRenew,
      autoRenewLoading,
      handleAutoRenewChange,
    ]
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
      <View style={[styles.listWrap, { marginTop: CONTENT_TOP }]}>
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

      <PlanCompareSheet
        visible={compareOpen}
        plans={sortedPlans}
        activePlanCode={activePlanCode}
        getFeatures={getAllPlanFeatures}
        onClose={() => setCompareOpen(false)}
      />

      <PlanBenefitsSheet
        visible={!!benefitsPlan}
        plan={benefitsPlan}
        isActive={
          benefitsPlan
            ? (benefitsPlan.plan_code || "").toUpperCase() === activePlanCode.toUpperCase()
            : false
        }
        features={benefitsPlan ? getAllPlanFeatures(benefitsPlan) : []}
        onClose={() => setBenefitsPlan(null)}
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
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  listWrap: { flex: 1, justifyContent: "center" },
  cardBase: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    overflow: "hidden",
    padding: CARD_PADDING,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  cardActiveOuterWrap: {
    borderWidth: 2,
    borderColor: GatiMitraMerchant.primary,
    borderRadius: CARD_RADIUS + 3,
    padding: 2,
  },
  cardTopSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 14,
  },
  cardTopLeft: { flex: 1, minWidth: 0, gap: 4 },
  cardGraphicWrap: {
    width: 56,
    height: 56,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  cardGraphicArrow: {
    width: 52,
    height: 44,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeActive: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#E8F5E9",
    marginBottom: 6,
  },
  statusBadgeActiveText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#2E7D32",
  },
  statusBadgePopular: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#E3F2FD",
    marginBottom: 6,
  },
  statusBadgePopularText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#1565C0",
  },
  planName: {
    fontSize: 22,
    fontFamily: LORA_BOLD,
    fontWeight: "800",
    color: "#1A1A1A",
    lineHeight: 28,
    marginBottom: 2,
  },
  metaLine: {
    fontSize: 13,
    fontFamily: LORA,
    color: "#757575",
    lineHeight: 18,
  },
  metaLineMuted: {
    fontSize: 12,
    fontFamily: LORA,
    color: "#9CA3AF",
    lineHeight: 17,
    marginTop: 2,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#EEEEEE",
    marginVertical: 10,
  },
  includesTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statsSection: { gap: 8, marginBottom: 4 },
  seeMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    marginBottom: 2,
  },
  seeMoreText: {
    fontSize: 13,
    fontFamily: LORA_BOLD,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: LORA,
    color: "#757575",
  },
  statValue: {
    fontSize: 14,
    fontFamily: LORA_BOLD,
    fontWeight: "700",
    color: "#1A1A1A",
    textAlign: "right",
    maxWidth: "48%",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  btnOutline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1A1A1A",
    backgroundColor: "#FFFFFF",
  },
  btnOutlineMuted: {
    borderColor: "#D1D5DB",
  },
  btnOutlineText: {
    fontSize: 13,
    fontFamily: LORA_BOLD,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  btnOutlineTextMuted: {
    color: "#9CA3AF",
  },
  btnSolid: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#1A1A1A",
  },
  btnSolidMuted: {
    backgroundColor: "#F3F4F6",
  },
  btnSolidText: {
    fontSize: 13,
    fontFamily: LORA_BOLD,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  btnSolidTextMuted: {
    color: "#9CA3AF",
  },
  btnPressed: { opacity: 0.88 },
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
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
