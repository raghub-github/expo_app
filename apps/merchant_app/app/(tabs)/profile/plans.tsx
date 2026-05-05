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
import { useSelectedStore } from "@/context/SelectedStoreContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type MerchantPlan = {
  id: number;
  plan_name: string;
  plan_code: string;
  description: string | null;
  price: number;
  gst_percent?: number;
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
  return [
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
}: {
  plan: MerchantPlan;
  index: number;
  currentIndex: number;
  total: number;
  isCurrentPlan: boolean;
  onSelect: () => void;
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
        <Text style={[styles.description, isPremium && styles.textWhite]} numberOfLines={1}>
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
      <Pressable
        onPress={onSelect}
        disabled={isCurrentPlan && plan.price === 0}
        style={({ pressed }) => [
          styles.cta,
          isPremium && styles.ctaPremium,
          isCurrentPlan && plan.price === 0 && styles.ctaActive,
          pressed && !(isCurrentPlan && plan.price === 0) && styles.ctaPressed,
        ]}
      >
        <Text
          style={[
            styles.ctaText,
            isPremium && styles.ctaTextPremium,
            isCurrentPlan && plan.price === 0 && styles.ctaTextActive,
          ]}
        >
          {isCurrentPlan && plan.price === 0 ? "Active Plan" : "Upgrade"}
        </Text>
      </Pressable>
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

/** Circular list: [last, ...plans, first] so swipe from last goes to first, from first to last. */
function buildCircularData(plans: MerchantPlan[]): MerchantPlan[] {
  if (plans.length <= 1) return plans;
  const first = plans[0]!;
  const last = plans[plans.length - 1]!;
  return [{ ...last, id: -1 }, ...plans, { ...first, id: -2 }];
}

export default function PlansScreen() {
  const listRef = useRef<FlatList>(null);
  const [plans, setPlans] = useState<MerchantPlan[]>(DEFAULT_PLANS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activePlanCode, setActivePlanCode] = useState(FALLBACK_ACTIVE_PLAN_CODE);

  const { selectedStore } = useSelectedStore();

  const circularData = buildCircularData(plans);
  const realCount = plans.length;

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

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const rawIndex = Math.round(x / CARD_WIDTH);
    let idx = rawIndex;
    if (rawIndex <= 0) idx = realCount - 1;
    else if (rawIndex >= circularData.length - 1) idx = 0;
    else idx = rawIndex - 1;
    setCurrentIndex(Math.max(0, Math.min(idx, realCount - 1)));
  }, [realCount, circularData.length]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const rawIndex = Math.round(x / CARD_WIDTH);
      if (realCount <= 1) {
        setCurrentIndex(0);
        return;
      }
      if (rawIndex <= 0) {
        listRef.current?.scrollToOffset({
          offset: (circularData.length - 1) * CARD_WIDTH,
          animated: false,
        });
        setCurrentIndex(0);
      } else if (rawIndex >= circularData.length - 1) {
        listRef.current?.scrollToOffset({ offset: CARD_WIDTH, animated: false });
        setCurrentIndex(0);
      } else {
        setCurrentIndex(rawIndex - 1);
      }
    },
    [realCount, circularData.length]
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: CARD_WIDTH,
      offset: CARD_WIDTH * index,
      index,
    }),
    []
  );

  const snapToOffsets = circularData.map((_, i) => i * CARD_WIDTH);

  const scrollBottomPadding = TAB_BAR_SCROLL_CONTENT_PADDING;

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MerchantPlan>) => {
      const displayIndex = index === 0 ? realCount - 1 : index >= circularData.length - 1 ? 0 : index - 1;
      return (
        <View style={styles.cell}>
          <StackCard
            plan={item}
            index={displayIndex}
            currentIndex={currentIndex}
            total={realCount}
            isCurrentPlan={(item.plan_code || "").toUpperCase() === activePlanCode.toUpperCase()}
            onSelect={() => {}}
          />
        </View>
      );
    },
    [currentIndex, activePlanCode, realCount, circularData.length]
  );

  return (
    <View style={[styles.container, { paddingBottom: scrollBottomPadding }]}>
      <View style={[styles.header, { paddingTop: CONTENT_TOP }]}>
        <Text style={styles.title}>Plans & Subscription</Text>
        <Text style={styles.subtitle}>Swipe to compare plans</Text>
      </View>

      <View style={[styles.listWrap, { marginTop: CARD_STACK_TOP }]}>
        <FlatList
          ref={listRef}
          data={circularData}
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
          initialScrollIndex={circularData.length > 1 ? 1 : 0}
        />
      </View>

      <View style={styles.dots}>
        {plans.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
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
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
  },
  cardActiveOuterWrap: {
    borderWidth: 2,
    borderColor: GatiMitraMerchant.primary,
    borderRadius: CARD_RADIUS + 3,
    padding: 2,
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
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  textWhite: { color: "#fff" },
  price: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraMerchant.primary,
    marginTop: 2,
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
  description: { fontSize: 11, color: GatiMitraMerchant.textSecondary, marginBottom: 6 },
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
    paddingVertical: 10,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    marginTop: 8,
  },
  ctaPremium: { backgroundColor: "rgba(255,255,255,0.28)" },
  ctaActive: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  ctaPressed: { opacity: 0.9 },
  ctaText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  ctaTextPremium: { color: "#fff" },
  ctaTextActive: { color: GatiMitraMerchant.textSecondary },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GatiMitraMerchant.border,
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GatiMitraMerchant.primary,
  },
});
