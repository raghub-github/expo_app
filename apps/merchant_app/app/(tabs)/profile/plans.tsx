/**
 * Plans & Subscription — carousel cards (Partner Site UI, INR from API).
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
  ActivityIndicator,
  Alert,
  type ListRenderItemInfo,
} from "react-native";
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
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import {
  activateFreeSubscription,
  createSubscriptionPaymentOrder,
  upgradeSubscription,
  verifySubscriptionPayment,
} from "@/services/subscriptionPaymentApi";
import {
  RazorpayCheckoutModal,
  type RazorpayOrderParams,
} from "@/components/subscription/RazorpayCheckoutModal";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PEEK = 28;
const CARD_WIDTH = SCREEN_WIDTH - PEEK * 2;
const CARD_HEIGHT = 520;

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

const DEFAULT_PLANS: MerchantPlan[] = [];

function formatPriceInr(price: number, billingCycle: string): string {
  if (price === 0) return "Free";
  const cycle = (billingCycle || "MONTHLY").toLowerCase();
  const suffix = cycle === "monthly" ? "mo" : cycle === "yearly" ? "yr" : "qtr";
  return `₹${price}/${suffix}`;
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

function getPlanFeatures(plan: MerchantPlan): { label: string; value: string }[] {
  return [
    { label: "Menu items", value: plan.max_menu_items != null ? `${plan.max_menu_items} max` : "—" },
    { label: "Cuisines", value: plan.max_cuisines != null ? `${plan.max_cuisines} max` : "—" },
    {
      label: "Menu categories",
      value: plan.max_menu_categories != null ? `${plan.max_menu_categories} max` : "—",
    },
    {
      label: "Image uploads",
      value:
        plan.image_upload_allowed && plan.max_image_uploads != null
          ? `${plan.max_image_uploads} images`
          : plan.image_upload_allowed
            ? "Yes"
            : "No",
    },
    { label: "Analytics", value: plan.analytics_access ? "Yes" : "No" },
    { label: "Advanced analytics", value: plan.advanced_analytics ? "Yes" : "No" },
    { label: "Priority support", value: plan.priority_support ? "Yes" : "No" },
    { label: "Marketing automation", value: plan.marketing_automation ? "Yes" : "No" },
    { label: "Custom API", value: plan.custom_api_integrations ? "Yes" : "No" },
    { label: "Dedicated manager", value: plan.dedicated_account_manager ? "Yes" : "No" },
  ];
}

function PlanCard({
  plan,
  isCurrentPlan,
  upgrading,
  onUpgrade,
}: {
  plan: MerchantPlan;
  isCurrentPlan: boolean;
  upgrading: boolean;
  onUpgrade: () => void;
}) {
  const gstPercent = normalizeGstPercent(plan.gst_percent);
  const totalWithTax = computeTotalWithGst(plan.price, gstPercent);
  const features = getPlanFeatures(plan);

  return (
    <View style={[styles.card, isCurrentPlan && styles.cardActive]}>
      <View style={styles.cardTop}>
        <View style={styles.titleRow}>
          <Text style={styles.planName} numberOfLines={2}>
            {plan.plan_name}
          </Text>
          {isCurrentPlan ? (
            <View style={styles.activeBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.price}>{formatPriceInr(plan.price, plan.billing_cycle)}</Text>

        {plan.price > 0 ? (
          <Text style={styles.taxLine}>
            Tax: {gstPercent.toFixed(2)}% • Total ₹{totalWithTax.toFixed(2)}
          </Text>
        ) : null}

        {plan.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {plan.description}
          </Text>
        ) : null}

        <Text style={styles.includesTitle}>INCLUDES</Text>
      </View>

      <ScrollView
        style={styles.featuresScroll}
        contentContainerStyle={styles.featuresContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        bounces={false}
      >
        {features.map((f, i) => {
          const included = f.value !== "No" && f.value !== "—";
          return (
            <View key={i} style={styles.featureRow}>
              <Ionicons
                name={included ? "checkmark-circle" : "ellipse-outline"}
                size={16}
                color={included ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
              />
              <Text style={styles.featureLabel} numberOfLines={1}>
                {f.label}
              </Text>
              <Text style={styles.featureValue} numberOfLines={1}>
                {f.value}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.cardFooter, isCurrentPlan && styles.cardFooterActive]}>
        {plan.price > 0 ? (
          <Pressable
            onPress={onUpgrade}
            disabled={isCurrentPlan || upgrading}
            style={({ pressed }) => [
              styles.cta,
              isCurrentPlan ? styles.ctaActive : null,
              pressed && !isCurrentPlan && !upgrading && styles.ctaPressed,
            ]}
          >
            {upgrading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : isCurrentPlan ? (
              <View style={styles.ctaActiveInner}>
                <Ionicons name="shield-checkmark" size={18} color={GatiMitraMerchant.primary} />
                <Text style={styles.ctaTextActive}>Your active plan</Text>
              </View>
            ) : (
              <Text style={styles.ctaText}>Upgrade</Text>
            )}
          </Pressable>
        ) : (
          <View style={[styles.cta, isCurrentPlan ? styles.ctaActive : styles.ctaMuted]}>
            {isCurrentPlan ? (
              <View style={styles.ctaActiveInner}>
                <Ionicons name="shield-checkmark" size={18} color={GatiMitraMerchant.primary} />
                <Text style={styles.ctaTextActive}>Your active plan</Text>
              </View>
            ) : (
              <Text style={styles.ctaTextMuted}>Free plan</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function PlansScreen() {
  const listRef = useRef<FlatList>(null);
  const [plans, setPlans] = useState<MerchantPlan[]>(DEFAULT_PLANS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activePlanCode, setActivePlanCode] = useState(FALLBACK_ACTIVE_PLAN_CODE);
  const [upgradingPlanId, setUpgradingPlanId] = useState<number | null>(null);
  const [checkoutParams, setCheckoutParams] = useState<RazorpayOrderParams | null>(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<number | null>(null);
  const [pendingIsUpgrade, setPendingIsUpgrade] = useState(false);

  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();

  const sortedPlans = [...plans].sort((a, b) => {
    if (a.plan_code === activePlanCode) return -1;
    if (b.plan_code === activePlanCode) return 1;
    return (a.display_order ?? a.price) - (b.display_order ?? b.price);
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/v1/plans?type=MERCHANT`, { method: "GET" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.plans) && data.plans.length > 0) setPlans(data.plans);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSubscription(selectedStore?.id ?? null).then((r) => {
      if (cancelled) return;
      const code = r.plan?.plan_code?.trim();
      setActivePlanCode(code ? code.toUpperCase() : FALLBACK_ACTIVE_PLAN_CODE);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedStore?.id]);

  const reloadSubscription = useCallback(() => {
    fetchSubscription(selectedStore?.id ?? null).then((r) => {
      const code = r.plan?.plan_code?.trim();
      setActivePlanCode(code ? code.toUpperCase() : FALLBACK_ACTIVE_PLAN_CODE);
    });
  }, [selectedStore?.id]);

  const handleUpgrade = useCallback(
    async (plan: MerchantPlan) => {
      if (!selectedStore?.id || !token) {
        Alert.alert("Select store", "Please select a store first.");
        return;
      }
      if ((plan.plan_code || "").toUpperCase() === activePlanCode.toUpperCase()) return;

      setUpgradingPlanId(plan.id);
      try {
        if (plan.price === 0) {
          await activateFreeSubscription(selectedStore.id, token, plan.id);
          Alert.alert("Success", "Free plan activated.");
          reloadSubscription();
          return;
        }

        const orderData = await createSubscriptionPaymentOrder(selectedStore.id, token, plan.id);

        if (orderData.skipPayment) {
          await upgradeSubscription(selectedStore.id, token, {
            newPlanId: plan.id,
            skipPayment: true,
          });
          Alert.alert("Success", "Your plan has been upgraded.");
          reloadSubscription();
          return;
        }

        if (!orderData.orderId || !orderData.keyId || !orderData.amount) {
          throw new Error("Invalid payment order response");
        }

        if (orderData.isUpgrade && orderData.amountToCharge != null) {
          Alert.alert(
            "Upgrade",
            `You will be charged ₹${Number(orderData.amountToCharge).toFixed(2)} (incl. GST) after credit from your current plan.`
          );
        }

        setPendingPlanId(plan.id);
        setPendingIsUpgrade(!!orderData.isUpgrade);
        setCheckoutParams({
          orderId: orderData.orderId,
          keyId: orderData.keyId,
          amount: orderData.amount,
        });
        setCheckoutVisible(true);
      } catch (e) {
        Alert.alert("Upgrade failed", e instanceof Error ? e.message : "Please try again.");
      } finally {
        setUpgradingPlanId(null);
      }
    },
    [selectedStore?.id, token, activePlanCode, reloadSubscription]
  );

  const onPaymentSuccess = useCallback(
    async (result: {
      razorpayPaymentId: string;
      razorpayOrderId: string;
      razorpaySignature: string;
    }) => {
      setCheckoutVisible(false);
      setCheckoutParams(null);
      if (!selectedStore?.id || !token || pendingPlanId == null) return;

      setUpgradingPlanId(pendingPlanId);
      try {
        if (pendingIsUpgrade) {
          await upgradeSubscription(selectedStore.id, token, {
            newPlanId: pendingPlanId,
            razorpay_order_id: result.razorpayOrderId,
            razorpay_payment_id: result.razorpayPaymentId,
            razorpay_signature: result.razorpaySignature,
          });
        } else {
          await verifySubscriptionPayment(selectedStore.id, token, {
            planId: pendingPlanId,
            razorpay_order_id: result.razorpayOrderId,
            razorpay_payment_id: result.razorpayPaymentId,
            razorpay_signature: result.razorpaySignature,
          });
        }
        Alert.alert("Success", "Payment successful. Your new plan is active.");
        reloadSubscription();
      } catch (e) {
        Alert.alert("Verification failed", e instanceof Error ? e.message : "Contact support.");
      } finally {
        setUpgradingPlanId(null);
        setPendingPlanId(null);
      }
    },
    [selectedStore?.id, token, pendingPlanId, pendingIsUpgrade, reloadSubscription]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MerchantPlan>) => (
      <View style={styles.cell}>
        <PlanCard
          plan={item}
          isCurrentPlan={(item.plan_code || "").toUpperCase() === activePlanCode.toUpperCase()}
          upgrading={upgradingPlanId === item.id}
          onUpgrade={() => void handleUpgrade(item)}
        />
      </View>
    ),
    [activePlanCode, upgradingPlanId, handleUpgrade]
  );

  return (
    <View style={[styles.container, { paddingBottom: TAB_BAR_SCROLL_CONTENT_PADDING }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Plans & Subscription</Text>
        <Text style={styles.subtitle}>Choose a plan that works best for your restaurant</Text>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={sortedPlans}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        horizontal
        snapToInterval={CARD_WIDTH}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
          setCurrentIndex(Math.max(0, Math.min(idx, sortedPlans.length - 1)));
        }}
        scrollEnabled={sortedPlans.length > 1}
      />

      <View style={styles.dots}>
        {sortedPlans.map((_, i) => (
          <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
        ))}
      </View>

      <RazorpayCheckoutModal
        visible={checkoutVisible}
        orderParams={checkoutParams}
        prefill={{
          name: selectedStore?.store_name ?? "",
        }}
        themeColor={GatiMitraMerchant.primary}
        onSuccess={onPaymentSuccess}
        onCancel={() => {
          setCheckoutVisible(false);
          setCheckoutParams(null);
          setPendingPlanId(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  header: { paddingHorizontal: H_PADDING, paddingTop: 18, marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 4,
  },
  list: {
    flexGrow: 0,
    flexShrink: 0,
  },
  listContent: {
    paddingHorizontal: PEEK,
    paddingBottom: 8,
    alignItems: "center",
  },
  cell: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT + 16,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
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
  cardActive: {
    borderWidth: 2,
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#F0FDF4",
    ...Platform.select({
      ios: {
        shadowColor: GatiMitraMerchant.primary,
        shadowOpacity: 0.18,
        shadowRadius: 14,
      },
      android: { elevation: 6 },
    }),
  },
  cardTop: {
    flexShrink: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: GatiMitraMerchant.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 0,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  planName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  price: {
    fontSize: 28,
    fontWeight: "800",
    color: GatiMitraMerchant.primary,
    marginBottom: 4,
  },
  taxLine: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  includesTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  featuresScroll: {
    flex: 1,
    minHeight: 0,
    marginBottom: 4,
  },
  featuresContent: {
    paddingBottom: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    minHeight: 22,
  },
  cardFooter: {
    flexShrink: 0,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
  },
  cardFooterActive: {
    borderTopColor: "rgba(22, 163, 74, 0.25)",
  },
  featureLabel: {
    flex: 1,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  featureValue: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    minWidth: 72,
    textAlign: "right",
  },
  cta: {
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    backgroundColor: GatiMitraMerchant.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  ctaActive: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1.5,
    borderColor: GatiMitraMerchant.primary,
  },
  ctaMuted: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  ctaActiveInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaPressed: { opacity: 0.92 },
  ctaText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  ctaTextActive: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.primary,
  },
  ctaTextMuted: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GatiMitraMerchant.border,
  },
  dotActive: {
    width: 9,
    height: 9,
    backgroundColor: GatiMitraMerchant.primary,
  },
});
