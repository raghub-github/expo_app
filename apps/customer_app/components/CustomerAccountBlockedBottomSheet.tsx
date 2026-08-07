/**
 * Bottom sheet when admin blocks a customer from a specific service.
 */

import { View, TouchableOpacity, StyleSheet, Modal, Pressable } from "react-native";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GatiMitraColors } from "@/constants/gatimitra";
import { FrozenServiceIconCircle } from "@/components/FrozenServiceIconCircle";

type CustomerAccountBlockedBottomSheetProps = {
  visible: boolean;
  serviceLabel: string;
  reason: string;
  serviceAssetKey?: string;
  onClose: () => void;
};

export function CustomerAccountBlockedBottomSheet({
  visible,
  serviceLabel,
  reason,
  serviceAssetKey,
  onClose,
}: CustomerAccountBlockedBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  if (!visible) return null;

  const reasonText = reason.trim() || "This service is unavailable for your account.";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            {serviceAssetKey ? (
              <FrozenServiceIconCircle assetKey={serviceAssetKey} size={48} />
            ) : (
              <View style={styles.iconRing}>
                <Ionicons name="ban-outline" size={30} color="#DC2626" />
              </View>
            )}
          </View>
          <AppText style={styles.eyebrow}>Service frozen</AppText>
          <AppText style={styles.title}>Unavailable for your account</AppText>
          <AppText style={styles.serviceChip}>{serviceLabel}</AppText>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
              </View>
              <View style={styles.infoTextCol}>
                <AppText style={styles.infoLabel}>Why blocked</AppText>
                <AppText style={styles.infoValue}>{reasonText}</AppText>
              </View>
            </View>
          </View>
          <AppText style={styles.message}>
            You cannot use this service until our team removes the restriction.
          </AppText>
          <TouchableOpacity
            style={styles.helpBtn}
            onPress={() => {
              onClose();
              router.push({ pathname: "/support", params: { newTicket: "1" } } as never);
            }}
            activeOpacity={0.9}
          >
            <Ionicons name="help-circle-outline" size={18} color="#0d5c4a" />
            <AppText style={styles.helpBtnText}>Contact Support</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.gotItBtn} onPress={onClose} activeOpacity={0.9}>
            <AppText style={styles.gotItBtnText}>Got It</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 14,
  },
  iconWrap: { alignItems: "center", marginBottom: 12 },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  eyebrow: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#DC2626",
    marginBottom: 6,
  },
  title: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  serviceChip: {
    alignSelf: "center",
    marginBottom: 14,
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#B91C1C",
  },
  infoCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTextCol: { flex: 1, paddingTop: 2 },
  infoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  infoValue: { fontSize: 15, fontWeight: "700", color: "#0F172A", lineHeight: 20 },
  message: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 12,
  },
  helpBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 10,
    paddingVertical: 12,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: "#0d5c4a",
    backgroundColor: "#F0FAF8",
  },
  helpBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0d5c4a",
  },
  gotItBtn: {
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
  },
  gotItBtnText: { fontSize: 16, fontWeight: "700", color: "#111827" },
});
