import { useCallback, useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import {
  PAYOUT_ORDER_TYPE_OPTIONS,
  type PayoutOrderTypeFilter,
} from "@/lib/merchantPayoutUtils";

type Props = {
  visible: boolean;
  value: PayoutOrderTypeFilter;
  onClose: () => void;
  onApply: (next: PayoutOrderTypeFilter) => void;
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, pressed && styles.optionRowPressed]}
    >
      <Text style={styles.optionLabel}>{label}</Text>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </Pressable>
  );
}

export function PayoutOrderTypeFilterSheet({ visible, value, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<PayoutOrderTypeFilter>(value);

  const sync = useCallback(() => setDraft(value), [value]);

  useEffect(() => {
    if (visible) sync();
  }, [visible, sync]);

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <MerchantBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightPercent="48%"
      footer={
        <Pressable
          onPress={handleApply}
          style={({ pressed }) => [styles.applyBtn, pressed && styles.applyBtnPressed]}
        >
          <Text style={styles.applyBtnText}>Apply</Text>
        </Pressable>
      }
    >
      <View style={styles.body}>
        <Text style={styles.title}>Select order type</Text>
        {PAYOUT_ORDER_TYPE_OPTIONS.map((option) => (
          <RadioRow
            key={option.id}
            label={option.label}
            selected={draft === option.id}
            onPress={() => setDraft(option.id)}
          />
        ))}
      </View>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  optionRowPressed: { opacity: 0.85 },
  optionLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: GatiMitraMerchant.textPrimary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GatiMitraMerchant.textPrimary,
  },
  applyBtn: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    minHeight: 52,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtnPressed: { opacity: 0.9 },
  applyBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
