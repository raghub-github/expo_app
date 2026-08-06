/**
 * Parcel book — choose Cash vs Online payment (bottom sheet).
 */

import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

export type ParcelPaymentMode = "cash" | "online";

export type ParcelPaymentModeSheetProps = {
  visible: boolean;
  onClose: () => void;
  selected: ParcelPaymentMode;
  onSelect: (mode: ParcelPaymentMode) => void;
};

const OPTIONS: {
  id: ParcelPaymentMode;
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: "cash",
    label: "Cash",
    sub: "Pay in cash at pickup or drop",
    icon: "wallet-outline",
  },
  {
    id: "online",
    label: "Online",
    sub: "Pay via UPI, card or wallet",
    icon: "card-outline",
  },
];

export function ParcelPaymentModeSheet({
  visible,
  onClose,
  selected,
  onSelect,
}: ParcelPaymentModeSheetProps) {
  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.48}>
      <View style={styles.handle} />
      <AppText style={styles.title}>Payment mode</AppText>
      <AppText style={styles.sub}>Choose how you want to pay for this parcel</AppText>

      <View style={styles.list}>
        {OPTIONS.map((opt) => {
          const active = selected === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.row, active && styles.rowActive]}
              activeOpacity={0.88}
              onPress={() => {
                onSelect(opt.id);
                onClose();
              }}
            >
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={active ? GatiMitraColors.deepMintStart : "#111827"}
                />
              </View>
              <View style={styles.textCol}>
                <AppText style={styles.rowLabel}>{opt.label}</AppText>
                <AppText style={styles.rowSub}>{opt.sub}</AppText>
              </View>
              {active ? (
                <Ionicons name="checkmark-circle" size={22} color={GatiMitraColors.deepMintStart} />
              ) : (
                <View style={styles.radio} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  rowActive: {
    borderColor: GatiMitraColors.deepMintStart,
    backgroundColor: "#ECFDF5",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: "#D1FAE5",
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  rowSub: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
});
