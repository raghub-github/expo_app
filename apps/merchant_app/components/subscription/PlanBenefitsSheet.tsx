import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { formatPlanPrice, billingCycleLabel } from "@/lib/billingCycleLabel";
import type { MerchantPlan } from "@/app/(tabs)/profile/plans";

type FeatureRow = { label: string; value: string };

type Props = {
  visible: boolean;
  plan: MerchantPlan | null;
  isActive: boolean;
  features: FeatureRow[];
  onClose: () => void;
};

export function PlanBenefitsSheet({
  visible,
  plan,
  isActive,
  features,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

  if (!plan) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{plan.plan_name}</Text>
              <Text style={styles.subtitle}>Full benefits included in this plan</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPlanPrice(plan.price, plan.billing_cycle)}</Text>
            <Text style={styles.cycle}> · {billingCycleLabel(plan.billing_cycle)}</Text>
            {isActive ? (
              <View style={styles.activeTag}>
                <Text style={styles.activeTagText}>ACTIVE</Text>
              </View>
            ) : null}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {features.map((row) => (
              <View key={row.label} style={styles.featureRow}>
                <Text style={styles.featureLabel}>{row.label}</Text>
                <Text style={styles.featureValue}>{row.value}</Text>
              </View>
            ))}
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
    maxHeight: "82%",
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
    paddingBottom: 8,
    gap: 8,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: H_PADDING,
    paddingBottom: 12,
  },
  price: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
  },
  cycle: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    fontWeight: "600",
  },
  activeTag: {
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
  scroll: { flexGrow: 0 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
    gap: 0,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
  },
  featureLabel: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    fontWeight: "500",
  },
  featureValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "right",
  },
});
