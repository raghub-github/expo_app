/**
 * Explains WHY a service is blocked for this rider (Step 5b). Opened from a blocked row in
 * the service dropdown. Read-only + advisory — it changes nothing; it turns "this service
 * is missing" into "here's exactly why, and what to do", so PREFERENCE is never mistaken
 * for ELIGIBILITY. Reasons come from the backend eligibility engine.
 */
import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlockingBottomSheetShell } from "@/src/components/vehicle/BlockingBottomSheetShell";
import { colors } from "@/src/theme";
import type { EligibilityReason } from "@/src/lib/rider-service-eligibility-rows";

type Props = {
  visible: boolean;
  serviceLabel: string;
  reasons: EligibilityReason[];
  onClose: () => void;
};

export function ServiceEligibilityReasonSheet({ visible, serviceLabel, reasons, onClose }: Props) {
  return (
    <BlockingBottomSheetShell visible={visible} maxHeightRatio={0.6}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed-outline" size={26} color="#B45309" />
        </View>
        <Text style={styles.title}>{serviceLabel} not available yet</Text>
        <Text style={styles.subtitle}>
          You can turn this on once it&apos;s eligible. Here&apos;s what&apos;s needed:
        </Text>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {reasons.map((r, i) => (
            <View key={`${r.code}-${i}`} style={styles.reasonRow}>
              <Ionicons
                name="alert-circle"
                size={18}
                color="#DC2626"
                style={styles.reasonIcon}
              />
              <View style={styles.reasonTextWrap}>
                <Text style={styles.reasonText}>{r.reason}</Text>
                {r.requiredAction ? (
                  <Text style={styles.actionText}>→ {r.requiredAction}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>

        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnText}>Got it</Text>
        </Pressable>
      </View>
    </BlockingBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 6,
    alignItems: "center",
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16,
  },
  list: {
    alignSelf: "stretch",
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 4,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  reasonIcon: {
    marginTop: 1,
  },
  reasonTextWrap: {
    flex: 1,
  },
  reasonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: "#111827",
  },
  actionText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#B91C1C",
    marginTop: 3,
  },
  btn: {
    alignSelf: "stretch",
    backgroundColor: colors.primary[500],
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  btnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
