/**
 * Explains WHY a service is blocked for this rider. Opened from a locked row in
 * the service dropdown. Dismissible — riders can close it or open DL/RC upload.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { RiderFonts } from "@/src/theme/fonts";
import {
  SLIDE_ACTION_GREEN,
  SLIDE_ACTION_GREEN_BORDER,
} from "@/src/theme/slideAction";
import type { EligibilityReason } from "@/src/lib/rider-service-eligibility-rows";

type Props = {
  visible: boolean;
  serviceLabel: string;
  reasons: EligibilityReason[];
  onClose: () => void;
  onCheckVehicles: () => void;
};

export function ServiceEligibilityReasonSheet({
  visible,
  serviceLabel,
  reasons,
  onClose,
  onCheckVehicles,
}: Props) {
  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onClose}
      maxHeightRatio={0.72}
      fitContent
      showFloatingClose
      compactBottomInset
      sheetBottomPadding={24}
    >
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed-outline" size={26} color="#B45309" />
        </View>

        <Text style={styles.title}>{serviceLabel} not available yet</Text>
        <Text style={styles.subtitle}>
          You can turn this on once it&apos;s eligible. Here&apos;s what&apos;s needed:
        </Text>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {reasons.map((r, i) => (
            <View key={`${r.code}-${i}`} style={styles.reasonRow}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" />
              <Text style={styles.reasonText}>{r.reason}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.actions}>
          <View style={styles.primarySlot}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={onCheckVehicles}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Check your vehicles"
            >
              <Text style={styles.primaryBtnText} numberOfLines={1}>
                Check your vehicles
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.secondarySlot}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={onClose}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.secondaryBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 22,
    lineHeight: 28,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  list: {
    alignSelf: "stretch",
    maxHeight: 160,
    width: "100%",
  },
  listContent: {
    paddingBottom: 4,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  reasonText: {
    flex: 1,
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: "#111827",
  },
  actions: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    marginTop: 16,
  },
  primarySlot: {
    width: "70%",
    paddingRight: 6,
  },
  secondarySlot: {
    width: "30%",
    paddingLeft: 6,
  },
  primaryBtn: {
    width: "100%",
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: SLIDE_ACTION_GREEN,
    borderWidth: 2,
    borderColor: SLIDE_ACTION_GREEN_BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  primaryBtnText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 14,
    color: "#0B1A0F",
  },
  secondaryBtn: {
    width: "100%",
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#111111",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  secondaryBtnText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: "#111827",
  },
});
