/**
 * Zomato-style "Donate with" picker — every order vs this order only.
 */

import { useEffect, useState } from "react";
import { View, Modal, Pressable, StyleSheet } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraColors } from "@/constants/gatimitra";

const GM = GatiMitraColors;

export type DonationScope = "every_order" | "this_order";

export function formatDonationScopeLabel(scope: DonationScope): string {
  return scope === "every_order" ? "Every Order" : "This Order";
}

export type DonateWithBottomSheetProps = {
  visible: boolean;
  value: DonationScope;
  onClose: () => void;
  onSave: (scope: DonationScope) => void;
};

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.optionRow} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}>
      <CheckoutText style={styles.optionLabel}>{label}</CheckoutText>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </Pressable>
  );
}

export function DonateWithBottomSheet({ visible, value, onClose, onSave }: DonateWithBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<DonationScope>(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.dim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}>
          <CheckoutText style={styles.title}>Donate with</CheckoutText>

          <RadioRow
            label="Every Order"
            selected={draft === "every_order"}
            onPress={() => setDraft("every_order")}
          />
          <View style={styles.optionDivider} />
          <RadioRow
            label="This Order"
            selected={draft === "this_order"}
            onPress={() => setDraft("this_order")}
          />

          <Pressable
            style={styles.saveBtn}
            onPress={() => {
              onSave(draft);
              onClose();
            }}
            accessibilityRole="button"
          >
            <CheckoutText style={styles.saveBtnText}>Save</CheckoutText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 23, 42, 0.45)" },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    textDecorationLine: "underline",
    textDecorationStyle: "dashed",
    textDecorationColor: "#9CA3AF",
  },
  optionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#E5E7EB" },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: { borderColor: GM.emerald },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GM.emerald,
  },
  saveBtn: {
    marginTop: 16,
    backgroundColor: GM.emerald,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.2 },
});
