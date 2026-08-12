import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { formatPlanPrice } from "@/lib/billingCycleLabel";
import type { MerchantPlan } from "@/app/(tabs)/profile/plans";

type FeatureRow = { label: string; value: string };

type Props = {
  visible: boolean;
  plans: MerchantPlan[];
  activePlanCode: string;
  getFeatures: (plan: MerchantPlan) => FeatureRow[];
  onClose: () => void;
};

function planRank(plan: MerchantPlan): number {
  return Number(plan.price) || 0;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const FEATURES_MAX_HEIGHT = Math.min(SCREEN_HEIGHT * 0.52, 420);

export function PlanCompareSheet({
  visible,
  plans,
  activePlanCode,
  getFeatures,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const ordered = [...plans].sort((a, b) => planRank(a) - planRank(b));
  const featureLabels = Array.from(
    new Set(ordered.flatMap((p) => getFeatures(p).map((f) => f.label)))
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Compare plans</Text>
              <Text style={styles.subtitle}>Full details of what each plan includes.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.planStrip}
            style={styles.planStripScroll}
          >
            {ordered.map((plan) => {
              const isActive =
                (plan.plan_code || "").toUpperCase() === activePlanCode.toUpperCase();
              const features = getFeatures(plan);
              return (
                <View
                  key={plan.plan_code}
                  style={[styles.planCol, isActive && styles.planColActive]}
                >
                  <Text style={styles.planName} numberOfLines={2}>
                    {plan.plan_name}
                  </Text>
                  <Text style={styles.planPrice}>
                    {formatPlanPrice(plan.price, plan.billing_cycle)}
                  </Text>
                  {isActive ? (
                    <View style={styles.activeTag}>
                      <Text style={styles.activeTagText}>ACTIVE</Text>
                    </View>
                  ) : null}
                  <ScrollView
                    style={styles.featuresScroll}
                    contentContainerStyle={styles.featuresContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {featureLabels.map((label) => {
                      const row = features.find((f) => f.label === label);
                      return (
                        <View key={label} style={styles.featureRow}>
                          <Text style={styles.featureLabel} numberOfLines={2}>
                            {label}
                          </Text>
                          <Text style={styles.featureValue} numberOfLines={2}>
                            {row?.value ?? "—"}
                          </Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
    paddingTop: 8,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingBottom: 12,
    gap: 8,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  subtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  planStripScroll: { flexGrow: 0 },
  planStrip: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
    gap: 10,
    alignItems: "flex-start",
  },
  planCol: {
    width: 220,
    maxHeight: FEATURES_MAX_HEIGHT + 120,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    padding: 12,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  planColActive: {
    borderColor: GatiMitraMerchant.primary,
    borderWidth: 2,
  },
  planName: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  planPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.navy,
  },
  activeTag: {
    alignSelf: "flex-start",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2E7D32",
    letterSpacing: 0.5,
  },
  featuresScroll: {
    maxHeight: FEATURES_MAX_HEIGHT,
  },
  featuresContent: {
    paddingBottom: 4,
    gap: 0,
  },
  featureRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 2,
  },
  featureLabel: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    fontWeight: "600",
  },
  featureValue: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
});
