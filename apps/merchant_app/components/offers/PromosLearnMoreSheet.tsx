import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreateNow: () => void;
};

const STEPS = [
  {
    icon: "pricetag-outline" as const,
    iconColor: GatiMitraMerchant.primary,
    label: "Set your discount spend",
  },
  {
    icon: "sparkles-outline" as const,
    iconColor: "#6366F1",
    label: "GatiMitra optimises your spends",
  },
  {
    icon: "trending-up-outline" as const,
    iconColor: "#F59E0B",
    label: "Track & manage it",
  },
];

const BEFORE_ITEMS = [
  "Manual creation of multiple discounts",
  "Limited customer segments to target",
  "High risk of over-discounting",
];

const WITH_ITEMS = [
  "Simple one-time budget setup",
  "Target customers with personalised offers",
  "Optimised spend for max profit",
];

export function PromosLearnMoreSheet({ visible, onClose, onCreateNow }: Props) {
  return (
    <MerchantBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightPercent="92%"
      footer={
        <Pressable
          onPress={() => {
            onClose();
            onCreateNow();
          }}
          style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.createBtnText}>Create now</Text>
        </Pressable>
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>How GatiMitra Promos work?</Text>
        <Text style={styles.lead}>
          A data-based model which personalises discounts for every customer based on offer
          sensitivity to get maximum returns.
        </Text>

        <View style={styles.stepsRow}>
          {STEPS.map((step, index) => (
            <React.Fragment key={step.label}>
              {index > 0 ? (
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={GatiMitraMerchant.textTertiary}
                  style={styles.stepArrow}
                />
              ) : null}
              <View style={styles.stepItem}>
                <View style={[styles.stepIcon, { backgroundColor: `${step.iconColor}18` }]}>
                  <Ionicons name={step.icon} size={22} color={step.iconColor} />
                </View>
                <Text style={styles.stepLabel}>{step.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        <View style={styles.compareCard}>
          <View style={styles.compareHeader}>
            <Text style={styles.compareColTitle}>Before</Text>
            <Text style={[styles.compareColTitle, styles.compareColTitleAccent]}>
              With GatiMitra Promos
            </Text>
          </View>
          <View style={styles.compareDivider} />
          <View style={styles.compareBody}>
            <View style={styles.compareCol}>
              {BEFORE_ITEMS.map((line) => (
                <View key={line} style={styles.compareLine}>
                  <View style={styles.bullet} />
                  <Text style={styles.compareText}>{line}</Text>
                </View>
              ))}
            </View>
            <View style={styles.compareCol}>
              {WITH_ITEMS.map((line) => (
                <View key={line} style={styles.compareLine}>
                  <Ionicons name="checkmark-circle" size={16} color={GatiMitraMerchant.primary} />
                  <Text style={styles.compareTextStrong}>{line}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.note}>
          Note: New promos follow your store menu and campaign rules. Existing menu discounts and
          special campaigns continue without any changes unless you replace them.
        </Text>
      </ScrollView>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  lead: {
    fontSize: 14,
    lineHeight: 21,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 22,
  },
  stepsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 22,
    gap: 4,
  },
  stepWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepArrow: {
    marginTop: 18,
    marginRight: 2,
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
  },
  stepIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    lineHeight: 15,
  },
  compareCard: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    overflow: "hidden",
    marginBottom: 16,
  },
  compareHeader: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  compareColTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
  },
  compareColTitleAccent: {
    color: GatiMitraMerchant.textPrimary,
  },
  compareDivider: {
    height: 1,
    backgroundColor: GatiMitraMerchant.divider,
    marginHorizontal: 14,
  },
  compareBody: {
    flexDirection: "row",
    padding: 14,
    gap: 10,
  },
  compareCol: {
    flex: 1,
    gap: 12,
  },
  compareLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GatiMitraMerchant.textTertiary,
    marginTop: 6,
  },
  compareText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: GatiMitraMerchant.textSecondary,
  },
  compareTextStrong: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "600",
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 8,
  },
  createBtn: {
    marginHorizontal: H_PADDING,
    marginTop: 4,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.textPrimary,
    alignItems: "center",
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});
